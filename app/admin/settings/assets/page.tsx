"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Save, Shield } from "lucide-react";

export default function PublicAssetSettingsPage() {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    const me = await fetch("/api/auth/me").then((response) => response.json());
    if (!me.user) { window.location.href = "/login"; return; }
    if (me.user.role !== "ADMIN") { window.location.href = "/"; return; }
    const response = await fetch("/api/admin/settings");
    const data = await response.json();
    const setting = (data.settings || []).find((item: { key: string }) => item.key === "ASSET_PUBLIC_BASE_URL");
    setValue(setting?.value || "");
    setLoading(false);
  }

  async function save() {
    const baseUrl = value.trim().replace(/\/$/, "");
    if (baseUrl && !/^https:\/\//i.test(baseUrl)) {
      setNotice({ ok: false, text: "素材公网地址必须使用 https://" });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ASSET_PUBLIC_BASE_URL: baseUrl }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setValue(baseUrl);
      setNotice({ ok: true, text: "素材公网地址已保存" });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  return <main className="admin-shell"><aside className="admin-side"><div className="brand"><div className="brand-mark"><Shield size={17} /></div><span>INKFRAME</span><small>ADMIN</small></div><nav className="side-nav"><a href="/admin/settings"><ArrowLeft size={17} /> 返回模型设置</a><a className="active"><Shield size={17} /> 素材公网配置</a></nav></aside><section className="admin-main"><header className="topbar"><div><span className="eyebrow">ADMIN / PUBLIC ASSETS</span><h1>素材公网访问</h1></div></header><div className="admin-content">{loading ? <div className="empty-state"><p>加载中…</p></div> : <section className="settings-group"><div className="settings-group-title"><strong>配置素材域名</strong><small>视频服务需要从公网读取人物和场景参考图。保存后，系统会自动把本地素材转换为 /api/public/assets/{"{assetId}"} 地址。</small></div><label className="settings-field channel-wide"><span>素材公网访问地址</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://media.example.com" /></label><p className="muted-line">域名必须能从 YuYu 服务器访问，并且已配置 HTTPS。开发环境可以使用公网隧道地址。</p>{notice && <div className={`auth-error ${notice.ok ? "auth-ok" : ""}`}>{notice.text}</div>}<button className="primary-button" onClick={() => void save()} disabled={saving}><Save size={15} /> {saving ? "保存中…" : "保存素材域名"}</button></section>}</div></section></main>;
}
