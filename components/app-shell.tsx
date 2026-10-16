import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import type { SessionUser } from "@/lib/auth";
import { MobilePageTitle, NavLinks } from "@/components/nav-links";
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const boss = user.role === "BOSS";
  return <div className="app-shell"><header className="topbar"><div className="topbar-inner"><Link href="/" className="brand"><span className="brand-icon" aria-hidden="true">运</span><strong>运营部看板</strong></Link><MobilePageTitle /><nav className="desktop-nav" aria-label="主导航"><NavLinks boss={boss} /></nav><details className="user-menu"><summary className="signed-user">{user.name} · {boss ? "只看不改" : "填报成员"}</summary><div className="user-menu-content"><Link href="/account">修改密码</Link><Link href="/guide">填写指南</Link><form action={logoutAction}><button className="logout" type="submit">退出登录</button></form></div></details></div></header><main className="app-main">{children}</main><nav className={`bottom-nav ${boss ? "boss" : ""}`} aria-label="手机导航"><NavLinks boss={boss} mobile /></nav></div>;
}
