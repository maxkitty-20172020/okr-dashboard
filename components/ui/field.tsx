import { cloneElement, isValidElement, useId, type ReactNode, type HTMLAttributes } from "react";
export function Field({ label, help, error, children, className = "" }: { label: string; help: string; error?: string; children: ReactNode; className?: string }) {
  const id = useId();
  const control = isValidElement<HTMLAttributes<HTMLElement>>(children) ? cloneElement(children, { "aria-describedby": `${id}-help${error ? ` ${id}-error` : ""}`, "aria-invalid": error ? true : undefined }) : children;
  return <div className={`ui-field ${error ? "field-error" : ""} ${className}`}><label><span className="field-label">{label}</span><span className="field-hint" id={`${id}-help`}>{help}</span>{control}</label>{error && <p id={`${id}-error`} role="alert">{error}</p>}</div>;
}
