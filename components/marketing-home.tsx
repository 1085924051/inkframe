"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

type CampaignBannerData = { id: string; title: string; subtitle: string; badge?: string | null; discountPercent: number; bonusPercent: number; ctaLabel: string; ctaHref: string };

export function CampaignBanner({ compact = false }: { compact?: boolean }) {
  const [campaign, setCampaign] = useState<CampaignBannerData | null>(null);
  useEffect(() => {
    fetch("/api/campaigns")
      .then((response) => response.ok ? response.json() : null)
      .then((data: { campaigns?: CampaignBannerData[] } | null) => setCampaign(data?.campaigns?.[0] || null))
      .catch(() => undefined);
  }, []);
  if (!campaign) return null;
  return <a className={`campaign-banner ${compact ? "compact" : ""}`} href={campaign.ctaHref || "/register"}>
    <span className="campaign-banner-badge">{campaign.badge || "限时活动"}</span>
    <span className="campaign-banner-copy"><b>{campaign.title}</b><small>{campaign.subtitle}</small></span>
    <span className="campaign-banner-benefit">{campaign.discountPercent ? `省 ${campaign.discountPercent}%` : campaign.bonusPercent ? `赠 ${campaign.bonusPercent}%` : "现在开始"}</span>
    <ArrowRight size={16} />
  </a>;
}

export function MarketingHome({ signedIn = false }: { signedIn?: boolean }) {
  const [authenticated, setAuthenticated] = useState(signedIn);
  useEffect(() => { fetch("/api/auth/me").then((response) => response.ok ? response.json() : null).then((data: { user?: unknown } | null) => setAuthenticated(Boolean(data?.user))).catch(() => undefined); }, []);
  const workspaceHref = authenticated ? "/" : "/login";
  return <main className="marketing-shell">
    <header className="marketing-nav">
      <a className="marketing-brand" href="/home" aria-label="InkFrame 首页"><span className="marketing-mark"><Sparkles size={17} /></span><span>INKFRAME</span><small>STUDIO</small></a>
      <nav>
        <a href="#workflow">创作流程</a><a href="#pricing">计费方式</a>
        {authenticated ? <><a href="/">工作台</a><a href="/account">个人中心</a></> : <a href="/login">登录</a>}
        <a className="marketing-nav-cta" href={authenticated ? "/" : "/register"}>{authenticated ? "进入工作台" : "免费开始"}</a>
      </nav>
    </header>
    <section className="marketing-hero">
      <div className="marketing-hero-copy">
        <div className="marketing-eyebrow"><span /> AI STORY PIPELINE</div>
        <h1>把文字的气质<br /><em>拍成一部短剧</em></h1>
        <p>从创作简报、作家风格和导演视觉出发，自动完成角色资产、连续剧本、分镜提示词和视频生成。</p>
        <div className="marketing-actions"><a className="marketing-primary" href={authenticated ? "/" : "/register"}>{authenticated ? "继续创作" : "开始创作"} <ArrowRight size={16} /></a><a className="marketing-secondary" href={workspaceHref}>{authenticated ? "打开工作台" : "登录后打开项目"}</a></div>
        <CampaignBanner />
      </div>
      <div className="marketing-visual"><div className="visual-glow" /><div className="visual-panel"><div className="visual-panel-top"><span>PROJECT / FIRST CUT</span><i>● LIVE</i></div><div className="visual-screen"><div className="visual-screen-label">FROM BRIEF TO FRAME</div><div className="visual-screen-title">一场尚未发生的<br /><strong>告别</strong></div><div className="visual-screen-meta"><span>03 场景</span><span>08 镜头</span><span>16:9 · 1080P</span></div></div><div className="visual-timeline"><span className="timeline-active" /><span /><span /><span /><span /></div><div className="visual-caption"><b>把故事交给一条连续的生产管线</b><small>角色、场景、对白和镜头始终保持关联</small></div></div></div>
    </section>
    <section id="workflow" className="marketing-workflow"><div className="marketing-section-heading"><span>WORKFLOW</span><h2>从灵感到成片，<em>每一步都有上下文</em></h2></div><div className="marketing-flow-grid"><div><span>01</span><b>创作简报</b><p>输入主题、篇幅、叙事视角和世界观约束。</p></div><div><span>02</span><b>资产与风格</b><p>固定人物、场景和导演视觉，持续复用。</p></div><div><span>03</span><b>剧本与分镜</b><p>让对白、动作和镜头运动准确对应。</p></div><div><span>04</span><b>视频生成</b><p>选择模型，异步生成可预览的镜头视频。</p></div></div></section>
    <section id="pricing" className="marketing-pricing"><div><span className="marketing-section-label">透明计费</span><h2>按实际模型消耗，<br /><em>不藏在黑箱里</em></h2><p>每个模型都可以由管理员单独配置价格。视频按秒、图像按张、文本按 token 记录，项目和用量都能回看。</p></div><div className="pricing-highlights"><div><b>¥0.2–1.0</b><span>视频生成每秒参考区间</span></div><div><b>可配置</b><span>模型、渠道和活动价格</span></div><div><b>可追溯</b><span>每次生成写入用量记录</span></div></div></section>
    <footer className="marketing-footer"><span>INKFRAME / FROM TEXT TO FRAME</span><a href={authenticated ? "/" : "/register"}>进入工作台 <ArrowRight size={14} /></a></footer>
  </main>;
}
