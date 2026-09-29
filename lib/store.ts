import { prisma } from "./prisma";
import { directorStyles, writerStyles } from "./styles";
import { groundCharactersToSource } from "./characters";
import type { EpisodeContinuity, GeneratedProject, NarrativePerspective, ScriptLength, Shot, ShotStatus, WriterStyle } from "./types";

export type ProjectScope = { userId: string; isAdmin: boolean };

async function ensureWriterStyle(id: string) {
  const existing = await prisma.writerStyle.findUnique({ where: { id } });
  if (existing) return existing;
  const curated = writerStyles.find((style) => style.id === id) ?? writerStyles[0];
  return prisma.writerStyle.upsert({
    where: { id: curated.id },
    create: {
      id: curated.id,
      name: curated.name,
      era: curated.era,
      summary: curated.summary,
      tags: JSON.stringify(curated.tags),
      axesJson: JSON.stringify(curated.axes),
      sample: curated.sample,
      sourceDigestJson: curated.sourceDigest ? JSON.stringify(curated.sourceDigest) : null,
    },
    update: {},
  });
}

async function ensureDirectorStyle(id: string) {
  const existing = await prisma.directorStyle.findUnique({ where: { id } });
  if (existing) return existing;
  const curated = directorStyles.find((style) => style.id === id) ?? directorStyles[0];
  return prisma.directorStyle.upsert({
    where: { id: curated.id },
    create: {
      id: curated.id,
      name: curated.name,
      summary: curated.summary,
      paletteJson: JSON.stringify(curated.palette),
      descriptor: curated.descriptor,
      lora: curated.lora,
    },
    update: {},
  });
}

