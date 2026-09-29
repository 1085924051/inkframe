import { prisma } from "./prisma";
import { getModelConfigValue } from "./settings";

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(Array.from(text).length / 4));
}

export async function modelCostMicros(inputTokens: number, outputTokens: number) {
  const [inputRate, outputRate] = await Promise.all([getModelConfigValue("LLM_INPUT_USD_PER_MILLION"), getModelConfigValue("LLM_OUTPUT_USD_PER_MILLION")]);
  const inputPrice = Number(inputRate);
  const outputPrice = Number(outputRate);
  const ratesConfigured = inputRate.trim() !== "" && outputRate.trim() !== "" && Number.isFinite(inputPrice) && Number.isFinite(outputPrice) && inputPrice >= 0 && outputPrice >= 0;
  const micros = ratesConfigured ? Math.round(inputTokens * inputPrice + outputTokens * outputPrice) : 0;
  return { costMicros: micros, costCents: Math.round(micros / 10_000), ratesConfigured };
}

export async function recordUsage(input: { projectId?: string; userId?: string; kind: "text" | "video" | "image"; provider: string; model?: string; inputTokens?: number; outputTokens?: number; inputText?: string; outputText?: string; costCents?: number; costMicros?: number; metadata?: unknown }) {
  const inputTokens = input.inputTokens ?? (input.inputText ? estimateTokens(input.inputText) : 0);
  const outputTokens = input.outputTokens ?? (input.outputText ? estimateTokens(input.outputText) : 0);
  const costs = input.costMicros === undefined && input.kind === "text" ? await modelCostMicros(inputTokens, outputTokens) : { costMicros: input.costMicros ?? 0, costCents: input.costCents ?? 0, ratesConfigured: false };
  const metadata = { ...(input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}), costSource: input.kind === "text" && costs.ratesConfigured ? "configured-model-rate" : "unavailable" };
  return prisma.usageRecord.create({ data: { projectId: input.projectId, userId: input.userId, kind: input.kind, provider: input.provider, model: input.model, inputTokens, outputTokens, costCents: input.costCents ?? costs.costCents, costMicros: costs.costMicros, metadata: JSON.stringify(metadata) } });
}

export async function usageSummary(projectId?: string) {
  const rows = await prisma.usageRecord.findMany({ where: projectId ? { projectId } : undefined, orderBy: { createdAt: "desc" } });
  const pricedRecords = rows.filter((row) => {
    try { return JSON.parse(row.metadata || "{}").costSource === "configured-model-rate"; } catch { return false; }
  }).length;
  return { inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0), outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0), costCents: rows.reduce((sum, row) => sum + row.costCents, 0), costMicros: rows.reduce((sum, row) => sum + row.costMicros, 0), pricedRecords, records: rows };
}
