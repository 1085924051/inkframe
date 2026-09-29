import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: vi.fn(), chat: vi.fn() }));
vi.mock("../ai/client", () => ({ isLLMConfigured: mocks.configured, chatCompletionDetailed: mocks.chat, chatCompletion: mocks.chat, extractJson: (text: string) => JSON.parse(text) }));

import { generateProjectRemotely } from "../ai/providers";

describe("episode continuity context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockResolvedValue(true);
    mocks.chat.mockResolvedValue({ content: JSON.stringify({ logline: "本集继续调查", script: "结尾：录音被藏起来", characters: [{ id: "c1", name: "林岚", role: "记者", description: "短发", wardrobe: "灰外套" }], scenes: [{ number: 1, title: "档案室", content: "林岚找到线索", mood: "紧张" }, { number: 2, title: "楼梯间", content: "有人跟踪", mood: "压迫" }], shots: [{ scene: 1, title: "档案柜前", duration: "04s", size: "中景", camera: "平视", movement: "推进", imagePrompt: "档案柜", videoPrompt: "慢慢推进", negativePrompt: "text" }], continuity: { summary: "林岚带着录音离开", ending: "楼梯间的脚步逼近", characterState: [{ id: "c1", name: "林岚", role: "记者", description: "短发", wardrobe: "灰外套" }], openThreads: ["谁在跟踪林岚"] } }), usage: { inputTokens: 10, outputTokens: 20, model: "test-model", estimated: false } });
  });

  it("passes previous episode state and repairs missing scene coverage", async () => {
    const result = await generateProjectRemotely({
      topic: "被篡改的档案",
      scriptLength: "series",
      narrativePerspective: "third-person",
      writer: { id: "w", name: "作家", era: "当代", summary: "克制", tags: [], axes: [] },
      director: { id: "d", name: "导演", summary: "冷静", palette: [], descriptor: "cinematic" },
      spec: { format: "series", episodeCount: 3, wordsPerEpisode: 1800, totalTargetWords: 5400, storyBible: "录音不能丢" },
      episodeContext: { episodeNumber: 2, episodeGoal: "揭示档案来源", sourceOutline: "第二章：跟踪者出现", previousEpisode: { number: 1, summary: "林岚发现档案被改", ending: "她把录音藏进旧相机", sceneTitles: ["档案室"], }, characterState: [{ id: "c1", name: "林岚", role: "记者", description: "短发", wardrobe: "灰外套" }] },
    });
    expect(result?.project.continuity?.ending).toContain("楼梯间");
    expect(result?.project.shots.some((shot) => shot.scene === 2)).toBe(true);
    const prompt = mocks.chat.mock.calls[0][0].map((message: { content: string }) => message.content).join("\n");
    expect(prompt).toContain("她把录音藏进旧相机");
    expect(prompt).toContain("揭示档案来源");
    expect(prompt).toContain("第二章：跟踪者出现");
  });
});
