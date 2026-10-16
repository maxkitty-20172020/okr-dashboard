import Link from "next/link";
export type TimelineItem = { id: string; who: string; action: string; time: string; title?: string; href?: string; body?: string };
export function Timeline({ items, empty = "还没有动态。" }: { items: TimelineItem[]; empty?: string }) {
  return items.length ? <ol className="timeline">{items.map(item => <li key={item.id}><p>{item.who} · {item.action}</p><time>{item.time}</time>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title && <p>{item.title}</p>}{item.body && <p className="history-body">{item.body}</p>}</li>)}</ol> : <p className="muted">{empty}</p>;
}
