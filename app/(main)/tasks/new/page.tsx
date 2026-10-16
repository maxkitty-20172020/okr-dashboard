import Link from "next/link";
import { requireWriter } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicUser } from "@/lib/tasks";
import { saveTaskAction } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { TaskFields } from "@/components/task-fields";

export const dynamic = "force-dynamic";
export default async function NewTaskPage() {
  const user = await requireWriter();
  const [members, keyResults] = await Promise.all([
    prisma.user.findMany({ where: { role: "MANAGER", disabledAt: null }, select: publicUser, orderBy: { createdAt: "asc" } }),
    prisma.keyResult.findMany({ select: { id: true, title: true } }),
  ]);
  return <div className="page"><Link className="back-link" href="/tasks">← 全部事项</Link><header className="page-heading"><div><p className="eyebrow">创建事项</p><h1>记一件事</h1><p className="muted">只要回答 3 个问题，30 秒记下来。其他的以后再补。</p></div></header>
    <div className="new-task-layout">
      <ActionForm action={saveTaskAction} className="surface form-surface" label="创建事项"><TaskFields members={members} keyResults={keyResults} currentUserId={user.id} /><div className="form-actions mobile-sticky-submit"><Button size="lg">记下来</Button><Link href="/tasks" className="text-link">取消</Link></div></ActionForm>
    </div>
  </div>;
}
