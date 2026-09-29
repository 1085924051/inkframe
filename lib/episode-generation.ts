import { generateProjectRemotely } from "./ai/providers";
import { listDirectorStyles, listWriterStyles } from "./store";
import { resolveDirector, resolveWriter, runPipeline } from "./pipeline";
import type { EpisodeGenerationContext, EpisodeSummary, GeneratedProject, WriterStyle } from "./types";
import type { ModelUsage } from "./ai/client";

export type EpisodeDraftResult = { project: GeneratedProject; context: EpisodeGenerationContext; usage?: ModelUsage; trace: { stage: string; at: string; summary: string }[] };

function previousEpisodeFor(project: GeneratedProject, episode: EpisodeSummary) {
  return project.episodes?.find((item) => item.number === episode.number - 1 && item.status === "draft")
    ?? project.episodes?.filter((item) => item.number < episode.number && item.status === "draft").sort((a, b) => b.number - a.number)[0];
}

function buildContext(project: GeneratedProject, episode: EpisodeSummary, writer: WriterStyle): EpisodeGenerationContext {
  const previous = previousEpisodeFor(project, episode);
  const previousScenes = previous ? project.scenes.filter((scene) => scene.episodeNumber === previous.number).map((scene) => scene.title) : [];
  const sourceOutline = writer.sourceDigest?.chapterOutline[episode.number - 1];
  return {
    episodeNumber: episode.number,
    episodeGoal: episode.outline || sourceOutline?.summary || `承接第 ${Math.max(1, episode.number - 1)} 集的结尾，推进主线冲突，完成本集转折并留下下一集悬念。`,
    sourceOutline: sourceOutline ? `${sourceOutline.title}${sourceOutline.summary ? `：${sourceOutline.summary}` : ""}` : undefined,
    previousEpisode: previous ? {
      number: previous.number,
      summary: previous.continuity?.summary || previous.logline || "",
      ending: previous.continuity?.ending || previous.script?.slice(-2400) || "",
      sceneTitles: previousScenes,
      continuity: previous.continuity,
    } : undefined,
    characterState: previous?.continuity?.characterState?.length ? previous.continuity.characterState : (project.characters || []),
  };
}

export async function generateEpisodeDraft(input: { project: GeneratedProject; episode: EpisodeSummary; userId: string; modelId?: string }): Promise<EpisodeDraftResult> {
  const [writers, directors] = await Promise.all([listWriterStyles(input.userId), listDirectorStyles(input.userId)]);
  const writer = writers.find((item) => item.id === input.project.writerStyleId) ?? resolveWriter({ writerId: input.project.writerStyleId });
  const director = directors.find((item) => item.id === input.project.directorStyleId) ?? resolveDirector({ directorId: input.project.directorStyleId });
  const context = buildContext(input.project, input.episode, writer);
  const spec = {
    format: "series" as const,
    episodeCount: input.project.episodeCount || 1,
    wordsPerEpisode: input.project.wordsPerEpisode || 500,
    totalTargetWords: input.project.totalTargetWords || (input.project.episodeCount || 1) * (input.project.wordsPerEpisode || 500),
    storyBible: input.project.storyBible,
  };
  const remote = await generateProjectRemotely({
    topic: input.project.topic || input.project.title,
    scriptLength: "series",
    narrativePerspective: input.project.narrativePerspective || "third-person",
    writer,
    director,
    spec,
    episodeContext: context,
    modelId: input.modelId,
  });
  if (remote) {
    return { project: remote.project, context, usage: remote.usage, trace: [{ stage: "continuity", at: new Date().toISOString(), summary: `承接第 ${context.previousEpisode?.number || 0} 集，生成第 ${context.episodeNumber} 集` }, { stage: "llm", at: new Date().toISOString(), summary: `远端模型生成 ${remote.project.shots.length} 个镜头` }] };
  }
  const local = runPipeline({
    topic: input.project.topic || input.project.title,
    scriptLength: "series",
    narrativePerspective: input.project.narrativePerspective || "third-person",
    writerId: input.project.writerStyleId,
    directorId: input.project.directorStyleId,
    writerStyle: writer,
    directorStyle: director,
    spec,
    episodeContext: context,
  });
  return { project: local.project, context, trace: [{ stage: "continuity", at: new Date().toISOString(), summary: `本地回退承接第 ${context.previousEpisode?.number || 0} 集` }, ...local.trace] };
}