export async function saveProject(
  project: GeneratedProject,
  meta: { writerId: string; directorId: string; userId: string; format?: "single" | "series"; episodeCount?: number; wordsPerEpisode?: number; storyBible?: string; scriptLength?: ScriptLength; narrativePerspective?: NarrativePerspective }
): Promise<GeneratedProject> {
  const [writerStyle, directorStyle] = await Promise.all([
    ensureWriterStyle(meta.writerId || "luxun"),
    ensureDirectorStyle(meta.directorId || "wong-kar-wai"),
  ]);

  // 分镜和人物 id 在生成器中只对当前草稿唯一，落库后统一换成全局 id。
  const shotIdMap = new Map<string, string>();
  const characterIdMap = new Map<string, string>();
  const projectSourceText = [
    project.script,
    ...project.scenes.flatMap((scene) => [scene.title, scene.content, scene.mood]),
  ].filter((value): value is string => typeof value === "string").join("\n");
  const sourceGroundedCharacters = groundCharactersToSource(project.characters ?? [], projectSourceText);
  const mappedCharacters = sourceGroundedCharacters.map((character) => {
    const newId = `character-${crypto.randomUUID()}`;
    characterIdMap.set(character.id, newId);
    return { ...character, id: newId };
  });
  const mappedShots = project.shots.map((shot) => {
    const newId = `shot-${crypto.randomUUID()}`;
    shotIdMap.set(shot.id, newId);
    return { ...shot, id: newId, characterIds: shot.characterIds?.map((id) => characterIdMap.get(id) ?? id) };
  });

  const created = await prisma.project.create({
    data: {
      ...(project.id ? { id: project.id } : {}),
      title: project.title,
      topic: project.topic || project.title,
      writerStyleId: writerStyle.id,
      directorStyleId: directorStyle.id,
      userId: meta.userId,
      format: meta.format ?? project.projectFormat ?? "single",
      episodeCount: Math.max(1, meta.episodeCount ?? project.episodeCount ?? 1),
      targetWords: Math.max(100, meta.wordsPerEpisode ?? project.wordsPerEpisode ?? 500),
      scriptLength: meta.scriptLength ?? project.scriptLength ?? "short",
      narrativePerspective: meta.narrativePerspective ?? project.narrativePerspective ?? "third-person",
      storyBibleJson: meta.storyBible ?? project.storyBible ?? null,
      script: {
        create: { content: project.script, logline: project.logline, version: 1 },
      },
      characters: {
        create: mappedCharacters.map((character) => ({ id: character.id, name: character.name, role: character.role, description: character.description, wardrobe: character.wardrobe, accessories: character.accessories, goal: character.goal, traits: character.traits, age: character.age, appearancePrompt: character.appearancePrompt, imagePrompt: character.imagePrompt, negativePrompt: character.negativePrompt, imageStatus: character.imageStatus || "draft" })),
      },
      scenes: {
        create: project.scenes.map((scene) => ({
          number: scene.number,
          title: scene.title,
          content: scene.content,
          mood: scene.mood || "",
          shots: {
            create: mappedShots
              .filter((shot) => shot.scene === scene.number)
              .map((shot) => ({
                id: shot.id,
                title: shot.title || "",
                duration: shot.duration,
                size: shot.size,
                camera: shot.camera,
                movement: shot.movement,
                imagePrompt: shot.imagePrompt,
                videoPrompt: shot.videoPrompt,
                negativePrompt: shot.negativePrompt,
                characterContext: shot.characterContext,
                characterIdsJson: shot.characterIds?.length ? JSON.stringify(shot.characterIds) : undefined,
                referenceAssetIdsJson: shot.referenceAssetIds?.length ? JSON.stringify(shot.referenceAssetIds) : undefined,
                status: "draft",
              })),
          },
        })),
      },
    },
  });

  const episodeCount = Math.max(1, meta.episodeCount ?? project.episodeCount ?? 1);
  if ((meta.format ?? project.projectFormat) === "series" || episodeCount > 1) {
    await prisma.episode.createMany({
      data: Array.from({ length: episodeCount }, (_, index) => ({ projectId: created.id, number: index + 1, title: "Episode " + (index + 1), logline: index === 0 ? project.logline : undefined, script: index === 0 ? project.script : undefined, continuityJson: index === 0 && project.continuity ? JSON.stringify(project.continuity) : undefined, characterIdsJson: index === 0 && mappedCharacters.length ? JSON.stringify(mappedCharacters.map((character) => character.id)) : undefined, status: index === 0 ? "draft" : "planned" })),
    });
    await prisma.scene.updateMany({ where: { projectId: created.id }, data: { episodeId: (await prisma.episode.findFirst({ where: { projectId: created.id, number: 1 } }))?.id } });
  }
  const storedEpisodes = await prisma.episode.findMany({ where: { projectId: created.id }, orderBy: { number: "asc" }, include: { _count: { select: { scenes: true } }, scenes: { select: { _count: { select: { shots: true } } } } } });

  return {
    ...project,
    id: created.id,
    finalVideoUrl: undefined,
    writerStyleId: writerStyle.id,
    directorStyleId: directorStyle.id,
    projectFormat: (meta.format ?? project.projectFormat ?? "single") as "single" | "series",
    episodeCount,
    wordsPerEpisode: meta.wordsPerEpisode ?? project.wordsPerEpisode ?? 500,
    totalTargetWords: (meta.wordsPerEpisode ?? project.wordsPerEpisode ?? 500) * episodeCount,
    scriptLength: meta.scriptLength ?? project.scriptLength ?? "short",
    narrativePerspective: meta.narrativePerspective ?? project.narrativePerspective ?? "third-person",
    storyBible: meta.storyBible ?? project.storyBible,
    episodes: storedEpisodes.map((episode) => ({ id: episode.id, number: episode.number, title: episode.title, status: episode.status, outline: episode.outline || undefined, logline: episode.logline || undefined, script: episode.script || undefined, continuity: episode.continuityJson ? JSON.parse(episode.continuityJson) as EpisodeContinuity : undefined, characterIds: episode.characterIdsJson ? JSON.parse(episode.characterIdsJson) as string[] : undefined, sceneCount: episode._count.scenes, shotCount: episode.scenes.reduce((sum, scene) => sum + scene._count.shots, 0) })),
    characters: sourceGroundedCharacters.map((character) => ({ ...character, id: characterIdMap.get(character.id) ?? character.id })),
    shots: mappedShots.map(({ characterIds: _characterIds, ...shot }) => ({ ...shot, status: "draft" as const })),
  };
}

