// 预留：OpenAI 兼容 Chat Completions 客户端。
// 配置来源：后台「模型配置」写入的 DB 配置 > 环境变量。配置 LLM_API_URL + LLM_API_KEY 后自动启用，
// 未配置时各 Provider 回退到本地确定性实现。契约见 docs/API.md「模型接入」章节。
import { resolveModelConfig } from "../settings";
import { prisma } from "../prisma";
import { decryptSecret } from "../security";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ModelUsage = { inputTokens: number; outputTokens: number; model: string; estimated: boolean };
export type ChatCompletionResult = { content: string; usage: ModelUsage };
export type ChatCompletionOptions = { modelId?: string };

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(Array.from(text).length / 4));
}

async function resolveChatConfig(modelId?: string) {
  if (modelId) {
    const channelModel = await prisma.modelChannelModel.findUnique({ where: { id: modelId }, include: { channel: { include: { keys: { where: { enabled: true }, take: 1 } } } } });
    if (channelModel?.kind === "text" && channelModel.channel.enabled) return { url: channelModel.channel.baseUrl, key: channelModel.channel.keys[0] ? decryptSecret(channelModel.channel.keys[0].apiKey) : "", model: channelModel.name };
    const profile = await prisma.modelProfile.findUnique({ where: { id: modelId } });
    if (profile?.kind === "text" && profile.enabled) return { url: profile.baseUrl, key: decryptSecret(profile.apiKey), model: profile.model };
  }
  const cfg = await resolveModelConfig();
  return { url: cfg.LLM_API_URL, key: cfg.LLM_API_KEY, model: cfg.LLM_MODEL || "gpt-4o-mini" };
}

export async function isLLMConfigured(modelId?: string): Promise<boolean> {
  const cfg = await resolveChatConfig(modelId);
  return Boolean(cfg.url && cfg.key);
}

export async function chatCompletionDetailed(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const cfg = await resolveChatConfig(options?.modelId);
  const configuredUrl = cfg.url?.replace(/\/$/, "");
  const apiKey = cfg.key;
  const model = cfg.model || "gpt-4o-mini";
  if (!configuredUrl || !apiKey) throw new Error("LLM 未配置：缺少 LLM_API_URL 或 LLM_API_KEY");
  const endpoint = configuredUrl.endsWith("/chat/completions") ? configuredUrl : `${configuredUrl}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("LLM 请求失败：HTTP 401（认证失败）。请检查 LLM_API_KEY 是否有效，并确认它与 LLM_API_URL 属于同一个服务。");
    if (response.status === 404) throw new Error(`LLM 请求失败：HTTP 404。请将 LLM_API_URL 填为服务基础地址（例如 https://api.openai.com/v1），不要重复填写 /chat/completions。当前请求地址：${endpoint}`);
    throw new Error(`LLM 请求失败：HTTP ${response.status}。请求地址：${endpoint}`);
  }
  const data = (await response.json()) as { model?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("LLM 返回为空");
  const exact = Number.isFinite(data.usage?.prompt_tokens) && Number.isFinite(data.usage?.completion_tokens);
  return {
    content,
    usage: {
      inputTokens: exact ? Number(data.usage!.prompt_tokens) : estimateTokens(messages.map((message) => message.content).join("\n")),
      outputTokens: exact ? Number(data.usage!.completion_tokens) : estimateTokens(content),
      model: data.model || model,
      estimated: !exact,
    },
  };
}

export async function chatCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string> {
  return (await chatCompletionDetailed(messages, options)).content;
}

// 从模型输出中提取 JSON 对象（容忍 ```json 代码块包裹）
export function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? trimmed;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("模型输出中未找到 JSON");
  return JSON.parse(fenced.slice(start, end + 1)) as T;
}
