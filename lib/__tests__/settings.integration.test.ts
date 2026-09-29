import { describe, it, expect } from "vitest";
import { saveSettings, listSettings, resolveModelConfig, getModelConfigValue } from "../settings";
import { modelCostMicros, recordUsage } from "../usage";

describe("settings 集成（SQLite test.db）", () => {
  it("保存配置 → DB 读取 + 密钥脱敏 + 来源 db", async () => {
    await saveSettings({ LLM_API_URL: "https://llm.example.com", LLM_API_KEY: "sk-abcdef1234567890" });
    const list = await listSettings();
    const key = list.find((s) => s.key === "LLM_API_KEY")!;
    expect(key.source).toBe("db");
    expect(key.configured).toBe(true);
    expect(key.value).toContain("••••");
    expect(key.value).not.toContain("abcdef1234567890");
    const url = list.find((s) => s.key === "LLM_API_URL")!;
    expect(url.value).toBe("https://llm.example.com");
  });

  it("resolveModelConfig：DB 值优先于环境变量，未保存项走 env", async () => {
    process.env.LLM_API_URL = "https://env.example.com";
    process.env.LLM_API_KEY = "sk-env-key";
    process.env.SEEDANCE_API_KEY = "sk-env-seedance";
    const cfg = await resolveModelConfig();
    expect(cfg.LLM_API_URL).toBe("https://llm.example.com"); // DB 优先
    expect(cfg.LLM_API_KEY).toBe("sk-abcdef1234567890"); // DB 优先
    expect(cfg.SEEDANCE_API_KEY).toBe("sk-env-seedance"); // 未保存项走 env
    delete process.env.LLM_API_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
  });

  it("getModelConfigValue 便捷读取", async () => {
    expect(await getModelConfigValue("LLM_MODEL")).toBe("");
  });

  it("calculates configured per-million-token pricing without cent rounding loss", async () => {
    await saveSettings({ LLM_INPUT_USD_PER_MILLION: "0.15", LLM_OUTPUT_USD_PER_MILLION: "0.60" });
    expect(await modelCostMicros(1000, 1000)).toEqual({ costMicros: 750, costCents: 0, ratesConfigured: true });
    const record = await recordUsage({ userId: "pricing-test-user", kind: "text", provider: "llm", model: "test-model", inputTokens: 1000, outputTokens: 1000, metadata: { estimatedTokens: false } });
    expect(record.costMicros).toBe(750);
    expect(JSON.parse(record.metadata || "{}").costSource).toBe("configured-model-rate");
  });
});