export async function updateProjectContent(
  projectId: string,
  project: GeneratedProject,
  meta: { userId: string; isAdmin?: boolean; writerId?: string; directorId?: string; format?: "single" | "series"; episodeCount?: number; wordsPerEpisode?: number; storyBible?: string; scriptLength?: ScriptLength; narrativePerspective?: NarrativePerspective },
): Promise<GeneratedProject | null> {
  const owner = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!owner || (!meta.isAdmin && owner.userId !== meta.userId)) return null;
  const [writerStyle, directorStyle] = await Promise.all([
    meta.writerId ? ensureWriterStyle(meta.writerId) : null,
    meta.directorId ? ensureDirectorStyle(meta.directorId) : null,
  ]);
  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { ...(writerStyle ? { writerStyleId: writerStyle.id } : {}), ...(directorStyle ? { directorStyleId: directorStyle.id } : {}), topic: project.topic || project.title, format: meta.format ?? project.projectFormat ?? "single", episodeCount: Math.max(1, meta.episodeCount ?? project.episodeCount ?? 1), targetWords: Math.max(100, meta.wordsPerEpisode ?? project.wordsPerEpisode ?? 500), scriptLength: meta.scriptLength ?? project.scriptLength ?? "short", narrativePerspective: meta.narrativePerspective ?? project.narrativePerspective ?? "third-person", storyBibleJson: meta.storyBible ?? project.storyBible ?? null } });
    await tx.script.upsert({ where: { projectId }, create: { projectId, content: project.script, logline: project.logline, version: 1 }, update: { content: project.script, logline: project.logline, version: { increment: 1 } } });
    const existingCharacters = await tx.character.findMany({ where: { projectId }, select: { id: true, name: true } });
    const sourceText = [project.script, ...project.scenes.flatMap((scene) => [scene.title, scene.content, scene.mood])].filter((value): value is string => typeof value === "string").join("\n");
    const groundedCharacters = groundCharactersToSource(project.characters ?? [], sourceText, existingCharacters);
    const contentCharacterIdMap = new Map<string, string>();
    for (const character of groundedCharacters) {
      const existing = existingCharacters.find((item) => item.name === character.name);
      const id = existing?.id || `character-${crypto.randomUUID()}`;
      contentCharacterIdMap.set(character.id, id);
      await tx.character.upsert({
        where: { id },
        create: { id, projectId, name: character.name, role: character.role, description: character.description, wardrobe: character.wardrobe, accessories: character.accessories, goal: character.goal, traits: character.traits, age: character.age, appearancePrompt: character.appearancePrompt, imagePrompt: character.imagePrompt, negativePrompt: character.negativePrompt, imageStatus: character.imageStatus || "draft" },
        update: { name: character.name, role: character.role, description: character.description, wardrobe: character.wardrobe, accessories: character.accessories, goal: character.goal, traits: character.traits, age: character.age, appearancePrompt: character.appearancePrompt, imagePrompt: character.imagePrompt, negativePrompt: character.negativePrompt },
      });
    }
    await tx.scene.deleteMany({ where: { projectId } });
    const episodes = await tx.episode.findMany({ where: { projectId }, orderBy: { number: "asc" }, select: { id: true, number: true } });
    const firstEpisodeId = episodes.find((episode) => episode.number === 1)?.id;
    for (const scene of project.scenes) {
      await tx.scene.create({
        data: {
          projectId, episodeId: firstEpisodeId, number: scene.number, title: scene.title, content: scene.content, mood: scene.mood || "",
          shots: {
            create: project.shots.filter((shot) => shot.scene === scene.number).map((shot) => ({
              id: `shot-${crypto.randomUUID()}`, title: shot.title || "", duration: shot.duration, size: shot.size, camera: shot.camera, movement: shot.movement,
              imagePrompt: shot.imagePrompt, videoPrompt: shot.videoPrompt, negativePrompt: shot.negativePrompt, characterContext: shot.characterContext,
              characterIdsJson: shot.characterIds?.length ? JSON.stringify(shot.characterIds.map((id) => contentCharacterIdMap.get(id) || id).filter((id) => groundedCharacters.some((character) => (contentCharacterIdMap.get(character.id) || character.id) === id))) : undefined,
              referenceAssetIdsJson: shot.referenceAssetIds?.length ? JSON.stringify(shot.referenceAssetIds) : undefined, status: "draft",
            })),
          },
        },
      });
    }
    if (firstEpisodeId) await tx.episode.update({ where: { id: firstEpisodeId }, data: { script: project.script, logline: project.logline, status: "draft", continuityJson: project.continuity ? JSON.stringify(project.continuity) : undefined, characterIdsJson: groundedCharacters.length ? JSON.stringify(groundedCharacters.map((character) => contentCharacterIdMap.get(character.id) || character.id)) : null } });
  });
  return getProject(projectId, { userId: meta.userId, isAdmin: Boolean(meta.isAdmin) });
}

