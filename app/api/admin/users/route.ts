import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, email: true, name: true, role: true, status: true, createdAt: true,
      _count: { select: { projects: true } },
    },
  });
  return NextResponse.json({ users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, projectCount: u._count.projects, createdAt: u.createdAt.toISOString() })) });
}