import type { GeneratedProject } from "./types";

export type AssetPackageEntry = {
  sourceKey: string;
  name: string;
  kind: "image" | "reference";
  episodeId?: string;
  shotId?: string;
  metadata: Record<string, unknown>;
};

export function buildAssetPackage(project: GeneratedProject): AssetPackageEntry[] {
  const episodeIdByNumber = new Map((project.episodes || []).map((episode) => [episode.number, episode.id]));
  const entries: AssetPackageEntry[] = [];
  for (const character of project.characters || []) {
    entries.push({
      sourceKey: `character:${character.id}`,
      name: `角色参考 · ${character.name}`,
      kind: "reference",
      metadata: { package: "continuity", category: "character", characterId: character.id, role: character.role, description: character.description, wardrobe: character.wardrobe, prompt: `${character.name}, ${character.description}, wardrobe: ${character.wardrobe}` },
    });
  }
  for (const scene of project.scenes) {
    entries.push({
      sourceKey: `scene:${scene.number}`,
      name: `场景参考 · ${scene.title}`,
      kind: "reference",
      episodeId: scene.episodeNumber ? episodeIdByNumber.get(scene.episodeNumber) : undefined,
      metadata: { package: "continuity", category: "scene", sceneNumber: scene.number, episodeNumber: scene.episodeNumber, mood: scene.mood, description: scene.content },
    });
  }
  for (const shot of project.shots) {
    entries.push({
      sourceKey: `shot:${shot.id}`,
      name: `镜头关键帧 · ${shot.title || `场景 ${shot.scene}`}`,
      kind: "image",
      episodeId: shot.episodeNumber ? episodeIdByNumber.get(shot.episodeNumber) : undefined,
      shotId: shot.id,
      metadata: { package: "continuity", category: "shot-keyframe", sceneNumber: shot.scene, episodeNumber: shot.episodeNumber, imagePrompt: shot.imagePrompt, negativePrompt: shot.negativePrompt, characterContext: shot.characterContext },
    });
  }
  return entries;
}
