import Link from "next/link";
import type { KeyResult, Objective, TaskStatus, User, WeeklyTask } from "@prisma/client";
import {
  createTaskAction,
  deleteTaskAction,
  updateTaskStatusAction,
} from "@/lib/actions";
import { statusLabel } from "@/lib/okr";
import { addWeeks, formatWeekRange, toISODate } from "@/lib/week";

const statuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

type TaskRow = WeeklyTask & {
  owner: User;
  keyResult: (KeyResult & { objective: Objective }) | null;
};

type KrOption = KeyResult & { objective: Objective };

export function WeekBoard({
  weekStart,
  currentUserId,
  users,
  keyResults,
  tasks,
}: {
  weekStart: Date;
  currentUserId: string;
  users: User[];
  keyResults: KrOption[];
  tasks: TaskRow[];
}) {
  const week = toISODate(weekStart);
  const prev = toISODate(addWeeks(weekStart, -1));
  const next = toISODate(addWeeks(weekStart, 1));
  const grouped = users.map((user) => ({
    user,
    tasks: tasks.filter((task) => task.ownerId === user.id),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Weekly tasks</p>
          <h1 className="mt-2 font-serif text-4xl italic">本周任务</h1>
          <p className="mt-2 text-muted">{formatWeekRange(weekStart)}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/week?week=${prev}`} className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
            上一周
          </Link>
          <Link href="/week" className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
            本周
          </Link>
          <Link href={`/week?week=${next}`} className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
            下一周
          </Link>
        </div>
      </div>

      <form action={createTaskAction} className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-lg font-medium">新增任务</h2>
        <p className="mt-1 mb-4 text-sm text-muted">默认记在当前登录人身上，也可以帮同事补一条。</p>
        <input type="hidden" name="week" value={week} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="md:col-span-2 xl:col-span-4">
            <span className="mb-1 block text-sm text-muted">任务</span>
            <input
              name="title"
              required
              placeholder="这周要推进的一件具体事情"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none ring-gold/40 focus:ring-2"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">负责人</span>
            <select
              name="ownerId"
              defaultValue={currentUserId}
              className="w-full rounded-lg border border-line bg-white px-3 py-2"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">关联 KR</span>
            <select name="keyResultId" className="w-full rounded-lg border border-line bg-white px-3 py-2">
              <option value="">不关联</option>
              {keyResults.map((kr) => (
                <option key={kr.id} value={kr.id}>
                  {kr.objective.title} / {kr.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">状态</span>
            <select name="status" defaultValue="TODO" className="w-full rounded-lg border border-line bg-white px-3 py-2">
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-lg bg-ink px-4 py-2 text-sm text-[#f7f1e6]">
              添加
            </button>
          </div>
        </div>
      </form>

      <div className="space-y-5">
        {grouped.map(({ user, tasks: userTasks }) => (
          <section key={user.id} className="rounded-2xl border border-line bg-card p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-medium">{user.name}</h2>
              <p className="text-sm text-muted">
                {userTasks.filter((task) => task.status === "DONE").length}/{userTasks.length} 已完成
              </p>
            </div>
            {userTasks.length === 0 ? (
              <p className="text-sm text-muted">这周还没有任务。</p>
            ) : (
              <ul className="space-y-3">
                {userTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-col gap-3 rounded-xl bg-paper px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <p>{task.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        {task.keyResult
                          ? `${task.keyResult.objective.title} · ${task.keyResult.title}`
                          : "未关联关键结果"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {statuses.map((status) => (
                        <form action={updateTaskStatusAction} key={status}>
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="week" value={week} />
                          <input type="hidden" name="status" value={status} />
                          <button
                            type="submit"
                            className={`rounded-full px-2.5 py-1 text-xs ${
                              task.status === status
                                ? "bg-ink text-[#f7f1e6]"
                                : "border border-line bg-card text-muted"
                            }`}
                          >
                            {statusLabel(status)}
                          </button>
                        </form>
                      ))}
                      <form action={deleteTaskAction}>
                        <input type="hidden" name="id" value={task.id} />
                        <input type="hidden" name="week" value={week} />
                        <button type="submit" className="px-2 text-xs text-danger">
                          删除
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
