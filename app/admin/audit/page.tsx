"use client";

import { useEffect, useState } from "react";
import { ScrollText, Shield, Sparkles, Users, Plug } from "lucide-react";

type LogRow = { id: string; actorName: string; action: string; targetType: string; targetId: string | null; detail: string | null; createdAt: string };

const ACTION_LABEL: Record<string, string> = {
  "settings.save": "修改配置",
  "user.create": "注册用户",
  "user.update": "修改用户",
  "user.delete": "删除用户",
  "project.create": "创建项目",
  "project.delete": "删除项目",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const me = await (await fetch("/api/auth/me")).json();
    if (!me.user) { window.location.href = "/login"; return; }
    if (me.user.role !== "ADMIN") { window.location.href = "/"; return; }
    const res = await fetch("/api/admin/audit?limit=100");
    if (res.ok) setLogs((await res.json()).logs ?? []);
    setLoading(false);
  }

  return <main className="admin-shell">
    <aside className="admin-side">
      <a className="brand brand-link" href="/home" aria-label="返回首页"><div className="brand-mark"><Sparkles size={17} /></div><span>INKFRAME</span><small>ADMIN</small></a>
      <nav className="side-nav">
        <a href="/home"><Users size={17} /> 首页</a>
        <a href="/"><Users size={17} /> 返回工作台</a>
        <a href="/account"><Users size={17} /> 个人中心</a>
        <a href="/admin"><Shield size={17} /> 用户管理</a>
        <a href="/admin/settings"><Plug size={17} /> 模型配置</a>
        <a href="/admin/settings/payments"><Plug size={17} /> 支付与账单</a>
        <a className="active"><ScrollText size={17} /> 审计日志</a>
      </nav>
      <div className="side-bottom"><div className="status-dot" /> <span>系统审计</span></div>
    </aside>
    <section className="admin-main">
      <header className="topbar"><div><span className="eyebrow">ADMIN / AUDIT</span><h1>操作审计日志</h1></div><span className="panel-note">{logs.length} 条记录</span></header>
      <div className="admin-content">
        {loading ? <div className="empty-state"><p>加载中…</p></div> : logs.length === 0 ? <div className="empty-state"><p>暂无操作记录</p></div> : (
          <table className="admin-table">
            <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>详情</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="mono">{new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}</td>
                  <td><b>{log.actorName}</b></td>
                  <td><span className="role-pill role-user">{ACTION_LABEL[log.action] ?? log.action}</span></td>
                  <td className="mono">{log.targetType}{log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ""}</td>
                  <td className="audit-detail">{log.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  </main>;
}
