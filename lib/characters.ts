import { chatCompletionDetailed, extractJson, isLLMConfigured, type ModelUsage } from "./ai/client";
import type { Character, GeneratedProject } from "./types";
import { buildCharacterReferencePrompt, CHARACTER_REFERENCE_NEGATIVE } from "./character-prompts";

export type CharacterExtraction = { characters: Character[]; usage?: ModelUsage; source: "vllm" | "fallback" };
type CharacterSeed = Partial<Character> & { name?: string };

export function extractGroundedCharacterNames(sourceText: string, knownNames: string[] = []): string[] {
  const text = String(sourceText || "");
  const names: string[] = [];
  const nonCharacterLabels = new Set(["声音", "旁白", "画外音", "系统", "镜头", "字幕", "主角", "配角", "同事", "主管", "群众", "村民甲", "村民乙"]);
  const add = (value: string) => {
    const name = value.trim();
    if (name.length >= 2 && name.length <= 8 && !nonCharacterLabels.has(name) && !names.includes(name)) names.push(name);
  };
  for (const name of knownNames) if (name.trim() && text.includes(name.trim())) add(name);
  const collect = (pattern: RegExp) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) add(match[1]);
  };
  collect(/(?:^|\n|[「『“"])[ \t]*([\u4e00-\u9fff]{2,4})[ \t]*[：:]/g);
  collect(/(?:人物|角色|主角|配角|名叫|叫作|叫做|称为|称作)[ \t]*[“「『"]?([\u4e00-\u9fff]{2,4})/g);
  return names;
}

function clean(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function normalize(raw: unknown, index: number, directorDescriptor = "", forcedName?: string): Character {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = forcedName || clean(item.name, `角色${index + 1}`);
  const role = clean(item.role, "主要角色");
  const age = clean(item.age);
  const traits = clean(item.traits ?? item.personality);
  const description = clean(item.description ?? item.appearance, "待补充外貌特征");
  const wardrobe = clean(item.wardrobe, "符合人物身份的固定服装，包含上衣、下装、鞋子与服装层次");
  const accessories = clean(item.accessories ?? item.accessory, "无；如有关键配饰请明确写出");
  const goal = clean(item.goal ?? item.motivation);
  const appearancePrompt = clean(item.appearancePrompt, `${name}, ${age ? `${age}, ` : ""}${description}, wearing ${wardrobe}`);
  const referencePrompt = buildCharacterReferencePrompt({ name, role, age, description, wardrobe, accessories, traits, goal }, directorDescriptor, "front");
  const modelPrompt = clean(item.imagePrompt);
  return {
    id: clean(item.id, `character-${index + 1}`), name, role, description, wardrobe, accessories,
    ...(goal ? { goal } : {}), ...(traits ? { traits } : {}), ...(age ? { age } : {}), appearancePrompt,
    imagePrompt: modelPrompt ? `${referencePrompt} Additional visual details from the model: ${modelPrompt}.` : referencePrompt,
    negativePrompt: clean(item.negativePrompt, CHARACTER_REFERENCE_NEGATIVE), imageStatus: "draft",
  };
}

export function groundCharactersToSource(
  rawCharacters: CharacterSeed[],
  sourceText: string,
  knownCharacters: Array<Pick<Character, "id" | "name">> = [],
  directorDescriptor = "",
): Character[] {
  const knownNames = knownCharacters.map((character) => character.name).filter(Boolean);
  const groundedNames = extractGroundedCharacterNames(sourceText, knownNames);
  if (!groundedNames.length) return rawCharacters.map((character, index) => normalize(character, index, directorDescriptor));
  const knownByName = new Map(knownCharacters.map((character) => [character.name, character]));
  const usedNames = new Set<string>();
  const result: Character[] = [];
  for (const raw of rawCharacters) {
    const modelName = clean(raw.name);
    const replacement = groundedNames.includes(modelName) || sourceText.includes(modelName)
      ? modelName
      : groundedNames.find((name) => !usedNames.has(name));
    if (!replacement) continue;
    usedNames.add(replacement);
    const normalized = normalize(raw, result.length, directorDescriptor, replacement);
    const existing = knownByName.get(replacement);
    result.push(existing ? { ...normalized, id: existing.id, name: existing.name } : normalized);
  }
  for (const name of groundedNames) {
    if (usedNames.has(name)) continue;
    const existing = knownByName.get(name);
    result.push(normalize(existing || { name }, result.length, directorDescriptor, name));
  }
  return result;
}

function fallbackCharacters(project: GeneratedProject, sourceText: string | undefined, directorDescriptor = ""): Character[] {
  const source = sourceText || "";
  const existing = (project.characters || []).filter((character) => !source || source.includes(character.name));
  if (existing.length) return existing.map((character, index) => normalize(character, index, directorDescriptor, character.name));
  const names = extractGroundedCharacterNames(source);
  if (names.length) return names.map((name, index) => normalize({ name, role: "主要角色" }, index, directorDescriptor, name));
  if (project.characters?.length) return project.characters.map((character, index) => normalize(character, index, directorDescriptor, character.name));
  return [normalize({ name: "主角", role: "主要角色", description: `围绕“${project.topic || project.title}”行动的人物` }, 0, directorDescriptor)];
}

export async function extractCharacters(project: GeneratedProject, modelId?: string, directorDescriptor = "", sourceText?: string): Promise<CharacterExtraction> {
  const fallback = fallbackCharacters(project, sourceText, directorDescriptor);
  if (!(await isLLMConfigured(modelId))) return { characters: fallback, source: "fallback" };
  const knownCharacters = (project.characters || []).map((character) => ({ id: character.id, name: character.name }));
  const groundedNames = sourceText ? extractGroundedCharacterNames(sourceText, knownCharacters.map((character) => character.name)) : [];
  const source = sourceText?.trim() || project.storyBible || "";
  const result = await chatCompletionDetailed([
    { role: "system", content: "你是影视开发中的 Character Bible 编辑。只输出 JSON。人物名称是连续性主键，绝不改写、翻译、替换或虚构剧本文本中的姓名。" },
    { role: "user", content: `从当前集剧本中提取实际出场人物，并为后续连续性生图补齐人物资料。\n硬性规则：\n1. name 必须逐字复制当前集剧本中的人物姓名；禁止把“陈默”改成其他名字。\n2. 如果项目已有角色名出现在当前集剧本中，必须复用该姓名。\n3. 不要返回只存在于旧项目上下文、示例或你自己编造的人物。\n4. 只输出实际出场人物，最多 8 个。\n\n可确认的已知姓名：${groundedNames.join("、") || "请从剧本原文识别"}\n\n当前集剧本与场景原文：\n${source}\n\n输出：{"characters":[{"id":"character-1","name":"必须来自原文的姓名","role":"","age":"","description":"完整外貌与体型","wardrobe":"固定服装","accessories":"关键配饰","traits":"性格","goal":"目标","appearancePrompt":"","imagePrompt":"","negativePrompt":""}]}` },
  ], { modelId });
  const parsed = extractJson<{ characters?: unknown[] }>(result.content);
  const rawCharacters = Array.isArray(parsed.characters) ? parsed.characters as CharacterSeed[] : [];
  const characters = sourceText ? groundCharactersToSource(rawCharacters, sourceText, project.characters || [], directorDescriptor) : rawCharacters.map((character, index) => normalize(character, index, directorDescriptor));
  return { characters: characters.length ? characters : fallback, usage: result.usage, source: "vllm" };
}
