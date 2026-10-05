import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pricingToView } from "@/lib/pricing";

export async function GET(request: Request) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind");
  const [models, profiles] = await Promise.all([
    prisma.modelChannelModel.findMany({ where: { enabled: true, ...(kind ? { kind } : {}) }, include: { channel: { select: { id: true, name: true, provider: true, enabled: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.modelProfile.findMany({ where: { enabled: true, ...(kind ? { kind } : {}) }, select: { id: true, name: true, model: true, kind: true, provider: true, baseUrl: true, priceCurrency: true, billingUnit: true, inputPerMillionMicros: true, outputPerMillionMicros: true, videoPerSecondMicros: true, imagePerImageMicros: true, requestFixedMicros: true, priceEnabled: true, priceNote: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return NextResponse.json({ models: [
    ...profiles.map((item) => ({ id: item.id, name: item.name, model: item.model, kind: item.kind, provider: item.provider, baseUrl: item.baseUrl, pricing: pricingToView(item) })),
    ...models.filter((item) => item.channel.enabled).map((item) => ({ id: item.id, name: item.name, model: item.name, kind: item.kind, channelId: item.channel.id, channelName: item.channel.name, provider: item.channel.provider, pricing: pricingToView(item) })),
  ] });
}