export class EpisodeGenerationError extends Error {
  constructor(public code: "NOT_FOUND" | "NOT_PLANNED" | "EMPTY", message: string) {
    super(message);
    this.name = "EpisodeGenerationError";
  }
}

export class ShotRetakeError extends Error {
  constructor(public code: "NOT_FOUND" | "ACTIVE_JOB" | "CONFLICT", message: string) {
    super(message);
    this.name = "ShotRetakeError";
  }
}

export async function updateProjectBrief(
  projectId: string,
  meta: { userId: string; isAdmin?: boolean; writerId: string; directorId: string; topic: string; format: "single" | "series"; episodeCount: number; wordsPerEpisode: number; storyBible?: string; scriptLength: ScriptLength; narrativePerspective: NarrativePerspective },
): Promise<GeneratedProject | null> {
  const owner = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!owner || (!meta.isAdmin && owner.userId !== meta.userId)) return null;
  const [writerStyle, directorStyle] = await Promise.all([ensureWriterStyle(meta.writerId), ensureDirectorStyle(meta.directorId)]);
  await prisma.project.update({
    where: { id: projectId },
    data: {
      writerStyleId: writerStyle.id,
      directorStyleId: directorStyle.id,
      topic: meta.topic,
      title: `${meta.topic.slice(0, 16)} · 创作项目`,
      format: meta.format,
      episodeCount: Math.max(1, meta.episodeCount),
      targetWords: Math.max(100, meta.wordsPerEpisode),
      scriptLength: meta.scriptLength,
      narrativePerspective: meta.narrativePerspective,
      storyBibleJson: meta.storyBible || null,
    },
  });
  return getProject(projectId, { userId: meta.userId, isAdmin: Boolean(meta.isAdmin) });
}

export async function replaceShot(
  projectId: string,
  shotId: string,
  replacement: Shot,
  scope: ProjectScope,
): Promise<GeneratedProject | null> {
  const project = await getProject(projectId, scope);
  const shot = project?.shots.find((item) => item.id === shotId);
  if (!project || !shot) return null;

  await prisma.$transaction(async (tx) => {
    const activeJob = await tx.videoJob.findFirst({ where: { shotId, status: { in: ["queued", "processing"] } }, select: { id: true } });
    if (activeJob) throw new ShotRetakeError("ACTIVE_JOB", "镜头正在生成视频，完成后再重拍");
    const changed = await tx.shot.updateMany({
      where: { id: shotId, scene: { projectId }, status: { notIn: ["queued", "processing"] } },
      data: {
        title: shot.title || replacement.title || "",
        duration: replacement.duration,
        size: replacement.size,
        camera: replacement.camera,
        movement: replacement.movement,
        imagePrompt: replacement.imagePrompt,
        videoPrompt: replacement.videoPrompt,
        negativePrompt: replacement.negativePrompt,
        characterContext: replacement.characterContext,
        status: "draft",
      },
    });
    if (!changed.count) throw new ShotRetakeError("CONFLICT", "镜头状态已变化，请刷新后重试");
    await tx.videoJob.deleteMany({ where: { shotId } });
    await tx.asset.updateMany({ where: { shotId }, data: { status: "superseded" } });
  });
  return getProject(projectId, scope);
}

