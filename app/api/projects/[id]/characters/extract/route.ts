import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject, listDirectorStyles } from "@/lib/store";
import { extractCharacters } from "@/lib/characters";
import { prisma } from "@/lib/prisma";
import { isSameOrigin } from "@/lib/rate-limit";
import { resolveDirector } from "@/lib/pipeline";

export async function POST(request: Request, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = { userId: session.userId, isAdmin: session.role === "ADMIN" };
  const project = await getProject(context.params.id, scope);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    const body = await request.json().catch(() => ({})) as { modelId?: string; episodeId?: string };
    const directors = await listDirectorStyles(session.userId);
    const director = directors.find((item) => item.id === project.directorStyleId) || resolveDirector({ directorId: project.directorStyleId });
    const episode = body.episodeId ? project.episodes?.find((item) => item.id === body.episodeId) : undefined;
    const episodeScenes = episode ? project.scenes.filter((scene) => scene.episodeNumber === episode.number) : [];
    const episodeSource = episode
      ? [episode.script, episode.logline, episodeScenes.map((scene) => `${scene.title}\n${scene.content}\n${scene.mood}`).join("\n")].filter(Boolean).join("\n")
      : undefined;
    const result = await extractCharacters(project, body.modelId, director.descriptor, episodeSource || project.script);
    await prisma.$transaction(async (tx) => {
      const existing = await tx.character.findMany({ where: { projectId: project.id }, select: { id: true, name: true } });
      for (const character of result.characters) {
        const matched = existing.find((item) => item.name === character.name);
        const id = matched?.id || `character-${crypto.randomUUID()}`;
        await tx.character.upsert({ where: { id }, create: { id, projectId: project.id!, name: character.name, role: character.role, description: character.description, wardrobe: character.wardrobe, accessories: character.accessories, goal: character.goal, traits: character.traits, age: character.age, appearancePrompt: character.appearancePrompt, imagePrompt: character.imagePrompt, negativePrompt: character.negativePrompt, imageStatus: "draft" }, update: { name: character.name, role: character.role, description: character.description, wardrobe: character.wardrobe, accessories: character.accessories, goal: character.goal, traits: character.traits, age: character.age, appearancePrompt: character.appearancePrompt, imagePrompt: character.imagePrompt, negativePrompt: character.negativePrompt } });
      }
    });
    const saved = await prisma.character.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } });
    const episodeCharacterIds = episode
      ? saved.filter((character) => result.characters.some((item) => item.name === character.name)).map((character) => character.id)
      : undefined;
    if (episode && episodeCharacterIds) {
      await prisma.episode.update({ where: { id: episode.id }, data: { characterIdsJson: episodeCharacterIds.length ? JSON.stringify(episodeCharacterIds) : null } });
    }
    return NextResponse.json({ characters: saved, episodeCharacterIds, source: result.source, usage: result.usage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "人物提取失败" }, { status: 502 });
  }
}
