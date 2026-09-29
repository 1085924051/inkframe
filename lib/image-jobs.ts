import { prisma } from "./prisma";
import type { ImageJobStatus } from "./image";

export type ImageJob = { id: string; projectId: string; episodeId?: string; characterId?: string; sceneId?: string; assetType?: string; view?: string; modelId?: string; provider: string; model?: string; prompt: string; negativePrompt?: string; status: ImageJobStatus; progress: number; externalId?: string; outputUrl?: string; error?: string; createdAt: string; updatedAt: string };

function map(row: { id: string; projectId: string; episodeId: string | null; characterId: string | null; sceneId: string | null; assetType: string; view: string | null; modelId: string | null; provider: string; model: string | null; prompt: string; negativePrompt: string | null; status: string; progress: number; externalId: string | null; outputUrl: string | null; error: string | null; createdAt: Date; updatedAt: Date }): ImageJob {
  return { id: row.id, projectId: row.projectId, episodeId: row.episodeId || undefined, characterId: row.characterId || undefined, sceneId: row.sceneId || undefined, assetType: row.assetType, view: row.view || undefined, modelId: row.modelId || undefined, provider: row.provider, model: row.model || undefined, prompt: row.prompt, negativePrompt: row.negativePrompt || undefined, status: row.status as ImageJobStatus, progress: row.progress, externalId: row.externalId || undefined, outputUrl: row.outputUrl || undefined, error: row.error || undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function createImageJob(input: { projectId: string; episodeId?: string; characterId?: string; sceneId?: string; assetType?: string; view?: string; modelId?: string; provider: string; model?: string; prompt: string; negativePrompt?: string }) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { directorStyle: { select: { descriptor: true } } } });
  const descriptor = project?.directorStyle.descriptor.trim();
  const prompt = descriptor && !input.prompt.includes(descriptor) ? `${descriptor}; ${input.prompt}` : input.prompt;
  const row = await prisma.imageJob.create({ data: { projectId: input.projectId, episodeId: input.episodeId, characterId: input.characterId, sceneId: input.sceneId, assetType: input.assetType || "character", view: input.view, modelId: input.modelId, provider: input.provider, model: input.model, prompt, negativePrompt: input.negativePrompt, status: "queued" } });
  if (input.characterId) await prisma.character.update({ where: { id: input.characterId }, data: { imageStatus: "queued", imageProvider: input.provider, imageModel: input.model } });
  return map(row);
}

export async function getImageJob(id: string) {
  const row = await prisma.imageJob.findUnique({ where: { id } });
  return row ? map(row) : null;
}

export async function listImageJobsForProject(projectId: string) {
  const rows = await prisma.imageJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  return rows.map(map);
}

export async function listActiveImageJobs() {
  const rows = await prisma.imageJob.findMany({ where: { status: { in: ["queued", "processing"] } }, orderBy: { createdAt: "asc" } });
  return rows.map(map);
}

export async function updateImageJob(id: string, patch: Partial<Pick<ImageJob, "status" | "progress" | "externalId" | "outputUrl" | "error">>) {
  const row = await prisma.imageJob.update({ where: { id }, data: patch });
  return map(row);
}
