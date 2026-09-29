import { Queue } from "bullmq/dist/esm/classes/queue";
import { Worker } from "bullmq/dist/esm/classes/worker";
import IORedis from "ioredis";

const QUEUE_NAME = "inkframe-video";
let queue: Queue | null = null;
let worker: Worker | null = null;

function redisUrl() {
  return process.env.REDIS_URL || "";
}

function connection() {
  const url = redisUrl();
  if (!url) return null;
  return new IORedis(url, { maxRetriesPerRequest: null });
}

async function ensureQueue() {
  const client = connection();
  if (!client) return false;
  queue ??= new Queue(QUEUE_NAME, { connection: client });
  if (!worker) {
    worker = new Worker(QUEUE_NAME, async (job) => {
      if (job.data.kind === "render") {
        const { processRenderJob } = await import("./worker");
        await processRenderJob(String(job.data.jobId));
      } else if (job.data.kind === "image") {
        const { processImageJob } = await import("./worker");
        await processImageJob(String(job.data.jobId));
      } else {
        const { processVideoJob } = await import("./worker");
        await processVideoJob(String(job.data.jobId));
      }
    }, { connection: client, concurrency: 2 });
    worker.on("failed", (job, error) => console.error(`[queue] job ${job?.id} failed`, error));
  }
  return true;
}

export function redisQueueEnabled() {
  return Boolean(redisUrl());
}

export async function enqueueVideoJob(jobId: string): Promise<boolean> {
  if (!await ensureQueue()) return false;
  await queue!.add("video", { jobId }, { jobId, removeOnComplete: 100, removeOnFail: 500 });
  return true;
}

export async function enqueueRenderJob(jobId: string): Promise<boolean> {
  if (!await ensureQueue()) return false;
  await queue!.add("render", { jobId, kind: "render" }, { jobId: `render-${jobId}`, removeOnComplete: 100, removeOnFail: 500 });
  return true;
}

export async function enqueueImageJob(jobId: string): Promise<boolean> {
  if (!await ensureQueue()) return false;
  await queue!.add("image", { jobId, kind: "image" }, { jobId: `image-${jobId}`, removeOnComplete: 100, removeOnFail: 500 });
  return true;
}
