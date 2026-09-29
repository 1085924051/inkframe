import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind");
  const profiles = await prisma.modelProfile.findMany({ where: { enabled: true, ...(kind ? { kind } : {}) }, select: { id: true, name: true, kind: true, provider: true, model: true, baseUrl: true }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ profiles });
}

