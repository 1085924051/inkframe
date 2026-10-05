import type { Character, DirectorStyle, EpisodeContinuity, EpisodeGenerationContext, GeneratedProject, GenerationSpec, NarrativePerspective, ScriptLength, Shot, StyleAxis, WriterStyle } from "../types";
import { chatCompletion, chatCompletionDetailed, extractJson, isLLMConfigured, type ModelUsage } from "./client";
import { buildCharacterReferencePrompt, CHARACTER_REFERENCE_NEGATIVE } from "../character-prompts";
import { getResolutionOption, resolutionPrompt } from "../resolution";

// ============================================================
// 风格蒸馏 Provider —— 把一段样本文本压缩为 9 轴作家风格卡
// 默认 HeuristicStyleDistiller（无模型，确定性打分）；
// 配置 LLM_API_URL / LLM_API_KEY 后切换 LLMStyleDistiller。
// ============================================================
export type DistilledStyle = { summary: string; tags: string[]; axes: StyleAxis[]; era: string };

export interface StyleDistiller {
  readonly name: string;
  distill(input: { sample: string; name?: string }): Promise<DistilledStyle>;
}

const STYLE_AXES = ["冷峻度", "讽刺性", "意象密度", "对话张力", "节奏", "口语化", "悲悯感", "荒诞感", "留白"];

function heuristicScore(text: string, seed: number): number {
  const value = Array.from(text).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + seed), 0);
  return 35 + (value % 61);
}

export class HeuristicStyleDistiller implements StyleDistiller {
  readonly name = "heuristic";
  async distill(input: { sample: string; name?: string }): Promise<DistilledStyle> {
    return {
      summary: `从 ${input.sample.length} 个字符中提取出的个人文字气质。`,
      tags: ["样本蒸馏", "个人风格", "可编辑"],
      axes: STYLE_AXES.map((label, index) => ({ label, value: heuristicScore(input.sample, index + 1) })),
      era: "来自样本蒸馏",
    };
  }
}

export class LLMStyleDistiller implements StyleDistiller {
  readonly name = "llm";
  async distill(input: { sample: string; name?: string; modelId?: string }): Promise<DistilledStyle> {
    const raw = await chatCompletion([
      { role: "system", content: "你是一名文学风格分析专家。请将给定样本文本蒸馏为一张作家风格卡，并只输出严格 JSON，不要输出任何解释。" },
      { role: "user", content: `样本文本：\n${input.sample}\n\n请输出 JSON：{"summary":"一句话风格总结","tags":["3-5个标签"],"axes":[{"label":"冷峻度","value":0},{"label":"讽刺性","value":0},{"label":"意象密度","value":0},{"label":"对话张力","value":0},{"label":"节奏","value":0},{"label":"口语化","value":0},{"label":"悲悯感","value":0},{"label":"荒诞感","value":0},{"label":"留白","value":0}],"era":"风格年代或流派"}` },
    ], { modelId: input.modelId });
    const parsed = extractJson<{ summary?: string; tags?: string[]; axes?: { label?: string; value?: number }[]; era?: string }>(raw);
    return {
      summary: parsed.summary || `基于 ${input.sample.length} 个字符蒸馏出的个人风格。`,
      tags: Array.isArray(parsed.tags) && parsed.tags.length ? parsed.tags.map(String) : ["样本蒸馏", "个人风格"],
      axes: STYLE_AXES.map((label, index) => {
        const found = Array.isArray(parsed.axes) ? parsed.axes.find((axis) => axis.label === label) : undefined;
        const value = typeof found?.value === "number" ? Math.max(0, Math.min(100, Math.round(found.value))) : heuristicScore(input.sample, index + 1);
        return { label, value };
      }),
      era: parsed.era || "来自样本蒸馏",
    };
  }
}

