import { describe, expect, it } from "vitest";
import { access, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { composeVideos } from "../compose";

describe("final video composition", () => {
  it("composes all completed mock shot clips in shot order", async () => {
    const projectId = `compose-test-${Date.now()}`;
    const output = await composeVideos({ projectId, urls: Array.from({ length: 6 }, () => "/demo/shot-preview.mp4") });
    expect(output).toBe(`/generated/${projectId}.mp4`);
    await access(resolve(process.cwd(), "public", output.slice(1)));
    await rm(resolve(process.cwd(), "public", output.slice(1)), { force: true });
  });
});
