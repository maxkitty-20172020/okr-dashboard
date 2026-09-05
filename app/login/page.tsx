import { LoginForm } from "@/components/login-form";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/okr";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    select: { name: true, email: true, role: true },
  });
  const accountOrder = ["okr", "okr1", "okr2", "okr3"];
  users.sort(
    (left, right) =>
      accountOrder.indexOf(left.email.split("@")[0] ?? "") -
      accountOrder.indexOf(right.email.split("@")[0] ?? ""),
  );

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="font-serif text-5xl italic tracking-tight">运营部 · 任务与进展</p>
          <h1 className="mt-4 max-w-md text-3xl font-medium leading-snug">
            分工清楚，进展有据，重要的事持续跟进。
          </h1>
          <p className="mt-4 max-w-md text-muted">
            业务、团队与库存管理，单人负责或多人协作，都在同一处跟进。
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_20px_50px_rgba(22,32,43,0.08)] sm:p-8">
          <h2 className="font-serif text-2xl italic">登录</h2>
          <p className="mt-1 mb-6 text-sm text-muted">成员记录进展，老板查看全貌。</p>
          <LoginForm
            accounts={users.map((user) => ({
              ...user,
              role: roleLabel(user.role),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
