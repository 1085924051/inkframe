import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { submitRenderJob } from "@/lib/worker";
import { isSameOrigin } from "@/lib/rate-limit";

export async function POST(request: Request, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { episodeId?: unknown };
  const episodeId = body.episodeId ? String(body.episodeId) : undefined;
  if (episodeId && !project.episodes?.some((episode) => episode.id === episodeId)) return NextResponse.json({ error: "Episode does not belong to this project" }, { status: 400 });
  const job = await submitRenderJob(project.id!, episodeId);
  return NextResponse.json({ job }, { status: job.reused ? 200 : 202 });
}
