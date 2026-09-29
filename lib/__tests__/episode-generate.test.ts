import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isSameOrigin: vi.fn(),
  getProject: vi.fn(),
  saveGeneratedEpisode: vi.fn(),
  generateEpisodeDraft: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/rate-limit", () => ({ isSameOrigin: mocks.isSameOrigin }));
vi.mock("@/lib/store", () => ({ getProject: mocks.getProject, saveGeneratedEpisode: mocks.saveGeneratedEpisode, EpisodeGenerationError: class EpisodeGenerationError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } } }));
vi.mock("@/lib/episode-generation", () => ({ generateEpisodeDraft: mocks.generateEpisodeDraft }));
vi.mock("@/lib/usage", () => ({ recordUsage: mocks.recordUsage }));

import { POST } from "../../app/api/projects/[id]/episodes/[episodeId]/generate/route";

const project = {
  id: "project-1",
  title: "Series",
  topic: "topic",
  projectFormat: "series",
  episodeCount: 3,
  wordsPerEpisode: 1200,
  totalTargetWords: 3600,
  writerStyleId: "luxun",
  directorStyleId: "nolan",
  episodes: [
    { id: "episode-1", number: 1, title: "Episode 1", status: "draft", sceneCount: 1, shotCount: 1 },
    { id: "episode-2", number: 2, title: "Episode 2", status: "planned", sceneCount: 0, shotCount: 0 },
  ],
  scenes: [],
  shots: [],
  script: "",
  logline: "",
};
const generated = { title: "generated", script: "script", logline: "logline", scenes: [{ number: 1, title: "scene", content: "content", mood: "mood" }], shots: [] };
const request = () => new Request("http://localhost/api/projects/project-1/episodes/episode-2/generate", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{}" });
const context = { params: { id: "project-1", episodeId: "episode-2" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: "owner", role: "USER" });
  mocks.isSameOrigin.mockReturnValue(true);
  mocks.getProject.mockResolvedValue(project);
  mocks.generateEpisodeDraft.mockResolvedValue({ project: generated, context: { episodeNumber: 2, episodeGoal: "continue", characterState: [] }, trace: [] });
  mocks.saveGeneratedEpisode.mockResolvedValue({ episodeId: "episode-2", episodeNumber: 2 });
});

describe("planned episode generation", () => {
  it("generates the requested episode and returns the refreshed project", async () => {
    const updated = { ...project, episodes: project.episodes.map((episode) => episode.id === "episode-2" ? { ...episode, status: "draft", sceneCount: 1, shotCount: 0 } : episode) };
    mocks.getProject.mockResolvedValueOnce(project).mockResolvedValueOnce(updated);
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.generateEpisodeDraft).toHaveBeenCalledOnce();
    expect(mocks.saveGeneratedEpisode).toHaveBeenCalledWith("project-1", "episode-2", generated, { userId: "owner", isAdmin: false }, { continuity: undefined, outline: "continue" });
    expect((await response.json()).episode).toMatchObject({ id: "episode-2", status: "draft" });
  });

  it("enforces ownership through the project lookup", async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.generateEpisodeDraft).not.toHaveBeenCalled();
    expect(mocks.saveGeneratedEpisode).not.toHaveBeenCalled();
  });

  it("rejects an already generated episode idempotently", async () => {
    mocks.getProject.mockResolvedValueOnce({ ...project, episodes: [{ ...project.episodes[1], status: "draft" }] });
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.generateEpisodeDraft).not.toHaveBeenCalled();
    expect(mocks.saveGeneratedEpisode).not.toHaveBeenCalled();
  });
});
