"use client";

import { usePathname } from "next/navigation";
import { CalendarDays, CreditCard, FileText, Home, LayoutDashboard, Plug, Shield, Sparkles, UserRound } from "lucide-react";

const items = [
  { href: "/home", label: "首页", icon: Home },
  { href: "/", label: "返回工作台", icon: LayoutDashboard },
  { href: "/account", label: "个人中心", icon: UserRound },
  { href: "/admin", label: "用户管理", icon: Shield },
  { href: "/admin/settings", label: "模型配置", icon: Plug },
  { href: "/admin/settings/payments", label: "支付与账单", icon: CreditCard },
  { href: "/admin/settings/assets", label: "素材公网", icon: FileText },
  { href: "/admin/campaigns", label: "活动管理", icon: CalendarDays },
  { href: "/admin/audit", label: "审计日志", icon: FileText },
];

function isActive(pathname: string, href: string) {
  if (href === "/home" || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname() || "/admin";
  return <aside className="admin-side admin-side-shared">
    <a className="brand brand-link" href="/home" aria-label="返回首页"><div className="brand-mark"><Sparkles size={17} /></div><span>INKFRAME</span><small>ADMIN</small></a>
    <nav className="side-nav" aria-label="后台导航">
      {items.map(({ href, label, icon: Icon }) => <a href={href} key={href} className={isActive(pathname, href) ? "active" : undefined} aria-current={isActive(pathname, href) ? "page" : undefined}><Icon size={17} /> {label}</a>)}
    </nav>
    <div className="side-bottom"><div className="status-dot" /> <span>ADMIN CONSOLE</span></div>
  </aside>;
}
