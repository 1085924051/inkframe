import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listAuditLogs } from "@/lib/audit";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  return NextResponse.json({ logs: await listAuditLogs(limit) });
}