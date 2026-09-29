import { NextResponse } from "next/server";
import { resolveDirector, resolveWriter, runPipeline } from "@/lib/pipeline";
import { generateProjectRemotely } from "@/lib/ai/providers";
import { generateWithPenShot } from "@/lib/penshot";
import { saveDirectorStyle, saveProject, saveWriterStyle, updateProjectContent } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { getModelConfigValue } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";
import { getClientIp, isSameOrigin, rateLimit } from "@/lib/rate-limit";
import type { GeneratedProject, GenerationSpec, NarrativePerspective, ScriptLength, WriterStyle } from "@/lib/types";
import { recordUsage } from "@/lib/usage";
import type { ModelUsage } from "@/lib/ai/client";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`generate:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "生成过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "非法来源" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const writerId = body.writerId ?? body.writerStyle?.id ?? "luxun";
  const directorId = body.directorId ?? "wong-kar-wai";
  const topic = String(body.topic || "一个人决定在周五下午说出真话");
  const allowedLengths: ScriptLength[] = ["micro", "short", "medium", "long", "feature", "series"];
  const allowedPerspectives: NarrativePerspective[] = ["third-person", "first-person", "observational", "multi-perspective", "epistolary", "unreliable-narrator"];
  const scriptLength: ScriptLength = allowedLengths.includes(body.scriptLength) ? body.scriptLength : "short";
  const narrativePerspective: NarrativePerspective = allowedPerspectives.includes(body.narrativePerspective) ? body.narrativePerspective : "third-person";
  const format = body.format === "series" ? "series" : "single";
  const episodeCount = Math.min(100, Math.max(1, Number(body.episodeCount) || 1));
  const wordsPerEpisode = Math.min(100000, Math.max(100, Number(body.wordsPerEpisode) || 500));
  const spec: GenerationSpec = { format, episodeCount, wordsPerEpisode, totalTargetWords: episodeCount * wordsPerEpisode, storyBible: typeof body.storyBible === "string" ? body.storyBible.slice(0, 20000) : undefined };

  let draft: GeneratedProject;
  let modelUsage: ModelUsage | undefined;
  let trace: { stage: string; at: string; summary: string }[] = [];

  const selectedDirector = body.directorStyle as import("@/lib/types").DirectorStyle | undefined;
  const director = resolveDirector({ directorId, directorStyle: selectedDirector });
  const selectedWriter = body.writerStyle as WriterStyle | undefined;
  let remote: Awaited<ReturnType<typeof generateProjectRemotely>>;
  try {
    remote = await generateProjectRemotely({
      topic,
      scriptLength,
      narrativePerspective,
      writer: resolveWriter({ writerId, writerStyle: selectedWriter }),
      director,
      spec,
      modelId: typeof body.modelId === "string" ? body.modelId : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM 生成失败，请检查模型配置后重试";
    return NextResponse.json({ error: message }, { status: /HTTP 401\b/.test(message) ? 401 : 502 });
  }
  if (remote) {
    draft = remote.project;
    modelUsage = remote.usage;
    trace = [{ stage: "llm", at: new Date().toISOString(), summary: `远端模型生成（${remote.project.shots.length} 个镜头）` }];
  } else {
    const result = runPipeline(
      { topic, scriptLength, narrativePerspective, writerId, directorId, writerStyle: selectedWriter, directorStyle: director, spec },
      { onStage: (stage, summary) => console.log(`[pipeline] ${stage}: ${summary}`) }
    );
    draft = result.project;
    trace = result.trace;
  }

  let project = draft;
  if (await getModelConfigValue("PENSHOT_API_URL")) {
    try { project = await generateWithPenShot({ script: draft.script, scriptId: `inkframe-${Date.now()}`, fallback: draft }) ?? draft; }
    catch (error) { console.warn("PenShot unavailable, using local fallback:", error); }
  }

  if (selectedWriter?.id && selectedWriter.source === "distilled") {
    await saveWriterStyle(selectedWriter, session.userId);
  }
  if (selectedDirector?.id?.startsWith("custom-")) {
    await saveDirectorStyle(selectedDirector, session.userId);
  }
  const stored = body.projectId
    ? await updateProjectContent(String(body.projectId), project, { userId: session.userId, isAdmin: session.role === "ADMIN", writerId, directorId, format, episodeCount, wordsPerEpisode, scriptLength, narrativePerspective, storyBible: typeof body.storyBible === "string" ? body.storyBible : undefined })
    : await saveProject(project, { writerId, directorId, userId: session.userId, format, episodeCount, wordsPerEpisode, scriptLength, narrativePerspective, storyBible: typeof body.storyBible === "string" ? body.storyBible : undefined });
  if (!stored) return NextResponse.json({ error: "项目不存在或无权修改" }, { status: 404 });
  await recordUsage({ projectId: stored.id, userId: session.userId, kind: "text", provider: modelUsage ? "llm" : "local", model: modelUsage?.model || project.engine, inputTokens: modelUsage?.inputTokens, outputTokens: modelUsage?.outputTokens, inputText: modelUsage ? undefined : topic, outputText: modelUsage ? undefined : project.script, metadata: { trace, estimatedTokens: modelUsage?.estimated ?? true } });
  await recordAudit(session, "project.create", "project", stored.id, stored.title);
  return NextResponse.json({ project: stored, trace });
}
