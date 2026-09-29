import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { isSameOrigin } from "@/lib/rate-limit";

async function allowed(id: string) {
  const session = await getSession();
  if (!session) return null;
  return getProject(id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
}

export async function PATCH(request: Request, context: { params: { id: string; assetId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const project = await allowed(context.params.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = await request.json();
  const asset = await prisma.asset.updateMany({ where: { id: context.params.assetId, projectId: project.id }, data: { ...(body.name !== undefined ? { name: String(body.name) } : {}), ...(body.status !== undefined ? { status: String(body.status) } : {}), ...(body.url !== undefined ? { url: body.url ? String(body.url) : null } : {}), ...(body.metadata !== undefined ? { metadataJson: JSON.stringify(body.metadata) } : {}) } });
  return asset.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Asset not found" }, { status: 404 });
}

export async function DELETE(request: Request, context: { params: { id: string; assetId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const project = await allowed(context.params.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const asset = await prisma.asset.deleteMany({ where: { id: context.params.assetId, projectId: project.id } });
  return asset.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Asset not found" }, { status: 404 });
}
