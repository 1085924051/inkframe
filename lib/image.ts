import { getModelConfigValue } from "./settings";
import { prisma } from "./prisma";
import { decryptSecret } from "./security";

export type ImageJobStatus = "queued" | "processing" | "complete" | "failed";
export type ImageGenerationInput = { prompt: string; negativePrompt?: string; model?: string; referenceImages?: string[] };
export type ImageProvider = {
  name: string;
  submit(input: ImageGenerationInput): Promise<{ externalId?: string; outputUrl?: string }>;
  getStatus(externalId: string): Promise<{ status: ImageJobStatus; progress: number; outputUrl?: string }>;
};

function mockSvg(prompt: string) {
  const safe = prompt.replace(/[<>&]/g, "").slice(0, 80);
  return `/generated/mock-character.svg?prompt=${encodeURIComponent(safe)}`;
}

export class MockImageProvider implements ImageProvider {
  name = "mock-image";
  async submit(input: ImageGenerationInput) { return { externalId: `mock-image-${crypto.randomUUID()}`, outputUrl: mockSvg(input.prompt) }; }
  async getStatus(_externalId: string) { return { status: "complete" as const, progress: 100, outputUrl: undefined }; }
}

async function imageConfig() {
  return {
    url: (await getModelConfigValue("IMAGE_API_URL")).replace(/\/$/, ""),
    key: await getModelConfigValue("IMAGE_API_KEY"),
    model: await getModelConfigValue("IMAGE_MODEL"),
  };
}

export class OpenAIImageProvider implements ImageProvider {
  name = "openai-image";
  async submit(input: ImageGenerationInput) {
    const cfg = await imageConfig();
    if (!cfg.url || !cfg.key) throw new Error("图像服务未配置：请设置 IMAGE_API_URL 和 IMAGE_API_KEY");
    const endpoint = cfg.url.endsWith("/images/generations") ? cfg.url : `${cfg.url}/images/generations`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: input.model || cfg.model || "gpt-image-1", prompt: input.prompt, ...(input.referenceImages?.length ? { reference_images: input.referenceImages } : {}) }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`图像服务请求失败：HTTP ${response.status}`);
    const data = await response.json() as { data?: { url?: string; b64_json?: string }[] };
    const item = data.data?.[0];
    if (!item?.url && !item?.b64_json) throw new Error("图像服务未返回图片地址");
    return { outputUrl: item.url || `data:image/png;base64,${item.b64_json}` };
  }
  async getStatus(_externalId: string) { return { status: "complete" as const, progress: 100 }; }
}

class ProfileImageProvider implements ImageProvider {
  constructor(public name: string, private baseUrl: string, private key: string, private defaultModel: string) {}
  async submit(input: ImageGenerationInput) {
    const endpoint = this.baseUrl.endsWith("/images/generations") ? this.baseUrl : `${this.baseUrl}/images/generations`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.key) headers.Authorization = `Bearer ${this.key}`;
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ model: input.model || this.defaultModel, prompt: input.prompt }), cache: "no-store" });
    if (!response.ok) throw new Error(`图像服务请求失败：HTTP ${response.status}`);
    const data = await response.json() as { data?: { url?: string; b64_json?: string }[] };
    const item = data.data?.[0];
    if (!item?.url && !item?.b64_json) throw new Error("图像服务未返回图片地址");
    return { outputUrl: item.url || `data:image/png;base64,${item.b64_json}` };
  }
  async getStatus(_externalId: string) { return { status: "complete" as const, progress: 100 }; }
}

export const imageProviders: Record<string, ImageProvider> = {
  "mock-image": new MockImageProvider(),
  "openai": new OpenAIImageProvider(),
  "openai-image": new OpenAIImageProvider(),
};

export async function selectedImageProvider(explicit?: string) {
  const configured = explicit || await getModelConfigValue("IMAGE_PROVIDER") || "mock-image";
  if (!imageProviders[configured]) {
    const model = await prisma.modelChannelModel.findUnique({ where: { id: configured }, include: { channel: { include: { keys: { where: { enabled: true }, take: 1 } } } } });
    if (model?.kind === "image" && model.channel.enabled) return new ProfileImageProvider(model.id, model.channel.baseUrl.replace(/\/$/, ""), model.channel.keys[0] ? decryptSecret(model.channel.keys[0].apiKey) : "", model.name);
    const profile = await prisma.modelProfile.findUnique({ where: { id: configured } });
    if (profile?.kind === "image" && profile.enabled) return new ProfileImageProvider(profile.id, profile.baseUrl.replace(/\/$/, ""), decryptSecret(profile.apiKey), profile.model);
  }
  return imageProviders[configured] || imageProviders["mock-image"];
}
