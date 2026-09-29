import { NextResponse } from "next/server";
import { getProject, updateProjectBrief } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/rate-limit";
import type { NarrativePerspective, ScriptLength } from "@/lib/types";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  return project ? NextResponse.json({ project }) : NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const lengths: ScriptLength[] = ["micro", "short", "medium", "long", "feature", "series"];
  const perspectives: NarrativePerspective[] = ["third-person", "first-person", "observational", "multi-perspective", "epistolary", "unreliable-narrator"];
  const result = await updateProjectBrief(context.params.id, {
    userId: session.userId,
    isAdmin: session.role === "ADMIN",
    writerId: String(body.writerId || "luxun"),
    directorId: String(body.directorId || "wong-kar-wai"),
    topic: String(body.topic || "未命名故事").slice(0, 500),
    format: body.format === "series" ? "series" : "single",
    episodeCount: Math.min(100, Math.max(1, Number(body.episodeCount) || 1)),
    wordsPerEpisode: Math.min(100000, Math.max(100, Number(body.wordsPerEpisode) || 500)),
    storyBible: typeof body.storyBible === "string" ? body.storyBible.slice(0, 20000) : undefined,
    scriptLength: lengths.includes(body.scriptLength as ScriptLength) ? body.scriptLength as ScriptLength : "short",
    narrativePerspective: perspectives.includes(body.narrativePerspective as NarrativePerspective) ? body.narrativePerspective as NarrativePerspective : "third-person",
  });
  return result ? NextResponse.json({ project: result }) : NextResponse.json({ error: "项目不存在或无权修改" }, { status: 404 });
}
