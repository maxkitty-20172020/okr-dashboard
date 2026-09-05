import { LoginForm } from "@/components/login-form";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/okr";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { name: true, email: true, role: true },
  });

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="font-serif text-5xl italic tracking-tight">OKR Board</p>
          <h1 className="mt-4 max-w-md text-3xl font-medium leading-snug">
            老板和管理层同一块面板，看目标，也看本周有没有推进。
          </h1>
          <p className="mt-4 max-w-md text-muted">
            先在本机运行。换电脑时从 GitHub 拉取代码即可继续迭代。
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_20px_50px_rgba(22,32,43,0.08)] sm:p-8">
          <h2 className="font-serif text-2xl italic">登录</h2>
          <p className="mt-1 mb-6 text-sm text-muted">四位管理层可使用各自账号填写和查看。</p>
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
