import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDirectorStyles, listWriterStyles, saveDirectorStyle, saveWriterStyle } from "@/lib/store";
import type { DirectorStyle, WriterStyle } from "@/lib/types";
import { isSameOrigin } from "@/lib/rate-limit";
import { getSharedStyle, setStyleSharing } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { directorStyles, writerStyles } from "@/lib/styles";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [writers, directors] = await Promise.all([listWriterStyles(session.userId), listDirectorStyles(session.userId)]);
  return NextResponse.json({ writers, directors });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  const kind = params.get("kind");
  if (!id || (kind !== "writer" && kind !== "director")) return NextResponse.json({ error: "Only owned styles can be deleted" }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    if (kind === "writer") {
      const fallback = writerStyles.find((style) => style.id !== id) || writerStyles[0];
      await tx.writerStyle.upsert({ where: { id: fallback.id }, create: { id: fallback.id, name: fallback.name, era: fallback.era, summary: fallback.summary, tags: JSON.stringify(fallback.tags), axesJson: JSON.stringify(fallback.axes), sample: fallback.sample, ownerId: null }, update: {} });
      await tx.project.updateMany({ where: { writerStyleId: id }, data: { writerStyleId: fallback.id } });
      return tx.writerStyle.deleteMany({ where: { id, ownerId: session.userId } });
    }
    const fallback = directorStyles.find((style) => style.id !== id) || directorStyles[0];
    await tx.directorStyle.upsert({ where: { id: fallback.id }, create: { id: fallback.id, name: fallback.name, summary: fallback.summary, paletteJson: JSON.stringify(fallback.palette), descriptor: fallback.descriptor, lora: fallback.lora, ownerId: null }, update: {} });
    await tx.project.updateMany({ where: { directorStyleId: id }, data: { directorStyleId: fallback.id } });
    return tx.directorStyle.deleteMany({ where: { id, ownerId: session.userId } });
  });
  if (!result.count) return NextResponse.json({ error: "Style not found or not owned by this user" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.kind === "import") {
    const shared = await getSharedStyle(String(body.shareToken || ""));
    if (!shared) return NextResponse.json({ error: "Share link is invalid or no longer public" }, { status: 404 });
    const style = { ...shared.style, id: `custom-${crypto.randomUUID()}`, isPublic: false, shareToken: undefined };
    const saved = shared.kind === "writer"
      ? await saveWriterStyle(style as WriterStyle, session.userId)
      : await saveDirectorStyle(style as DirectorStyle, session.userId);
    return NextResponse.json({ kind: shared.kind, style: saved }, { status: 201 });
  }
  if (body.kind === "sharing") {
    if (body.styleKind !== "writer" && body.styleKind !== "director") return NextResponse.json({ error: "Invalid style kind" }, { status: 400 });
    const id = String(body.id || "");
    const result = await setStyleSharing(body.styleKind, id, session.userId, Boolean(body.isPublic));
    if (!result.count) return NextResponse.json({ error: "Style not found or not owned by this user" }, { status: 404 });
    const style = body.styleKind === "writer"
      ? await prisma.writerStyle.findUnique({ where: { id }, select: { shareToken: true, isPublic: true } })
      : await prisma.directorStyle.findUnique({ where: { id }, select: { shareToken: true, isPublic: true } });
    return NextResponse.json({ isPublic: style?.isPublic, shareToken: style?.shareToken });
  }
  if (body.kind === "writer") {
    const style = body.style as WriterStyle;
    if (!style || !style.name || !Array.isArray(style.axes)) return NextResponse.json({ error: "Invalid writer style" }, { status: 400 });
    const persisted = { ...style, id: String(style.id || `custom-${crypto.randomUUID()}`), source: "distilled" as const };
    const existing = await prisma.writerStyle.findUnique({ where: { id: persisted.id }, select: { ownerId: true } });
    if (existing && existing.ownerId !== session.userId) return NextResponse.json({ error: "Style belongs to another user" }, { status: 403 });
    if (!persisted.id.startsWith("custom-") && (!existing || existing.ownerId !== session.userId)) return NextResponse.json({ error: "Only owned styles can be edited" }, { status: 400 });
    return NextResponse.json({ style: await saveWriterStyle(persisted, session.userId) }, { status: 201 });
  }
  if (body.kind === "director") {
    const style = body.style as DirectorStyle;
    if (!style || !style.name || !style.descriptor || !Array.isArray(style.palette)) return NextResponse.json({ error: "Invalid director style" }, { status: 400 });
    const persisted = { ...style, id: String(style.id || `custom-${crypto.randomUUID()}`) };
    const { prisma } = await import("@/lib/prisma");
    const existing = await prisma.directorStyle.findUnique({ where: { id: persisted.id }, select: { ownerId: true } });
    if (existing && existing.ownerId !== session.userId) return NextResponse.json({ error: "Style belongs to another user" }, { status: 403 });
    if (!persisted.id.startsWith("custom-") && (!existing || existing.ownerId !== session.userId)) return NextResponse.json({ error: "Only owned styles can be edited" }, { status: 400 });
    return NextResponse.json({ style: await saveDirectorStyle(persisted, session.userId) }, { status: 201 });
  }
  return NextResponse.json({ error: "kind must be writer or director" }, { status: 400 });
}
