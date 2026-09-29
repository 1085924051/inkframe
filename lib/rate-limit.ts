// 进程内「滑动窗口」限流：按「路由:IP」维度计数，用于登录/注册/生成等易被滥用接口。
// 单机内存实现，多实例部署时需替换为 Redis 等共享计数。
type Bucket = { hits: number[] };

declare global { var __inkframeRateBuckets: Map<string, Bucket> | undefined; }
const store = globalThis.__inkframeRateBuckets ?? new Map<string, Bucket>();
globalThis.__inkframeRateBuckets = store;

const MAX_KEYS = 10_000;

export type RateResult = { ok: boolean; remaining: number; retryAfter: number };

function sweep(now: number) {
  if (store.size <= MAX_KEYS) return;
  const cutoff = now - 10 * 60_000; // 10 分钟无请求即视为可回收
  store.forEach((bucket, key) => {
    if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] <= cutoff) store.delete(key);
  });
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const windowStart = now - windowMs;
  const bucket = store.get(key);
  const hits = (bucket?.hits ?? []).filter((t) => t > windowStart);

  if (hits.length >= limit) {
    const oldest = hits[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    store.set(key, { hits });
    return { ok: false, remaining: 0, retryAfter };
  }

  hits.push(now);
  store.set(key, { hits });
  return { ok: true, remaining: limit - hits.length, retryAfter: 0 };
}

// 客户端 IP：仅在显式声明可信代理（TRUST_PROXY=1，如 Nginx/Caddy 之后）时才信任转发头，
// 否则统一按 anonymous 计数，防止伪造 X-Forwarded-For 绕过限流。
export function getClientIp(request: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return xff;
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  return "anonymous";
}

// 同源校验（CSRF 纵深防御：会话 Cookie 已 SameSite=Lax）
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // 无 Origin 头（同源导航/curl）放行
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function resetRateLimiter(): void { store.clear(); }
