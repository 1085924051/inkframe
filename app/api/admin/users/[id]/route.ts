import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: context.params.id } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const body = await request.json();
  const data: { role?: string; status?: string } = {};
  if (body.role && ["USER", "ADMIN"].includes(String(body.role))) data.role = String(body.role);
  if (body.status && ["active", "disabled"].includes(String(body.status))) data.status = String(body.status);

  // 防止管理员误操作自己导致失去唯一管理员
  if (target.id === session.userId && data.role === "USER") {
    return NextResponse.json({ error: "不能把自己的角色降为普通用户" }, { status: 400 });
  }
  if (target.id === session.userId && data.status === "disabled") {
    return NextResponse.json({ error: "不能禁用自己的账号" }, { status: 400 });
  }

  const updated = await prisma.user.update({ where: { id: target.id }, data });
  await recordAudit(session, "user.update", "user", updated.id, JSON.stringify(data));
  return NextResponse.json({ user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, status: updated.status } });
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  if (context.params.id === session.userId) return NextResponse.json({ error: "不能删除自己的账号" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: context.params.id } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  await prisma.user.delete({ where: { id: target.id } });
  await recordAudit(session, "user.delete", "user", target.id, `删除用户 ${target.email}`);
  return NextResponse.json({ ok: true });
}