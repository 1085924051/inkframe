import type { DirectorStyle, WriterStyle } from "./types";

export const writerStyles: WriterStyle[] = [
  { id: "luxun", name: "鲁迅", era: "1881 — 1936", summary: "冷峻的白描、克制的讽刺，以及藏在沉默里的锋利。", tags: ["冷峻", "讽刺", "白描"], axes: [{ label: "冷峻度", value: 92 }, { label: "讽刺性", value: 88 }, { label: "意象密度", value: 64 }, { label: "对话张力", value: 86 }, { label: "节奏", value: 72 }, { label: "口语化", value: 42 }, { label: "悲悯感", value: 78 }, { label: "荒诞感", value: 57 }, { label: "留白", value: 83 }], sample: "办公室的灯亮着，像一只疲倦而不肯闭上的眼睛。", source: "curated" },
  { id: "zhangailing", name: "张爱玲", era: "1920 — 1995", summary: "华丽而疏离的城市观察，情感总在日常细节中突然转身。", tags: ["精致", "疏离", "都市"], axes: [{ label: "华丽度", value: 90 }, { label: "疏离感", value: 84 }, { label: "意象密度", value: 91 }, { label: "对话张力", value: 76 }, { label: "节奏", value: 68 }, { label: "口语化", value: 48 }, { label: "悲悯感", value: 71 }, { label: "荒诞感", value: 38 }, { label: "留白", value: 88 }], sample: "她把咖啡杯往旁边挪了一寸，仿佛那便是他们之间合适的距离。", source: "curated" },
  { id: "wangxiaobo", name: "王小波", era: "1952 — 1997", summary: "以荒诞拆解秩序，用轻盈的幽默讲出不合时宜的真话。", tags: ["荒诞", "幽默", "自由"], axes: [{ label: "荒诞度", value: 89 }, { label: "幽默感", value: 93 }, { label: "意象密度", value: 58 }, { label: "对话张力", value: 81 }, { label: "节奏", value: 86 }, { label: "口语化", value: 73 }, { label: "悲悯感", value: 65 }, { label: "反叛性", value: 90 }, { label: "留白", value: 52 }], sample: "我决定先把周一过完，再考虑要不要热爱这个世界。", source: "curated" }
];

export const directorStyles: DirectorStyle[] = [
  { id: "wong-kar-wai", name: "王家卫", summary: "潮湿霓虹、慢门残影与未说出口的情绪。", palette: ["#d86b49", "#56384b", "#f2c078"], descriptor: "35mm film grain, wet neon reflections, shallow depth of field, lingering camera, amber and teal palette, emotionally restrained faces", lora: "lora://wkw-cinematic-v2" },
  { id: "makoto-shinkai", name: "新海诚", summary: "通透的天空、精密的城市光线与远距离的思念。", palette: ["#6aa7c9", "#dcecf0", "#f0b36d"], descriptor: "luminous anime background, dramatic cloudscape, crisp urban details, volumetric sunlight, cyan and sunset orange, quiet wonder", lora: "lora://shinkai-light-v1" },
  { id: "nolan", name: "诺兰", summary: "冷硬的现实质感、时间结构与压迫感极强的空间。", palette: ["#1d2529", "#667477", "#c9ad77"], descriptor: "large format cinematic realism, desaturated steel palette, practical lighting, architectural symmetry, controlled contrast, temporal tension", lora: "lora://nolan-reality-v3" }
];