// 根据当前配置选择蒸馏实现，远端失败自动回退启发式
export async function distillStyle(input: { sample: string; name?: string; modelId?: string }): Promise<{ style: DistilledStyle; usage?: ModelUsage }> {
  if (await isLLMConfigured(input.modelId)) {
    try {
      const messages = [
        { role: "system" as const, content: "你是一名文学风格分析专家。请将给定样本文本蒸馏为一张作家风格卡，并只输出严格 JSON，不要输出任何解释。" },
        { role: "user" as const, content: `样本文本：\n${input.sample}\n\n请输出 JSON：{"summary":"一句话风格总结","tags":["3-5个标签"],"axes":[{"label":"冷峻度","value":0},{"label":"讽刺性","value":0},{"label":"意象密度","value":0},{"label":"对话张力","value":0},{"label":"节奏","value":0},{"label":"口语化","value":0},{"label":"悲悯感","value":0},{"label":"荒诞感","value":0},{"label":"留白","value":0}],"era":"风格年代或流派"}` },
      ];
      const completion = await chatCompletionDetailed(messages, { modelId: input.modelId });
      const parsed = extractJson<{ summary?: string; tags?: string[]; axes?: { label?: string; value?: number }[]; era?: string }>(completion.content);
      const style: DistilledStyle = {
        summary: parsed.summary || `基于 ${input.sample.length} 个字符蒸馏出的个人风格。`,
        tags: Array.isArray(parsed.tags) && parsed.tags.length ? parsed.tags.map(String) : ["样本蒸馏", "个人风格"],
        axes: STYLE_AXES.map((label, index) => {
          const found = Array.isArray(parsed.axes) ? parsed.axes.find((axis) => axis.label === label) : undefined;
          const value = typeof found?.value === "number" ? Math.max(0, Math.min(100, Math.round(found.value))) : heuristicScore(input.sample, index + 1);
          return { label, value };
        }),
        era: parsed.era || "来自样本蒸馏",
      };
      return { style, usage: completion.usage };
    } catch (error) {
      console.warn("[ai] 远端风格蒸馏失败，回退启发式：", error);
    }
  }
  return { style: await new HeuristicStyleDistiller().distill(input) };
}

// ============================================================
// 项目生成 Provider —— 主题 + 风格 → 剧本 + 场景 + 分镜
// 本地默认走 lib/pipeline.ts 的确定性生成器；
// 配置 LLM 后可通过 generateProjectRemotely 走真实模型。
// ============================================================
export interface ProjectGenerator {
  readonly name: string;
  generate(input: { topic: string; scriptLength: ScriptLength; narrativePerspective: NarrativePerspective; writer: WriterStyle; director: DirectorStyle; spec: GenerationSpec; episodeContext?: EpisodeGenerationContext; modelId?: string }): Promise<{ project: GeneratedProject; usage: ModelUsage }>;
}

type RemoteProject = {
  logline?: string;
  script?: string;
  scenes?: { number?: number; title?: string; content?: string; mood?: string }[];
  shots?: Partial<Shot>[];
  characters?: Partial<Character>[];
  continuity?: Partial<EpisodeContinuity>;
};

