import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, maskSecret, decryptSecret } from "@/lib/security";
import { pricingFromPayload, pricingToView, type ModelPricingPayload } from "@/lib/pricing";

const kinds = new Set(["text", "storyboard", "image", "video"]);
async function admin() { const session = await getSession(); return session?.role === "ADMIN" ? session : null; }
function output(channel: { id: string; name: string; provider: string; baseUrl: string; enabled: boolean; keys: { id: string; label: string; apiKey: string; enabled: boolean }[]; models: { id: string; name: string; kind: string; enabled: boolean; priceCurrency: string; billingUnit: string; inputPerMillionMicros: number; outputPerMillionMicros: number; videoPerSecondMicros: number; imagePerImageMicros: number; requestFixedMicros: number; priceEnabled: boolean; priceNote: string | null }[] }) {
  return { id: channel.id, name: channel.name, provider: channel.provider, baseUrl: channel.baseUrl, enabled: channel.enabled, keys: channel.keys.map((key) => ({ id: key.id, label: key.label, enabled: key.enabled, maskedKey: key.apiKey ? maskSecret(decryptSecret(key.apiKey)) : "" })), models: channel.models.map((model) => ({ id: model.id, name: model.name, kind: model.kind, enabled: model.enabled, pricing: pricingToView(model) })) };
}
async function read(id: string) { return prisma.modelChannel.findUnique({ where: { id }, include: { keys: true, models: true } }); }

export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const rows = await prisma.modelChannel.findMany({ include: { keys: true, models: true }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ channels: rows.map(output) });
}

export async function POST(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name || "").trim(); const provider = String(body?.provider || "openai-compatible").trim(); const baseUrl = String(body?.baseUrl || "").trim().replace(/\/$/, "");
  const models = Array.isArray(body?.models) ? body.models as Record<string, unknown>[] : []; const keys = Array.isArray(body?.keys) ? body.keys as Record<string, unknown>[] : [];
  if (!name || !baseUrl || !models.length) return NextResponse.json({ error: "渠道名称、端点和至少一个模型为必填" }, { status: 400 });
  if (models.some((model) => !String(model.name || "").trim() || !kinds.has(String(model.kind)))) return NextResponse.json({ error: "模型名称或模型类型无效" }, { status: 400 });
  const created = await prisma.modelChannel.create({ data: { name: name.slice(0, 100), provider: provider.slice(0, 80), baseUrl: baseUrl.slice(0, 500), keys: { create: keys.filter((key) => String(key.apiKey || "")).map((key) => ({ label: String(key.label || "Key").slice(0, 80), apiKey: encryptSecret(String(key.apiKey)) })) }, models: { create: models.map((model) => ({ name: String(model.name).slice(0, 200), kind: String(model.kind), ...pricingFromPayload(model.pricing as ModelPricingPayload | undefined) })) } }, include: { keys: true, models: true } });
  await prisma.auditLog.create({ data: { actorId: session.userId, actorName: session.email, action: "model-channel.create", targetType: "model-channel", targetId: created.id, detail: created.name } });
  return NextResponse.json({ channel: output(created) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const channelId = String(body?.channelId || ""); const action = String(body?.action || "");
  if (!channelId) return NextResponse.json({ error: "缺少渠道 id" }, { status: 400 });
  if (!await prisma.modelChannel.findUnique({ where: { id: channelId }, select: { id: true } })) return NextResponse.json({ error: "渠道不存在" }, { status: 404 });
  const childId = String(body?.id || "");
  if (action === "add-key") {
    const apiKey = String(body?.apiKey || "").trim();
    if (!apiKey) return NextResponse.json({ error: "API Key 不能为空；无鉴权服务无需添加 Key" }, { status: 400 });
    await prisma.modelChannelKey.create({ data: { channelId, label: String(body?.label || "Key").slice(0, 80), apiKey: encryptSecret(apiKey) } });
  } else if (action === "toggle-key") {
    if (!await prisma.modelChannelKey.findFirst({ where: { id: childId, channelId } })) return NextResponse.json({ error: "Key 不属于当前渠道" }, { status: 404 });
    await prisma.modelChannelKey.update({ where: { id: childId }, data: { enabled: Boolean(body?.enabled) } });
  } else if (action === "delete-key") {
    if (!await prisma.modelChannelKey.findFirst({ where: { id: childId, channelId } })) return NextResponse.json({ error: "Key 不属于当前渠道" }, { status: 404 });
    await prisma.modelChannelKey.delete({ where: { id: childId } });
  } else if (action === "add-model") {
    const name = String(body?.name || "").trim(); const kind = String(body?.kind || "");
    if (!name || !kinds.has(kind)) return NextResponse.json({ error: "模型名称和用途无效" }, { status: 400 });
    await prisma.modelChannelModel.create({ data: { channelId, name: name.slice(0, 200), kind, ...pricingFromPayload(body?.pricing as ModelPricingPayload | undefined) } });
  } else if (action === "toggle-model") {
    if (!await prisma.modelChannelModel.findFirst({ where: { id: childId, channelId } })) return NextResponse.json({ error: "模型不属于当前渠道" }, { status: 404 });
    await prisma.modelChannelModel.update({ where: { id: childId }, data: { enabled: Boolean(body?.enabled) } });
  } else if (action === "delete-model") {
    if (!await prisma.modelChannelModel.findFirst({ where: { id: childId, channelId } })) return NextResponse.json({ error: "模型不属于当前渠道" }, { status: 404 });
    await prisma.modelChannelModel.delete({ where: { id: childId } });
  }
  else if (action === "toggle-channel") await prisma.modelChannel.update({ where: { id: channelId }, data: { enabled: Boolean(body?.enabled) } });
  else if (action === "update-channel") {
    const name = String(body?.name || "").trim();
    const provider = String(body?.provider || "").trim();
    const baseUrl = String(body?.baseUrl || "").trim().replace(/\/$/, "");
    const models = Array.isArray(body?.models) ? body.models as Record<string, unknown>[] : [];
    const keys = Array.isArray(body?.keys) ? body.keys as Record<string, unknown>[] : [];
    if (!name || !baseUrl || !models.length) return NextResponse.json({ error: "渠道名称、端点和至少一个模型为必填" }, { status: 400 });
    if (models.some((model) => !String(model.name || "").trim() || !kinds.has(String(model.kind)))) return NextResponse.json({ error: "模型名称或模型类型无效" }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      await tx.modelChannel.update({ where: { id: channelId }, data: { name: name.slice(0, 100), provider: provider.slice(0, 80), baseUrl: baseUrl.slice(0, 500) } });
      await tx.modelChannelModel.deleteMany({ where: { channelId } });
      await tx.modelChannelModel.createMany({ data: models.map((model) => ({ channelId, name: String(model.name).trim().slice(0, 200), kind: String(model.kind), enabled: model.enabled === undefined ? true : Boolean(model.enabled), ...pricingFromPayload(model.pricing as ModelPricingPayload | undefined) })) });
      const newKeys = keys.filter((key) => String(key.apiKey || "").trim());
      if (newKeys.length) await tx.modelChannelKey.createMany({ data: newKeys.map((key) => ({ channelId, label: String(key.label || "Key").slice(0, 80), apiKey: encryptSecret(String(key.apiKey).trim()) })) });
    });
  }
  else return NextResponse.json({ error: "不支持的渠道操作" }, { status: 400 });
  const updated = await read(channelId);
  return NextResponse.json({ channel: updated ? output(updated) : null });
}

export async function DELETE(request: Request) {
  if (!await admin()) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "缺少渠道 id" }, { status: 400 });
  await prisma.modelChannel.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
