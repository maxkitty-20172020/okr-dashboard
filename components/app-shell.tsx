import { logoutAction } from "@/lib/actions";
import type { SessionUser } from "@/lib/auth";
import { roleLabel } from "@/lib/okr";
import { NavLinks } from "@/components/nav-links";

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-ink text-[#f7f1e6]">
        <div className="flex items-center justify-between px-6 py-5 lg:block lg:px-7 lg:py-8">
          <div>
            <p className="font-serif text-3xl italic tracking-tight">OKR</p>
            <p className="mt-1 text-xs tracking-[0.18em] text-[#cbbca3] uppercase">
              Weekly Board
            </p>
          </div>
          <div className="hidden lg:mt-10 lg:block">
            <p className="text-sm">{user.name}</p>
            <p className="mt-1 text-xs text-[#cbbca3]">{roleLabel(user.role)}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:px-4">
          <NavLinks />
        </nav>
        <form action={logoutAction} className="hidden px-4 pb-6 lg:block">
          <button
            type="submit"
            className="mt-6 w-full rounded-lg border border-white/15 px-3 py-2 text-sm text-[#d9ccb6] hover:bg-white/10"
          >
            退出登录
          </button>
        </form>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
          <div>
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted">{roleLabel(user.role)}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-muted">
              退出
            </button>
          </form>
        </header>
        <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