/**
 * Persist one locally generated episode without touching the project's existing
 * scenes, shots, script, or other episodes. Scene numbers remain project-wide
 * because the current schema intentionally keeps @@unique([projectId, number]).
 */
export async function saveGeneratedEpisode(
  projectId: string,
  episodeId: string,
  generated: GeneratedProject,
  scope: ProjectScope,
  meta?: { continuity?: EpisodeContinuity; outline?: string; replace?: boolean },
): Promise<{ episodeId: string; episodeNumber: number } | null> {
  const owner = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!owner || (!scope.isAdmin && owner.userId !== scope.userId)) return null;
  if (!generated.scenes.length) throw new EpisodeGenerationError("EMPTY", "本集没有可保存的场景");

  return prisma.$transaction(async (tx) => {
    const episode = await tx.episode.findFirst({
      where: { id: episodeId, projectId },
      select: { id: true, number: true, status: true, characterIdsJson: true },
    });
    if (!episode) throw new EpisodeGenerationError("NOT_FOUND", "分集不存在或不属于当前项目");
    if (episode.status !== "planned" && !meta?.replace) throw new EpisodeGenerationError("NOT_PLANNED", "该集已经生成过，不能重复生成");

    if (meta?.replace) {
      await tx.asset.deleteMany({ where: { episodeId, shotId: { not: null } } });
      await tx.imageJob.deleteMany({ where: { episodeId } });
      await tx.renderJob.deleteMany({ where: { episodeId } });
      await tx.scene.deleteMany({ where: { episodeId } });
    }

    // Episode generation returns temporary character ids. Persist the character
    // bible at project scope, reusing an existing character (and its generated
    // assets) when the name already exists in this project.
    const existingProjectCharacters = await tx.character.findMany({
      where: { projectId },
      select: { id: true, name: true },
    });
    const characterIdMap = new Map<string, string>();
    const generatedCharacterSeeds = generated.characters?.length ? generated.characters : (generated.continuity?.characterState || []);
    const generatedEpisodeText = [
      generated.script,
      generated.logline,
      generated.continuity?.summary,
      generated.continuity?.ending,
      ...(generated.continuity?.openThreads || []),
      ...generated.scenes.flatMap((scene) => [scene.title, scene.content, scene.mood]),
    ].filter((value): value is string => typeof value === "string").join("\n");
    const generatedCharacters = groundCharactersToSource(generatedCharacterSeeds, generatedEpisodeText, existingProjectCharacters);
    for (const character of generatedCharacters) {
      const existing = await tx.character.findFirst({ where: { projectId, name: character.name }, select: { id: true } });
      const id = existing?.id || `character-${crypto.randomUUID()}`;
      characterIdMap.set(character.id, id);
      await tx.character.upsert({
        where: { id },
        create: { id, projectId, name: character.name, role: character.role, description: character.description, wardrobe: character.wardrobe, accessories: character.accessories, goal: character.goal, traits: character.traits, age: character.age, appearancePrompt: character.appearancePrompt, imagePrompt: character.imagePrompt, negativePrompt: character.negativePrompt, imageStatus: "draft" },
        update: { name: character.name, role: character.role, description: character.description, wardrobe: character.wardrobe, accessories: character.accessories, goal: character.goal, traits: character.traits, age: character.age, appearancePrompt: character.appearancePrompt, imagePrompt: character.imagePrompt, negativePrompt: character.negativePrompt },
      });
    }
    // Models sometimes return only the characters they describe in the JSON
    // bible, while the episode script still uses an existing project character
    // (for example, mentioning 吕布 in episode 2). Recover those references
    // from the generated episode text so the episode character list does not
    // silently lose a continuing character.
    const episodeText = [
      generated.script,
      generated.logline,
      generated.continuity?.summary,
      generated.continuity?.ending,
      ...(generated.continuity?.openThreads || []),
      ...generated.scenes.flatMap((scene) => [scene.title, scene.content, scene.mood]),
      ...generated.shots.flatMap((shot) => [shot.title, shot.imagePrompt, shot.videoPrompt, shot.characterContext]),
    ].filter((value): value is string => typeof value === "string").join("\n");
    const mentionedExistingCharacterIds = existingProjectCharacters
      .filter((character) => character.name.trim() && episodeText.includes(character.name.trim()))
      .map((character) => character.id);
    const persistedCharacterIds = Array.from(new Set(Array.from(characterIdMap.values()).concat(mentionedExistingCharacterIds)));
    const episodeCharacterIds = persistedCharacterIds.length
      ? persistedCharacterIds
      : (episode.characterIdsJson ? JSON.parse(episode.characterIdsJson) as string[] : []);

    const maxScene = await tx.scene.aggregate({ where: { projectId }, _max: { number: true } });
    const firstSceneNumber = (maxScene._max.number ?? 0) + 1;
    const sceneNumbers = new Map<number, number>();
    for (let index = 0; index < generated.scenes.length; index += 1) {
      sceneNumbers.set(generated.scenes[index].number, firstSceneNumber + index);
    }

    for (const scene of generated.scenes) {
      const number = sceneNumbers.get(scene.number)!;
      await tx.scene.create({
        data: {
          projectId,
          episodeId,
          number,
          title: scene.title,
          content: scene.content,
          mood: scene.mood || "",
          shots: {
            create: generated.shots
              .filter((shot) => shot.scene === scene.number)
              .map((shot) => ({
                id: `shot-${crypto.randomUUID()}`,
              title: shot.title || "",
                duration: shot.duration,
                size: shot.size,
                camera: shot.camera,
                movement: shot.movement,
                imagePrompt: shot.imagePrompt,
                videoPrompt: shot.videoPrompt,
                negativePrompt: shot.negativePrompt,
                characterContext: shot.characterContext,
                // 先保存剧本；用户在剧本阶段选择本集人物后再建立关联。
                characterIdsJson: (() => {
                  const ids = (shot.characterIds || episodeCharacterIds).map((id) => characterIdMap.get(id) || id).filter((id) => episodeCharacterIds.includes(id));
                  return ids.length ? JSON.stringify(ids) : undefined;
                })(),
                referenceAssetIdsJson: shot.referenceAssetIds?.length ? JSON.stringify(shot.referenceAssetIds) : undefined,
                status: "draft",
              })),
          },
        },
      });
    }

    const updated = await tx.episode.update({
      where: { id: episodeId },
      data: { script: generated.script, logline: generated.logline, continuityJson: JSON.stringify(meta?.continuity || generated.continuity || null), characterIdsJson: episodeCharacterIds.length ? JSON.stringify(episodeCharacterIds) : null, ...(meta?.outline ? { outline: meta.outline } : {}), status: "draft" },
      select: { id: true, number: true },
    });
    if (updated.number === 1) {
      await tx.script.upsert({
        where: { projectId },
        create: { projectId, content: generated.script, logline: generated.logline, version: 1 },
        update: { content: generated.script, logline: generated.logline, version: { increment: 1 } },
      });
    }
    return { episodeId: updated.id, episodeNumber: updated.number };
  });
}

