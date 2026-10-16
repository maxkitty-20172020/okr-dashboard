"use client";
import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/task-service";

import { PendingContext } from "./form-pending";

export function ActionForm({ action, children, className = "", label }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; children: React.ReactNode; className?: string; label?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Explicit dispatch avoids React resetting uncontrolled fields on validation errors.
    startTransition(() => formAction(data));
  }} className={className} aria-label={label} aria-busy={pending}>
    <PendingContext value={pending}><fieldset disabled={pending} className="form-fieldset">{children}</fieldset></PendingContext>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="form-success" role="status">{state.success}</p>}
  </form>;
}
export function SubmitButton({ children, secondary = false }: { children: React.ReactNode; secondary?: boolean }) {
  return <Button variant={secondary ? "secondary" : "primary"}>{children}</Button>;
}
