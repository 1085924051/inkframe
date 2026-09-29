import { directorStyles, writerStyles } from "./styles";
import { buildCharacterReferencePrompt, CHARACTER_REFERENCE_NEGATIVE } from "./character-prompts";
import type { Character, DirectorStyle, EpisodeContinuity, EpisodeGenerationContext, GeneratedProject, GenerationSpec, NarrativePerspective, ScriptLength, Shot, WriterStyle } from "./types";

export type PipelineStage = "distill" | "script" | "parse" | "shots";
export type PipelineTrace = { stage: PipelineStage; at: string; summary: string };
export type PipelineInput = { topic?: string; scriptLength?: ScriptLength; narrativePerspective?: NarrativePerspective; writerId?: string; directorId?: string; writerStyle?: WriterStyle; directorStyle?: DirectorStyle; spec?: GenerationSpec; episodeContext?: EpisodeGenerationContext };
export type PipelineHooks = { onStage?: (stage: PipelineStage, summary: string) => void };

type SceneDraft = { number: number; title: string; content: string; mood: string };

type Context = {
  topic: string;
  writer: WriterStyle;
  director: DirectorStyle;
  scriptLength: ScriptLength;
  narrativePerspective: NarrativePerspective;
  spec: GenerationSpec;
  styleProfile: string;
  logline: string;
  script: string;
  characters: Character[];
  scenes: SceneDraft[];
  shots: Shot[];
  episodeContext?: EpisodeGenerationContext;
};

export function resolveWriter(input: PipelineInput): WriterStyle {
  return input.writerStyle ?? writerStyles.find((item) => item.id === input.writerId) ?? writerStyles[0];
}

export function resolveDirector(input: PipelineInput): DirectorStyle {
  return input.directorStyle ?? directorStyles.find((item) => item.id === input.directorId) ?? directorStyles[0];
}

// 节点 1：风格蒸馏 —— 将作家风格卡压缩为一段可注入剧本的语气剖面
function distillNode(ctx: Context) {
  const axes = ctx.writer.axes.map((axis) => `${axis.label} ${axis.value}`).join("、");
  ctx.styleProfile = `${ctx.writer.name}（${ctx.writer.era}）｜${ctx.writer.summary}｜九轴强度：${axes}`;
}

// 节点 2：剧本生成 —— 依据主题、作家与导演风格产出 logline 与完整剧本
function scriptNode(ctx: Context) {
  const perspective = ctx.narrativePerspective === "first-person" ? "我" : ctx.narrativePerspective === "observational" ? "镜头" : "主角";
  const subject = ctx.topic.replace(/\s+/g, " ").trim().slice(0, 360) || "一个人必须做出的选择";
  const constraint = ctx.spec.storyBible?.replace(/\s+/g, " ").trim().slice(0, 260);
  ctx.logline = `当${subject}进入故事，${ctx.writer.name}的文字气质与${ctx.director.name}的视觉语言共同推动一次不可逆的选择。叙事采用${ctx.narrativePerspective}视角。${ctx.spec.format === "series" ? `本项目规划 ${ctx.spec.episodeCount} 集，每集约 ${ctx.spec.wordsPerEpisode} 字。` : `目标字数约 ${ctx.spec.wordsPerEpisode} 字。`}`;
  const core = `【场景一｜主线的起点｜日】\n\n${subject}并不是一个可以轻易解释的开端。${ctx.writer.summary}。${constraint ? `故事必须遵守这些约束：${constraint}。` : "人物先按自己的习惯行动，直到一个细节暴露出真正的冲突。"}\n\n${perspective}：事情已经走到这里了。\n关键人物：你现在才承认？\n${perspective}：我终于听见了它。\n\n【场景二｜选择被看见｜日】\n\n一个被忽略的物件、一句没有说完的话，迫使人物重新理解刚才发生的一切。周围的人都在等待一个更方便的答案，没人愿意先承担答案的后果。\n\n${perspective}：如果继续装作没看见，接下来会更容易吗？\n阻力：容易，但不会结束。\n${perspective}：那就从现在开始。\n\n光线从人物之间经过，留下短暂而清楚的边界。没有人提高声音，局面却已经改变。\n\n【场景三｜余波未平｜夜】\n\n决定做出之后，世界没有立刻奖励谁。${perspective}走过熟悉的地方，发现每一件东西都还在原处，只有人与它们的关系已经不同。\n\n关键人物：你准备好承担了吗？\n${perspective}：没有。但我不再把害怕当成理由。`;
  const detail = `\n\n沉默持续了很久。每个人都在心里替这次选择寻找一个名字，有人叫它冲动，有人叫它背叛，也有人第一次承认那是必要。${ctx.writer.name}式的克制让情绪停在动作和物件之间，而不是替人物解释。\n\n${perspective}：这不是结论，只是不能再往回走的地方。\n\n窗外的声音逐渐远去，留下一个仍然开放的问题。`;
  const extended = `${detail}\n\n下一步尚未发生，人物却已经带着新的关系和代价进入下一场戏。`;
  const continuity = ctx.episodeContext ? `\n\n【本集连续性约束】\n本集目标：${ctx.episodeContext.episodeGoal}\n${ctx.episodeContext.previousEpisode ? `上一集结尾：${ctx.episodeContext.previousEpisode.ending}` : "这是第一集，建立人物与主线。"}\n角色状态必须保持：${ctx.episodeContext.characterState.map((character) => `${character.name}（${character.description}；${character.wardrobe}）`).join("；")}\n` : "";
  const body = ctx.scriptLength === "micro" ? core : ctx.scriptLength === "short" ? core.replace("【场景三", `${extended}【场景三`) : ctx.scriptLength === "medium" ? core.replace("【场景三", `${extended}${extended}【场景三`) : core.replace("【场景三", `${extended}${extended}${extended}【场景三`);
  ctx.script = continuity + body;
}