export async function getProject(id: string, scope: ProjectScope): Promise<GeneratedProject | null> {
  const row = await prisma.project.findUnique({
    where: { id },
    include: {
      script: true,
      characters: true,
      scenes: {
        orderBy: { number: "asc" },
        include: { episode: { select: { number: true } }, shots: { orderBy: { id: "asc" } } },
      },
      episodes: { include: { _count: { select: { scenes: true } }, scenes: { select: { _count: { select: { shots: true } } } } } },
    },
  });
  if (!row) return null;
  // 归属校验：非管理员只能访问自己的项目
  if (!scope.isAdmin && row.userId !== scope.userId) return null;

  const scenes = row.scenes.map((scene) => ({
    id: scene.id,
    number: scene.number,
    episodeNumber: scene.episode?.number,
    title: scene.title,
    content: scene.content,
    mood: scene.mood || "",
  }));
  const shots = row.scenes.flatMap((scene) =>
    scene.shots.map((shot) => ({
      id: shot.id,
      scene: scene.number,
      episodeNumber: scene.episode?.number,
      title: shot.title || undefined,
      duration: shot.duration,
      size: shot.size,
      camera: shot.camera,
      movement: shot.movement,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt,
      negativePrompt: shot.negativePrompt,
      characterContext: shot.characterContext || undefined,
      characterIds: shot.characterIdsJson ? JSON.parse(shot.characterIdsJson) as string[] : undefined,
      referenceAssetIds: shot.referenceAssetIdsJson ? JSON.parse(shot.referenceAssetIdsJson) as string[] : undefined,
      status: shot.status as ShotStatus,
    }))
  );

  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    writerStyleId: row.writerStyleId,
    directorStyleId: row.directorStyleId,
    projectFormat: row.format as "single" | "series",
    episodeCount: row.episodeCount,
    wordsPerEpisode: row.targetWords,
    totalTargetWords: row.targetWords * row.episodeCount,
    scriptLength: row.scriptLength as ScriptLength,
    narrativePerspective: row.narrativePerspective as NarrativePerspective,
    storyBible: row.storyBibleJson || undefined,
    episodes: row.episodes.map((episode) => ({ id: episode.id, number: episode.number, title: episode.title, status: episode.status, outline: episode.outline || undefined, logline: episode.logline || undefined, script: episode.script || undefined, continuity: episode.continuityJson ? JSON.parse(episode.continuityJson) as EpisodeContinuity : undefined, characterIds: episode.characterIdsJson ? JSON.parse(episode.characterIdsJson) as string[] : undefined, sceneCount: episode._count.scenes, shotCount: episode.scenes.reduce((sum, scene) => sum + scene._count.shots, 0) })),
    finalVideoUrl: row.finalVideoUrl || undefined,
    logline: row.script?.logline || "",
    script: row.script?.content || "",
    characters: row.characters.map((character) => ({ id: character.id, name: character.name, role: character.role, description: character.description, wardrobe: character.wardrobe, accessories: character.accessories || undefined, goal: character.goal || undefined, traits: character.traits || undefined, age: character.age || undefined, appearancePrompt: character.appearancePrompt || undefined, imagePrompt: character.imagePrompt || undefined, negativePrompt: character.negativePrompt || undefined, referenceAssetId: character.referenceAssetId || undefined, imageProvider: character.imageProvider || undefined, imageModel: character.imageModel || undefined, imageStatus: character.imageStatus as import("./types").Character["imageStatus"] })),
    scenes,
    shots,
  };
}

