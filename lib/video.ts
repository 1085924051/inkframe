import type { Shot } from "./types";
import { getModelConfigValue } from "./settings";
import { shotDurationSeconds } from "./shot-retake";
import { prisma } from "./prisma";
import { decryptSecret } from "./security";

export type VideoJobStatus = "queued" | "processing" | "complete" | "failed";
export type VideoJob = { id: string; shotId: string; provider: string; model?: string; externalId?: string; status: VideoJobStatus; progress: number; outputUrl?: string; error?: string; createdAt: string; updatedAt: string };

export interface VideoProvider {
  readonly name: string;
  submit(shot: Shot): Promise<{ externalId: string }>;
  getStatus(externalId: string): Promise<{ status: VideoJobStatus; progress: number; outputUrl?: string; error?: string }>;
}

export function assertVideoReferenceCapacity(provider: string, urls: string[] = []) {
  if (provider.startsWith("channel:")) return;
  if (provider === "seedance" || provider === "mock-video") return;
  if (urls.length > 1) {
    throw new Error(`${provider} 当前适配器只验证了单张起始参考图；镜头关联了 ${urls.length} 张人物/场景图。Seedance 适配器支持同镜头多图输入，或请先在分镜中保留一张参考图。未提交任务，以免静默丢失参考图。`);
  }
}

// 默认 mock：用于链路联调，不调用真实模型
export class MockVideoProvider implements VideoProvider {
  readonly name = "mock-video";
  async submit(_shot: Shot) { return { externalId: `mock-${crypto.randomUUID()}` }; }
  async getStatus(_externalId: string) { return { status: "complete" as const, progress: 100, outputUrl: "/demo/shot-preview.mp4" }; }
}

async function resolveProviderConfig(urlKey: string, keyKey: string, defaultUrl: string): Promise<{ baseUrl: string; key: string }> {
  const baseUrl = ((await getModelConfigValue(urlKey)) || defaultUrl).replace(/\/$/, "");
  const key = await getModelConfigValue(keyKey);
  if (!key) throw new Error(`${keyKey} 未配置（请在后台「模型配置」或环境变量中设置）`);
  return { baseUrl, key };
}

function resolveStatus(raw: string): VideoJobStatus {
  const status = String(raw || "").toUpperCase();
  if (status === "SUCCEEDED" || status === "COMPLETED" || status === "SUCCESS" || status === "DONE") return "complete";
  if (status === "FAILED" || status === "ERROR" || status === "CANCELLED" || status === "EXPIRED") return "failed";
  return "processing";
}

function seedanceDuration(model: string, duration: string): number {
  const requested = Math.round(shotDurationSeconds(duration));
  const normalized = model.toLowerCase();
  if (normalized.includes("1-5") || normalized.includes("1.5") || normalized.includes("2.0") || normalized.includes("2-")) {
    return Math.max(4, Math.min(15, requested));
  }
  return Math.max(2, Math.min(12, requested));
}

