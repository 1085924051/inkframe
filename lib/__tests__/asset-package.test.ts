import { describe, expect, it } from "vitest";
import { buildAssetPackage } from "../asset-package";
import type { GeneratedProject } from "../types";

const project: GeneratedProject = {
  title: "测试项目", topic: "测试", logline: "测试", script: "测试", projectFormat: "series", episodeCount: 2,
  episodes: [{ id: "ep-1", number: 1, title: "Episode 1", status: "draft", sceneCount: 1, shotCount: 1 }],
  characters: [{ id: "char-1", name: "主角", role: "记者", description: "短发", wardrobe: "灰外套" }],
  scenes: [{ number: 1, episodeNumber: 1, title: "档案室", content: "旧档案", mood: "紧张" }],
  shots: [{ id: "shot-1", scene: 1, episodeNumber: 1, title: "柜门后的录音", duration: "04s", size: "中景", camera: "平视", movement: "推进", imagePrompt: "frame", videoPrompt: "move", negativePrompt: "text" }],
};

describe("asset package manifest", () => {
  it("creates continuity, scene, and shot entries with stable keys", () => {
    const entries = buildAssetPackage(project);
    expect(entries.map((entry) => entry.sourceKey)).toEqual(["character:char-1", "scene:1", "shot:shot-1"]);
    expect(entries.find((entry) => entry.sourceKey === "shot:shot-1")?.kind).toBe("image");
  });
});
