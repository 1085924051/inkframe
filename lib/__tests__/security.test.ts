import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken, encryptSecret, decryptSecret, maskSecret } from "../security";

describe("security 纯函数", () => {
  it("密码哈希与校验", () => {
    const hash = hashPassword("secret123");
    expect(hash).toContain(":");
    expect(verifyPassword("secret123", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("secret123", "malformed")).toBe(false);
  });

  it("令牌签发、校验与防篡改", () => {
    const user = { userId: "u1", email: "a@b.c", name: "A", role: "ADMIN" as const };
    const token = signToken(user);
    expect(verifyToken(token)).toMatchObject({ userId: "u1", email: "a@b.c", role: "ADMIN" });
    expect(verifyToken(token + "x")).toBeNull();
    expect(verifyToken("not.a.token")).toBeNull();
  });

  it("无主钥时配置明文存取", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    const enc = encryptSecret("sk-1234567890");
    expect(enc).toBe("sk-1234567890");
    expect(decryptSecret(enc)).toBe("sk-1234567890");
  });

  it("有主钥时配置密文存取", () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    const enc = encryptSecret("sk-secret-value");
    expect(enc).toContain("enc:");
    expect(enc).not.toContain("sk-secret-value");
    expect(decryptSecret(enc)).toBe("sk-secret-value");
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  });

  it("脱敏", () => {
    expect(maskSecret("sk-t1234567890")).toBe("sk-t••••••7890");
    expect(maskSecret("short")).toBe("••••••••");
    expect(maskSecret("")).toBe("");
  });
});