// 预留：Runway 图生视频（端点以官方文档为准）
export class RunwayVideoProvider implements VideoProvider {
  readonly name = "runway";
  async submit(shot: Shot) {
    assertVideoReferenceCapacity(this.name, shot.referenceAssetUrls);
    const { baseUrl, key } = await resolveProviderConfig("RUNWAY_API_URL", "RUNWAY_API_KEY", "https://api.runwayml.com");
    const model = shot.model || await getModelConfigValue("RUNWAY_MODEL");
    const response = await fetch(`${baseUrl}/v1/image_to_video`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...(model ? { model } : {}), prompt_text: shot.videoPrompt, ...(shot.referenceAssetUrls?.[0] ? { prompt_image: shot.referenceAssetUrls[0] } : {}), duration: shotDurationSeconds(shot.duration), ratio: "1280:720" }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Runway 提交失败：HTTP ${response.status}`);
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error("Runway 未返回任务 id");
    return { externalId: data.id };
  }
  async getStatus(externalId: string) {
    const { baseUrl, key } = await resolveProviderConfig("RUNWAY_API_URL", "RUNWAY_API_KEY", "https://api.runwayml.com");
    const response = await fetch(`${baseUrl}/v1/tasks/${externalId}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Runway 查询失败：HTTP ${response.status}`);
    const data = (await response.json()) as { status?: string; output?: string[] };
    const status = resolveStatus(data.status || "processing");
    return { status, progress: status === "complete" ? 100 : 50, outputUrl: data.output?.[0] };
  }
}

// 预留：可灵 Kling 图生视频（端点以官方文档为准）
export class KlingVideoProvider implements VideoProvider {
  readonly name = "kling";
  async submit(shot: Shot) {
    assertVideoReferenceCapacity(this.name, shot.referenceAssetUrls);
    const { baseUrl, key } = await resolveProviderConfig("KLING_API_URL", "KLING_API_KEY", "https://api.klingai.com");
    const model = shot.model || (await getModelConfigValue("KLING_MODEL")) || "kling-v1";
    const response = await fetch(`${baseUrl}/v1/videos/image2video`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model_name: model, prompt: shot.videoPrompt, ...(shot.referenceAssetUrls?.[0] ? { image: shot.referenceAssetUrls[0] } : {}), duration: String(shotDurationSeconds(shot.duration)), mode: "std" }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`可灵提交失败：HTTP ${response.status}`);
    const data = (await response.json()) as { data?: { task_id?: string } };
    if (!data.data?.task_id) throw new Error("可灵未返回 task_id");
    return { externalId: data.data.task_id };
  }
  async getStatus(externalId: string) {
    const { baseUrl, key } = await resolveProviderConfig("KLING_API_URL", "KLING_API_KEY", "https://api.klingai.com");
    const response = await fetch(`${baseUrl}/v1/videos/image2video/${externalId}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`可灵查询失败：HTTP ${response.status}`);
    const data = (await response.json()) as { data?: { task_status?: string; task_result?: { videos?: { url?: string }[] } } };
    const status = resolveStatus(data.data?.task_status || "processing");
    return { status, progress: status === "complete" ? 100 : 50, outputUrl: data.data?.task_result?.videos?.[0]?.url };
  }
}

// 预留：Seedance 视频生成（端点以官方文档为准）
export class SeedanceVideoProvider implements VideoProvider {
  readonly name = "seedance";
  async submit(shot: Shot) {
    assertVideoReferenceCapacity(this.name, shot.referenceAssetUrls);
    const { baseUrl, key } = await resolveProviderConfig("SEEDANCE_API_URL", "SEEDANCE_API_KEY", "https://ark.cn-beijing.volces.com/api/v3");
    const model = shot.model || (await getModelConfigValue("SEEDANCE_MODEL")) || "doubao-seedance-1-0-pro";
    const response = await fetch(`${baseUrl}/contents/generations/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, content: [{ type: "text", text: shot.videoPrompt }, ...(shot.referenceAssetUrls || []).map((url) => ({ type: "image_url", role: "reference_image", image_url: { url } }))] }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Seedance 提交失败：HTTP ${response.status}`);
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error("Seedance 未返回任务 id");
    return { externalId: data.id };
  }
  async getStatus(externalId: string) {
    const { baseUrl, key } = await resolveProviderConfig("SEEDANCE_API_URL", "SEEDANCE_API_KEY", "https://ark.cn-beijing.volces.com/api/v3");
    const response = await fetch(`${baseUrl}/contents/generations/tasks/${externalId}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Seedance 查询失败：HTTP ${response.status}`);
    const data = (await response.json()) as { status?: string; content?: { video_url?: string } };
    const status = resolveStatus(data.status || "processing");
    return { status, progress: status === "complete" ? 100 : 50, outputUrl: data.content?.video_url };
  }
}

type ConfiguredVideoChannel = { id: string; provider: string; baseUrl: string; key: string; model: string };

function isYuYuChannel(config: Pick<ConfiguredVideoChannel, "provider" | "baseUrl">) {
  const provider = config.provider.toLowerCase();
  return provider === "yuyu" || provider === "yu-yu" || config.baseUrl.toLowerCase().includes("api.yu-yu.ai");
}

function normalizeChannelBaseUrl(config: Pick<ConfiguredVideoChannel, "provider" | "baseUrl">) {
  let baseUrl = config.baseUrl.trim().replace(/\/$/, "");
  if (isYuYuChannel(config)) baseUrl = baseUrl.replace(/\/contents\/generations\/tasks\/?$/i, "");
  return baseUrl;
}

