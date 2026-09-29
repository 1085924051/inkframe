import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../settings", () => ({
  resolveModelConfig: async () => ({ LLM_API_URL: "https://model.example/v1", LLM_API_KEY: "test-key", LLM_MODEL: "test-model" }),
}));

import { chatCompletionDetailed } from "../ai/client";

describe("OpenAI compatible token usage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns provider token counts and the actual model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      model: "served-model",
      choices: [{ message: { content: "response" } }],
      usage: { prompt_tokens: 17, completion_tokens: 9 },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await chatCompletionDetailed([{ role: "user", content: "input" }]);
    expect(result.usage).toEqual({ inputTokens: 17, outputTokens: 9, model: "served-model", estimated: false });
  });

  it("estimates counts and labels them when the provider omits usage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "answer" } }] }), { status: 200 })));
    const result = await chatCompletionDetailed([{ role: "user", content: "01234567" }]);
    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 2, model: "test-model", estimated: true });
  });
});
