"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function NavLinks({ boss = false, mobile = false }: { boss?: boolean; mobile?: boolean }) {
  const pathname = usePathname();
  const items = mobile ? [{ href: "/", label: "工作台" }, { href: "/tasks", label: "事项" }, ...(!boss ? [{ href: "/tasks/new", label: "＋", add: true }] : []), { href: "/overview", label: "每周进展" }, { href: "/account", label: "我的" }] : [{ href: "/", label: "工作台" }, { href: "/tasks", label: "全部事项" }, { href: "/overview", label: "每周进展" }, { href: "/okrs", label: "目标" }, ...(boss ? [{ href: "/members", label: "成员" }] : [])];
  return <>{items.map(item => {
    const active = item.href === "/" ? pathname === "/" : item.href === "/tasks" ? pathname.startsWith("/tasks") && pathname !== "/tasks/new" : pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} aria-label={"add" in item ? "记一件事" : undefined} className={`nav-item ${active ? "active" : ""} ${"add" in item ? "nav-add" : ""}`} aria-current={active ? "page" : undefined}>{item.label}</Link>;
  })}</>;
}
export function MobilePageTitle() {
  const path = usePathname();
  return <span className="mobile-page-title">{path === "/" ? "工作台" : path === "/tasks/new" ? "记一件事" : path.startsWith("/tasks/") ? "事项详情" : path.startsWith("/tasks") ? "全部事项" : path.startsWith("/overview") ? "每周进展" : path.startsWith("/account") ? "我的" : path.startsWith("/members") ? "成员" : path.startsWith("/okrs") ? "目标" : "填写指南"}</span>;
}