// 节点 3：剧本解析 —— 将剧本拆解为编号场景（情绪、内容）
function parseNode(ctx: Context) {
  ctx.characters = [
    { id: "char-protagonist", name: "主角", role: "推动主线选择的人物", age: "三十岁左右", traits: "克制、敏锐、行动前反复权衡", description: "眼神清醒，面部轮廓明确，体型自然，发型稳定", wardrobe: "与故事时代、身份和场景保持一致的固定服装", accessories: "与人物身份相关的固定手表或随身物件" },
    { id: "char-colleague", name: "关键人物", role: "旁观者与见证人", age: "二十多岁至三十岁", traits: "善于观察，谨慎而可靠", description: "五官与发型清晰，体态自然，与主角有明确关系", wardrobe: "符合人物身份并在各集保持一致的固定服装", accessories: "简洁眼镜或工作证等固定配饰" },
    { id: "char-manager", name: "阻力", role: "制造选择代价的人物", age: "四十岁左右", traits: "表面稳定，控制欲强，目的明确", description: "面部线条成熟，姿态稳定，具有辨识度", wardrobe: "符合故事世界观的固定服装", accessories: "身份象征性的戒指、钢笔或文件夹" },
  ];
  const subject = ctx.topic.replace(/\s+/g, " ").trim().slice(0, 360) || "一个人必须做出的选择";
  ctx.scenes = [
    { number: 1, title: "周五，五点四十", mood: "压抑 / 暗涌", content: `${subject}被放进第一个具体场景，人物通过一个细节暴露出主线冲突。` },
    { number: 2, title: "会议室里没有回声", mood: "紧绷 / 迟疑", content: "人物与阻力正面相遇，原本可以回避的选择变成必须回答的问题。" },
    { number: 3, title: "灯灭之前", mood: "释然 / 余震", content: "决定已经发生，人物带着新的代价离开现场，并留下可继续发展的悬念。" }
  ];
}

function sceneScriptBlock(script: string, sceneNumber: number) {
  const blocks = script.split(/(?=【场景[一二三四五六七八九十\d])/).filter(Boolean);
  return (blocks[sceneNumber - 1] || "").replace(/【[^】]+】/g, "").replace(/\s+/g, " ").trim().slice(0, 900);
}

