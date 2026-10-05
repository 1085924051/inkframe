import { NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { submitVideoJob } from "@/lib/worker";
import { recordUsage } from "@/lib/usage";
import { isSameOrigin } from "@/lib/rate-limit";
import { listVideoJobsForProject } from "@/lib/jobs";
import { assertVideoReferenceCapacity, validateVideoProviderConfig } from "@/lib/video";
import { prisma } from "@/lib/prisma";
import { shotDurationSeconds } from "@/lib/shot-retake";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  const project = await getProject(projectId, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json({ jobs: await listVideoJobsForProject(project.id!) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const project = await getProject(String(body.projectId), { userId: session.userId, isAdmin: session.role === "ADMIN" });
  const shot = project?.shots.find((item) => item.id === body.shotId);
  if (!project || !shot) return NextResponse.json({ error: "项目或镜头不存在" }, { status: 404 });
  const selectedModelId = typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : undefined;
  const channelModel = selectedModelId ? await prisma.modelChannelModel.findUnique({ where: { id: selectedModelId }, select: { id: true, name: true, kind: true, enabled: true, channel: { select: { enabled: true } } } }) : null;
  const profileModel = selectedModelId && !channelModel ? await prisma.modelProfile.findUnique({ where: { id: selectedModelId }, select: { id: true, model: true, kind: true, enabled: true } }) : null;
  if (selectedModelId && (!channelModel && !profileModel || channelModel && (channelModel.kind !== "video" || !channelModel.enabled || !channelModel.channel.enabled) || profileModel && (profileModel.kind !== "video" || !profileModel.enabled))) return NextResponse.json({ error: "所选视频模型不存在或已停用" }, { status: 400 });
  const providerName = channelModel ? `channel:${channelModel.id}` : String(body.provider || "mock-video");
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
  const providerConfig = await validateVideoProviderConfig(providerName);
  if (!providerConfig.valid) {
    return NextResponse.json({ error: providerConfig.message, provider: providerName, missing: providerConfig.missing }, { status: 400 });
  }
  const ids = shot.referenceAssetIds || [];
  const references = ids.length ? await prisma.asset.findMany({ where: { id: { in: ids }, projectId: project.id, url: { not: null }, kind: { in: ["image", "reference"] } }, select: { id: true, url: true } }) : [];
  const urls = ids.map((id) => references.find((asset) => asset.id === id)?.url).filter((url): url is string => Boolean(url));
  try { assertVideoReferenceCapacity(providerName, urls); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "视频参考图不受支持" }, { status: 400 }); }
  const job = await submitVideoJob(shot.id, providerName, model);
  if (!job.reused) await recordUsage({ projectId: project.id, userId: session.userId, kind: "video", provider: providerName, model: model || channelModel?.name || profileModel?.model, modelId: selectedModelId, durationSeconds: shotDurationSeconds(shot.duration), metadata: { shotId: shot.id, jobId: job.id } });
  return NextResponse.json({ job }, { status: job.reused ? 200 : 202 });
}
