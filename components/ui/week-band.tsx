import Link from "next/link";
import { NoChangeButton } from "@/components/progress-form";
import { Disclosure } from "./disclosure";
export type WeekBandItem = { id: string; title: string; ownerName: string; version: number; canConfirm: boolean; href: string };
type Group = { ownerId: string; ownerName: string; items: WeekBandItem[] };
export function WeekBand({ written, total, pending, boss, groups }: { written: number; total: number; pending: WeekBandItem[]; boss: boolean; groups?: Group[] }) {
  const groupedIds = new Set(groups?.flatMap(group => group.items.map(item => item.id)));
  const remaining = groups ? pending.filter(item => !groupedIds.has(item.id)) : pending;
  const row = (item: WeekBandItem, grouped = false) => <div className="week-item" key={item.id}><Link href={item.href}>{item.title}</Link>{!boss && item.canConfirm ? <><NoChangeButton taskId={item.id} version={item.version} /><Link className="text-link" href={`${item.href}#update`}>更新进展</Link></> : grouped ? null : <span className="small">{item.ownerName} 还没写</span>}</div>;
  return <section className="week-band" aria-label="本周进展"><div><h2>本周进展</h2><p className="week-numbers">已写 {written} / {total}</p>{!boss && <p className="small">没变化点「暂无变化」也算写过</p>}</div><div className="week-pending">{pending.length ? <>{groups?.map(group => <Disclosure defaultOpen className="pending-group" key={group.ownerId} title={<>{group.ownerName} <span className="small">还没写 {group.items.length}</span></>} variant="text"><div className="week-group-items">{group.items.map(item => row(item, true))}</div></Disclosure>)}{remaining.map(item => row(item))}</> : <p>这周都写完了</p>}</div></section>;
}
