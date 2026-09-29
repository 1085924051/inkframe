import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { getRenderJobForProject } from "@/lib/render-jobs";

export async function GET(_request: Request, context: { params: { id: string; jobId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const job = await getRenderJobForProject(context.params.jobId, project.id!);
  if (!job) return NextResponse.json({ error: "Render job not found" }, { status: 404 });
  return NextResponse.json({ job });
}
