"use client";
import { createContext, startTransition, useActionState, useContext } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/task-service";

const PendingContext = createContext(false);

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
  const status = useFormStatus();
  const dispatched = useContext(PendingContext);
  const pending = status.pending || dispatched;
  return <button className={secondary ? "button secondary" : "button"} type="submit" disabled={pending}>{pending ? "保存中…" : children}</button>;
}
