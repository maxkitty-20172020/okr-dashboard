"use client";
import { useActionState } from "react";
import { loginAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
const initialState: { error?: string } | null = null;
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  return <form action={formAction} className="login-fields">
    <Field label="账号" help="填写你的短账号或邮箱。"><input name="email" type="text" autoComplete="username" autoCapitalize="none" required placeholder="例：liming" /></Field>
    <Field label="密码" help="填写你的登录密码。"><input name="password" type="password" autoComplete="current-password" required placeholder="例：你的登录密码" /></Field>
    {state?.error && <Notice tone="risk">{state.error}</Notice>}
    <Button size="lg" pending={pending}>进入看板</Button>
  </form>;
}
