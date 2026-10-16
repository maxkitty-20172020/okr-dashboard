import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "运营部 · 事项与进展",
  description: "持续跟进部门事项、分工与协作进展",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="min-h-full bg-bg text-ink">{children}</body>
    </html>
  );
}
