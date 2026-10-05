import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function admin() {
  const session = await getSession();
  return session?.role === "ADMIN" ? session : null;
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function payload(body: Record<string, unknown>) {
  return {
    name: String(body.name || "").trim().slice(0, 80),
    title: String(body.title || "").trim().slice(0, 120),
    subtitle: String(body.subtitle || "").trim().slice(0, 240),
    badge: body.badge ? String(body.badge).trim().slice(0, 40) : null,
    discountPercent: Math.min(100, Math.max(0, Number(body.discountPercent) || 0)),
    bonusPercent: Math.min(1000, Math.max(0, Number(body.bonusPercent) || 0)),
    startsAt: dateOrNull(body.startsAt),
    endsAt: dateOrNull(body.endsAt),
    enabled: body.enabled !== false,
    sortOrder: Math.max(0, Number(body.sortOrder) || 0),
    ctaLabel: String(body.ctaLabel || "立即创作").trim().slice(0, 30),
    ctaHref: String(body.ctaHref || "/register").trim().slice(0, 200),
  };
}

export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  return NextResponse.json({ campaigns: await prisma.campaign.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }) });
}

export async function POST(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const data = payload(body);
  if (!data.name || !data.title || !data.subtitle) return NextResponse.json({ error: "活动名称、标题和副标题不能为空" }, { status: 400 });
  const campaign = await prisma.campaign.create({ data: { ...data, createdBy: session.userId } });
  return NextResponse.json({ campaign }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "缺少活动 id" }, { status: 400 });
  const current = await prisma.campaign.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  const campaign = await prisma.campaign.update({ where: { id }, data: payload({ ...current, ...body }) });
  return NextResponse.json({ campaign });
}

export async function DELETE(request: Request) {
  if (!await admin()) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "缺少活动 id" }, { status: 400 });
  await prisma.campaign.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
