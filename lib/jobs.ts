import { prisma } from "./prisma";
import type { VideoJob, VideoJobStatus } from "./video";

type JobRow = {
  id: string;
  shotId: string;
  provider: string;
  model: string | null;
  externalId: string | null;
  status: string;
  progress: number;
  outputUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toVideoJob(row: JobRow): VideoJob {
  return {
    id: row.id,
    shotId: row.shotId,
    provider: row.provider,
    model: row.model ?? undefined,
    externalId: row.externalId ?? undefined,
    status: row.status as VideoJobStatus,
    progress: row.progress,
    outputUrl: row.outputUrl ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type VideoJobPatch = Partial<Pick<VideoJob, "externalId" | "status" | "progress" | "outputUrl" | "error">>;

export async function createVideoJob(input: { shotId: string; provider: string; model?: string }): Promise<{ job: VideoJob; reused: boolean }> {
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.shot.updateMany({
      where: { id: input.shotId, status: { notIn: ["queued", "processing"] } },
      data: { status: "queued" },
    });
    if (!claimed.count) {
      const existing = await tx.videoJob.findFirst({
        where: { shotId: input.shotId, status: { in: ["queued", "processing"] } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return { row: existing, reused: true };
      throw new Error("镜头当前不可提交视频任务");
    }
    const row = await tx.videoJob.create({
      data: { shotId: input.shotId, provider: input.provider, model: input.model || null, status: "queued", progress: 0 },
    });
    return { row, reused: false };
  });
  return { job: toVideoJob(result.row), reused: result.reused };
}

export async function getVideoJob(id: string): Promise<VideoJob | null> {
  const row = await prisma.videoJob.findUnique({ where: { id } });
  return row ? toVideoJob(row) : null;
}

export async function getVideoJobForProject(id: string, projectId: string): Promise<VideoJob | null> {
  const row = await prisma.videoJob.findFirst({ where: { id, shot: { scene: { projectId } } } });
  return row ? toVideoJob(row) : null;
}

export async function listActiveVideoJobs(): Promise<VideoJob[]> {
  const rows = await prisma.videoJob.findMany({
    where: { status: { in: ["queued", "processing"] } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toVideoJob);
}

export async function listVideoJobsForProject(projectId: string): Promise<VideoJob[]> {
  const rows = await prisma.videoJob.findMany({
    where: { shot: { scene: { projectId } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toVideoJob);
}

export async function updateVideoJob(id: string, patch: VideoJobPatch): Promise<VideoJob> {
  const row = await prisma.videoJob.update({
    where: { id },
    data: {
      ...(patch.externalId !== undefined ? { externalId: patch.externalId } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
      ...(patch.outputUrl !== undefined ? { outputUrl: patch.outputUrl } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    },
  });
  return toVideoJob(row);
}
