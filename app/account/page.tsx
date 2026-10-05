"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CheckCircle2, Clapperboard, Coins, ExternalLink, LogOut, Package, QrCode, Settings, Sparkles, UserRound, X } from "lucide-react";

type Pricing = { billingUnit: string; inputPerMillion: number; outputPerMillion: number; videoPerSecond: number; imagePerImage: number; requestFixed: number; enabled: boolean; note: string };
type PaymentOrder = { orderNo: string; provider: "mock" | "alipay" | "wechat"; subject: string; amountMicros: number; creditMicros: number; status: string; qrCode?: string | null; expiresAt: string; paidAt?: string | null; createdAt: string };
type WalletTransaction = { id: string; orderId?: string | null; type: string; amountMicros: number; balanceAfterMicros: number; description: string; createdAt: string };
type AccountData = {
  user: { id: string; name: string; email: string; role: string };
  balance: { status: string; amountMicros: number; provider: string; billingEnforced: boolean };
  payments: { providers: string[]; orders: PaymentOrder[]; transactions: WalletTransaction[] };
  usage: { costMicros: number; costCents: number; inputTokens: number; outputTokens: number; recordCount: number };
  projects: { id: string; title: string; topic: string; format: string; episodeCount: number; sceneCount: number; charactersCount: number; assetsCount: number; updatedAt: string; createdAt: string }[];
  models: { id: string; name: string; model: string; kind: string; provider: string; channelName: string; pricing: Pricing }[];
};

const KIND_LABEL: Record<string, string> = { text: "文本", storyboard: "分镜", image: "图像", video: "视频" };
const PROVIDER_LABEL: Record<string, string> = { mock: "Mock（本地测试）", alipay: "支付宝", wechat: "微信支付" };

