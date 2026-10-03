import { prisma } from "./prisma";
import { createVideoJob, getVideoJob, listActiveVideoJobs, updateVideoJob } from "./jobs";
import { createRenderJob, getRenderJob, listActiveRenderJobs, updateRenderJob } from "./render-jobs";
import { configuredChannelVideoProvider, videoProviders, type VideoProvider } from "./video";
import type { Shot } from "./types";
import { composeVideos } from "./compose";
import { getImageJob, listActiveImageJobs, updateImageJob } from "./image-jobs";
import { selectedImageProvider } from "./image";

const POLL_INTERVAL_MS = 600;

async function providerFor(name: string): Promise<VideoProvider> {
  const configured = await configuredChannelVideoProvider(name);
  return configured ?? videoProviders[name] ?? videoProviders["mock-video"];
}

async function loadShot(id: string): Promise<Shot | null> {
  const row = await prisma.shot.findUnique({ where: { id }, include: { scene: true } });
  if (!row) return null;
  const referenceAssetIds = row.referenceAssetIdsJson ? JSON.parse(row.referenceAssetIdsJson) as string[] : [];
  const referenceAssets = referenceAssetIds.length ? await prisma.asset.findMany({ where: { id: { in: referenceAssetIds }, projectId: row.scene.projectId, url: { not: null }, kind: { in: ["image", "reference"] } }, select: { id: true, url: true } }) : [];
  const orderedReferenceUrls = referenceAssetIds.map((id) => referenceAssets.find((asset) => asset.id === id)?.url).filter((url): url is string => Boolean(url));
  return {
    id: row.id,
    scene: row.scene.number,
    duration: row.duration,
    size: row.size,
    camera: row.camera,
    movement: row.movement,
    imagePrompt: row.imagePrompt,
    videoPrompt: row.videoPrompt,
    negativePrompt: row.negativePrompt,
    referenceAssetIds,
    referenceAssetUrls: orderedReferenceUrls,
  };
}

async function failJob(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const job = await updateVideoJob(id, { status: "failed", error: message });
  await prisma.shot.update({ where: { id: job.shotId }, data: { status: "failed" } });
}

export async function processVideoJob(id: string): Promise<void> {
  let job = await getVideoJob(id);
  if (!job || job.status === "complete" || job.status === "failed") return;
  const provider = await providerFor(job.provider);

  if (job.status === "queued") {
    await updateVideoJob(id, { status: "processing", progress: 10 });
    await prisma.shot.update({ where: { id: job.shotId }, data: { status: "processing" } });
    if (!job.externalId) {
      const shot = await loadShot(job.shotId);
      if (!shot) return failJob(id, new Error("镜头不存在"));
      try {
        const submitted = await provider.submit({ ...shot, model: job.model || undefined });
        await updateVideoJob(id, { externalId: submitted.externalId });
      } catch (error) {
        return failJob(id, error);
      }
    }
    job = (await getVideoJob(id)) ?? job;
  }

  try {
    const current = await provider.getStatus(job.externalId ?? job.id);
    if (current.status === "complete") {
      await updateVideoJob(id, { status: "complete", progress: 100, outputUrl: current.outputUrl });
      await prisma.shot.update({ where: { id: job.shotId }, data: { status: "complete" } });
      if (current.outputUrl) {
        const shot = await prisma.shot.findUnique({ where: { id: job.shotId }, include: { scene: true } });
        if (shot) await prisma.asset.upsert({ where: { id: `video-${job.id}` }, create: { id: `video-${job.id}`, projectId: shot.scene.projectId, shotId: shot.id, kind: "video", status: "complete", name: `Shot ${shot.id} video`, url: current.outputUrl, provider: job.provider, externalId: job.externalId }, update: { status: "complete", url: current.outputUrl, provider: job.provider, externalId: job.externalId } });
      }
    } else if (current.status === "failed") {
      return failJob(id, new Error(current.error || "provider reported failure"));
    } else {
      await updateVideoJob(id, { status: "processing", progress: Math.max(10, current.progress ?? job.progress) });
    }
  } catch (error) {
    return failJob(id, error);
  }
}

async function failImageJob(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const job = await updateImageJob(id, { status: "failed", progress: 100, error: message });
  if (job.characterId) await prisma.character.update({ where: { id: job.characterId }, data: { imageStatus: "failed" } });
}

