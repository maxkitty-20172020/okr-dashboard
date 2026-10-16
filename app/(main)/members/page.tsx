import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadMembers } from "@/lib/member-view";
import { memberAction } from "@/lib/member-actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { dateLabel } from "@/lib/tasks";

export const dynamic = "force-dynamic";
function RoleChoice({ role = "MANAGER" }: { role?: string }) {
  return <ChoiceChips name="role" legend="角色" help="填报成员维护事项；老板查看业务并管理账号。" defaultValue={role} options={[{ value: "MANAGER", label: "填报成员" }, { value: "BOSS", label: "老板" }]} />;
}
export default async function MembersPage() {
  const actor = await requireSession();
  if (actor.role !== "BOSS") redirect("/?error=no-permission");
  const members = await loadMembers(prisma, actor);
  return <div className="page">
    <header className="page-heading"><div><p className="eyebrow">账号与权限</p><h1>成员</h1><p className="muted">在这里管理账号。停用后保留所有历史记录。</p></div>
      <details className="member-create"><summary className="button">＋ 新增成员</summary><section className="surface detail-section"><h2>新增成员</h2>
        <ActionForm action={memberAction} label="新增成员"><input type="hidden" name="operation" value="create" /><div className="fields">
          <Field label="姓名" help="填写团队中使用的称呼。"><input name="name" required maxLength={40} placeholder="例：李明" /></Field>
          <Field label="登录账号" help="使用短账号或邮箱登录。"><input name="login" required autoCapitalize="none" autoComplete="off" placeholder="例：liming" /></Field>
          <Field label="初始密码" help="8–72 个字符。对方第一次登录时需要改成自己的密码。"><input name="password" type="password" required autoComplete="new-password" placeholder="例：至少 8 位临时密码" /></Field>
          <RoleChoice />
        </div><div className="form-actions"><SubmitButton>新增成员</SubmitButton></div></ActionForm>
      </section></details>
    </header>
    <div className="member-grid">{members.map(member => <article key={member.id} className="surface detail-section member-card" aria-label={`成员 ${member.email}`}>
      <div className="section-heading"><div className="person-name"><span className="avatar">{member.name.slice(-1)}</span><h2>{member.name}</h2></div><StatusBadge tone={member.disabledAt ? "plain" : "ok"}>{member.disabledAt ? "已停用" : "已启用"}</StatusBadge></div>
      <p className="member-login">{member.email}</p><div className="badges"><StatusBadge>{member.role === "BOSS" ? "只看不改" : "填报成员"}</StatusBadge><StatusBadge>主责未结束 {member._count.tasks} 项</StatusBadge></div>
      <p className="section-help">创建时间：{dateLabel(member.createdAt)}</p>
      <details className="edit-disclosure member-actions"><summary aria-label={`管理 ${member.name}`}>管理账号 ···</summary>
        <ActionForm action={memberAction} label={`编辑 ${member.email}`}><input type="hidden" name="operation" value="update" /><input type="hidden" name="id" value={member.id} /><div className="fields"><Field label="姓名" help="修改团队中显示的称呼。"><input name="name" defaultValue={member.name} required maxLength={40} placeholder="例：李明" /></Field><RoleChoice role={member.role} /></div><div className="form-actions"><SubmitButton secondary>保存姓名和角色</SubmitButton></div></ActionForm>
        <details className="edit-disclosure"><summary>重置密码</summary><ActionForm action={memberAction} label={`重置密码 ${member.email}`}><input type="hidden" name="operation" value="reset" /><input type="hidden" name="id" value={member.id} /><Field label="新的临时密码" help="保存后所有设备须重新登录并改密。重置自己的密码会退出当前会话。"><input name="password" type="password" required autoComplete="new-password" placeholder="例：至少 8 位临时密码" /></Field><div className="form-actions"><SubmitButton secondary>设置临时密码</SubmitButton></div></ActionForm></details>
        {member.id !== actor.id && <ActionForm action={memberAction} label={`账号状态 ${member.email}`}><input type="hidden" name="operation" value={member.disabledAt ? "enable" : "disable"} /><input type="hidden" name="id" value={member.id} /><div className="form-actions"><Button variant={member.disabledAt ? "secondary" : "danger"}>{member.disabledAt ? "启用成员" : "停用成员"}</Button></div></ActionForm>}
      </details>
    </article>)}</div>
  </div>;
}