function yuan(micros: number) { return `¥${(micros / 1_000_000).toFixed(2)}`; }
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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("50");
  const [paymentProvider, setPaymentProvider] = useState("mock");
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  async function loadAccount() {
    const response = await fetch("/api/account", { cache: "no-store" });
    if (response.status === 401) { window.location.href = "/login"; return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "账户信息加载失败");
    setAccount(data.account as AccountData);
  }

  useEffect(() => { void loadAccount().catch((reason) => setError(reason instanceof Error ? reason.message : "账户信息加载失败")).finally(() => setLoading(false)); }, []);

  useEffect(() => {
    if (!paymentOrder || paymentOrder.status !== "pending") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/payments/${paymentOrder.orderNo}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { order: PaymentOrder };
      setPaymentOrder(data.order);
      if (data.order.status === "paid") void loadAccount();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [paymentOrder?.orderNo, paymentOrder?.status]);

  const groupedModels = useMemo(() => {
    if (!account) return [] as [string, AccountData["models"]][];
    return Array.from(new Map(account.models.map((model) => [model.kind, account.models.filter((item) => item.kind === model.kind)])).entries());
  }, [account]);

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/home"; }

  async function createPayment() {
    setPaymentBusy(true); setPaymentError("");
    try {
      const response = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(paymentAmount), provider: paymentProvider }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "创建充值订单失败");
      setPaymentOrder(data.order as PaymentOrder);
    } catch (reason) { setPaymentError(reason instanceof Error ? reason.message : "创建充值订单失败"); }
    finally { setPaymentBusy(false); }
  }

  async function mockComplete() {
    if (!paymentOrder) return;
    setPaymentBusy(true); setPaymentError("");
    try {
      const response = await fetch(`/api/payments/${paymentOrder.orderNo}/mock-complete`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "模拟支付失败");
      setPaymentOrder(data.order as PaymentOrder);
      await loadAccount();
    } catch (reason) { setPaymentError(reason instanceof Error ? reason.message : "模拟支付失败"); }
    finally { setPaymentBusy(false); }
  }

  function openPayment() { setPaymentError(""); setPaymentOrder(null); setPaymentOpen(true); setPaymentProvider(account?.balance.provider || "mock"); }
  function closePayment() { if (!paymentBusy) { setPaymentOpen(false); setPaymentOrder(null); setPaymentError(""); } }

  if (loading) return <main className="account-shell account-loading"><Sparkles size={22} /><span>正在读取个人中心…</span></main>;
  if (!account) return <main className="account-shell"><div className="account-error">{error || "账户信息不可用"}<a href="/login">返回登录</a></div></main>;

  return <main className="account-shell">
    <header className="account-topbar"><a className="account-brand" href="/home" aria-label="返回首页"><span className="account-brand-mark"><Sparkles size={16} /></span><span>INKFRAME</span><small>ACCOUNT</small></a><nav><a href="/home">首页</a><a href="/">工作台</a><a className="account-nav-active" href="#projects">我的项目</a><a href="#models">可用模型</a></nav><button className="account-logout" onClick={() => void logout()}><LogOut size={14} /> 退出</button></header>
    <div className="account-content">
      <div className="account-heading"><div><span className="account-eyebrow">ACCOUNT / OVERVIEW</span><h1>个人中心</h1><p>管理账户、项目、余额和可用模型；每次生成的成本都会持续记录。</p></div><a className="account-workspace-button" href="/"><Clapperboard size={15} /> 返回工作台 <ArrowRight size={14} /></a></div>
      <section className="account-profile-grid"><article className="account-profile-card"><div className="account-avatar"><UserRound size={24} /></div><div><b>{account.user.name}</b><span>{account.user.email}</span><small>{account.user.role === "ADMIN" ? "管理员账户" : "创作者账户"}</small></div><a className="account-profile-settings" href={account.user.role === "ADMIN" ? "/admin" : "#usage"} title={account.user.role === "ADMIN" ? "后台管理" : "查看用量"}><Settings size={16} /></a></article><article className="account-balance-card"><div><span>账户余额</span><b>{yuan(account.balance.amountMicros)}</b><small>{account.balance.billingEnforced ? "余额不足时会阻止新的生成任务" : "当前为记录成本模式，可在后台开启余额扣款"}</small><button className="account-recharge-button" onClick={openPayment}><Coins size={14} /> 充值</button></div><Coins size={25} /></article><article className="account-stat-card"><span>累计模型成本</span><b>¥{(account.usage.costMicros / 1_000_000).toFixed(4)}</b><small>{account.usage.recordCount} 次生成记录</small></article></section>
      <section id="usage" className="account-usage-strip"><div><BarChart3 size={17} /><span>累计输入 Token <b>{account.usage.inputTokens.toLocaleString()}</b></span></div><div><BarChart3 size={17} /><span>累计输出 Token <b>{account.usage.outputTokens.toLocaleString()}</b></span></div><div><Package size={17} /><span>当前项目 <b>{account.projects.length}</b></span></div></section>
      <section id="payments" className="account-section"><div className="account-section-heading"><div><span>WALLET / PAYMENTS</span><h2>充值与余额流水</h2></div><button className="account-text-button" onClick={openPayment}><QrCode size={14} /> 扫码充值</button></div><div className="account-payment-grid"><div className="account-payment-card"><div className="account-payment-card-head"><b>最近充值订单</b><span>{PROVIDER_LABEL[account.balance.provider] || account.balance.provider}</span></div>{account.payments.orders.length ? <div className="account-payment-list">{account.payments.orders.slice(0, 6).map((order) => <div className="account-payment-row" key={order.orderNo}><div><b>{yuan(order.amountMicros)}</b><small>{order.orderNo} · {PROVIDER_LABEL[order.provider]}</small></div><span className={`payment-status payment-status-${order.status}`}>{order.status === "paid" ? "已到账" : order.status === "pending" ? "待支付" : order.status === "closed" ? "已关闭" : "失败"}</span></div>)}</div> : <p className="account-muted-empty">还没有充值订单。</p>}</div><div className="account-payment-card"><div className="account-payment-card-head"><b>钱包流水</b><span>最近 30 条</span></div>{account.payments.transactions.length ? <div className="account-payment-list">{account.payments.transactions.slice(0, 6).map((tx) => <div className="account-payment-row" key={tx.id}><div><b className={tx.amountMicros >= 0 ? "wallet-positive" : "wallet-negative"}>{tx.amountMicros >= 0 ? "+" : ""}{yuan(tx.amountMicros)}</b><small>{tx.description}</small></div><span>{new Date(tx.createdAt).toLocaleDateString("zh-CN")}</span></div>)}</div> : <p className="account-muted-empty">充值或生成后会在这里留下记录。</p>}</div></div></section>
      <section id="projects" className="account-section"><div className="account-section-heading"><div><span>PROJECTS</span><h2>我的项目</h2></div><a className="account-text-link" href="/"><span>新建项目</span><ArrowRight size={14} /></a></div><div className="account-project-grid">{account.projects.length ? account.projects.map((project) => <article className="account-project-card" key={project.id}><div className="account-project-card-top"><span>{project.format === "series" ? `${project.episodeCount} 集系列` : "单集短剧"}</span><small>{new Date(project.updatedAt).toLocaleDateString("zh-CN")}</small></div><h3>{project.title}</h3><p>{project.topic || "暂无主题"}</p><div className="account-project-meta"><span>{project.sceneCount} 场景</span><span>{project.charactersCount} 人物</span><span>{project.assetsCount} 素材</span></div><a href={`/?project=${encodeURIComponent(project.id)}`} className="account-project-open">在工作台打开 <ExternalLink size={13} /></a></article>) : <div className="account-empty"><Package size={22} /><p>还没有项目</p><a className="primary-button" href="/">开始创建第一个项目</a></div>}</div></section>
      <section id="models" className="account-section"><div className="account-section-heading"><div><span>MODEL CATALOG</span><h2>可用模型与价格</h2></div><small>价格由管理员在模型配置中维护</small></div>{groupedModels.length ? <div className="account-model-groups">{groupedModels.map(([kind, models]) => <div className="account-model-group" key={kind}><div className="account-model-group-title"><b>{KIND_LABEL[kind] || kind}</b><span>{models.length} 个模型</span></div><div className="account-model-list">{models.map((model) => <article className="account-model-row" key={model.id}><div className="account-model-icon"><Sparkles size={15} /></div><div className="account-model-main"><b>{model.name}</b><span>{model.model} · {model.channelName} · {model.provider}</span></div><div className="account-model-price"><b>{priceLabel(model.pricing)}</b><small>{model.pricing.enabled ? "计费已启用" : "不计费"}</small></div></article>)}</div></div>)}</div> : <div className="account-empty"><Settings size={22} /><p>暂未配置可用模型</p><a href={account.user.role === "ADMIN" ? "/admin/settings" : "/home"} className="account-text-link">{account.user.role === "ADMIN" ? "去配置模型" : "联系管理员"} <ArrowRight size={14} /></a></div>}</section>
    </div>
    {paymentOpen && <div className="account-payment-modal-backdrop" onClick={closePayment}><section className="account-payment-modal" onClick={(event) => event.stopPropagation()}><header><div><span>WALLET / RECHARGE</span><h2>{paymentOrder ? "扫码完成支付" : "充值创作额度"}</h2></div><button className="account-modal-close" onClick={closePayment} aria-label="关闭"><X size={18} /></button></header>{!paymentOrder ? <div className="account-payment-form"><div className="account-amount-presets">{[10, 50, 100, 500].map((amount) => <button className={paymentAmount === String(amount) ? "selected" : ""} key={amount} onClick={() => setPaymentAmount(String(amount))}>¥{amount}</button>)}</div><label><span>充值金额（元）</span><input type="number" min="1" max="10000" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><label><span>支付方式</span><select value={paymentProvider} onChange={(event) => setPaymentProvider(event.target.value)}><option value="mock">Mock（本地测试）</option><option value="alipay">支付宝扫码</option><option value="wechat">微信支付 Native 扫码</option></select></label>{paymentError && <p className="account-payment-error">{paymentError}</p>}<button className="primary-button account-payment-submit" onClick={() => void createPayment()} disabled={paymentBusy}>{paymentBusy ? "创建订单中…" : `创建 ${yuan(Math.round(Number(paymentAmount || 0) * 1_000_000))} 充值订单`}</button><small>真实支付需要管理员先配置回调地址、证书和密钥；本地可用 Mock 完成闭环测试。</small></div> : <div className="account-qr-panel"><div className="account-qr-frame">{paymentOrder.qrCode ? <img src={paymentOrder.qrCode} alt="支付二维码" /> : <QrCode size={80} />}<span>{paymentOrder.status === "paid" ? "支付成功" : paymentOrder.status === "pending" ? "等待扫码支付" : "订单已结束"}</span></div><div className="account-qr-info"><b>{yuan(paymentOrder.amountMicros)}</b><span>{paymentOrder.orderNo}</span><small>二维码有效期至 {new Date(paymentOrder.expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small>{paymentError && <p className="account-payment-error">{paymentError}</p>}{paymentOrder.status === "pending" && paymentOrder.provider === "mock" && <button className="primary-button" onClick={() => void mockComplete()} disabled={paymentBusy}>{paymentBusy ? "入账中…" : "模拟支付完成"}</button>}{paymentOrder.status === "paid" && <p className="account-payment-success"><CheckCircle2 size={16} /> ¥{(paymentOrder.creditMicros / 1_000_000).toFixed(2)} 已加入余额</p>}<button className="ghost-button" onClick={() => { setPaymentOrder(null); setPaymentError(""); }}>返回修改</button></div></div>}</section></div>}
  </main>;
}
