import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "InkFrame / 作家风格 → 短剧生成", description: "从文字气质到可视化短剧的创作工作台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
