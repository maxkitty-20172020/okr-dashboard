import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { changeOwnPasswordAction } from "@/lib/member-actions";
import { AppShell } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";

export const dynamic = "force-dynamic";
// Outside (main): requireSession guards main pages and actions, while this page
// explicitly permits a password-change-only session without a redirect loop.
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const user = await requireSession({ allowPasswordChange: true });
  const params = await searchParams;
  return <AppShell user={user}><div className="page">
    <header className="page-heading"><div><p className="eyebrow">我的账号</p><h1>修改密码</h1></div></header>
    {user.mustChangePassword && <p className="form-error" role="alert">首次登录或密码已被重置，请先设置新密码</p>}
    {params.changed === "1" && <p className="form-success" role="status">密码已修改，其他设备的会话已失效。</p>}
    <section className="surface detail-section"><h2>{user.name}</h2><p>{user.email} · {user.role === "BOSS" ? "老板" : "填报成员"}</p>
      <ActionForm action={changeOwnPasswordAction} label="修改密码">
        <div className="fields">
          <label>当前密码<input type="password" name="currentPassword" required autoComplete="current-password" /></label>
          <label>新密码<input type="password" name="newPassword" required autoComplete="new-password" /></label>
        </div>
        <p className="section-help">规范化后为 8–72 字符；不能与当前密码相同。</p>
        <div className="form-actions"><SubmitButton>保存新密码</SubmitButton>{!user.mustChangePassword && <Link className="text-link" href="/">进入工作台</Link>}</div>
      </ActionForm>
    </section>
  </div></AppShell>;
}