export async function processImageJob(id: string): Promise<void> {
  let job = await getImageJob(id);
  if (!job || job.status === "complete" || job.status === "failed") return;
  const provider = await selectedImageProvider(job.provider);
  try {
    if (job.status === "queued") {
      await updateImageJob(id, { status: "processing", progress: 10 });
      if (!job.externalId && !job.outputUrl) {
        const submitted = await provider.submit({ prompt: job.prompt, negativePrompt: job.negativePrompt, model: job.model });
        await updateImageJob(id, { externalId: "externalId" in submitted ? submitted.externalId : undefined, outputUrl: submitted.outputUrl });
      }
      job = (await getImageJob(id)) || job;
    }
    const current = job.outputUrl ? { status: "complete" as const, progress: 100, outputUrl: job.outputUrl } : await provider.getStatus(job.externalId || job.id);
    if (current.status === "complete") {
      const outputUrl = ("outputUrl" in current ? current.outputUrl : undefined) || job.outputUrl;
      await updateImageJob(id, { status: "complete", progress: 100, outputUrl });
      if (job.characterId) {
        const character = await prisma.character.update({ where: { id: job.characterId }, data: { imageStatus: "complete" } });
        if (outputUrl) {
          const view = job.view || "front";
          const asset = await prisma.asset.upsert({ where: { id: `character-${character.id}-${job.episodeId || "project"}-${view}` }, create: { id: `character-${character.id}-${job.episodeId || "project"}-${view}`, projectId: job.projectId, episodeId: job.episodeId, kind: "reference", status: "complete", name: `人物参考 · ${character.name} · ${view}`, url: outputUrl, provider: job.provider, externalId: job.externalId, sourceKey: `character-reference:${character.id}:${job.episodeId || "project"}:${view}`, metadataJson: JSON.stringify({ category: "character", characterId: character.id, episodeId: job.episodeId, view, prompt: job.prompt, model: job.model }) }, update: { status: "complete", url: outputUrl, provider: job.provider, externalId: job.externalId, metadataJson: JSON.stringify({ category: "character", characterId: character.id, episodeId: job.episodeId, view, prompt: job.prompt, model: job.model }) } });
          if (view === "front") await prisma.character.update({ where: { id: character.id }, data: { referenceAssetId: asset.id } });
        }
      }
      if (job.sceneId && outputUrl) {
        const scene = await prisma.scene.findUnique({ where: { id: job.sceneId }, select: { title: true } });
        const view = job.view || "establishing";
        await prisma.asset.upsert({ where: { id: `scene-${job.sceneId}-${job.episodeId || "project"}-${view}` }, create: { id: `scene-${job.sceneId}-${job.episodeId || "project"}-${view}`, projectId: job.projectId, episodeId: job.episodeId, kind: "reference", status: "complete", name: `场景参考 · ${scene?.title || job.sceneId} · ${view}`, url: outputUrl, provider: job.provider, externalId: job.externalId, sourceKey: `scene-reference:${job.sceneId}:${job.episodeId || "project"}:${view}`, metadataJson: JSON.stringify({ category: "scene", sceneId: job.sceneId, episodeId: job.episodeId, view, prompt: job.prompt, model: job.model }) }, update: { status: "complete", url: outputUrl, provider: job.provider, externalId: job.externalId } });
      }
    } else if (current.status === "failed") await failImageJob(id, new Error("图像 Provider 返回失败"));
    else await updateImageJob(id, { status: "processing", progress: Math.max(10, current.progress) });
  } catch (error) { await failImageJob(id, error); }
}

async function failRenderJob(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await updateRenderJob(id, { status: "failed", progress: 100, error: message });
}

export async function processRenderJob(id: string): Promise<void> {
  let job = await getRenderJob(id);
  if (!job || job.status === "complete" || job.status === "failed") return;
  if (job.status === "queued") {
    job = await updateRenderJob(id, { status: "processing", progress: 10 });
  }

  const project = await prisma.project.findUnique({
    where: { id: job.projectId },
    include: { scenes: { orderBy: { number: "asc" }, include: { shots: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } } },
  });
  if (!project) return failRenderJob(id, new Error("项目不存在"));
  const scenes = job.episodeId ? project.scenes.filter((scene) => scene.episodeId === job.episodeId) : project.scenes;
  const shots = scenes.flatMap((scene) => scene.shots);
  if (!shots.length) return failRenderJob(id, new Error("没有可合成的镜头"));

  const completedJobs = await prisma.videoJob.findMany({ where: { shotId: { in: shots.map((shot) => shot.id) }, status: "complete" }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
  const outputByShot = new Map<string, string>();
  for (const videoJob of completedJobs) if (videoJob.outputUrl) outputByShot.set(videoJob.shotId, videoJob.outputUrl);
  const urls = shots.map((shot) => outputByShot.get(shot.id));
  if (urls.some((url) => !url)) return failRenderJob(id, new Error("仍有镜头素材未完成"));

  await updateRenderJob(id, { progress: 60 });
  try {
    const finalVideoUrl = await composeVideos({ projectId: `${project.id}-${job.episodeId || "full"}`, urls: urls as string[] });
    await prisma.project.update({ where: { id: project.id }, data: { finalVideoUrl } });
    await updateRenderJob(id, { status: "complete", progress: 100, outputUrl: finalVideoUrl });
  } catch (error) {
    await failRenderJob(id, error);
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const jobs = await listActiveVideoJobs();
    for (const job of jobs) await processVideoJob(job.id);
    const imageJobs = await listActiveImageJobs();
    for (const job of imageJobs) await processImageJob(job.id);
    const renderJobs = await listActiveRenderJobs();
    for (const job of renderJobs) await processRenderJob(job.id);
  } catch (error) {
    console.error("[worker] tick failed:", error);
  } finally {
    running = false;
  }
}

declare global { var __inkframeVideoWorkerStarted: boolean | undefined; }

export function ensureWorker() {
  if (globalThis.__inkframeVideoWorkerStarted) return;
  globalThis.__inkframeVideoWorkerStarted = true;
  const interval = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
  if (typeof interval.unref === "function") interval.unref();
  console.log("[worker] video job worker started");
  void tick();
}

export async function submitVideoJob(shotId: string, providerName: string, model?: string) {
  const provider = await providerFor(providerName);
  const { job, reused } = await createVideoJob({ shotId, provider: provider.name, model });
  if (reused) return { ...job, reused: true };
  const { enqueueVideoJob } = await import("./queue");
  if (!await enqueueVideoJob(job.id)) ensureWorker();
  return { ...job, reused: false };
}

export async function submitRenderJob(projectId: string, episodeId?: string) {
  const { job, reused } = await createRenderJob({ projectId, episodeId });
  if (reused) return { ...job, reused: true };
  const { enqueueRenderJob } = await import("./queue");
  if (!await enqueueRenderJob(job.id)) ensureWorker();
  return { ...job, reused: false };
}
