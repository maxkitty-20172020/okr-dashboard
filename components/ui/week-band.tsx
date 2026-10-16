import Link from "next/link";
import { NoChangeButton } from "@/components/progress-form";
export type WeekBandItem = { id: string; title: string; ownerName: string; version: number; canConfirm: boolean; href: string };
export function WeekBand({ written, total, pending, boss }: { written: number; total: number; pending: WeekBandItem[]; boss: boolean }) {
  return <section className="week-band" aria-label="本周进展"><div><h2>本周进展</h2><p className="week-numbers">已写 {written} / {total}</p><p className="small">没变化点「暂无变化」也算写过</p></div><div className="week-pending">{pending.length ? pending.map(item => <div className="week-item" key={item.id}><Link href={item.href}>{item.title}</Link>{!boss && item.canConfirm ? <NoChangeButton taskId={item.id} version={item.version} /> : <span className="small">{item.ownerName} 还没写</span>}</div>) : <p>这周都写完了</p>}</div></section>;
}
