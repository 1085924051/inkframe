"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Plug, ScrollText, Shield, Sparkles, Trash2, Users } from "lucide-react";

type UserRow = { id: string; email: string; name: string; role: string; status: string; projectCount: number; createdAt: string };
type Me = { id: string; email: string; name: string; role: string };

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ users: number; projects: number; scenes: number; shots: number; jobs: number; costCents?: number } | null>(null);

  async function load() {
    setLoading(true);
    const meRes = await fetch("/api/auth/me");
    const meData = await meRes.json();
    if (!meData.user) { window.location.href = "/login"; return; }
    setMe(meData.user);
    if (meData.user.role !== "ADMIN") { setError("需要管理员权限"); setLoading(false); return; }

    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    const statsRes = await fetch("/api/admin/stats");
    if (statsRes.ok) setStats((await statsRes.json()).stats);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function patch(id: string, body: Record<string, string>) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { await load(); } else { setError((await res.json()).error || "操作失败"); }
  }

  async function remove(id: string) {
    if (!confirm("确定删除该用户？其项目会保留（归属置空）。")) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) { await load(); } else { setError((await res.json()).error || "删除失败"); }
  }

  return <main className="admin-shell">
    <aside className="admin-side">
      <a className="brand brand-link" href="/home" aria-label="返回首页"><div className="brand-mark"><Sparkles size={17} /></div><span>INKFRAME</span><small>ADMIN</small></a>
      <nav className="side-nav">
        <a href="/home"><Users size={17} /> 首页</a>
        <a href="/"><Users size={17} /> 返回工作台</a>
        <a href="/account"><Users size={17} /> 个人中心</a>
        <a className="active"><Shield size={17} /> 用户管理</a>
        <a href="/admin/settings"><Plug size={17} /> 模型配置</a>
        <a href="/admin/settings/payments"><Plug size={17} /> 支付与账单</a>
        <a href="/admin/campaigns"><CalendarDays size={17} /> 活动管理</a>
        <a href="/admin/audit"><ScrollText size={17} /> 审计日志</a>
      </nav>
      <div className="side-bottom"><div className="status-dot" /> <span>{me?.name ?? "…"}</span></div>
    </aside>
    <section className="admin-main">
      <header className="topbar"><div><span className="eyebrow">ADMIN / USERS</span><h1>用户与权限管理</h1></div><span className="panel-note">{users.length} 位用户</span></header>
      <div className="admin-content">
        {error && <div className="auth-error">{error}</div>}
        {stats && <div className="stat-grid"><div className="stat-card"><b>{stats.users}</b><span>用户</span></div><div className="stat-card"><b>{stats.projects}</b><span>项目</span></div><div className="stat-card"><b>{stats.scenes}</b><span>场景</span></div><div className="stat-card"><b>{stats.jobs}</b><span>视频任务</span></div><div className="stat-card"><b>¥{((stats.costCents || 0) / 100).toFixed(2)}</b><span>累计模型成本</span></div></div>}
        {loading ? <div className="empty-state"><p>加载中…</p></div> : (
          <table className="admin-table">
            <thead><tr><th>用户</th><th>邮箱</th><th>角色</th><th>状态</th><th>项目数</th><th>操作</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{u.id === me?.id && <em className="me-tag">我</em>}</td>
                  <td>{u.email}</td>
                  <td><span className={`role-pill role-${u.role.toLowerCase()}`}>{u.role === "ADMIN" ? "管理员" : "普通用户"}</span></td>
                  <td><span className={`status-badge status-${u.status === "active" ? "complete" : "failed"}`}>{u.status === "active" ? "正常" : "已禁用"}</span></td>
                  <td>{u.projectCount}</td>
                  <td className="admin-actions">
                    <button onClick={() => void patch(u.id, { role: u.role === "ADMIN" ? "USER" : "ADMIN" })}>{u.role === "ADMIN" ? "降为用户" : "设为管理员"}</button>
                    <button onClick={() => void patch(u.id, { status: u.status === "active" ? "disabled" : "active" })}>{u.status === "active" ? "禁用" : "启用"}</button>
                    <button className="danger" onClick={() => void remove(u.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  </main>;
}
