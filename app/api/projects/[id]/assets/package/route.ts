import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { buildAssetPackage } from "@/lib/asset-package";
import { prisma } from "@/lib/prisma";
import { isSameOrigin } from "@/lib/rate-limit";

export async function POST(request: Request, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const entries = buildAssetPackage(project);
  const existing = await prisma.asset.findMany({ where: { projectId: project.id, sourceKey: { in: entries.map((entry) => entry.sourceKey) } }, select: { sourceKey: true } });
  const existingKeys = new Set(existing.map((asset) => asset.sourceKey));
  const missing = entries.filter((entry) => !existingKeys.has(entry.sourceKey));
  if (missing.length) {
    await prisma.asset.createMany({
      data: missing.map((entry) => ({ projectId: project.id!, episodeId: entry.episodeId, shotId: entry.shotId, kind: entry.kind, status: "draft", name: entry.name, sourceKey: entry.sourceKey, metadataJson: JSON.stringify(entry.metadata) })),
    });
  }
  const assets = await prisma.asset.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ assets, createdCount: missing.length, totalCount: entries.length });
}
