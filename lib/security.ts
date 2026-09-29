// 纯函数安全模块：密码哈希、会话令牌、配置加解密。
// 不依赖 Next.js / Prisma，便于单元测试。
import crypto from "node:crypto";

const AUTH_SECRET = process.env.AUTH_SECRET || "inkframe-dev-secret-change-me";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 天

export type Role = "USER" | "ADMIN";
export type SessionUser = { userId: string; email: string; name: string; role: Role };

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const hmac = (data: string) => crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");

// ---- 密码哈希（scrypt）----
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- 会话令牌（HMAC 签名）----
export function signToken(user: SessionUser): string {
  const payload = { ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.${hmac(`${header}.${body}`)}`;
}

export function verifyToken(token: string): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = hmac(`${header}.${body}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionUser & { exp: number };
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.userId || !payload.role || !payload.email) return null;
    return { userId: payload.userId, email: payload.email, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

// ---- 配置项 AES-256-GCM 加解密（主钥缺失时明文 + 脱敏）----
function masterKey(): Buffer | null {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptionEnabled(): boolean {
  return Boolean(masterKey());
}

export function encryptSecret(plain: string): string {
  const key = masterKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith("enc:")) return stored;
  const key = masterKey();
  if (!key) return "";
  const parts = stored.split(":");
  if (parts.length !== 4) return "";
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const data = Buffer.from(parts[3], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}