import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "inkframe-studio", db: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, service: "inkframe-studio", db: "down" }, { status: 503 });
  }
}