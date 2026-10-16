import type { ReactNode } from "react";
export function Lane({ id, title, count, help, empty = "这里没有事项。", children }: { id: string; title: string; count: number; help: string; empty?: string; children: ReactNode }) {
  return <section className="lane" aria-labelledby={`${id}-title`} id={id}><header><h2 id={`${id}-title`}>{title} <span className="lane-count">{count}</span></h2><p className="muted small">{help}</p></header><div className="lane-cards">{count ? children : <p className="lane-empty">{empty}</p>}</div></section>;
}
