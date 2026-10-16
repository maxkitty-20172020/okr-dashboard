"use client";
import { useId, useState, type ReactNode } from "react";

/** Native disclosure: Enter/Space work without custom keyboard handlers. */
export function Disclosure({ title, children, className = "", id, defaultOpen = false, ariaLabel, variant = "secondary" }: {
  title: ReactNode; children: ReactNode; className?: string; id?: string;
  defaultOpen?: boolean; ariaLabel?: string; variant?: "secondary" | "text";
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const contentId = useId();
  return <details id={id} className={`disclosure ${className}`} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary role="button" aria-label={ariaLabel} aria-expanded={expanded} aria-controls={contentId} className={`button ${variant} disclosure-trigger`}>
      {title}<svg className="disclosure-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <div id={contentId} className="disclosure-content">{children}</div>
  </details>;
}
