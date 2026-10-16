import { Icon } from "@/components/ui/icon";
import { Disclosure } from "@/components/ui/disclosure";
import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import type { SessionUser } from "@/lib/auth";
import { NavLinks } from "@/components/nav-links";
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const boss = user.role === "BOSS";
  return <div className="app-shell"><header className="topbar"><div className="topbar-inner"><Link href="/" className="brand"><span className="brand-icon" aria-hidden="true">运</span><strong>运营部看板</strong></Link><nav className="desktop-nav" aria-label="主导航"><NavLinks boss={boss} /></nav><Disclosure className="user-menu" ariaLabel="账号菜单" title={<><span className="avatar">{user.name.slice(-1)}</span><span className="account-caption"><strong>{user.name}</strong><small className={boss ? "readonly-label" : undefined}>{boss ? "只看不改" : "填报成员"}</small></span></>}><div className="user-menu-content"><Link href="/account"><Icon name="password" />修改密码</Link><Link href="/guide"><Icon name="guide" />填写指南</Link><hr /><form action={logoutAction}><button className="logout" type="submit"><Icon name="logout" />退出登录</button></form></div></Disclosure></div></header><main className="app-main">{children}</main><nav className={`bottom-nav ${boss ? "boss" : ""}`} aria-label="手机导航"><NavLinks boss={boss} mobile /></nav></div>;
}
