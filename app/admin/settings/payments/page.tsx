"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CreditCard, Save, Shield, Sparkles } from "lucide-react";

type Setting = { key: string; label: string; group: string; isSecret: boolean; value: string; configured: boolean; source: string };
const PAYMENT_KEYS = [
  "PAYMENT_PROVIDER", "BILLING_ENFORCE_BALANCE", "ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_GATEWAY_URL", "ALIPAY_NOTIFY_URL",
  "WECHAT_APP_ID", "WECHAT_MCH_ID", "WECHAT_SERIAL_NO", "WECHAT_API_URL", "WECHAT_PRIVATE_KEY", "WECHAT_API_V3_KEY", "WECHAT_PLATFORM_CERTIFICATE", "WECHAT_NOTIFY_URL",
];
const GROUPS = [
  { title: "运行策略", keys: ["PAYMENT_PROVIDER", "BILLING_ENFORCE_BALANCE"] },
  { title: "支付宝扫码支付", keys: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_GATEWAY_URL", "ALIPAY_NOTIFY_URL"] },
  { title: "微信支付 Native 扫码", keys: ["WECHAT_APP_ID", "WECHAT_MCH_ID", "WECHAT_SERIAL_NO", "WECHAT_API_URL", "WECHAT_PRIVATE_KEY", "WECHAT_API_V3_KEY", "WECHAT_PLATFORM_CERTIFICATE", "WECHAT_NOTIFY_URL"] },
];

export default function PaymentSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const me = await fetch("/api/auth/me").then((response) => response.json());
    if (!me.user) { window.location.href = "/login"; return; }
    if (me.user.role !== "ADMIN") { window.location.href = "/"; return; }
    const response = await fetch("/api/admin/settings");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "加载支付配置失败");
    const rows = (data.settings || []).filter((item: Setting) => PAYMENT_KEYS.includes(item.key)) as Setting[];
    setSettings(rows);
    setValues(Object.fromEntries(rows.filter((item) => !item.isSecret).map((item) => [item.key, item.value])));
    setLoading(false);
  }

  useEffect(() => { void load().catch((reason) => { setError(reason instanceof Error ? reason.message : "加载支付配置失败"); setLoading(false); }); }, []);

  const byKey = useMemo(() => new Map(settings.map((item) => [item.key, item])), [settings]);
  function field(key: string) { return byKey.get(key); }
  function setValue(key: string, value: string) { setValues((current) => ({ ...current, [key]: value })); }

  async function save() {
    setSaving(true); setNotice(""); setError("");
    try {
      const patch: Record<string, string> = {};
      for (const key of PAYMENT_KEYS) {
        const item = field(key);
        if (!item?.isSecret || values[key]) patch[key] = values[key] || "";
      }
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存支付配置失败");
      setNotice(data.warning || "支付配置已保存");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存支付配置失败"); }
    finally { setSaving(false); }
  }

  return <main className="admin-shell"><aside className="admin-side"><a className="brand brand-link" href="/home" aria-label="返回首页"><div className="brand-mark"><Sparkles size={17} /></div><span>INKFRAME</span><small>ADMIN</small></a><nav className="side-nav"><a href="/home"><Shield size={17} /> 首页</a><a href="/"><Shield size={17} /> 返回工作台</a><a href="/account"><Shield size={17} /> 个人中心</a><a href="/admin"><Shield size={17} /> 用户管理</a><a href="/admin/settings"><Shield size={17} /> 模型配置</a><a className="active"><CreditCard size={17} /> 支付与账单</a><a href="/admin/campaigns"><Shield size={17} /> 活动管理</a></nav><div className="side-bottom"><div className="status-dot" /> <span>支付中心</span></div></aside><section className="admin-main"><header className="topbar"><div><span className="eyebrow">ADMIN / PAYMENTS</span><h1>支付与余额配置</h1></div><span className="panel-note">扫码支付 · 异步回调 · 钱包入账</span></header><div className="admin-content"><div className="payment-admin-toolbar"><a className="ghost-button" href="/admin/settings"><ArrowLeft size={14} /> 返回模型设置</a><span>当前配置只在服务端使用，密钥不会返回到前端。</span></div>{notice && <div className="auth-error auth-ok">{notice}</div>}{error && <div className="auth-error">{error}</div>}{loading ? <div className="empty-state"><p>加载中…</p></div> : <><section className="settings-group"><div className="settings-group-title"><strong>支付配置</strong><small>本地开发选择 Mock；上线时选择支付宝或微信，并把回调地址配置为公网 HTTPS 地址。</small></div>{GROUPS.map((group) => <div className="payment-admin-group" key={group.title}><div className="payment-admin-group-title">{group.title}</div><div className="payment-admin-grid">{group.keys.map((key) => { const item = field(key); if (!item) return null; const isProvider = key === "PAYMENT_PROVIDER"; const isEnforce = key === "BILLING_ENFORCE_BALANCE"; return <label className="settings-field" key={key}><span>{item.label}{item.isSecret && <small>重新填写才会更新</small>}</span>{isProvider ? <select value={values[key] || "mock"} onChange={(event) => setValue(key, event.target.value)}><option value="mock">Mock（本地测试）</option><option value="alipay">支付宝扫码</option><option value="wechat">微信 Native 扫码</option></select> : isEnforce ? <select value={values[key] || "false"} onChange={(event) => setValue(key, event.target.value)}><option value="false">关闭：只记录成本，不阻塞生成</option><option value="true">开启：余额不足时阻止生成</option></select> : <input type={item.isSecret ? "password" : "text"} value={values[key] || ""} placeholder={item.isSecret ? (item.configured ? "已配置，留空保持不变" : "请输入密钥") : item.key.includes("URL") ? "https://..." : ""} onChange={(event) => setValue(key, event.target.value)} />}</label>; })}</div></div>)}</section><section className="settings-group payment-admin-help"><div className="settings-group-title"><strong>回调地址和证书说明</strong><small>必须让支付宝/微信服务器能访问到你的域名。</small></div><p>支付宝异步通知地址填写 <code>/api/payments/callback/alipay</code>；微信支付回调地址填写 <code>/api/payments/callback/wechat</code>。如果 InkFrame 部署在 example.com，完整地址分别是 https://example.com/api/payments/callback/alipay 和 https://example.com/api/payments/callback/wechat。</p><p>支付宝需要应用 App ID、RSA2 应用私钥和支付宝公钥；微信需要商户号、商户证书序列号、商户私钥、API v3 密钥和微信支付平台证书。保存密钥前请先在生产环境设置 SETTINGS_ENCRYPTION_KEY。</p></section><button className="primary-button" onClick={() => void save()} disabled={saving}><Save size={15} /> {saving ? "保存中…" : "保存支付配置"}</button></>}</div></section></main>;
}
