"use client";

import { useState } from "react";
import { ArrowRight, Sparkles, UserPlus } from "lucide-react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "注册失败"); return; }
      window.location.href = "/";
    } catch {
      setError("网络错误，请稍后重试");
    } finally { setLoading(false); }
  }

  return <main className="auth-shell">
    <div className="auth-card">
      <a className="brand brand-link" href="/home" aria-label="返回首页"><div className="brand-mark"><Sparkles size={17} /></div><span>INKFRAME</span><small>STUDIO</small></a>
      <h1>创建账号</h1>
      <p className="auth-sub">首个注册的账号将自动成为管理员</p>
      <label className="field"><span>昵称</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="你的名字" /></label>
      <label className="field"><span>邮箱</span><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label className="field"><span>密码</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" onKeyDown={(e) => e.key === "Enter" && void submit()} /></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="primary-button auth-button" onClick={submit} disabled={loading}>{loading ? "注册中…" : <>注册 <UserPlus size={16} /></>}</button>
      <div className="auth-switch">已有账号？<a href="/login">直接登录 <ArrowRight size={13} /></a></div>
    </div>
  </main>;
}