export async function listProjects(scope: ProjectScope) {
  const rows = await prisma.project.findMany({
    where: scope.isAdmin ? {} : { userId: scope.userId },
    orderBy: { createdAt: "desc" },
    include: {
      script: true,
      user: { select: { name: true, email: true } },
      scenes: { include: { _count: { select: { shots: true } } } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    topic: row.topic,
    logline: row.script?.logline || "",
    sceneCount: row.scenes.length,
    shotCount: row.scenes.reduce((sum, scene) => sum + scene._count.shots, 0),
    format: row.format,
    episodeCount: row.episodeCount,
    targetWords: row.targetWords,
    owner: row.user?.name || "—",
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function saveWriterStyle(style: WriterStyle, ownerId?: string): Promise<WriterStyle> {
  const data = {
    id: style.id,
    name: style.name,
    era: style.era,
    summary: style.summary,
    tags: JSON.stringify(style.tags),
    axesJson: JSON.stringify(style.axes),
    sample: style.sample,
    sourceDigestJson: style.sourceDigest ? JSON.stringify(style.sourceDigest) : undefined,
  };
  await prisma.writerStyle.upsert({ where: { id: style.id }, create: { ...data, ownerId }, update: data });
  return style;
}

export async function listWriterStyles(userId?: string): Promise<WriterStyle[]> {
  const rows = await prisma.writerStyle.findMany({ where: userId ? { OR: [{ ownerId: userId }, { isPublic: true }, { ownerId: null }] } : { OR: [{ isPublic: true }, { ownerId: null }] }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    era: row.era || "",
    summary: row.summary,
    tags: JSON.parse(row.tags) as string[],
    axes: JSON.parse(row.axesJson) as WriterStyle["axes"],
    sample: row.sample || undefined,
    sourceDigest: row.sourceDigestJson ? JSON.parse(row.sourceDigestJson) as WriterStyle["sourceDigest"] : undefined,
    source: writerStyles.some((style) => style.id === row.id) ? "curated" : "distilled",
    isPublic: row.isPublic,
    shareToken: row.ownerId === userId ? row.shareToken || undefined : undefined,
  }));
}

export async function saveDirectorStyle(style: import("./types").DirectorStyle, ownerId?: string): Promise<import("./types").DirectorStyle> {
  await prisma.directorStyle.upsert({
    where: { id: style.id },
    create: { id: style.id, name: style.name, summary: style.summary, paletteJson: JSON.stringify(style.palette), descriptor: style.descriptor, lora: style.lora, ownerId },
    update: { name: style.name, summary: style.summary, paletteJson: JSON.stringify(style.palette), descriptor: style.descriptor, lora: style.lora },
  });
  return style;
}

export async function listDirectorStyles(userId?: string): Promise<import("./types").DirectorStyle[]> {
  const rows = await prisma.directorStyle.findMany({ where: userId ? { OR: [{ ownerId: userId }, { isPublic: true }, { ownerId: null }] } : { OR: [{ isPublic: true }, { ownerId: null }] }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({ id: row.id, name: row.name, summary: row.summary, palette: JSON.parse(row.paletteJson) as string[], descriptor: row.descriptor, lora: row.lora || undefined, isPublic: row.isPublic, shareToken: row.ownerId === userId ? row.shareToken || undefined : undefined }));
}

export async function setStyleSharing(kind: "writer" | "director", id: string, ownerId: string, isPublic: boolean) {
  const token = isPublic ? crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "") : null;
  if (kind === "writer") return prisma.writerStyle.updateMany({ where: { id, ownerId }, data: { isPublic, shareToken: token } });
  return prisma.directorStyle.updateMany({ where: { id, ownerId }, data: { isPublic, shareToken: token } });
}

export async function getSharedStyle(token: string) {
  const writer = await prisma.writerStyle.findUnique({ where: { shareToken: token } });
  if (writer?.isPublic) return { kind: "writer" as const, style: { id: writer.id, name: writer.name, era: writer.era || "", summary: writer.summary, tags: JSON.parse(writer.tags) as string[], axes: JSON.parse(writer.axesJson) as WriterStyle["axes"], sample: writer.sample || undefined, sourceDigest: writer.sourceDigestJson ? JSON.parse(writer.sourceDigestJson) as WriterStyle["sourceDigest"] : undefined, source: "distilled" as const, isPublic: true } };
  const director = await prisma.directorStyle.findUnique({ where: { shareToken: token } });
  if (director?.isPublic) return { kind: "director" as const, style: { id: director.id, name: director.name, summary: director.summary, palette: JSON.parse(director.paletteJson) as string[], descriptor: director.descriptor, lora: director.lora || undefined, isPublic: true } };
  return null;
}
