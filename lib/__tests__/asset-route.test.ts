import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getProject: vi.fn(), isSameOrigin: vi.fn(),
  episodeFindFirst: vi.fn(), shotFindFirst: vi.fn(), assetCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/store", () => ({ getProject: mocks.getProject }));
vi.mock("@/lib/rate-limit", () => ({ isSameOrigin: mocks.isSameOrigin }));
vi.mock("@/lib/prisma", () => ({ prisma: { episode: { findFirst: mocks.episodeFindFirst }, shot: { findFirst: mocks.shotFindFirst }, asset: { create: mocks.assetCreate } } }));

import { POST } from "../../app/api/projects/[id]/assets/route";

const context = { params: { id: "project-1" } };
const request = (body: unknown) => new Request("http://localhost/api/projects/project-1/assets", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: "owner", role: "USER" });
  mocks.isSameOrigin.mockReturnValue(true);
  mocks.getProject.mockResolvedValue({ id: "project-1", episodes: [{ id: "episode-1" }] });
  mocks.episodeFindFirst.mockResolvedValue({ id: "episode-1" });
  mocks.shotFindFirst.mockResolvedValue({ id: "shot-1" });
  mocks.assetCreate.mockResolvedValue({ id: "asset-1" });
});

describe("asset import ownership and validation", () => {
  it("rejects an episode that belongs to another project", async () => {
    mocks.episodeFindFirst.mockResolvedValue(null);
    const response = await POST(request({ episodeId: "foreign-episode", name: "ref" }), context);
    expect(response.status).toBe(400);
    expect(mocks.assetCreate).not.toHaveBeenCalled();
  });

  it("rejects a shot outside the selected episode", async () => {
    mocks.shotFindFirst.mockResolvedValue(null);
    const response = await POST(request({ episodeId: "episode-1", shotId: "foreign-shot", name: "ref" }), context);
    expect(response.status).toBe(400);
    expect(mocks.assetCreate).not.toHaveBeenCalled();
  });

  it("accepts a valid project-scoped asset and rejects unsupported fields", async () => {
    const response = await POST(request({ episodeId: "episode-1", shotId: "shot-1", kind: "image", name: "reference", url: "/uploads/reference.png", metadata: { source: "test" } }), context);
    expect(response.status).toBe(201);
    expect(mocks.assetCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: "project-1", episodeId: "episode-1", shotId: "shot-1", kind: "image", name: "reference" }) });

    const invalid = await POST(request({ name: "reference", arbitrary: "not allowed" }), context);
    expect(invalid.status).toBe(400);
  });
});
