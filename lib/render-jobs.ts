import { prisma } from "./prisma";

export type RenderJobStatus = "queued" | "processing" | "complete" | "failed";
export type RenderJob = { id: string; projectId: string; episodeId?: string; status: RenderJobStatus; progress: number; outputUrl?: string; error?: string; createdAt: string; updatedAt: string };

type RenderJobRow = { id: string; projectId: string; episodeId: string | null; status: string; progress: number; outputUrl: string | null; error: string | null; createdAt: Date; updatedAt: Date };

function toRenderJob(row: RenderJobRow): RenderJob {
  return { id: row.id, projectId: row.projectId, episodeId: row.episodeId ?? undefined, status: row.status as RenderJobStatus, progress: row.progress, outputUrl: row.outputUrl ?? undefined, error: row.error ?? undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function createRenderJob(input: { projectId: string; episodeId?: string }): Promise<{ job: RenderJob; reused: boolean }> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.renderJob.findFirst({ where: { projectId: input.projectId, episodeId: input.episodeId ?? null, status: { in: ["queued", "processing"] } }, orderBy: { createdAt: "desc" } });
    if (existing) return { row: existing, reused: true };
    const row = await tx.renderJob.create({ data: { projectId: input.projectId, episodeId: input.episodeId, status: "queued", progress: 0 } });
    return { row, reused: false };
  });
  return { job: toRenderJob(result.row), reused: result.reused };
}

export async function getRenderJob(id: string): Promise<RenderJob | null> {
  const row = await prisma.renderJob.findUnique({ where: { id } });
  return row ? toRenderJob(row) : null;
}

export async function getRenderJobForProject(id: string, projectId: string): Promise<RenderJob | null> {
  const row = await prisma.renderJob.findFirst({ where: { id, projectId } });
  return row ? toRenderJob(row) : null;
}

export async function listActiveRenderJobs(): Promise<RenderJob[]> {
  const rows = await prisma.renderJob.findMany({ where: { status: { in: ["queued", "processing"] } }, orderBy: { createdAt: "asc" } });
  return rows.map(toRenderJob);
}

export async function updateRenderJob(id: string, patch: Partial<Pick<RenderJob, "status" | "progress" | "outputUrl" | "error">>): Promise<RenderJob> {
  const row = await prisma.renderJob.update({ where: { id }, data: { ...(patch.status !== undefined ? { status: patch.status } : {}), ...(patch.progress !== undefined ? { progress: patch.progress } : {}), ...(patch.outputUrl !== undefined ? { outputUrl: patch.outputUrl } : {}), ...(patch.error !== undefined ? { error: patch.error } : {}) } });
  return toRenderJob(row);
}
