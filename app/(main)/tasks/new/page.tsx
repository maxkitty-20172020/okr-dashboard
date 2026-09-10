import Link from "next/link";
import { requireWriter } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicUser } from "@/lib/tasks";
import { saveTaskAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FillingGuide } from "@/components/filling-guide";
import { TaskFields } from "@/components/task-fields";

export const dynamic = "force-dynamic";
export default async function NewTaskPage() {
  const user = await requireWriter();
  const [members, keyResults, example] = await Promise.all([
    prisma.user.findMany({ where: { role: "MANAGER" }, select: publicUser, orderBy: { createdAt: "asc" } }),
    prisma.keyResult.findMany({ select: { id: true, title: true } }),
    prisma.task.findFirst({
      where: { title: { startsWith: "【填写案例】" }, archivedAt: null },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return <div className="page"><Link className="back-link" href="/tasks">← 全部任务</Link><header className="page-heading"><div><p className="eyebrow">创建事项</p><h1>先把责任和交付说清楚</h1><p className="muted">任务会跨周保留，创建后可以添加协作者和关键节点。右侧是填写指南。</p></div></header>
    <div className="detail-grid">
      <ActionForm action={saveTaskAction} className="surface form-surface" label="创建任务"><TaskFields members={members} keyResults={keyResults} currentUserId={user.id} /><div className="form-actions"><SubmitButton>创建任务</SubmitButton><Link href="/tasks" className="text-link">取消</Link></div></ActionForm>
      <FillingGuide example={example} />
    </div>
  </div>;
}