function channelStatus(data: Record<string, unknown>) {
  const nested = (data.data as Record<string, unknown> | undefined) || {};
  const content = (data.content as Record<string, unknown> | undefined) || (nested.content as Record<string, unknown> | undefined) || {};
  const output = (data.output as Record<string, unknown> | undefined) || (nested.output as Record<string, unknown> | undefined) || {};
  const raw = String(data.status || nested.status || data.task_status || nested.task_status || "processing");
  const videos = (output.videos || content.videos || nested.videos || data.videos) as { url?: string }[] | undefined;
  const outputUrl = (content.video_url || content.url || output.video_url || output.url || output.output_url || nested.video_url || nested.url || data.video_url || data.url || videos?.[0]?.url) as string | undefined;
  const errorValue = data.error || nested.error;
  const error = typeof errorValue === "string" ? errorValue : errorValue && typeof errorValue === "object" ? String((errorValue as Record<string, unknown>).message || (errorValue as Record<string, unknown>).code || "") : undefined;
  const status = resolveStatus(raw);
  return { status, progress: status === "complete" ? 100 : 50, outputUrl, error: error || undefined };
}

class ConfiguredChannelVideoProvider implements VideoProvider {
  readonly name: string;
  constructor(private config: ConfiguredVideoChannel) { this.name = `channel:${config.id}`; }
  private headers() { const headers: Record<string, string> = { "Content-Type": "application/json" }; if (this.config.key) headers.Authorization = `Bearer ${this.config.key}`; return headers; }
  private async request(path: string, init: RequestInit = {}) { const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers: { ...this.headers(), ...(init.headers || {}) }, cache: "no-store" }); if (!response.ok) throw new Error(`视频渠道请求失败：HTTP ${response.status}`); return response.json() as Promise<Record<string, unknown>>; }
  async submit(shot: Shot) {
    assertVideoReferenceCapacity(this.config.provider, shot.referenceAssetUrls);
    const refs = shot.referenceAssetUrls || [];
    if (isYuYuChannel(this.config)) {
      const data = await this.request("/contents/generations/tasks", { method: "POST", body: JSON.stringify({
        model: this.config.model,
        content: [{ type: "text", text: shot.videoPrompt }, ...refs.map((url) => ({ type: "image_url", role: "reference_image", image_url: { url } }))],
        resolution: "720p",
        ratio: "16:9",
        duration: seedanceDuration(this.config.model, shot.duration),
        watermark: false,
      }) });
      const id = data.id || (data.data as Record<string, unknown> | undefined)?.id || data.task_id;
      if (!id) throw new Error("YuYu 未返回任务 ID");
      return { externalId: String(id) };
    }
    if (this.config.provider === "runway") { const data = await this.request("/v1/image_to_video", { method: "POST", body: JSON.stringify({ model: this.config.model, prompt_text: shot.videoPrompt, ...(refs[0] ? { prompt_image: refs[0] } : {}), duration: shotDurationSeconds(shot.duration), ratio: "1280:720" }) }); return { externalId: String(data.id) }; }
    if (this.config.provider === "kling") { const data = await this.request("/v1/videos/image2video", { method: "POST", body: JSON.stringify({ model_name: this.config.model, prompt: shot.videoPrompt, ...(refs[0] ? { image: refs[0] } : {}), duration: String(shotDurationSeconds(shot.duration)), mode: "std" }) }); return { externalId: String((data.data as Record<string, unknown> | undefined)?.task_id || data.task_id) }; }
    if (this.config.provider === "seedance") { const data = await this.request("/contents/generations/tasks", { method: "POST", body: JSON.stringify({ model: this.config.model, content: [{ type: "text", text: shot.videoPrompt }, ...refs.map((url) => ({ type: "image_url", role: "reference_image", image_url: { url } }))], resolution: "720p", ratio: "16:9", duration: seedanceDuration(this.config.model, shot.duration), watermark: false }) }); return { externalId: String(data.id || (data.data as Record<string, unknown> | undefined)?.id) }; }
    const data = await this.request("/videos/generations", { method: "POST", body: JSON.stringify({ model: this.config.model, prompt: shot.videoPrompt, negative_prompt: shot.negativePrompt, duration: shotDurationSeconds(shot.duration), aspect_ratio: "16:9", reference_images: refs }) });
    const id = data.id || (data.data as Record<string, unknown> | undefined)?.id || (data.data as Record<string, unknown> | undefined)?.task_id;
    if (!id) throw new Error("视频渠道未返回任务 ID");
    return { externalId: String(id) };
  }
  async getStatus(externalId: string) { const path = isYuYuChannel(this.config) || this.config.provider === "seedance" ? `/contents/generations/tasks/${externalId}` : this.config.provider === "runway" ? `/v1/tasks/${externalId}` : this.config.provider === "kling" ? `/v1/videos/image2video/${externalId}` : `/videos/generations/${externalId}`; return channelStatus(await this.request(path)); }
}

