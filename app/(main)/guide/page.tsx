import { visibleTaskWhere } from "@/lib/task-visibility";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { StatusBadge } from "@/components/ui/status-badge";
export const dynamic = "force-dynamic";
export default async function GuidePage() {
  const user = await requireSession();
  const example = await prisma.task.findFirst({ where: { AND: [visibleTaskWhere(user)], title: { startsWith: "【填写案例】" }, archivedAt: null }, select: { id: true, title: true }, orderBy: { createdAt: "desc" } });
  return <div className="page">
    <header className="page-heading"><div><p className="eyebrow">怎么填</p><h1>填写指南</h1><p className="muted">先记一件事，再按当前情况持续更新。</p></div><div className="heading-actions">{example && <Link className="button secondary" href={`/tasks/${example.id}`}>打开填写案例</Link>}{user.role !== "BOSS" ? <Link className="button" href="/tasks/new">＋ 记一件事</Link> : null}</div></header>
    <div className="guide-sections">
      <section className="surface detail-section guide-step"><div><p className="eyebrow">01</p><h2>记一件事</h2><p>只需回答 3 个问题：这件事是什么？做到什么算完成？谁负责？</p><p className="section-help">默认由你负责，3 天后再看一眼。领域、期限、目标和重要程度可以在“更多设置”中选填，以后再补。</p></div><div className="guide-example" aria-label="记一件事示意"><StatusBadge>填写示意</StatusBadge><dl className="summary-grid"><div className="span-all"><dt>这件事是什么？</dt><dd>确认旺季备货方案</dd></div><div className="span-all"><dt>做到什么算完成？</dt><dd>拿到销量预测、补货数量与供应商出货排期</dd></div><div><dt>谁负责？</dt><dd>我</dd></div></dl></div></section>
      <section className="surface detail-section guide-step"><div><p className="eyebrow">02</p><h2>更新进展</h2><p>先选“现在怎么样”，再补充这次的变化。</p><p className="section-help">有风险或卡住时写原因与支持；做完时写最后结果；没变化只确认情况、调整跟进日。协作者更新自己的交付，主负责人维护整体进展。</p></div><div className="guide-example" aria-label="更新进展示意"><StatusBadge>填写示意</StatusBadge><div className="badges"><StatusBadge tone="ok">顺利推进</StatusBadge><StatusBadge tone="risk">有风险</StatusBadge><StatusBadge tone="wait">在等别人</StatusBadge><StatusBadge tone="risk">卡住了</StatusBadge><StatusBadge tone="done">做完了</StatusBadge><StatusBadge>没变化</StatusBadge></div><p>例：已拿到销售预测，下一步确认供应商排期。</p></div></section>
      <section className="surface detail-section guide-step"><div><p className="eyebrow">03</p><h2>本周进展</h2><p>主负责人更新进展或确认“暂无变化”，就会自动记录本周进展。</p><p className="section-help">不用再写一遍，已有事实会保留。每周进展页按成员列出还没写的事项；月度看关键结果、季度看目标。完成协作或关键节点不会自动完成整件事。</p></div><div className="guide-example guide-week" aria-label="本周进展示意"><StatusBadge>填写示意</StatusBadge><h3>本周进展</h3><p>更新进展 → 自动记为已写</p><p>暂无变化 → 同样算写过</p><p className="small">每次更新都有记录，方便回看。</p></div></section>
    </div>
  </div>;
}
