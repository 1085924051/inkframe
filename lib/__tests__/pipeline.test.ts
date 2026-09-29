import { describe, it, expect } from "vitest";
import { runPipeline } from "../pipeline";

describe("pipeline 确定性生成", () => {
  it("生成 3 场景 6 镜头与四阶段 trace", () => {
    const { project, trace } = runPipeline({ topic: "测试主题", writerId: "luxun", directorId: "nolan" });
    expect(project.engine).toBe("local");
    expect(project.scenes.length).toBe(3);
    expect(project.shots.length).toBe(6);
    expect(trace.map((t) => t.stage)).toEqual(["distill", "script", "parse", "shots"]);
    expect(project.title).toContain("风格化短剧");
    expect(project.logline.length).toBeGreaterThan(0);
    expect(project.script.length).toBeGreaterThanOrEqual(500);
    expect(project.characters?.length).toBeGreaterThan(0);
    expect(project.shots.every((shot) => shot.characterContext && shot.videoPrompt.includes("Character Bible"))).toBe(true);
    expect(new Set(project.shots.map((shot) => shot.title)).size).toBe(project.shots.length);
    expect(project.shots.every((shot) => shot.title && !shot.title.endsWith("· 分镜"))).toBe(true);
    expect(project.shots.map((shot) => shot.title)).toEqual([
      "周五，五点四十 · 环境与人物",
      "周五，五点四十 · 手部情绪特写",
      "会议室里没有回声 · 环境与人物",
      "会议室里没有回声 · 手部情绪特写",
      "灯灭之前 · 环境与人物",
      "灯灭之前 · 手部情绪特写",
    ]);
  });

  it("保留自定义导演卡并注入镜头提示词", () => {
    const director = { id: "custom-director", name: "自定义导演", summary: "测试", palette: ["#000"], descriptor: "custom visual descriptor" };
    const { project } = runPipeline({ topic: "测试主题", writerId: "luxun", directorStyle: director });
    expect(project.directorStyleId).toBeUndefined();
    expect(project.shots.every((shot) => shot.imagePrompt.includes(director.descriptor) && shot.videoPrompt.includes(director.descriptor))).toBe(true);
  });

  it("应用剧本长度与叙事视角选项", () => {
    const micro = runPipeline({ topic: "测试主题", scriptLength: "micro", narrativePerspective: "first-person" }).project;
    const long = runPipeline({ topic: "测试主题", scriptLength: "long", narrativePerspective: "observational" }).project;
    expect(micro.scriptLength).toBe("micro");
    expect(micro.narrativePerspective).toBe("first-person");
    expect(long.scriptLength).toBe("long");
    expect(long.script.length).toBeGreaterThan(micro.script.length);
    expect(long.logline).toContain("observational");
  });

  it("将长篇项目规格传入本地生成结果", () => {
    const project = runPipeline({ topic: "连续故事", spec: { format: "series", episodeCount: 12, wordsPerEpisode: 1800, totalTargetWords: 21600, storyBible: "角色不能离开海港" } }).project;
    expect(project.projectFormat).toBe("series");
    expect(project.episodeCount).toBe(12);
    expect(project.wordsPerEpisode).toBe(1800);
    expect(project.totalTargetWords).toBe(21600);
    expect(project.storyBible).toContain("海港");
    expect(project.logline).toContain("12");
  });
});
