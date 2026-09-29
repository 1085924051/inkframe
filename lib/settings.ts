import { prisma } from "./prisma";
import { decryptSecret, encryptSecret, encryptionEnabled, maskSecret } from "./security";

// ============================================================
// 模型 API 配置中心：DB(SystemSetting) 优先，环境变量兜底。
// 密钥类配置在启用 SETTINGS_ENCRYPTION_KEY 时 AES-256-GCM 加密落库。
// ============================================================

export type SettingMeta = { key: string; label: string; group: "text" | "storyboard" | "image" | "video"; isSecret: boolean };

export const SETTING_META: SettingMeta[] = [
  { key: "LLM_API_URL", label: "文本模型接口地址", group: "text", isSecret: false },
  { key: "LLM_API_KEY", label: "文本模型 API Key", group: "text", isSecret: true },
  { key: "LLM_MODEL", label: "文本模型名称", group: "text", isSecret: false },
  { key: "LLM_INPUT_USD_PER_MILLION", label: "输入单价（USD / 百万 tokens）", group: "text", isSecret: false },
  { key: "LLM_OUTPUT_USD_PER_MILLION", label: "输出单价（USD / 百万 tokens）", group: "text", isSecret: false },
  { key: "PENSHOT_API_URL", label: "PenShot 分镜服务地址", group: "storyboard", isSecret: false },
  { key: "PENSHOT_API_KEY", label: "PenShot API Key（可选）", group: "storyboard", isSecret: true },
  { key: "PENSHOT_MODEL", label: "PenShot 编排模型（可选）", group: "storyboard", isSecret: false },
  { key: "IMAGE_PROVIDER", label: "图像生成 Provider", group: "image", isSecret: false },
  { key: "IMAGE_API_URL", label: "图像生成接口地址", group: "image", isSecret: false },
  { key: "IMAGE_API_KEY", label: "图像生成 API Key", group: "image", isSecret: true },
  { key: "IMAGE_MODEL", label: "图像生成模型名称", group: "image", isSecret: false },
  { key: "REPLICATE_API_TOKEN", label: "Replicate Token（可选）", group: "image", isSecret: true },
  { key: "REPLICATE_IMAGE_MODEL", label: "Replicate 图像模型（可选）", group: "image", isSecret: false },
  { key: "COMFYUI_API_URL", label: "ComfyUI 地址（可选）", group: "image", isSecret: false },
  { key: "RUNWAY_API_URL", label: "Runway 接口地址", group: "video", isSecret: false },
  { key: "RUNWAY_API_KEY", label: "Runway API Key", group: "video", isSecret: true },
  { key: "RUNWAY_MODEL", label: "Runway 模型名称", group: "video", isSecret: false },
  { key: "KLING_API_URL", label: "可灵接口地址", group: "video", isSecret: false },
  { key: "KLING_API_KEY", label: "可灵 API Key", group: "video", isSecret: true },
  { key: "KLING_MODEL", label: "可灵模型名称", group: "video", isSecret: false },
  { key: "SEEDANCE_API_URL", label: "Seedance 接口地址", group: "video", isSecret: false },
  { key: "SEEDANCE_API_KEY", label: "Seedance API Key", group: "video", isSecret: true },
  { key: "SEEDANCE_MODEL", label: "Seedance 模型名", group: "video", isSecret: false },
];

const SECRET_KEYS = new Set(SETTING_META.filter((m) => m.isSecret).map((m) => m.key));
const CACHE_TTL = 30_000;

let cache: Record<string, string> | null = null;
let cacheAt = 0;
let warnedPlaintext = false;

// ---- 读取（带进程内缓存） ----
export async function getSettings(): Promise<Record<string, string>> {
  if (cache && Date.now() - cacheAt < CACHE_TTL) return cache;
  const rows = await prisma.systemSetting.findMany();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  cache = map;
  cacheAt = Date.now();
  return map;
}

// 解析最终生效值：DB 配置 > 环境变量 > 空
export async function resolveModelConfig(): Promise<Record<string, string>> {
  const db = await getSettings();
  const out: Record<string, string> = {};
  for (const meta of SETTING_META) {
    const stored = db[meta.key];
    const value = stored !== undefined ? (meta.isSecret ? decryptSecret(stored) : stored) : (process.env[meta.key] ?? "");
    out[meta.key] = value;
  }
  return out;
}

export async function getModelConfigValue(key: string): Promise<string> {
  const config = await resolveModelConfig();
  return config[key] ?? "";
}

// ---- 写 ----
export async function saveSettings(patch: Record<string, string>, actor?: string): Promise<void> {
  for (const meta of SETTING_META) {
    if (meta.key in patch) {
      const raw = String(patch[meta.key] ?? "");
      let value = raw;
      if (meta.isSecret) {
        if (!encryptionEnabled() && !warnedPlaintext) {
          console.warn("[settings] 未设置 SETTINGS_ENCRYPTION_KEY，密钥类配置将以明文存储");
          warnedPlaintext = true;
        }
        value = encryptSecret(raw);
      }
      await prisma.systemSetting.upsert({
        where: { key: meta.key },
        create: { key: meta.key, value, isSecret: meta.isSecret, group: meta.group, updatedBy: actor },
        update: { value, isSecret: meta.isSecret, group: meta.group, updatedBy: actor },
      });
    }
  }
  cache = null; // 失效
}

// 管理端列表（脱敏 + 来源）
export async function listSettings(): Promise<{ key: string; label: string; group: string; isSecret: boolean; value: string; configured: boolean; source: "db" | "env" | "empty" }[]> {
  const db = await getSettings();
  return SETTING_META.map((meta) => {
    const stored = db[meta.key];
    const source: "db" | "env" | "empty" = stored !== undefined ? "db" : process.env[meta.key] ? "env" : "empty";
    const plain = stored !== undefined ? decryptSecret(stored) : (process.env[meta.key] ?? "");
    return { key: meta.key, label: meta.label, group: meta.group, isSecret: meta.isSecret, value: meta.isSecret ? maskSecret(plain) : plain, configured: Boolean(plain), source };
  });
}

export { SECRET_KEYS, encryptionEnabled };
