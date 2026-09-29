import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { isSameOrigin } from "@/lib/rate-limit";

export async function POST(request: Request, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getProject(context.params.id, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name || "").trim(); if (!name) return NextResponse.json({ error: "人物名称不能为空" }, { status: 400 });
  const character = await prisma.character.create({ data: { id: `character-${crypto.randomUUID()}`, projectId: project.id!, name, role: String(body?.role || "主要角色"), description: String(body?.description || ""), wardrobe: String(body?.wardrobe || ""), accessories: String(body?.accessories || ""), goal: String(body?.goal || ""), traits: String(body?.traits || ""), age: String(body?.age || ""), appearancePrompt: String(body?.appearancePrompt || ""), imagePrompt: String(body?.imagePrompt || ""), negativePrompt: String(body?.negativePrompt || "extra fingers, duplicate person, text, watermark"), imageStatus: "draft" } });
  return NextResponse.json({ character }, { status: 201 });
}
