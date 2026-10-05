import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/rate-limit";
import { getProject, saveGeneratedEpisode, EpisodeGenerationError } from "@/lib/store";
import { generateEpisodeDraft } from "@/lib/episode-generation";
import { recordUsage } from "@/lib/usage";

export async function POST(request: Request, context: { params: { id: string; episodeId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = { userId: session.userId, isAdmin: session.role === "ADMIN" };
  const project = await getProject(context.params.id, scope);
  if (!project) return NextResponse.json({ error: "Project or episode not found" }, { status: 404 });
  const episode = project.episodes?.find((item) => item.id === context.params.episodeId);
  if (!episode) return NextResponse.json({ error: "Project or episode not found" }, { status: 404 });
  if (project.projectFormat !== "series") return NextResponse.json({ error: "Only series projects have episodes" }, { status: 409 });
  try {
    const body = await request.json().catch(() => ({})) as { modelId?: string; regenerate?: boolean };
    if (episode.status !== "planned" && !body.regenerate) return NextResponse.json({ error: "该集已经生成过，请使用重新生成本集" }, { status: 409 });
    const draft = await generateEpisodeDraft({ project, episode, userId: session.userId, modelId: body.modelId });
    const saved = await saveGeneratedEpisode(context.params.id, context.params.episodeId, draft.project, scope, { continuity: draft.project.continuity, outline: draft.context.episodeGoal, ...(body.regenerate ? { replace: true } : {}) });
    if (!saved) return NextResponse.json({ error: "Project or episode not found" }, { status: 404 });
    const updatedProject = await getProject(context.params.id, scope);
    if (!updatedProject) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const updatedEpisode = updatedProject.episodes?.find((item) => item.id === saved.episodeId);
    try {
      if (draft.usage) await recordUsage({ projectId: context.params.id, userId: session.userId, kind: "text", provider: "llm", model: draft.usage.model, modelId: typeof body.modelId === "string" ? body.modelId : undefined, inputTokens: draft.usage.inputTokens, outputTokens: draft.usage.outputTokens, metadata: { operation: "episode-generation", episodeNumber: saved.episodeNumber, estimatedTokens: draft.usage.estimated } });
      else await recordUsage({ projectId: context.params.id, userId: session.userId, kind: "text", provider: "local", model: "local-episode-continuity", modelId: typeof body.modelId === "string" ? body.modelId : undefined, inputText: draft.context.episodeGoal, outputText: draft.project.script, metadata: { operation: "episode-generation", episodeNumber: saved.episodeNumber, estimatedTokens: true } });
    } catch (usageError) {
      console.warn("[episode-generation] usage recording failed after episode save", usageError);
    }
    return NextResponse.json({ project: updatedProject, episode: updatedEpisode, trace: draft.trace });
  } catch (error) {
    if (error instanceof EpisodeGenerationError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "EMPTY" ? 422 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[episode-generation] failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "本集生成失败，请稍后重试" }, { status: 502 });
  }
}
