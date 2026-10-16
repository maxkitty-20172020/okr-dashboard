import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadMembers } from "@/lib/member-view";
import { memberAction } from "@/lib/member-actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { dateLabel } from "@/lib/tasks";

export const dynamic = "force-dynamic";
function RoleSelect({ role = "MANAGER" }: { role?: string }) {
  return <label>角色<select name="role" defaultValue={role}><option value="MANAGER">填报成员</option><option value="BOSS">老板</option></select></label>;
}
export default async function MembersPage() {
  const actor = await requireSession();
  if (actor.role !== "BOSS") redirect("/?error=no-permission");
  const members = await loadMembers(prisma, actor);
  return <div className="page">
    <header className="page-heading"><div><p className="eyebrow">账号与权限</p><h1>成员管理</h1><p className="muted">老板管理账号；任务与汇报仍然只读。停用保留所有历史记录。</p></div></header>
    <section className="surface detail-section">
      <h2>新增成员</h2>
      <ActionForm action={memberAction} label="新增成员">
        <input type="hidden" name="operation" value="create" />
        <div className="fields">
          <label>姓名<input name="name" required maxLength={40} /></label>
          <label>登录账号<input name="login" required autoCapitalize="none" autoComplete="off" placeholder="短账号或邮箱" /></label>
          <label>初始密码<input name="password" type="password" required autoComplete="new-password" /></label>
          <RoleSelect />
        </div>
        <p className="section-help">密码规范化后为 8–72 字符。新成员首次登录须改密。</p>
        <div className="form-actions"><SubmitButton>新增成员</SubmitButton></div>
      </ActionForm>
    </section>
    <div className="space-y-4">{members.map(member => <article key={member.id} className="surface detail-section" aria-label={`成员 ${member.email}`}>
      <div className="section-heading"><h2>{member.name}</h2><span className="muted">{member.disabledAt ? "已停用" : "已启用"}</span></div>
      <p>{member.email} · {member.role === "BOSS" ? "老板" : "填报成员"}</p>
      <p className="section-help">创建时间：{dateLabel(member.createdAt)} · 主责未结束任务：{member._count.tasks} 项</p>
      <ActionForm action={memberAction} label={`编辑 ${member.email}`}>
        <input type="hidden" name="operation" value="update" /><input type="hidden" name="id" value={member.id} />
        <div className="fields"><label>姓名<input name="name" defaultValue={member.name} required maxLength={40} /></label><RoleSelect role={member.role} /></div>
        <div className="form-actions"><SubmitButton secondary>保存姓名和角色</SubmitButton></div>
      </ActionForm>
      <details><summary className="text-link">重置密码</summary>
        <ActionForm action={memberAction} label={`重置密码 ${member.email}`}>
          <input type="hidden" name="operation" value="reset" /><input type="hidden" name="id" value={member.id} />
          <div className="fields"><label>新的临时密码<input name="password" type="password" required autoComplete="new-password" /></label></div>
          <p className="section-help">保存后该成员所有设备须重新登录并改密；重置自己的密码也会退出当前会话。</p>
          <SubmitButton secondary>设置临时密码</SubmitButton>
        </ActionForm>
      </details>
      {member.id !== actor.id && <ActionForm action={memberAction} label={`账号状态 ${member.email}`}>
        <input type="hidden" name="operation" value={member.disabledAt ? "enable" : "disable"} /><input type="hidden" name="id" value={member.id} />
        <div className="form-actions"><SubmitButton secondary>{member.disabledAt ? "启用成员" : "停用成员"}</SubmitButton></div>
      </ActionForm>}
    </article>)}</div>
  </div>;
}
