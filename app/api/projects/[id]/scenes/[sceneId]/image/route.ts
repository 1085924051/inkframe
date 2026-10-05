import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { createImageJob } from "@/lib/image-jobs";
import { selectedImageProvider } from "@/lib/image";
import { isSameOrigin } from "@/lib/rate-limit";
import { resolutionPrompt } from "@/lib/resolution";
import { recordUsage } from "@/lib/usage";

export async function POST(request: Request, context: { params: { id: string; sceneId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const scene = await prisma.scene.findFirst({ where: { id: context.params.sceneId, projectId: project.id }, include: { episode: true } });
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as { modelId?: string; model?: string; view?: string; prompt?: string; episodeId?: string } | null;
  const provider = await selectedImageProvider(body?.modelId);
  const prompt = body?.prompt || `影棚纯色背景，影视场景参考图，${scene.title}，${scene.content}，high detail, clean production design, no people unless required`;
  const job = await createImageJob({ projectId: project.id!, episodeId: body?.episodeId || scene.episodeId || undefined, sceneId: scene.id, assetType: "scene", view: body?.view || "establishing", modelId: body?.modelId, provider: provider.name, model: body?.model, prompt: `${prompt}；${resolutionPrompt(project.resolutionPreset)}`, negativePrompt: "text, subtitle, watermark, clutter, inconsistent architecture" });
  const { enqueueImageJob } = await import("@/lib/queue"); if (!await enqueueImageJob(job.id)) { const { ensureWorker } = await import("@/lib/worker"); ensureWorker(); }
  await recordUsage({ projectId: project.id, userId: session.userId, kind: "image", provider: provider.name, model: body?.model, modelId: body?.modelId, imageCount: 1, metadata: { imageJobId: job.id, assetType: "scene", view: body?.view || "establishing" } });
  return NextResponse.json({ job }, { status: 202 });
}
