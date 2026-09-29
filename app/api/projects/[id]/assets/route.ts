import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { isSameOrigin } from "@/lib/rate-limit";

async function authorized(id: string) {
  const session = await getSession();
  if (!session) return { session: null, project: null };
  const project = await getProject(id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  return { session, project };
}

export async function GET(_request: Request, context: { params: { id: string } }) {
  const { project } = await authorized(context.params.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const assets = await prisma.asset.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ assets });
}

export async function POST(request: Request, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const { project } = await authorized(context.params.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid asset data" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const allowedFields = new Set(["episodeId", "shotId", "kind", "status", "name", "url", "thumbnailUrl", "provider", "externalId", "metadata", "sourceKey"]);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) return NextResponse.json({ error: "Unsupported asset field" }, { status: 400 });

  const episodeId = input.episodeId === undefined || input.episodeId === null || input.episodeId === "" ? undefined : String(input.episodeId);
  const shotId = input.shotId === undefined || input.shotId === null || input.shotId === "" ? undefined : String(input.shotId);
  const kind = String(input.kind || "reference");
  const status = String(input.status || "draft");
  const name = String(input.name || "Untitled asset").trim();
  const url = input.url ? String(input.url).trim() : undefined;
  const thumbnailUrl = input.thumbnailUrl ? String(input.thumbnailUrl).trim() : undefined;
  const provider = input.provider ? String(input.provider).trim() : undefined;
  const externalId = input.externalId ? String(input.externalId).trim() : undefined;
  const sourceKey = input.sourceKey ? String(input.sourceKey).trim() : undefined;
  const allowedKinds = new Set(["image", "video", "audio", "reference"]);
  const allowedStatuses = new Set(["draft", "queued", "processing", "complete", "failed", "superseded"]);
  if (!name || name.length > 200 || !allowedKinds.has(kind) || !allowedStatuses.has(status)) return NextResponse.json({ error: "Invalid asset name, kind, or status" }, { status: 400 });
  if ([url, thumbnailUrl].some((value) => value && (value.length > 4096 || !/^(https?:\/\/|\/)/i.test(value)))) return NextResponse.json({ error: "Invalid asset URL" }, { status: 400 });
  if ([provider, externalId, sourceKey].some((value) => value && value.length > 200)) return NextResponse.json({ error: "Asset provider, external id, or source key is too long" }, { status: 400 });
  if (input.metadata !== undefined && (typeof input.metadata !== "object" || input.metadata === null || Array.isArray(input.metadata) || JSON.stringify(input.metadata).length > 20000)) return NextResponse.json({ error: "Invalid asset metadata" }, { status: 400 });

  if (episodeId) {
    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId: project.id }, select: { id: true } });
    if (!episode) return NextResponse.json({ error: "Episode does not belong to this project" }, { status: 400 });
  }
  if (shotId) {
    const shot = await prisma.shot.findFirst({ where: { id: shotId, scene: { projectId: project.id }, ...(episodeId ? { scene: { projectId: project.id, episodeId } } : {}) }, select: { id: true } });
    if (!shot) return NextResponse.json({ error: "Shot does not belong to this project or episode" }, { status: 400 });
  }

  const asset = await prisma.asset.create({ data: { projectId: project.id!, episodeId, shotId, kind, status, name, url, thumbnailUrl, provider, externalId, sourceKey, metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined } });
  return NextResponse.json({ asset }, { status: 201 });
}
