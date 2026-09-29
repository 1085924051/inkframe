import { describe, expect, it } from "vitest";
import { retakePrompt, shotDurationSeconds } from "../shot-retake";
import { assertVideoReferenceCapacity } from "../video";
import type { Shot } from "../types";

const shot: Shot = { id: "shot-1", scene: 1, duration: "04s", size: "近景", camera: "平视", movement: "缓推", imagePrompt: "", videoPrompt: "", negativePrompt: "" };

describe("duration-aware shot retake", () => {
  it("uses the stored shot duration and avoids long dialogue", () => {
    const result = retakePrompt(shot, "陈默走进房间，面对李浩。", ["陈默", "李浩"]);
    expect(result.seconds).toBe(4);
    expect(result.prompt).toContain("4秒单镜头");
    expect(result.prompt).toContain("无对白");
    expect(shotDurationSeconds("12s")).toBe(12);
  });

  it("rejects multiple references for unverified provider adapters", () => {
    expect(() => assertVideoReferenceCapacity("runway", ["a", "b"])).toThrow(/只验证了单张/);
    expect(() => assertVideoReferenceCapacity("seedance", ["character", "scene"])).not.toThrow();
    expect(() => assertVideoReferenceCapacity("mock-video", ["a", "b"])).not.toThrow();
  });
});
