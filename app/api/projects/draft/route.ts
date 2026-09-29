import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveProject } from "@/lib/store";
import { isSameOrigin } from "@/lib/rate-limit";
import type { GeneratedProject, NarrativePerspective, ProjectFormat, ScriptLength } from "@/lib/types";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const topic = String(body.topic || "未命名故事").slice(0, 500);
  const project: GeneratedProject = { title: `${topic.slice(0, 16)} · 创作项目`, topic, logline: "", script: "", characters: [], scenes: [], shots: [], engine: "local", projectFormat: body.format === "series" ? "series" : "single", episodeCount: Math.max(1, Number(body.episodeCount) || 1), wordsPerEpisode: Math.max(100, Number(body.wordsPerEpisode) || 500), scriptLength: String(body.scriptLength || "short") as ScriptLength, narrativePerspective: String(body.narrativePerspective || "third-person") as NarrativePerspective, storyBible: String(body.storyBible || "") };
  const stored = await saveProject(project, { writerId: String(body.writerId || "luxun"), directorId: String(body.directorId || "wong-kar-wai"), userId: session.userId, format: body.format === "series" ? "series" as ProjectFormat : "single", episodeCount: project.episodeCount, wordsPerEpisode: project.wordsPerEpisode, scriptLength: project.scriptLength, narrativePerspective: project.narrativePerspective, storyBible: project.storyBible });
  return NextResponse.json({ project: stored }, { status: 201 });
}
