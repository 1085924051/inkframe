import type { Shot } from "./types";

export function shotDurationSeconds(duration: string): number {
  const match = String(duration || "").match(/\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : 5;
  return Math.max(1, Math.min(30, Number.isFinite(value) ? value : 5));
}

export function retakePrompt(shot: Shot, sceneContent: string, characterNames: string[] = []) {
  const seconds = shotDurationSeconds(shot.duration);
  const maxSpeech = Math.max(4, Math.floor(seconds * 3));
  const source = [shot.dialogue, shot.action, shot.videoPrompt, sceneContent].filter(Boolean).join(" ");
  const quotes = Array.from(source.matchAll(/[“「『"]([^”」』"]{1,80})[”」』"]/g)).map((match) => match[1]);
  const dialogue = quotes.find((line) => line.length <= maxSpeech) || "";
  const beat = sceneContent.replace(/\s+/g, " ").slice(0, Math.max(50, seconds * 18));
  const pace = seconds <= 5 ? "单一动作和一个明确反应，不安排多轮对话或复杂转场" : "最多两个连续动作节拍，留出人物反应和镜头运动时间";
  const prompt = `${seconds}秒单镜头。${pace}。${characterNames.length ? `出场人物：${characterNames.join("、")}。` : ""}剧情依据：${beat}。${dialogue ? `只说一句台词：“${dialogue}”，约${dialogue.length}字，口型同步。` : "无对白，以动作、表情和环境声叙事。"}景别${shot.size}，机位${shot.camera}，运镜${shot.movement}。参考人物图和场景图仅用于保持身份、服装与空间一致性。`;
  return { prompt, seconds, maxSpeech, dialogue };
}