export async function configuredChannelVideoProvider(providerName: string): Promise<VideoProvider | null> {
  if (!providerName.startsWith("channel:")) return null;
  const id = providerName.slice("channel:".length);
  const model = await prisma.modelChannelModel.findUnique({ where: { id }, include: { channel: { include: { keys: { where: { enabled: true }, take: 1 } } } } });
  if (!model || model.kind !== "video" || !model.enabled || !model.channel.enabled) return null;
  return new ConfiguredChannelVideoProvider({ id: model.id, provider: model.channel.provider, baseUrl: normalizeChannelBaseUrl({ provider: model.channel.provider, baseUrl: model.channel.baseUrl }), key: model.channel.keys[0] ? decryptSecret(model.channel.keys[0].apiKey) : "", model: model.name });
}

export const videoProviders: Record<string, VideoProvider> = {
  "mock-video": new MockVideoProvider(),
  runway: new RunwayVideoProvider(),
  kling: new KlingVideoProvider(),
  seedance: new SeedanceVideoProvider(),
};

export type VideoProviderConfigStatus = { provider: string; configured: boolean; reachable?: boolean; message: string; missing: string[] };

type VideoProviderMeta = { urlKey: string; keyKey: string; modelKey?: string; defaultUrl: string; defaultModel?: string };

const videoProviderMeta: Record<string, VideoProviderMeta> = {
  runway: { urlKey: "RUNWAY_API_URL", keyKey: "RUNWAY_API_KEY", modelKey: "RUNWAY_MODEL", defaultUrl: "https://api.runwayml.com" },
  kling: { urlKey: "KLING_API_URL", keyKey: "KLING_API_KEY", modelKey: "KLING_MODEL", defaultUrl: "https://api.klingai.com", defaultModel: "kling-v1" },
  seedance: { urlKey: "SEEDANCE_API_URL", keyKey: "SEEDANCE_API_KEY", modelKey: "SEEDANCE_MODEL", defaultUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seedance-1-0-pro" },
};

export type VideoProviderValidation = { provider: string; valid: boolean; message: string; missing: string[] };

/** Validate local configuration without making a network request. */
export async function validateVideoProviderConfig(providerName: string): Promise<VideoProviderValidation> {
  if (providerName.startsWith("channel:")) return (await configuredChannelVideoProvider(providerName)) ? { provider: providerName, valid: true, message: "已加载已配置视频渠道", missing: [] } : { provider: providerName, valid: false, message: "视频渠道或模型不存在、已停用或未配置", missing: ["channel-model"] };
  if (providerName === "mock-video") return { provider: providerName, valid: true, message: "Mock Provider 可用", missing: [] };
  const config = videoProviderMeta[providerName];
  if (!config) return { provider: providerName, valid: false, message: "不支持的 Provider", missing: ["provider"] };
  const key = await getModelConfigValue(config.keyKey);
  if (!key) return { provider: providerName, valid: false, message: `未配置 ${config.keyKey}`, missing: [config.keyKey] };
  return { provider: providerName, valid: true, message: "视频 Provider 配置可提交", missing: [] };
}

export async function checkVideoProviderConfig(providerName: string): Promise<VideoProviderConfigStatus> {
  const config = videoProviderMeta[providerName];
  if (!config) return { provider: providerName, configured: false, message: "不支持的 Provider", missing: ["provider"] };
  const url = ((await getModelConfigValue(config.urlKey)) || config.defaultUrl).replace(/\/$/, "");
  const key = await getModelConfigValue(config.keyKey);
  const model = config.modelKey ? await getModelConfigValue(config.modelKey) : "";
  const missing = [!url ? config.urlKey : "", !key ? config.keyKey : ""].filter(Boolean);
  if (missing.length) return { provider: providerName, configured: false, message: `缺少：${missing.join("、")}`, missing };
  try {
    const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (response.status === 401 || response.status === 403) return { provider: providerName, configured: true, reachable: true, message: "地址可达，但 API Key 鉴权失败", missing: [] };
    if (response.status >= 500) return { provider: providerName, configured: true, reachable: true, message: `地址可达，但服务返回 HTTP ${response.status}`, missing: [] };
    return { provider: providerName, configured: true, reachable: true, message: `配置完整，地址可达${model || config.defaultModel ? ` · 模型 ${model || config.defaultModel}` : ""}`, missing: [] };
  } catch (error) {
    return { provider: providerName, configured: true, reachable: false, message: error instanceof Error ? `配置完整，但地址不可达：${error.message}` : "配置完整，但地址不可达", missing: [] };
  }
}
