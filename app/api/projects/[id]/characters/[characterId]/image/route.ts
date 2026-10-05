import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { createImageJob } from "@/lib/image-jobs";
import { selectedImageProvider } from "@/lib/image";
import { isSameOrigin } from "@/lib/rate-limit";
import { resolutionPrompt } from "@/lib/resolution";
import { recordUsage } from "@/lib/usage";

export async function POST(request: Request, context: { params: { id: string; characterId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const character = await prisma.character.findFirst({ where: { id: context.params.characterId, projectId: project.id } });
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as { modelId?: string; model?: string; prompt?: string; negativePrompt?: string; view?: string; episodeId?: string } | null;
  const provider = await selectedImageProvider(body?.modelId);
  const prompt = `${body?.prompt || character.imagePrompt || character.appearancePrompt || character.description}；${resolutionPrompt(project.resolutionPreset)}`;
  const job = await createImageJob({ projectId: project.id!, episodeId: body?.episodeId, characterId: character.id, assetType: "character", view: body?.view || "front", modelId: body?.modelId, provider: provider.name, model: body?.model || character.imageModel || undefined, prompt, negativePrompt: body?.negativePrompt || character.negativePrompt || undefined });
  const { enqueueImageJob } = await import("@/lib/queue");
  if (!await enqueueImageJob(job.id)) { const { ensureWorker } = await import("@/lib/worker"); ensureWorker(); }
  await recordUsage({ projectId: project.id, userId: session.userId, kind: "image", provider: provider.name, model: body?.model, modelId: body?.modelId, imageCount: 1, metadata: { imageJobId: job.id, assetType: "character", view: body?.view || "front" } });
  return NextResponse.json({ job }, { status: 202 });
}
