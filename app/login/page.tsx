"use client";

import { useState } from "react";
import { ArrowRight, LogIn, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "登录失败"); return; }
      window.location.href = "/";
    } catch {
      setError("网络错误，请稍后重试");
    } finally { setLoading(false); }
  }

  return <main className="auth-shell">
    <div className="auth-card">
      <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>INKFRAME</span><small>STUDIO</small></div>
      <h1>欢迎回来</h1>
      <p className="auth-sub">登录后继续你的短剧创作</p>
      <label className="field"><span>邮箱</span><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label className="field"><span>密码</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === "Enter" && void submit()} /></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="primary-button auth-button" onClick={submit} disabled={loading}>{loading ? "登录中…" : <>登录 <LogIn size={16} /></>}</button>
      <div className="auth-switch">还没有账号？<a href="/register">立即注册 <ArrowRight size={13} /></a></div>
    </div>
  </main>;
}