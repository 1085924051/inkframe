import { describe, expect, it } from "vitest";
import { extractGroundedCharacterNames, groundCharactersToSource } from "../characters";

describe("episode character grounding", () => {
  it("keeps the exact name used by the episode script", () => {
    const script = "【场景一】\n陈默：把档案给我。\n陈默转身走进走廊。";
    expect(extractGroundedCharacterNames(script)).toContain("陈默");
    const result = groundCharactersToSource([{ id: "llm-1", name: "林夕", role: "记者", description: "短发" }], script, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("陈默");
  });

  it("reuses the stable project character id when the model changes the name", () => {
    const script = "陈默：我们现在出发。";
    const result = groundCharactersToSource([{ id: "temporary", name: "林夕", role: "记者" }], script, [{ id: "character-chen-mo", name: "陈默" }]);
    expect(result[0]).toMatchObject({ id: "character-chen-mo", name: "陈默" });
  });
});
