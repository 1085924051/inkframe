import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getVideoJobForProject } from "@/lib/jobs";
import { getProject } from "@/lib/store";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const projectId = new URL(_request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  const project = await getProject(projectId, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const job = await getVideoJobForProject(context.params.id, project.id!);
  if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json({ job });
}
