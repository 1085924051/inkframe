import type { ResolutionPreset } from "./types";

export type ResolutionOption = {
  id: ResolutionPreset;
  label: string;
  ratio: string;
  width: number;
  height: number;
  apiRatio: string;
  providerResolution: string;
};

export const DEFAULT_RESOLUTION_PRESET: ResolutionPreset = "landscape-16-9";

export const RESOLUTION_OPTIONS: ResolutionOption[] = [
  { id: "landscape-16-9", label: "横屏 16:9 · 1080P · 1920×1080", ratio: "16:9", width: 1920, height: 1080, apiRatio: "1280:720", providerResolution: "1080p" },
  { id: "portrait-9-16", label: "竖屏 9:16 · 1080P · 1080×1920", ratio: "9:16", width: 1080, height: 1920, apiRatio: "720:1280", providerResolution: "1080p" },
  { id: "landscape-16-9-720p", label: "横屏 16:9 · 720P · 1280×720", ratio: "16:9", width: 1280, height: 720, apiRatio: "1280:720", providerResolution: "720p" },
  { id: "portrait-9-16-720p", label: "竖屏 9:16 · 720P · 720×1280", ratio: "9:16", width: 720, height: 1280, apiRatio: "720:1280", providerResolution: "720p" },
];

export function getResolutionOption(value?: string | null): ResolutionOption {
  return RESOLUTION_OPTIONS.find((option) => option.id === value) || RESOLUTION_OPTIONS[0];
}

export function resolutionPrompt(value?: string | null): string {
  const option = getResolutionOption(value);
  return `项目统一画布：${option.ratio} ${option.width}×${option.height}，所有镜头保持相同横竖屏比例与构图方向`;
}
