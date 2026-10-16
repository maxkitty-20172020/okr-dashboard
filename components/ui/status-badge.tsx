import type { ReactNode } from "react";
export type Tone = "ok" | "risk" | "wait" | "plain" | "today" | "done";
export function StatusBadge({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`status-badge tone-${tone}`}>{tone === "done" && <span aria-hidden="true">✓ </span>}{children}</span>;
}
