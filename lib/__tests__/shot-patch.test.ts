import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getProject: vi.fn(), isSameOrigin: vi.fn(),
  replaceShot: vi.fn(), runPipeline: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/store", () => ({ getProject: mocks.getProject, replaceShot: mocks.replaceShot, ShotRetakeError: class ShotRetakeError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } } }));
vi.mock("@/lib/rate-limit", () => ({ isSameOrigin: mocks.isSameOrigin }));
vi.mock("@/lib/prisma", () => ({ prisma: { videoJob: { findFirst: mocks.findFirst }, shot: { updateMany: mocks.updateMany } } }));
vi.mock("@/lib/pipeline", () => ({ runPipeline: mocks.runPipeline }));

import { PATCH } from "../../app/api/projects/[id]/shots/[shotId]/route";

const shot = { id: "shot-1", scene: 1, title: "窗口前的抉择", status: "draft" };
const project = { id: "project-1", scenes: [{ number: 1, title: "场景一" }], shots: [shot, { ...shot, id: "shot-2", title: "走廊里的告别" }] };
const context = { params: { id: project.id, shotId: shot.id } };
const request = (body: unknown) => new Request("http://localhost/api/projects/project-1/shots/shot-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSameOrigin.mockReturnValue(true);
  mocks.getSession.mockResolvedValue({ userId: "owner", role: "USER" });
  mocks.getProject.mockResolvedValue(project);
  mocks.findFirst.mockResolvedValue(null);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("shot PATCH", () => {
  it("checks ownership and shot membership", async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    expect((await PATCH(request({ title: "新标题" }), context)).status).toBe(404);
    expect(mocks.getProject).toHaveBeenCalledWith(project.id, { userId: "owner", isAdmin: false });
  });

  it("rejects unknown fields, template titles and duplicate titles", async () => {
    expect((await PATCH(request({ status: "complete" }), context)).status).toBe(400);
    expect((await PATCH(request({ title: "场景一 · 分镜" }), context)).status).toBe(400);
    expect((await PATCH(request({ title: "走廊里的告别" }), context)).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a title matching another legacy shot's displayed fallback", async () => {
    mocks.getProject.mockResolvedValue({ ...project, shots: [shot, { ...shot, id: "shot-2", title: "场景一 · 分镜" }] });
    expect((await PATCH(request({ title: "场景一 · 镜头 2" }), context)).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("blocks active jobs and uses scoped conditional update", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "job-1" });
    expect((await PATCH(request({ camera: "低机位" }), context)).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect((await PATCH(request({ camera: "低机位", movement: "环绕/推近" }), context)).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: shot.id, scene: { projectId: project.id }, status: { notIn: ["queued", "processing"] } }, data: { camera: "低机位", movement: "环绕/推近" } });
  });
});
