import { NextResponse } from "next/server";
import type { WriterStyle } from "@/lib/types";
import { saveWriterStyle } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { distillStyle } from "@/lib/ai/providers";
import { distillSource } from "@/lib/ai/source-provider";
import { buildStyleEvidence } from "@/lib/ai/source-digest";
import { recordUsage } from "@/lib/usage";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let sample = "";
  let saveStyle = false;
  let modelId = "";
  let name = "我的作家风格";
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    name = String(form.get("name") || name).trim();
    saveStyle = String(form.get("saveStyle") || "false") === "true";
    modelId = String(form.get("modelId") || "").trim();
    sample = file instanceof File ? (await file.text()).trim() : String(form.get("sample") || "").trim();
  } else {
    const body = await request.json();
    sample = String(body.sample || "").trim();
    name = String(body.name || name).trim();
    saveStyle = body.saveStyle === true;
    modelId = String(body.modelId || "").trim();
  }
  if (sample.length < 80) return NextResponse.json({ error: "样本文章至少需要 80 个字符" }, { status: 400 });
  if (sample.length > 20000000) return NextResponse.json({ error: "样本文章超过 2000 万字符，请拆成多个卷分别导入" }, { status: 413 });

  const source = await distillSource(sample, modelId || undefined);
  const distilled = await distillStyle({ sample: source.digest.styleEvidence || buildStyleEvidence(sample), name, modelId: modelId || undefined });

  const style: WriterStyle = {
    id: `custom-${crypto.randomUUID()}`,
    name,
    era: distilled.style.era,
    summary: distilled.style.summary,
    tags: distilled.style.tags,
    axes: distilled.style.axes,
    sample: sample.slice(0, 180),
    sourceDigest: source.digest,
    source: "distilled"
  };
  const saved = saveStyle ? await saveWriterStyle(style, session.userId) : style;
  const usage = [source.usage, distilled.usage].filter(Boolean);
  await recordUsage({ userId: session.userId, kind: "text", provider: usage.length ? "llm" : "local", model: usage[0]?.model, modelId: modelId || undefined, inputTokens: usage.reduce((sum, item) => sum + (item?.inputTokens || 0), 0), outputTokens: usage.reduce((sum, item) => sum + (item?.outputTokens || 0), 0), inputText: usage.length ? undefined : sample, outputText: usage.length ? undefined : JSON.stringify({ style: distilled.style, digest: source.digest }), metadata: { operation: "source-digest-and-style-distillation", sourceChars: sample.length, chunks: source.digest.chunkCount, estimatedTokens: usage.some((item) => item?.estimated) || !usage.length } });
  return NextResponse.json({ style: saved, digest: source.digest, persisted: saveStyle });
}
