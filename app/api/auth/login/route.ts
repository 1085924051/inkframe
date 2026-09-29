import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionCookieOptions, signToken, verifyPassword, COOKIE_NAME } from "@/lib/auth";
import { getClientIp, isSameOrigin, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "登录尝试过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "非法来源" }, { status: 403 });
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }
  if (user.status !== "active") return NextResponse.json({ error: "账号已被禁用" }, { status: 403 });

  const token = signToken({ userId: user.id, email: user.email, name: user.name, role: user.role as "USER" | "ADMIN" });
  const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return response;
}