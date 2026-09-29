import { describe, expect, it } from "vitest";
import { buildLocalSourceDigest, splitSource } from "../ai/source-digest";

describe("long source digest", () => {
  it("splits large input without losing the complete character count", () => {
    const source = Array.from({ length: 5 }, (_, index) => `Chapter ${index + 1}\n${"story ".repeat(2500)}`).join("\n\n");
    const chunks = splitSource(source, 1200);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.join("\n\n").replace(/\s/g, "")).toBe(source.replace(/\s/g, ""));
  });

  it("infers a series plan and preserves constraint candidates", () => {
    const source = `${"The hero must return to the harbor.\n".repeat(5000)}\nChapter 1\nChapter 2\nChapter 3\nChapter 4\nChapter 5\nChapter 6\nChapter 7\nChapter 8`;
    const digest = buildLocalSourceDigest(source);
    expect(digest.format).toBe("series");
    expect(digest.episodeCount).toBeGreaterThan(1);
    expect(digest.chunkCount).toBeGreaterThan(1);
    expect(digest.constraints.length).toBeGreaterThan(0);
    expect(digest.styleEvidence.length).toBeLessThanOrEqual(22000);
  });
});
