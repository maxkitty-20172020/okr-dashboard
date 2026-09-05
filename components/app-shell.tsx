import { logoutAction } from "@/lib/actions";
import type { SessionUser } from "@/lib/auth";
import { NavLinks } from "@/components/nav-links";

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-icon">运</div><div><strong>运营部</strong><span>任务与进展</span></div></div><nav aria-label="主导航"><NavLinks boss={user.role === "BOSS"} /></nav><div className="sidebar-bottom"><div className="signed-user"><span className="avatar">{user.name.slice(-2)}</span><div><p>{user.name}</p><small>{user.role === "BOSS" ? "老板 · 只读" : "管理成员 · 可填报"}</small></div></div><form action={logoutAction}><button type="submit" className="logout">退出登录</button></form></div></aside><main className="app-main">{children}</main></div>;
}
