import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { encryptionEnabled, listSettings, saveSettings } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  return NextResponse.json({ settings: await listSettings(), encryptionEnabled: encryptionEnabled() });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

  const body = await request.json();
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(body || {})) {
    patch[key] = String(value ?? "");
  }
  await saveSettings(patch, session.userId);
  await recordAudit(session, "settings.save", "system", undefined, `更新 ${Object.keys(patch).length} 项配置`);
  const warning = encryptionEnabled() ? undefined : "未设置 SETTINGS_ENCRYPTION_KEY，密钥将以明文存储";
  return NextResponse.json({ ok: true, warning, settings: await listSettings(), encryptionEnabled: encryptionEnabled() });
}