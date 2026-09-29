import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../prisma";
import { createVideoJob, updateVideoJob } from "../jobs";
import { createRenderJob, updateRenderJob } from "../render-jobs";
import { saveProject } from "../store";
import { hashPassword } from "../security";
import type { GeneratedProject } from "../types";

function makeProject(): GeneratedProject {
  return {
    title: "视频任务幂等测试",
    topic: "测试主题",
    logline: "测试梗概",
    script: "测试剧本",
    scenes: [{ number: 1, title: "测试场景", content: "测试内容", mood: "平静" }],
    shots: [{ id: "shot-1", scene: 1, title: "测试镜头", duration: "04s", size: "近景", camera: "平视", movement: "固定", imagePrompt: "image", videoPrompt: "video", negativePrompt: "negative" }],
  };
}

describe("video job idempotency", () => {
  let userId = "";
  let projectId = "";
  let shotId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `jobs-${crypto.randomUUID()}@t.com`, name: "任务测试用户", passwordHash: hashPassword("123456") } });
    userId = user.id;
    const project = await saveProject(makeProject(), { writerId: "luxun", directorId: "nolan", userId });
    projectId = project.id!;
    const shot = await prisma.shot.findFirst({ where: { scene: { projectId: project.id } }, select: { id: true } });
    shotId = shot!.id;
  });

  it("reuses an active job and allows a new job after failure", async () => {
    const first = await createVideoJob({ shotId, provider: "mock-video" });
    const second = await createVideoJob({ shotId, provider: "runway" });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(await prisma.videoJob.count({ where: { shotId } })).toBe(1);

    await updateVideoJob(first.job.id, { status: "failed", error: "provider failed" });
    await prisma.shot.update({ where: { id: shotId }, data: { status: "failed" } });
    const retry = await createVideoJob({ shotId, provider: "mock-video" });
    expect(retry.reused).toBe(false);
    expect(retry.job.id).not.toBe(first.job.id);
    expect(await prisma.videoJob.count({ where: { shotId } })).toBe(2);
  });

  it("keeps render submission asynchronous and idempotent", async () => {
    const first = await createRenderJob({ projectId });
    const second = await createRenderJob({ projectId });
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    await updateRenderJob(first.job.id, { status: "failed", error: "ffmpeg failed" });
    const retry = await createRenderJob({ projectId });
    expect(retry.reused).toBe(false);
    expect(retry.job.id).not.toBe(first.job.id);
  });
});
