import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { hashPassword, signToken, verifyPassword, verifyToken } from "./security";
import type { Role, SessionUser } from "./security";

const COOKIE_NAME = "inkframe_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 天

export function sessionCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: MAX_AGE_SECONDS };
}

// ---- 会话读取（同时校验用户仍存在且未禁用）----
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = verifyToken(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "active") return null;
  return { userId: user.id, email: user.email, name: user.name, role: user.role as Role };
}

export function requireAdmin(session: SessionUser | null): session is SessionUser {
  return Boolean(session && session.role === "ADMIN");
}

// 纯函数从 security.ts 再导出，保持既有导入路径不变
export { hashPassword, signToken, verifyPassword, verifyToken, COOKIE_NAME };
export type { Role, SessionUser };