"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";

const initialState: { error?: string } | null = null;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">账号</span>
        <input
          name="email"
          type="text"
          autoComplete="username"
          required
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
  );
}
