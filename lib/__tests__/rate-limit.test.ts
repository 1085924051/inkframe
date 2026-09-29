import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, getClientIp, resetRateLimiter } from "../rate-limit";

describe("rateLimit 滑动窗口", () => {
  beforeEach(() => resetRateLimiter());

  it("窗口内超过 limit 即拒绝并给出重试秒数", () => {
    for (let i = 0; i < 5; i++) expect(rateLimit("k", 5, 60_000).ok).toBe(true);
    const blocked = rateLimit("k", 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("不同 key 互不影响", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000);
    expect(rateLimit("b", 5, 60_000).ok).toBe(true);
  });

  it("getClientIp：默认匿名，可信代理时取 XFF", () => {
    delete process.env.TRUST_PROXY;
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(getClientIp(req)).toBe("anonymous");
    process.env.TRUST_PROXY = "1";
    expect(getClientIp(req)).toBe("1.2.3.4");
    delete process.env.TRUST_PROXY;
  });
});