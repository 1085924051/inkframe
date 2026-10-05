import { prisma } from "./prisma";

export const MICRO_YUAN = 1_000_000;
export const BILLING_UNITS = ["request", "token", "image", "video_second"] as const;
export type BillingUnit = typeof BILLING_UNITS[number];

export type ModelPricingView = {
  currency: "CNY";
  billingUnit: BillingUnit;
  inputPerMillion: number;
  outputPerMillion: number;
  videoPerSecond: number;
  imagePerImage: number;
  requestFixed: number;
  enabled: boolean;
  note: string;
};

export type ModelPricingPayload = Partial<ModelPricingView>;

export const DEFAULT_MODEL_PRICING: ModelPricingView = {
  currency: "CNY",
  billingUnit: "request",
  inputPerMillion: 0,
  outputPerMillion: 0,
  videoPerSecond: 0,
  imagePerImage: 0,
  requestFixed: 0,
  enabled: true,
  note: "",
};

function yuanToMicros(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * MICRO_YUAN) : 0;
}

function microsToYuan(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Number((number / MICRO_YUAN).toFixed(6)) : 0;
}

export function pricingFromPayload(payload?: ModelPricingPayload | null) {
  const unit = BILLING_UNITS.includes(payload?.billingUnit as BillingUnit) ? payload?.billingUnit as BillingUnit : "request";
  return {
    priceCurrency: "CNY",
    billingUnit: unit,
    inputPerMillionMicros: yuanToMicros(payload?.inputPerMillion),
    outputPerMillionMicros: yuanToMicros(payload?.outputPerMillion),
    videoPerSecondMicros: yuanToMicros(payload?.videoPerSecond),
    imagePerImageMicros: yuanToMicros(payload?.imagePerImage),
    requestFixedMicros: yuanToMicros(payload?.requestFixed),
    priceEnabled: payload?.enabled !== false,
    priceNote: typeof payload?.note === "string" ? payload.note.slice(0, 500) : null,
  };
}

export function pricingToView(row?: { priceCurrency?: string | null; billingUnit?: string | null; inputPerMillionMicros?: number | null; outputPerMillionMicros?: number | null; videoPerSecondMicros?: number | null; imagePerImageMicros?: number | null; requestFixedMicros?: number | null; priceEnabled?: boolean | null; priceNote?: string | null } | null): ModelPricingView {
  const unit = BILLING_UNITS.includes(row?.billingUnit as BillingUnit) ? row?.billingUnit as BillingUnit : "request";
  return {
    currency: "CNY",
    billingUnit: unit,
    inputPerMillion: microsToYuan(row?.inputPerMillionMicros),
    outputPerMillion: microsToYuan(row?.outputPerMillionMicros),
    videoPerSecond: microsToYuan(row?.videoPerSecondMicros),
    imagePerImage: microsToYuan(row?.imagePerImageMicros),
    requestFixed: microsToYuan(row?.requestFixedMicros),
    enabled: row?.priceEnabled !== false,
    note: row?.priceNote || "",
  };
}

export async function findModelPricing(modelId?: string) {
  if (!modelId) return null;
  const channelModel = await prisma.modelChannelModel.findUnique({ where: { id: modelId }, select: { priceCurrency: true, billingUnit: true, inputPerMillionMicros: true, outputPerMillionMicros: true, videoPerSecondMicros: true, imagePerImageMicros: true, requestFixedMicros: true, priceEnabled: true, priceNote: true } });
  if (channelModel) return channelModel;
  return prisma.modelProfile.findUnique({ where: { id: modelId }, select: { priceCurrency: true, billingUnit: true, inputPerMillionMicros: true, outputPerMillionMicros: true, videoPerSecondMicros: true, imagePerImageMicros: true, requestFixedMicros: true, priceEnabled: true, priceNote: true } });
}

export function calculatePricing(input: { kind: "text" | "image" | "video"; pricing: ReturnType<typeof pricingToView>; inputTokens?: number; outputTokens?: number; durationSeconds?: number; imageCount?: number }) {
  if (!input.pricing.enabled) return 0;
  const tokenCost = (input.inputTokens || 0) * input.pricing.inputPerMillion * MICRO_YUAN / 1_000_000 + (input.outputTokens || 0) * input.pricing.outputPerMillion * MICRO_YUAN / 1_000_000;
  const videoCost = (input.durationSeconds || 0) * input.pricing.videoPerSecond * MICRO_YUAN;
  const imageCost = (input.imageCount || 0) * input.pricing.imagePerImage * MICRO_YUAN;
  return Math.max(0, Math.round(tokenCost + videoCost + imageCost + input.pricing.requestFixed * MICRO_YUAN));
}

export function pricingSummary(pricing: ModelPricingView) {
  const parts: string[] = [];
  if (pricing.inputPerMillion || pricing.outputPerMillion) parts.push(`输入 ¥${pricing.inputPerMillion}/M · 输出 ¥${pricing.outputPerMillion}/M`);
  if (pricing.videoPerSecond) parts.push(`视频 ¥${pricing.videoPerSecond}/秒`);
  if (pricing.imagePerImage) parts.push(`图像 ¥${pricing.imagePerImage}/张`);
  if (pricing.requestFixed) parts.push(`请求 ¥${pricing.requestFixed}`);
  return parts.length ? parts.join(" · ") : "尚未设置价格";
}
