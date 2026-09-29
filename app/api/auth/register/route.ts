import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp, isSameOrigin, rateLimit } from "@/lib/rate-limit";
import { hashPassword, sessionCookieOptions, signToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`register:${ip}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "注册过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "非法来源" }, { status: 403 });
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: "昵称至少 2 个字符" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });

  const isFirst = (await prisma.user.count()) === 0;
  const user = await prisma.user.create({
    data: { email, name, passwordHash: hashPassword(password), role: isFirst ? "ADMIN" : "USER" },
  });

  await recordAudit({ userId: user.id, email: user.email, name: user.name, role: user.role as "USER" | "ADMIN" }, "user.create", "user", user.id, `注册 ${email}`);
  const token = signToken({ userId: user.id, email: user.email, name: user.name, role: user.role as "USER" | "ADMIN" });
  const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return response;
}