// 节点 4：分镜生成 —— 为每个场景产出两个可拍摄的镜头提示词
function shotsNode(ctx: Context) {
  const characterContext = ctx.characters.map((character) => `${character.name}（${character.role}）：${character.description}；服装：${character.wardrobe}`).join(" | ");
  ctx.shots = ctx.scenes.flatMap((scene, index) => {
    const scriptBlock = sceneScriptBlock(ctx.script, scene.number) || scene.content;
    const dynamic = `剧本动作与对白：${scriptBlock}；请表现人物的连续动作、说话时的口型与语气、表情变化和环境声音。已有参考资产只用于人物/场景一致性，重点表现动态。`;
    return [
      { id: `shot-${scene.number}-a`, scene: scene.number, title: `${scene.title} · 环境与人物`, duration: "04s", size: index === 0 ? "远景" : "中近景", camera: "平视", movement: "缓慢推进", action: scriptBlock, dialogue: scriptBlock, sound: "对白语气与现场环境声随动作变化", imagePrompt: `${ctx.director.descriptor}, ${scene.content}, ${dynamic} cinematic composition, character continuity, high detail. Character Bible: ${characterContext}`, videoPrompt: `${ctx.director.descriptor}; ${dynamic} slow push-in, preserve action order, lip-sync dialogue, restrained but visible micro-expression, 4 seconds, preserve spatial continuity. Character Bible: ${characterContext}`, negativePrompt: "text, subtitle, watermark, extra fingers, distorted face, inconsistent costume, oversaturated colors", characterContext, characterIds: ctx.characters.map((character) => character.id) },
      { id: `shot-${scene.number}-b`, scene: scene.number, title: `${scene.title} · 手部情绪特写`, duration: "06s", size: "近景", camera: "侧后方", movement: "固定镜头", action: `${scriptBlock}；聚焦动作发生的关键瞬间`, dialogue: scriptBlock, sound: "近距离对白、呼吸和关键物件声", imagePrompt: `${ctx.director.descriptor}, key action moment from the script, close-up of the hand and prop, ${dynamic}, ${scene.mood}, tactile detail. Character Bible: ${characterContext}`, videoPrompt: `${ctx.director.descriptor}; ${dynamic} locked-off close-up, the hand tightens then relaxes around the story prop, show the reaction after the line, ambient room tone, 6 seconds, match-cut ready. Character Bible: ${characterContext}`, negativePrompt: "jitter, jump cut, unreadable props, duplicate person, plastic skin, cartoon artifact", characterContext, characterIds: ctx.characters.map((character) => character.id) }
    ];
  });
}

export function runPipeline(input: PipelineInput, hooks: PipelineHooks = {}): { project: GeneratedProject; trace: PipelineTrace[] } {
  const trace: PipelineTrace[] = [];
  const stage = (name: PipelineStage, summary: string) => {
    trace.push({ stage: name, at: new Date().toISOString(), summary });
    hooks.onStage?.(name, summary);
  };

  const spec: GenerationSpec = input.spec ?? { format: "single", episodeCount: 1, wordsPerEpisode: 500, totalTargetWords: 500 };
  const ctx: Context = {
    topic: String(input.topic || "一位普通职员决定在周五下午说出真话"),
    writer: resolveWriter(input),
    director: resolveDirector(input),
    scriptLength: input.scriptLength ?? "short",
    narrativePerspective: input.narrativePerspective ?? "third-person",
    spec,
    styleProfile: "",
    logline: "",
    script: "",
    characters: [],
    scenes: [],
    shots: [],
    episodeContext: input.episodeContext,
  };

  distillNode(ctx);
  stage("distill", `作家风格「${ctx.writer.name}」 → 语气剖面 ${ctx.styleProfile.length} 字符`);
  scriptNode(ctx);
  stage("script", `剧本 ${ctx.script.length} 字（${ctx.writer.name} × ${ctx.director.name}）`);
  parseNode(ctx);
  for (const character of ctx.characters) {
    character.appearancePrompt = buildCharacterReferencePrompt(character, ctx.director.descriptor, "front");
    character.imagePrompt = character.appearancePrompt;
    character.negativePrompt = CHARACTER_REFERENCE_NEGATIVE;
  }
  stage("parse", `剧本解析为 ${ctx.scenes.length} 个场景`);
  shotsNode(ctx);
  stage("shots", `分镜生成 ${ctx.shots.length} 个镜头提示词`);

  const project: GeneratedProject = {
    title: `${ctx.topic.slice(0, 16)} · 风格化短剧`,
    topic: ctx.topic,
    scriptLength: ctx.scriptLength,
    narrativePerspective: ctx.narrativePerspective,
    projectFormat: ctx.spec.format,
    episodeCount: ctx.spec.episodeCount,
    wordsPerEpisode: ctx.spec.wordsPerEpisode,
    totalTargetWords: ctx.spec.totalTargetWords,
    storyBible: ctx.spec.storyBible,
    logline: ctx.logline,
    script: ctx.script,
    continuity: {
      summary: ctx.logline,
      ending: ctx.script.slice(-1800),
      characterState: ctx.characters,
      openThreads: ctx.episodeContext?.episodeGoal ? [ctx.episodeContext.episodeGoal] : [],
    } satisfies EpisodeContinuity,
    characters: ctx.characters,
    scenes: ctx.scenes,
    shots: ctx.shots,
    engine: "local",
  };
  return { project, trace };
}

export function generateProject(input: PipelineInput): GeneratedProject {
  return runPipeline(input).project;
}
