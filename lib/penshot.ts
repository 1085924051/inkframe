import type { GeneratedProject, Shot } from "./types";
import { getModelConfigValue } from "./settings";

type PenShotResult = { data?: unknown; status?: string; success?: boolean; error?: string };

function findShotArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === "object" && ("video_prompt" in item || "videoPrompt" in item || "prompt" in item || "instruction" in item))) return value;
    for (const item of value) { const nested = findShotArray(item); if (nested) return nested; }
  }
  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) { const nested = findShotArray(nestedValue); if (nested) return nested; }
  }
  return undefined;
}

function normalizeShots(raw: unknown, fallback: Shot[]): Shot[] {
  const items = findShotArray(raw);
  if (!items?.length) return fallback;
  return items.map((item, index) => {
    const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const text = String(record.video_prompt ?? record.videoPrompt ?? record.prompt ?? record.instruction ?? record.description ?? fallback[index % fallback.length]?.videoPrompt ?? "");
    const negative = String(record.negative_prompt ?? record.negativePrompt ?? fallback[index % fallback.length]?.negativePrompt ?? "text, subtitle, watermark");
    return { ...(fallback[index % fallback.length] ?? fallback[0]), id: `penshot-${index + 1}`, title: String(record.title ?? record.shot_title ?? fallback[index % fallback.length]?.title ?? `镜头 ${index + 1}`), videoPrompt: text, imagePrompt: String(record.image_prompt ?? record.imagePrompt ?? text), negativePrompt: negative, characterContext: fallback[index % fallback.length]?.characterContext };
  });
}

export async function generateWithPenShot(input: { script: string; scriptId: string; fallback: GeneratedProject }): Promise<GeneratedProject | null> {
  const baseUrl = (await getModelConfigValue("PENSHOT_API_URL"))?.replace(/\/$/, "");
  if (!baseUrl) return null;
  const apiKey = await getModelConfigValue("PENSHOT_API_KEY");
  const model = await getModelConfigValue("PENSHOT_MODEL");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(`${baseUrl}/api/v1/storyboard/sync`, { method: "POST", headers, body: JSON.stringify({ script: input.script, script_id: input.scriptId, language: "zh", ...(model ? { model } : {}) }), cache: "no-store" });
  if (!response.ok) throw new Error(`PenShot returned ${response.status}`);
  const result = await response.json() as PenShotResult;
  if (result.success === false || result.status === "failed") throw new Error(result.error || "PenShot processing failed");
  return { ...input.fallback, shots: normalizeShots(result.data, input.fallback.shots), engine: "penshot" };
}
