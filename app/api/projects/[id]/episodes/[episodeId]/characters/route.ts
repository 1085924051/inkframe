import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/rate-limit";
import { getProject } from "@/lib/store";
import { prisma } from "@/lib/prisma";

function parseIds(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? Array.from(new Set(parsed.filter((item): item is string => typeof item === "string"))) : [];
  } catch {
    return [] as string[];
  }
}

function metadata(value: string | null) {
  if (!value) return {} as Record<string, string>;
  try { return JSON.parse(value) as Record<string, string>; } catch { return {}; }
}

export async function PATCH(request: Request, context: { params: { id: string; episodeId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = { userId: session.userId, isAdmin: session.role === "ADMIN" };
  const project = await getProject(context.params.id, scope);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as { characterIds?: unknown } | null;
  if (!body || !Array.isArray(body.characterIds) || body.characterIds.some((id) => typeof id !== "string")) return NextResponse.json({ error: "Invalid characterIds" }, { status: 400 });
  const characterIds = Array.from(new Set(body.characterIds.map((id) => id.trim()).filter(Boolean)));

  const episode = await prisma.episode.findFirst({ where: { id: context.params.episodeId, projectId: context.params.id }, include: { scenes: { include: { shots: true } } } });
  if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  const validCharacters = await prisma.character.findMany({ where: { projectId: context.params.id, id: { in: characterIds } }, select: { id: true } });
  if (validCharacters.length !== characterIds.length) return NextResponse.json({ error: "Character does not belong to this project" }, { status: 400 });

  const assets = await prisma.asset.findMany({ where: { projectId: context.params.id }, select: { id: true, metadataJson: true } });
  const assetMeta = new Map(assets.map((asset) => [asset.id, metadata(asset.metadataJson)]));
  await prisma.$transaction(async (tx) => {
    await tx.episode.update({ where: { id: episode.id }, data: { characterIdsJson: characterIds.length ? JSON.stringify(characterIds) : null } });
    for (const scene of episode.scenes) {
      const sceneAssets = assets.filter((asset) => metadata(asset.metadataJson).category === "scene" && metadata(asset.metadataJson).sceneId === scene.id).map((asset) => asset.id);
      const characterAssets = assets.filter((asset) => metadata(asset.metadataJson).category === "character" && characterIds.includes(metadata(asset.metadataJson).characterId || "")).map((asset) => asset.id);
      for (const shot of scene.shots) {
        const existingRefs = parseIds(shot.referenceAssetIdsJson);
        const preserved = existingRefs.filter((id) => {
          const meta = assetMeta.get(id);
          return !meta || (meta.category !== "character" && !(meta.category === "scene" && meta.sceneId === scene.id));
        });
        const referenceAssetIds = Array.from(new Set([...preserved, ...characterAssets, ...sceneAssets]));
        await tx.shot.update({ where: { id: shot.id }, data: { characterIdsJson: characterIds.length ? JSON.stringify(characterIds) : null, referenceAssetIdsJson: referenceAssetIds.length ? JSON.stringify(referenceAssetIds) : null } });
      }
    }
  });
  const updated = await getProject(context.params.id, scope);
  return NextResponse.json({ project: updated });
}
