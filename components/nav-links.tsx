"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ boss = false }: { boss?: boolean }) {
  const pathname = usePathname();
  const navItems = [{ href: "/", label: boss ? "部门总览" : "我的工作台", symbol: "◈" }, { href: "/overview", label: "周期汇报", symbol: "◉" }, { href: "/tasks", label: "任务与协作", symbol: "▤" }, { href: "/okrs", label: "目标与结果", symbol: "◎" }, { href: "/guide", label: "填写指南", symbol: "✦" }];
  return <>{navItems.map(item => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><span aria-hidden="true">{item.symbol}</span>{item.label}</Link>;
  })}</>;
}
