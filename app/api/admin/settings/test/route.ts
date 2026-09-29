import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chatCompletion } from "@/lib/ai/client";
import { checkVideoProviderConfig } from "@/lib/video";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { provider?: unknown };
  if (body.provider && body.provider !== "text") return NextResponse.json(await checkVideoProviderConfig(String(body.provider)));
  try {
    const reply = await chatCompletion([{ role: "user", content: "回复两个字：正常" }]);
    return NextResponse.json({ ok: true, message: "连通成功", reply: reply.slice(0, 50) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
