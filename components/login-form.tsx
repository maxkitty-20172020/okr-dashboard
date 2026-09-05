"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";

const initialState: { error?: string } | null = null;

export function LoginForm({
  accounts,
}: {
  accounts: { name: string; email: string; role: string }[];
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">账号</span>
          <input
            name="email"
            type="text"
            autoComplete="username"
            required
            placeholder="okr"
            className="w-full rounded-lg border border-line bg-white px-3 py-2.5 outline-none ring-gold/40 focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">密码</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue="okr12345"
            className="w-full rounded-lg border border-line bg-white px-3 py-2.5 outline-none ring-gold/40 focus:ring-2"
          />
        </label>
        {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm text-[#f7f1e6] disabled:opacity-60"
        >
          {pending ? "登录中…" : "进入面板"}
        </button>
      </form>
      <div className="rounded-xl border border-line bg-paper/80 p-4">
        <p className="text-xs tracking-[0.16em] text-muted uppercase">演示账号</p>
        <ul className="mt-3 space-y-2 text-sm">
          {accounts.map((account) => (
            <li key={account.email} className="flex items-center justify-between gap-3">
              <span>
                {account.name}
                <span className="ml-2 text-muted">{account.role}</span>
              </span>
              <span className="font-mono text-xs text-gold-strong">
                {account.email.split("@")[0]}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">演示账号初始密码为 okr12345。</p>
      </div>
    </div>
  );
}