export class LLMProjectGenerator implements ProjectGenerator {
  readonly name = "llm";
  async generate(input: { topic: string; scriptLength: ScriptLength; narrativePerspective: NarrativePerspective; writer: WriterStyle; director: DirectorStyle; spec: GenerationSpec; episodeContext?: EpisodeGenerationContext; modelId?: string }): Promise<{ project: GeneratedProject; usage: ModelUsage }> {
    const continuity = input.episodeContext ? `\n\n本集连续性上下文：\n本集目标：${input.episodeContext.episodeGoal}\n${input.episodeContext.sourceOutline ? `原文/长篇大纲对应段落：${input.episodeContext.sourceOutline}\n` : ""}${input.episodeContext.previousEpisode ? `上一集摘要：${input.episodeContext.previousEpisode.summary}\n上一集结尾：${input.episodeContext.previousEpisode.ending}\n上一集场景：${input.episodeContext.previousEpisode.sceneTitles.join("、")}\n` : "这是第一集，请建立可供后续集承接的主线。\n"}固定角色状态：${input.episodeContext.characterState.map((character) => `${character.name}（${character.role}；${character.description}；服装：${character.wardrobe}）`).join(" | ")}` : "";
    const sourceContext = input.writer.sourceDigest ? `\n创作简报蒸馏结果：\n主线摘要：${input.writer.sourceDigest.plotSummary}\n世界观与硬约束：${input.writer.sourceDigest.storyBible}\n章节规划：${input.writer.sourceDigest.chapterOutline.map((chapter) => `${chapter.title}${chapter.summary ? `：${chapter.summary}` : ""}`).join("；")}\n原文人物线索：${input.writer.sourceDigest.characters.map((character) => `${character.name}${character.role ? `（${character.role}）` : ""}${character.traits ? `：${character.traits}` : ""}`).join("；")}` : "";
    const completion = await chatCompletionDetailed([
      { role: "system", content: "你是一名短剧编剧与分镜师。请根据主题与风格生成一个短剧，并只输出严格 JSON，不要输出任何解释。多集项目必须承接上一集，不能把每一集写成互不相关的新故事。" },
      { role: "user", content: `主题：${input.topic}\n剧本长度：${input.scriptLength}（micro=约300字，short=约500字，medium=约1200字，long=约3000字，feature=8000字以上，series=按分集规格）\n叙事视角：${input.narrativePerspective}\n项目规格：${input.spec.format}，${input.spec.episodeCount} 集，单集目标 ${input.spec.wordsPerEpisode} 字，总目标 ${input.spec.totalTargetWords} 字；${input.spec.format === "series" ? "本次只生成一集草稿，不要一次生成全部集数。" : "本次生成完整单集。"}\nStory Bible：${input.spec.storyBible || "无"}\n作家风格：${input.writer.name}（${input.writer.summary}）\n导演视觉：${input.director.name}（${input.director.descriptor}）${sourceContext}\n\n请严格按照剧本长度和叙事视角输出 JSON。必须围绕主题和创作简报写本项目故事，禁止套用办公室、周五、会议室等演示案例；如果简报提供了章节规划，第一集必须使用第一段规划。分镜不能只写静态构图或外貌：必须从剧本对白和情节中提取每个镜头的具体动作、说话内容、说话方式、表情变化、声音/环境变化和镜头时序。已有参考资产只用于保持人物与场景一致性，提示词重点放在动作、对白、情绪和连续运动上。JSON 结构：{"logline":"一句话梗概","script":"完整剧本（含场景标题与对白）","characters":[{"id":"char-1","name":"角色名","role":"叙事作用","description":"固定外貌特征","wardrobe":"固定服装"}],"scenes":[{"number":1,"title":"场景名","content":"场景叙述","mood":"情绪"}],"shots":[{"scene":1,"title":"具体且不重复的画面标题","duration":"04s","size":"景别","camera":"机位","movement":"运镜","action":"按时间顺序写人物动作、互动和表情变化","dialogue":"本镜头实际说出的台词；无台词时写无台词并说明反应","sound":"对白语气、环境声和关键音效","imagePrompt":"这一时刻的动作定格、对白中的表情与姿态、场景关系；不要只重复外貌","videoPrompt":"从开始到结束的动作、对白口型/说话节奏、情绪变化、镜头运动和声音；可直接交给视频模型","negativePrompt":"负面提示词","characterContext":"角色一致性描述"}]}` },
      ...(continuity ? [{ role: "user" as const, content: `${continuity}\n请把这些连续性约束落实到本集剧情、角色状态、场景和分镜中，并在 continuity 字段中给出本集结尾与未解决线索。凡是在本集剧本、场景或分镜中实际出场的既有人物，必须全部写入 characters 数组，不能只返回新增人物或部分人物。` }] : []),
    ], { modelId: input.modelId });
    const parsed = extractJson<RemoteProject>(completion.content);
    return { project: this.normalize(input, parsed), usage: completion.usage };
  }

