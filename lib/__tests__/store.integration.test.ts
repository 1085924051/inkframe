import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../prisma";
import { saveProject, getProject, listProjects, saveWriterStyle, listWriterStyles, setStyleSharing, getSharedStyle, saveGeneratedEpisode, EpisodeGenerationError, replaceShot } from "../store";
import { hashPassword } from "../security";
import type { GeneratedProject } from "../types";

function makeProject(topic: string): GeneratedProject {
  return {
    title: `${topic} · 风格化短剧`,
    topic,
    logline: "测试 logline",
    script: "【场景一】测试剧本",
    scenes: [
      { number: 1, title: "场景一", content: "内容一", mood: "平静" },
      { number: 2, title: "场景二", content: "内容二", mood: "紧张" },
    ],
    shots: [
      { id: "s1", scene: 1, title: "窗口前的抉择", duration: "04s", size: "远景", camera: "平视", movement: "推进", imagePrompt: "i1", videoPrompt: "v1", negativePrompt: "n1" },
      { id: "s2", scene: 2, title: "走廊里的告别", duration: "04s", size: "近景", camera: "平视", movement: "固定", imagePrompt: "i2", videoPrompt: "v2", negativePrompt: "n2" },
    ],
    engine: "local",
  };
}

describe("store 集成（SQLite test.db）", () => {
  let userA = "";
  let userB = "";
  let admin = "";

  beforeAll(async () => {
    const a = await prisma.user.create({ data: { email: "a@t.com", name: "用户A", passwordHash: hashPassword("123456"), role: "USER" } });
    const b = await prisma.user.create({ data: { email: "b@t.com", name: "用户B", passwordHash: hashPassword("123456"), role: "USER" } });
    const adm = await prisma.user.create({ data: { email: "adm@t.com", name: "管理员", passwordHash: hashPassword("123456"), role: "ADMIN" } });
    userA = a.id; userB = b.id; admin = adm.id;
  });

  it("saveProject 生成唯一分镜 id 并可 getProject 回读", async () => {
    const saved = await saveProject(makeProject("甲"), { writerId: "luxun", directorId: "nolan", userId: userA, scriptLength: "long", narrativePerspective: "first-person" });
    expect(saved.id).toBeTruthy();
    expect(saved.writerStyleId).toBe("luxun");
    expect(saved.directorStyleId).toBe("nolan");
    expect(saved.shots.map((s) => s.id)).not.toContain("s1");
    const got = await getProject(saved.id!, { userId: userA, isAdmin: false });
    expect(got).not.toBeNull();
    expect(got!.scenes.length).toBe(2);
    expect(got!.shots.length).toBe(2);
    expect(got!.shots[0].status).toBe("draft");
    expect(got!.shots.map((shot) => shot.title)).toEqual(["窗口前的抉择", "走廊里的告别"]);
    expect(got!.writerStyleId).toBe("luxun");
    expect(got!.directorStyleId).toBe("nolan");
    expect(got!.scriptLength).toBe("long");
    expect(got!.narrativePerspective).toBe("first-person");
  });

  it("项目归属隔离：普通用户只能看到自己的项目", async () => {
    await saveProject(makeProject("乙"), { writerId: "luxun", directorId: "nolan", userId: userB });
    const listB = await listProjects({ userId: userB, isAdmin: false });
    expect(listB.length).toBeGreaterThan(0);
    expect(listB.every((p) => p.owner === "用户B")).toBe(true);
    const listAdmin = await listProjects({ userId: admin, isAdmin: true });
    expect(listAdmin.length).toBeGreaterThanOrEqual(2);
  });

  it("多集项目回读分集状态与场景镜头统计", async () => {
    const saved = await saveProject(makeProject("多集"), { writerId: "luxun", directorId: "nolan", userId: userA, format: "series", episodeCount: 3, wordsPerEpisode: 1800 });
    const got = await getProject(saved.id!, { userId: userA, isAdmin: false });
    expect(got?.episodes).toHaveLength(3);
    expect(got?.episodes?.[0]).toMatchObject({ number: 1, status: "draft", script: "【场景一】测试剧本", sceneCount: 2, shotCount: 2 });
    expect(got?.episodes?.[1]).toMatchObject({ number: 2, status: "planned", sceneCount: 0, shotCount: 0 });
    expect(got?.episodeCount).toBe(3);
    expect(got?.shots.every((shot) => !shot.characterIds)).toBe(true);
  });

  it("generates only the requested planned episode and rejects a second generation", async () => {
    const saved = await saveProject(makeProject("episode generation"), { writerId: "luxun", directorId: "nolan", userId: userA, format: "series", episodeCount: 3, wordsPerEpisode: 1800 });
    const planned = saved.episodes?.find((episode) => episode.number === 2);
    expect(planned).toBeTruthy();
    const result = await saveGeneratedEpisode(saved.id!, planned!.id, makeProject("episode two"), { userId: userA, isAdmin: false });
    expect(result?.episodeNumber).toBe(2);

    const got = await getProject(saved.id!, { userId: userA, isAdmin: false });
    expect(got?.episodes?.find((episode) => episode.number === 1)).toMatchObject({ sceneCount: 2, shotCount: 2 });
    expect(got?.episodes?.find((episode) => episode.number === 2)).toMatchObject({ status: "draft", script: "【场景一】测试剧本", sceneCount: 2, shotCount: 2 });
    expect(got?.shots.filter((shot) => shot.episodeNumber === 2).every((shot) => !shot.characterIds)).toBe(true);
    expect(got?.episodes?.find((episode) => episode.number === 3)).toMatchObject({ status: "planned", sceneCount: 0, shotCount: 0 });
    expect(got?.scenes.map((scene) => scene.number)).toEqual([1, 2, 3, 4]);

    await expect(saveGeneratedEpisode(saved.id!, planned!.id, makeProject("duplicate"), { userId: userA, isAdmin: false })).rejects.toMatchObject({ code: "NOT_PLANNED" });
    expect(await saveGeneratedEpisode(saved.id!, planned!.id, makeProject("unauthorized"), { userId: userB, isAdmin: false })).toBeNull();
    expect(EpisodeGenerationError).toBeDefined();
  });

  it("retakes one shot in place without copying the project", async () => {
    const saved = await saveProject(makeProject("single retake"), { writerId: "luxun", directorId: "nolan", userId: userA });
    const before = await getProject(saved.id!, { userId: userA, isAdmin: false });
    const target = before!.shots[0];
    const replacement = { ...target, videoPrompt: "retaken video prompt", imagePrompt: "retaken image prompt" };
    const updated = await replaceShot(saved.id!, target.id, replacement, { userId: userA, isAdmin: false });

    expect(updated?.id).toBe(saved.id);
    expect(updated?.shots).toHaveLength(2);
    expect(updated?.shots.find((shot) => shot.id === target.id)?.videoPrompt).toBe("retaken video prompt");
    expect(updated?.shots.find((shot) => shot.id === before!.shots[1].id)?.videoPrompt).toBe(before!.shots[1].videoPrompt);
  });

  it("越权访问他人项目返回 null", async () => {
    const listA = await listProjects({ userId: userA, isAdmin: false });
    const aProject = listA[0];
    const denied = await getProject(aProject.id, { userId: userB, isAdmin: false });
    expect(denied).toBeNull();
    const allowed = await getProject(aProject.id, { userId: admin, isAdmin: true });
    expect(allowed).not.toBeNull();
  });

  it("自定义风格卡按所有者隔离并可公开分享", async () => {
    const style = await saveWriterStyle({ id: "custom-share-test", name: "测试风格", era: "当代", summary: "测试", tags: ["测试"], axes: [{ label: "冷峻度", value: 50 }], source: "distilled" }, userA);
    expect((await listWriterStyles(userB)).some((item) => item.id === style.id)).toBe(false);
    const shared = await setStyleSharing("writer", style.id, userA, true);
    expect(shared.count).toBe(1);
    const visible = await listWriterStyles(userB);
    expect(visible.some((item) => item.id === style.id && item.isPublic)).toBe(true);
    const row = await listWriterStyles(userA);
    const token = row.find((item) => item.id === style.id)?.shareToken;
    expect(token).toBeTruthy();
    const publicStyle = await getSharedStyle(token!);
    expect(publicStyle?.kind).toBe("writer");
  });
});
