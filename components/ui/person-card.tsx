import Link from "next/link";
import { StatusBadge } from "./status-badge";
export function PersonCard({ id, name, owned, assisting, blocked }: { id: string; name: string; owned: number; assisting: number; blocked: boolean }) {
  return <Link className="person-card" href={`/tasks?person=${id}`}><span className="avatar">{name.slice(-1)}</span><span><strong>{name}</strong><small>主责 {owned} · 协作 {assisting}</small></span><StatusBadge tone={blocked ? "risk" : "ok"}>{blocked ? "有事卡住" : "正常"}</StatusBadge></Link>;
}
