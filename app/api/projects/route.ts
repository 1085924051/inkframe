import { NextResponse } from "next/server";
import { listProjects } from "@/lib/store";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const projects = await listProjects({ userId: session.userId, isAdmin: session.role === "ADMIN" });
  return NextResponse.json({ projects });
}