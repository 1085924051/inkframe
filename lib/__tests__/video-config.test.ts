import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../settings", () => ({ getModelConfigValue: vi.fn(async (key: string) => ({ RUNWAY_API_KEY: "test-key", RUNWAY_API_URL: "https://runway.example", RUNWAY_MODEL: "" } as Record<string, string>)[key] || "") }));

import { checkVideoProviderConfig, validateVideoProviderConfig } from "../video";

describe("video provider configuration check", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports a reachable configured provider and its default model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    const result = await checkVideoProviderConfig("runway");
    expect(result).toMatchObject({ configured: true, reachable: true });
    expect(result.message).toContain("配置完整");
  });

  it("distinguishes missing credentials from an unsupported provider", async () => {
    const missing = await checkVideoProviderConfig("kling");
    expect(missing.configured).toBe(false);
    expect(missing.missing).toContain("KLING_API_KEY");
    const unsupported = await checkVideoProviderConfig("unknown");
    expect(unsupported.configured).toBe(false);
    expect(unsupported.missing).toContain("provider");
  });

  it("validates local credentials without probing the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateVideoProviderConfig("mock-video")).resolves.toMatchObject({ valid: true });
    await expect(validateVideoProviderConfig("runway")).resolves.toMatchObject({ valid: true });
    await expect(validateVideoProviderConfig("kling")).resolves.toMatchObject({ valid: false, missing: ["KLING_API_KEY"] });
    await expect(validateVideoProviderConfig("unknown")).resolves.toMatchObject({ valid: false, missing: ["provider"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
