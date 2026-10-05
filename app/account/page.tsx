"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Clapperboard, Coins, ExternalLink, LogOut, Package, Settings, Sparkles, UserRound } from "lucide-react";

type Pricing = { billingUnit: string; inputPerMillion: number; outputPerMillion: number; videoPerSecond: number; imagePerImage: number; requestFixed: number; enabled: boolean; note: string };
type AccountData = {
  user: { id: string; name: string; email: string; role: string };
  balance: { status: string; amountMicros: number };
  usage: { costMicros: number; costCents: number; inputTokens: number; outputTokens: number; recordCount: number };
  projects: { id: string; title: string; topic: string; format: string; episodeCount: number; sceneCount: number; charactersCount: number; assetsCount: number; updatedAt: string; createdAt: string }[];
  models: { id: string; name: string; model: string; kind: string; provider: string; channelName: string; pricing: Pricing }[];
};

const KIND_LABEL: Record<string, string> = { text: "文本", storyboard: "分镜", image: "图像", video: "视频" };

function priceLabel(pricing: Pricing) {
  const parts: string[] = [];
  if (pricing.videoPerSecond) parts.push(`¥${pricing.videoPerSecond}/秒`);
  if (pricing.imagePerImage) parts.push(`¥${pricing.imagePerImage}/张`);
  if (pricing.inputPerMillion || pricing.outputPerMillion) parts.push(`输入 ¥${pricing.inputPerMillion}/M · 输出 ¥${pricing.outputPerMillion}/M`);
  if (pricing.requestFixed) parts.push(`请求 ¥${pricing.requestFixed}`);
  return parts.length ? parts.join(" · ") : "价格未设置";
}

export default function AccountPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/account").then(async (response) => {
      if (response.status === 401) { window.location.href = "/login"; return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "账户信息加载失败");
      setAccount(data.account as AccountData);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "账户信息加载失败")).finally(() => setLoading(false));
  }, []);

  const groupedModels = useMemo(() => {
    if (!account) return [] as [string, AccountData["models"]][];
    return Array.from(new Map(account.models.map((model) => [model.kind, account.models.filter((item) => item.kind === model.kind)])).entries());
  }, [account]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/home";
  }

  if (loading) return <main className="account-shell account-loading"><Sparkles size={22} /><span>正在读取个人中心…</span></main>;
  if (!account) return <main className="account-shell"><div className="account-error">{error || "账户信息不可用"}<a href="/login">返回登录</a></div></main>;

  return <main className="account-shell">
    <header className="account-topbar"><a className="account-brand" href="/home" aria-label="返回首页"><span className="account-brand-mark"><Sparkles size={16} /></span><span>INKFRAME</span><small>ACCOUNT</small></a><nav><a href="/home">首页</a><a href="/">工作台</a><a className="account-nav-active" href="#projects">我的项目</a><a href="#models">可用模型</a></nav><button className="account-logout" onClick={() => void logout()}><LogOut size={14} /> 退出</button></header>
    <div className="account-content">
      <div className="account-heading"><div><span className="account-eyebrow">ACCOUNT / OVERVIEW</span><h1>个人中心</h1><p>管理账户、项目和可用模型；所有生成成本会按项目持续记录。</p></div><a className="account-workspace-button" href="/"><Clapperboard size={15} /> 返回工作台 <ArrowRight size={14} /></a></div>
      <section className="account-profile-grid"><article className="account-profile-card"><div className="account-avatar"><UserRound size={24} /></div><div><b>{account.user.name}</b><span>{account.user.email}</span><small>{account.user.role === "ADMIN" ? "管理员账户" : "创作者账户"}</small></div><a className="account-profile-settings" href={account.user.role === "ADMIN" ? "/admin" : "#usage"} title={account.user.role === "ADMIN" ? "后台管理" : "查看用量"}><Settings size={16} /></a></article><article className="account-balance-card"><div><span>账户余额</span><b>暂未启用</b><small>余额充值和扣款系统将在支付模块接入后开放</small></div><Coins size={25} /></article><article className="account-stat-card"><span>累计模型成本</span><b>¥{(account.usage.costMicros / 1_000_000).toFixed(4)}</b><small>{account.usage.recordCount} 次生成记录</small></article></section>
      <section id="usage" className="account-usage-strip"><div><BarChart3 size={17} /><span>累计输入 Token <b>{account.usage.inputTokens.toLocaleString()}</b></span></div><div><BarChart3 size={17} /><span>累计输出 Token <b>{account.usage.outputTokens.toLocaleString()}</b></span></div><div><Package size={17} /><span>当前项目 <b>{account.projects.length}</b></span></div></section>
      <section id="projects" className="account-section"><div className="account-section-heading"><div><span>PROJECTS</span><h2>我的项目</h2></div><a className="account-text-link" href="/"><span>新建项目</span><ArrowRight size={14} /></a></div><div className="account-project-grid">{account.projects.length ? account.projects.map((project) => <article className="account-project-card" key={project.id}><div className="account-project-card-top"><span>{project.format === "series" ? `${project.episodeCount} 集系列` : "单集短剧"}</span><small>{new Date(project.updatedAt).toLocaleDateString("zh-CN")}</small></div><h3>{project.title}</h3><p>{project.topic || "暂无主题"}</p><div className="account-project-meta"><span>{project.sceneCount} 场景</span><span>{project.charactersCount} 人物</span><span>{project.assetsCount} 素材</span></div><a href={`/?project=${encodeURIComponent(project.id)}`} className="account-project-open">在工作台打开 <ExternalLink size={13} /></a></article>) : <div className="account-empty"><Package size={22} /><p>还没有项目</p><a className="primary-button" href="/">开始创建第一个项目</a></div>}</div></section>
      <section id="models" className="account-section"><div className="account-section-heading"><div><span>MODEL CATALOG</span><h2>可用模型与价格</h2></div><small>价格由管理员在模型配置中维护</small></div>{groupedModels.length ? <div className="account-model-groups">{groupedModels.map(([kind, models]) => <div className="account-model-group" key={kind}><div className="account-model-group-title"><b>{KIND_LABEL[kind] || kind}</b><span>{models.length} 个模型</span></div><div className="account-model-list">{models.map((model) => <article className="account-model-row" key={model.id}><div className="account-model-icon"><Sparkles size={15} /></div><div className="account-model-main"><b>{model.name}</b><span>{model.model} · {model.channelName} · {model.provider}</span></div><div className="account-model-price"><b>{priceLabel(model.pricing)}</b><small>{model.pricing.enabled ? "计费已启用" : "不计费"}</small></div></article>)}</div></div>)}</div> : <div className="account-empty"><Settings size={22} /><p>暂未配置可用模型</p><a href={account.user.role === "ADMIN" ? "/admin/settings" : "/home"} className="account-text-link">{account.user.role === "ADMIN" ? "去配置模型" : "联系管理员"} <ArrowRight size={14} /></a></div>}</section>
    </div>
  </main>;
}
