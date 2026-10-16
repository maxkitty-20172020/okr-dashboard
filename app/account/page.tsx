import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";
import { changeOwnPasswordAction } from "@/lib/member-actions";
import { AppShell } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Notice } from "@/components/ui/notice";

export const dynamic = "force-dynamic";
// Allows password-change-only sessions without redirecting back to this page.
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const user = await requireSession({ allowPasswordChange: true });
  const params = await searchParams;
  return <AppShell user={user}><div className="page narrow account-page">
    <header className="page-heading"><div><p className="eyebrow">我的账号</p><h1>我的</h1></div></header>
    {user.mustChangePassword && <Notice tone="risk">首次登录或密码已被重置，请先设置新密码</Notice>}
    {params.changed === "1" && <Notice tone="ok">密码已修改，其他设备的会话已失效。</Notice>}
    <section className="surface detail-section"><div className="section-heading"><div className="person-name"><span className="avatar">{user.name.slice(-1)}</span><h2>{user.name}</h2></div><StatusBadge>{user.role === "BOSS" ? "只看不改" : "填报成员"}</StatusBadge></div><p className="member-login muted">{user.email}</p></section>
    <section className="surface detail-section"><h2>修改密码</h2><p className="section-help">新密码 8–72 个字符，不能和当前密码一样。</p><ActionForm action={changeOwnPasswordAction} label="修改密码"><div className="fields">
      <Field label="当前密码" help="填写现在使用的密码。"><input type="password" name="currentPassword" required autoComplete="current-password" placeholder="例：当前登录密码" /></Field>
      <Field label="新密码" help="设置一个与当前不同的新密码。"><input type="password" name="newPassword" required autoComplete="new-password" placeholder="例：至少 8 位新密码" /></Field>
    </div><div className="form-actions"><SubmitButton>保存新密码</SubmitButton>{!user.mustChangePassword && <Link className="text-link" href="/">进入工作台</Link>}</div></ActionForm></section>
    <section className="surface detail-section account-links" aria-label="我的入口">{user.role === "BOSS" && <Link className="text-link" href="/members">成员管理 →</Link>}<Link className="text-link" href="/guide">填写指南 →</Link><form action={logoutAction}><Button variant="secondary">退出登录</Button></form></section>
  </div></AppShell>;
}
