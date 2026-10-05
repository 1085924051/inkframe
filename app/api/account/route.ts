import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pricingToView } from "@/lib/pricing";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const [projects, usage, usageCount, profiles, channelModels] = await Promise.all([
    prisma.project.findMany({ where: { userId: session.userId }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, topic: true, format: true, episodeCount: true, updatedAt: true, createdAt: true, _count: { select: { scenes: true, characters: true, assets: true } } } }),
    prisma.usageRecord.aggregate({ where: { userId: session.userId }, _sum: { costMicros: true, costCents: true, inputTokens: true, outputTokens: true } }),
    prisma.usageRecord.count({ where: { userId: session.userId } }),
    prisma.modelProfile.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, model: true, kind: true, provider: true, priceCurrency: true, billingUnit: true, inputPerMillionMicros: true, outputPerMillionMicros: true, videoPerSecondMicros: true, imagePerImageMicros: true, requestFixedMicros: true, priceEnabled: true, priceNote: true } }),
    prisma.modelChannelModel.findMany({ where: { enabled: true, channel: { enabled: true } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, kind: true, priceCurrency: true, billingUnit: true, inputPerMillionMicros: true, outputPerMillionMicros: true, videoPerSecondMicros: true, imagePerImageMicros: true, requestFixedMicros: true, priceEnabled: true, priceNote: true, channel: { select: { name: true, provider: true } } } }),
  ]);

  const models = [
    ...profiles.map((model) => ({ id: model.id, name: model.name, model: model.model, kind: model.kind, provider: model.provider, channelName: "独立模型", pricing: pricingToView(model) })),
    ...channelModels.map((model) => ({ id: model.id, name: model.name, model: model.name, kind: model.kind, provider: model.channel.provider, channelName: model.channel.name, pricing: pricingToView(model) })),
  ];

  return NextResponse.json({ account: {
    user: { id: session.userId, name: session.name, email: session.email, role: session.role },
    balance: { status: "not-configured", amountMicros: 0 },
    usage: { costMicros: usage._sum.costMicros || 0, costCents: usage._sum.costCents || 0, inputTokens: usage._sum.inputTokens || 0, outputTokens: usage._sum.outputTokens || 0, recordCount: usageCount },
    projects: projects.map((project) => ({ id: project.id, title: project.title, topic: project.topic, format: project.format, episodeCount: project.episodeCount, sceneCount: project._count.scenes, charactersCount: project._count.characters, assetsCount: project._count.assets, updatedAt: project.updatedAt.toISOString(), createdAt: project.createdAt.toISOString() })),
    models,
  } });
}
