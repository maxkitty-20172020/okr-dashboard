"use client";
import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { useActionPending } from "@/components/form-pending";
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "text"; size?: "lg" | "sm"; pending?: boolean };
export function Button({ variant = "primary", size, pending: supplied = false, children, className = "", disabled, type = "submit", ...props }: ButtonProps) {
  const status = useFormStatus();
  const dispatched = useActionPending();
  const pending = supplied || (type === "submit" && (status.pending || dispatched));
  return <button {...props} type={type} className={`button ui-button ${variant} ${size ?? ""} ${className}`} disabled={disabled || pending} aria-busy={pending || undefined}>{pending ? "保存中…" : children}</button>;
}
