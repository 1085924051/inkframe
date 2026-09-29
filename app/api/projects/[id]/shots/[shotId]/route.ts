import { NextResponse } from "next/server";
import { getProject, replaceShot, ShotRetakeError } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { retakePrompt } from "../../../../../../lib/shot-retake";

const editableFields = ["title", "duration", "size", "camera", "movement", "imagePrompt", "videoPrompt", "negativePrompt"] as const;
const associationFields = ["characterIds", "referenceAssetIds"] as const;
const requiredFields = new Set<string>(["title", "duration", "size", "camera", "movement", "imagePrompt", "videoPrompt"]);
const fieldLimits: Record<string, number> = { title: 100, duration: 40, size: 100, camera: 100, movement: 100, imagePrompt: 10000, videoPrompt: 10000, negativePrompt: 10000 };

function sceneScriptBlock(script: string, sceneNumber: number) {
  const blocks = script.split(/(?=【场景[一二三四五六七八九十\d])/).filter(Boolean);
  return (blocks[sceneNumber - 1] || "").replace(/【[^】]+】/g, "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

export async function POST(request: Request, context: { params: { id: string; shotId: string } }) {
  const session = await getSession();
  if (!isSameOrigin(request)) return NextResponse.json({ error: "闈炴硶鏉ユ簮" }, { status: 403 });
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  const shot = project?.shots.find((item) => item.id === context.params.shotId);
  if (!project || !shot) return NextResponse.json({ error: "项目或镜头不存在" }, { status: 404 });
  const scene = project.scenes.find((item) => item.number === shot.scene);
  const episode = project.episodes?.find((item) => item.number === (shot.episodeNumber || scene?.episodeNumber || 1));
  const scriptBlock = sceneScriptBlock(episode?.script || project.script || "", shot.scene) || scene?.content || "";
  const takes = [
    { camera: "低机位", movement: "缓慢环绕后推近" },
    { camera: "侧后方近景", movement: "跟随人物动作横移" },
    { camera: "过肩视角", movement: "先固定观察，再快速推近反应" },
  ];
  const take = takes[Date.now() % takes.length];
  const names = (project.characters || []).filter((character) => shot.characterIds?.includes(character.id)).map((character) => character.name);
  const { prompt } = retakePrompt(shot, scriptBlock, names);
  const replacement = {
    ...shot,
    title: shot.title || `${scene?.title || "当前场景"} · 重拍动作版`,
    camera: take.camera,
    movement: take.movement,
    imagePrompt: prompt,
    videoPrompt: prompt,
    negativePrompt: shot.negativePrompt || "text, subtitle, watermark, unrelated characters, inconsistent costume, static pose",
  };
  try {
    const updated = await replaceShot(context.params.id, shot.id, replacement, { userId: session.userId, isAdmin: session.role === "ADMIN" });
    if (!updated) return NextResponse.json({ error: "Project or shot not found" }, { status: 404 });
    return NextResponse.json({ project: updated, replacedShotId: shot.id }, { status: 200 });
  } catch (error) {
    if (error instanceof ShotRetakeError) return NextResponse.json({ error: error.message }, { status: error.code === "ACTIVE_JOB" || error.code === "CONFLICT" ? 409 : 404 });
    throw error;
  }
}

export async function PATCH(request: Request, context: { params: { id: string; shotId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  const shot = project?.shots.find((item) => item.id === context.params.shotId);
  if (!project || !shot) return NextResponse.json({ error: "Project or shot not found" }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid shot data" }, { status: 400 });
  const fields = Object.keys(body);
  if (!fields.length || fields.some((field) => !editableFields.includes(field as typeof editableFields[number]) && !associationFields.includes(field as typeof associationFields[number]))) return NextResponse.json({ error: "Unsupported shot field" }, { status: 400 });
  const data: Partial<Record<typeof editableFields[number], string>> = {};
  const associationData: { characterIdsJson?: string | null; referenceAssetIdsJson?: string | null } = {};
  for (const field of editableFields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const value = (body as Record<string, unknown>)[field];
    if (typeof value !== "string" || value.trim().length > fieldLimits[field] || (requiredFields.has(field) && !value.trim())) {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
    data[field] = value.trim();
  }
  for (const field of associationFields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const value = (body as Record<string, unknown>)[field];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    const ids = Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
    if (field === "characterIds") {
      const valid = await prisma.character.findMany({ where: { id: { in: ids }, projectId: project.id }, select: { id: true } });
      if (valid.length !== ids.length) return NextResponse.json({ error: "关联人物不属于当前项目" }, { status: 400 });
      associationData.characterIdsJson = JSON.stringify(ids);
    } else {
      const valid = await prisma.asset.findMany({ where: { id: { in: ids }, projectId: project.id }, select: { id: true } });
      if (valid.length !== ids.length) return NextResponse.json({ error: "关联资产不属于当前项目" }, { status: 400 });
      associationData.referenceAssetIdsJson = ids.length ? JSON.stringify(ids) : null;
    }
  }
  if (data.title && (/^(?:分镜|shot)\s*\d*$/i.test(data.title) || /[·・]\s*分镜\s*$/i.test(data.title))) {
    return NextResponse.json({ error: "请填写具体的分镜标题" }, { status: 400 });
  }
  if (data.title && project.shots.some((item, index) => {
    if (item.id === shot.id) return false;
    const title = item.title?.trim();
    const earlierDuplicate = project.shots.slice(0, index).some((previous) => previous.title?.trim().toLocaleLowerCase() === title?.toLocaleLowerCase());
    const isTemplate = !title || /^(?:分镜|shot)\s*\d*$/i.test(title) || /[·・]\s*分镜\s*$/i.test(title);
    const sceneTitle = project.scenes.find((scene) => scene.number === item.scene)?.title || `场景 ${item.scene}`;
    const sceneShotNumber = project.shots.slice(0, index + 1).filter((candidate) => candidate.scene === item.scene).length;
    const displayedTitle = isTemplate || earlierDuplicate ? `${sceneTitle} · 镜头 ${sceneShotNumber}` : title;
    return displayedTitle.toLocaleLowerCase() === data.title?.toLocaleLowerCase();
  })) {
    return NextResponse.json({ error: "分镜标题不能重复" }, { status: 409 });
  }
  const activeJob = await prisma.videoJob.findFirst({ where: { shotId: shot.id, status: { in: ["queued", "processing"] } }, select: { id: true } });
  if (activeJob) return NextResponse.json({ error: "镜头正在生成视频，完成后再编辑" }, { status: 409 });
  const changed = await prisma.shot.updateMany({ where: { id: shot.id, scene: { projectId: project.id }, status: { notIn: ["queued", "processing"] } }, data: { ...data, ...associationData } });
  if (!changed.count) return NextResponse.json({ error: "镜头状态已变化，请刷新后重试" }, { status: 409 });
  const updated = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  return NextResponse.json({ project: updated });
}
