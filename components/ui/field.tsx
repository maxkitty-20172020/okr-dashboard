import { cloneElement, isValidElement, useId, type ReactNode, type HTMLAttributes } from "react";
export function Field({ label, help, error, hintBelow, children, className = "" }: { label: string; help?: string; error?: string; hintBelow?: string; children: ReactNode; className?: string }) {
  const id = useId();
  const control = isValidElement<HTMLAttributes<HTMLElement>>(children) ? cloneElement(children, { "aria-describedby": [help && `${id}-help`, error && `${id}-error`, hintBelow && `${id}-below`].filter(Boolean).join(" ") || undefined, "aria-invalid": error ? true : undefined }) : children;
  return <div className={`ui-field ${error ? "field-error" : ""} ${className}`}><label><span className="field-label">{label}</span>{help && <span className="field-hint" id={`${id}-help`}>{help}</span>}{control}</label>{hintBelow && <p className="required-hint" id={`${id}-below`}>{hintBelow}</p>}{error && <p id={`${id}-error`} role="alert">{error}</p>}</div>;
}
