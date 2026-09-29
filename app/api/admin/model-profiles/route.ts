import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/security";

const kinds = new Set(["text", "storyboard", "image", "video"]);
const providers = new Set(["openai-compatible", "vllm", "mock-image", "openai-image", "replicate", "comfyui", "penshot", "runway", "kling", "seedance"]);

async function admin() {
  const session = await getSession();
  return session && session.role === "ADMIN" ? session : null;
}

function publicProfile(row: { id: string; name: string; kind: string; provider: string; baseUrl: string; apiKey: string; model: string; enabled: boolean; createdAt: Date; updatedAt: Date }) {
  const plain = row.apiKey ? decryptSecret(row.apiKey) : "";
  return { ...row, apiKey: plain ? maskSecret(plain) : "", configured: Boolean(row.baseUrl && plain && row.model) };
}

export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const profiles = await prisma.modelProfile.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ profiles: profiles.map(publicProfile) });
}

export async function POST(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name || "").trim();
  const kind = String(body?.kind || "image");
  const provider = String(body?.provider || "openai-compatible");
  const baseUrl = String(body?.baseUrl || "").trim().replace(/\/$/, "");
  const model = String(body?.model || "").trim();
  const apiKey = String(body?.apiKey || "");
  if (!name || !kinds.has(kind) || !providers.has(provider) || !baseUrl || !model) return NextResponse.json({ error: "名称、类型、Provider、接口地址和模型名均为必填" }, { status: 400 });
  const created = await prisma.modelProfile.create({ data: { name: name.slice(0, 100), kind, provider, baseUrl: baseUrl.slice(0, 500), apiKey: apiKey ? encryptSecret(apiKey) : "", model: model.slice(0, 200), enabled: body?.enabled !== false } });
  await prisma.auditLog.create({ data: { actorId: session.userId, actorName: session.email, action: "model-profile.create", targetType: "model-profile", targetId: created.id, detail: created.name } });
  return NextResponse.json({ profile: publicProfile(created) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "缺少模型档案 id" }, { status: 400 });
  const current = await prisma.modelProfile.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "模型档案不存在" }, { status: 404 });
  const data: Record<string, string | boolean> = {};
  for (const key of ["name", "kind", "provider", "baseUrl", "model"]) if (body?.[key] !== undefined) data[key] = String(body[key]).trim();
  if (body?.enabled !== undefined) data.enabled = Boolean(body.enabled);
  if (body?.apiKey && !String(body.apiKey).includes("••••")) data.apiKey = encryptSecret(String(body.apiKey));
  const updated = await prisma.modelProfile.update({ where: { id }, data });
  await prisma.auditLog.create({ data: { actorId: session.userId, actorName: session.email, action: "model-profile.update", targetType: "model-profile", targetId: id, detail: updated.name } });
  return NextResponse.json({ profile: publicProfile(updated) });
}

export async function DELETE(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "缺少模型档案 id" }, { status: 400 });
  await prisma.modelProfile.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}

