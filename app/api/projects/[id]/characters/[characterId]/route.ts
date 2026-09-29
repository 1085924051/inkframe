import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { isSameOrigin } from "@/lib/rate-limit";

export async function PATCH(request: Request, context: { params: { id: string; characterId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid character data" }, { status: 400 });
  const allowed = ["name", "role", "description", "wardrobe", "accessories", "goal", "traits", "age", "appearancePrompt", "imagePrompt", "negativePrompt", "imageProvider", "imageModel"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return NextResponse.json({ error: `Unsupported character field: ${Object.keys(body).find((key) => !allowed.includes(key))}` }, { status: 400 });
  const character = await prisma.character.findFirst({ where: { id: context.params.characterId, projectId: project.id } });
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  const data: Record<string, string> = {};
  for (const key of allowed) if (body[key] !== undefined) data[key] = String(body[key] ?? "").slice(0, 20000);
  const updated = await prisma.character.update({ where: { id: character.id }, data });
  return NextResponse.json({ character: updated });
}

export async function DELETE(request: Request, context: { params: { id: string; characterId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const character = await prisma.character.findFirst({ where: { id: context.params.characterId, projectId: project.id } });
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  await prisma.character.delete({ where: { id: character.id } });
  return NextResponse.json({ ok: true });
}