  private normalize(input: { topic: string; scriptLength: ScriptLength; narrativePerspective: NarrativePerspective; writer: WriterStyle; director: DirectorStyle; spec: GenerationSpec; episodeContext?: EpisodeGenerationContext }, parsed: RemoteProject): GeneratedProject {
    const scenes = (Array.isArray(parsed.scenes) ? parsed.scenes : []).map((scene, index) => ({
      number: scene.number || index + 1,
      title: scene.title || `场景 ${index + 1}`,
      content: scene.content || "",
      mood: scene.mood || "",
    }));
    const shots: Shot[] = (Array.isArray(parsed.shots) ? parsed.shots : []).map((shot, index) => ({
      id: `llm-shot-${index + 1}`,
      scene: shot.scene || 1,
      title: shot.title?.trim() || `${scenes.find((scene) => scene.number === (shot.scene || 1))?.title || "场景"} · ${shot.size || "画面"}镜头 ${index + 1}`,
      duration: shot.duration || "04s",
      size: shot.size || "中近景",
      camera: shot.camera || "平视",
      movement: shot.movement || "缓慢推进",
      action: shot.action || "",
      dialogue: shot.dialogue || "",
      sound: shot.sound || "",
      imagePrompt: shot.imagePrompt || "",
      videoPrompt: shot.videoPrompt || "",
      negativePrompt: shot.negativePrompt || "text, subtitle, watermark",
      characterContext: shot.characterContext || "",
    }));
    const rawCharacters = Array.isArray(parsed.characters) && parsed.characters.length
      ? parsed.characters
      : (input.episodeContext?.characterState || []);
    const characters: Character[] = rawCharacters.map((character, index) => ({ id: character.id || `char-${index + 1}`, name: character.name || `角色${index + 1}`, role: character.role || "角色", age: character.age || "", traits: character.traits || "", goal: character.goal || "", description: character.description || "", wardrobe: character.wardrobe || "", accessories: character.accessories || "" }));
    const characterContext = characters.map((character) => `${character.name}（${character.role}）：${character.description}；服装：${character.wardrobe}`).join(" | ");
    for (const character of characters) {
      character.appearancePrompt = buildCharacterReferencePrompt(character, input.director.descriptor, "front");
      character.imagePrompt = character.appearancePrompt;
      character.negativePrompt = CHARACTER_REFERENCE_NEGATIVE;
    }
    for (const shot of shots) {
      const shotText = `${shot.title || ""} ${shot.imagePrompt || ""} ${shot.videoPrompt || ""} ${shot.characterContext || ""}`;
      const related = characters.filter((character) => shotText.includes(character.name));
      shot.characterIds = (related.length ? related : characters.slice(0, Math.min(2, characters.length))).map((character) => character.id);
      shot.characterContext = shot.characterContext || characterContext;
      const bible = shot.characterContext ? ` Character Bible: ${shot.characterContext}` : "";
      const dynamics = [
        shot.action ? ` Action and expression: ${shot.action}.` : "",
        shot.dialogue ? ` Spoken dialogue: ${shot.dialogue}.` : "",
        shot.sound ? ` Sound and delivery: ${shot.sound}.` : "",
        " Use any attached character/scene reference assets for continuity; do not replace the action with a static character description.",
      ].join("");
      shot.imagePrompt = `${shot.imagePrompt || input.director.descriptor}.${dynamics}${bible}`;
      shot.videoPrompt = `${shot.videoPrompt || input.director.descriptor}.${dynamics} Preserve temporal order and lip-sync the spoken dialogue.${bible}`;
    }
    const preset = getResolutionOption(input.spec.resolutionPreset).id;
    const canvas = resolutionPrompt(preset);
    for (const shot of shots) {
      shot.imagePrompt = `${canvas}；${shot.imagePrompt}`;
      shot.videoPrompt = `${canvas}；${shot.videoPrompt}`;
      shot.resolutionPreset = preset;
    }
    const fallbackShot = shots[0];
    for (const scene of scenes) {
      if (shots.some((shot) => shot.scene === scene.number)) continue;
      const characterBible = characterContext ? ` Character Bible: ${characterContext}` : "";
      shots.push({
        id: `llm-shot-repair-${scene.number}`,
        scene: scene.number,
        title: `${scene.title} · 场景建立镜头`,
        duration: fallbackShot?.duration || "04s",
        size: fallbackShot?.size || "中景",
        camera: fallbackShot?.camera || "平视",
        movement: fallbackShot?.movement || "缓慢推进",
        imagePrompt: `${canvas}；${input.director.descriptor}, ${scene.content}${characterBible}`,
        videoPrompt: `${canvas}；${input.director.descriptor}; establish scene ${scene.title}, preserve continuity${characterBible}`,
        negativePrompt: fallbackShot?.negativePrompt || "text, subtitle, watermark",
        characterContext,
        characterIds: characters.slice(0, Math.min(2, characters.length)).map((character) => character.id),
        resolutionPreset: preset,
      });
    }
    const continuity: EpisodeContinuity = {
      summary: typeof parsed.continuity?.summary === "string" && parsed.continuity.summary.trim() ? parsed.continuity.summary.trim() : parsed.logline || "",
      ending: typeof parsed.continuity?.ending === "string" && parsed.continuity.ending.trim() ? parsed.continuity.ending.trim() : (parsed.script || "").slice(-1800),
      characterState: Array.isArray(parsed.continuity?.characterState) && parsed.continuity.characterState.length ? parsed.continuity.characterState.map((character, index) => ({ id: character.id || `char-${index + 1}`, name: character.name || `角色${index + 1}`, role: character.role || "角色", age: character.age || "", traits: character.traits || "", goal: character.goal || "", description: character.description || "", wardrobe: character.wardrobe || "", accessories: character.accessories || "" })) : characters,
      openThreads: Array.isArray(parsed.continuity?.openThreads) ? parsed.continuity.openThreads.filter((thread): thread is string => typeof thread === "string").slice(0, 20) : [],
    };
    return {
      title: `${input.topic.slice(0, 16)} · 风格化短剧`,
      topic: input.topic,
      scriptLength: input.scriptLength,
      narrativePerspective: input.narrativePerspective,
      projectFormat: input.spec.format,
      episodeCount: input.spec.episodeCount,
      wordsPerEpisode: input.spec.wordsPerEpisode,
      totalTargetWords: input.spec.totalTargetWords,
      storyBible: input.spec.storyBible,
      resolutionPreset: preset,
      logline: parsed.logline || "",
      script: parsed.script || "",
      continuity,
      characters,
      scenes: scenes.length ? scenes : [{ number: 1, title: "场景一", content: "", mood: "" }],
      shots,
      engine: "llm",
    };
  }
}

// 配置了 LLM 时返回远端生成结果；否则或失败时返回 null（由调用方回退本地）
export async function generateProjectRemotely(input: { topic: string; scriptLength: ScriptLength; narrativePerspective: NarrativePerspective; writer: WriterStyle; director: DirectorStyle; spec: GenerationSpec; episodeContext?: EpisodeGenerationContext; modelId?: string }): Promise<{ project: GeneratedProject; usage: ModelUsage } | null> {
  if (!(await isLLMConfigured(input.modelId))) return null;
  const result = await new LLMProjectGenerator().generate(input);
  if (!result.project.shots.length) throw new Error("LLM 未生成可用分镜，请检查模型输出或调整提示后重试");
  return result;
}
