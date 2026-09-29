import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(), chat: vi.fn(), session: vi.fn(), origin: vi.fn(), limit: vi.fn(), save: vi.fn(), pipeline: vi.fn(), modelConfig: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({ isLLMConfigured: mocks.configured, chatCompletionDetailed: mocks.chat, chatCompletion: mocks.chat, extractJson: JSON.parse }));
vi.mock("@/lib/ai/providers", () => ({ generateProjectRemotely: async () => {
  if (!await mocks.configured()) return null;
  return mocks.chat();
} }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "test", isSameOrigin: mocks.origin, rateLimit: mocks.limit }));
vi.mock("@/lib/pipeline", () => ({ resolveWriter: () => ({ id: "writer", name: "Writer", summary: "Style" }), resolveDirector: () => ({ id: "director", name: "Director", descriptor: "Visual" }), runPipeline: mocks.pipeline }));
vi.mock("@/lib/store", () => ({ saveProject: mocks.save, saveWriterStyle: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getModelConfigValue: mocks.modelConfig }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/usage", () => ({ recordUsage: vi.fn() }));
vi.mock("@/lib/penshot", () => ({ generateWithPenShot: vi.fn() }));

import { POST } from "../../app/api/generate/route";

const request = () => new Request("http://localhost/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "test" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ userId: "owner", role: "USER" });
  mocks.origin.mockReturnValue(true);
  mocks.limit.mockReturnValue({ ok: true });
  mocks.configured.mockResolvedValue(true);
});

describe("configured LLM generation errors", () => {
  it("returns actionable HTTP 401 without local fallback or saving a project", async () => {
    mocks.chat.mockRejectedValue(new Error("LLM 请求失败：HTTP 401（认证失败）。请检查 LLM_API_KEY"));
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect((await response.json()).error).toContain("LLM_API_KEY");
    expect(mocks.pipeline).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps local generation when no LLM is configured", async () => {
    mocks.configured.mockResolvedValue(false);
    mocks.pipeline.mockReturnValue({ project: { title: "local", script: "script", shots: [], scenes: [] }, trace: [] });
    mocks.save.mockResolvedValue({ id: "project-1", title: "local", script: "script", shots: [], scenes: [] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.pipeline).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
