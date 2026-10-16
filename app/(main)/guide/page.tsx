import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { FillingGuide } from "@/components/filling-guide";

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const user = await requireSession();
  const example = await prisma.task.findFirst({
    where: { title: { startsWith: "【填写案例】" }, archivedAt: null },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });
  const writable = user.role !== "BOSS";

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">怎么填</p>
          <h1>填写指南</h1>
          <p className="muted">回答 3 个问题就能新建；更新时先选现在怎么样，本周进展会自动记录。</p>
        </div>
        <div className="heading-actions">
          {example ? <Link className="button secondary" href={`/tasks/${example.id}`}>打开填写案例</Link> : null}
          {writable ? <Link className="button" href="/tasks/new">＋ 新建任务</Link> : <span className="readonly-label">老板账号 · 只读</span>}
        </div>
      </header>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="surface detail-section">
            <h2>新建只需 3 个问题</h2>
            <p className="section-help">写清事情、完成标准和负责人，其他设置可以以后再补。</p>
            <dl className="summary-grid">
              <div className="span-all"><dt>这件事是什么？</dt><dd>写具体动作，例如「完成旺季备货方案并确认出货排期」，不要只写「备货」或「跟进」。</dd></div>
              <div className="span-all"><dt>做到什么算完成？</dt><dd>写交付什么、做到什么程度才算完成。例如确认销量预测、补货数量和供应商出货排期，并同步给协作人。</dd></div>
              <div><dt>谁负责？</dt><dd>默认选你，也可以指定其他填报成员。</dd></div>
              <div><dt>下一步 / 跟进日</dt><dd>默认 3 天后跟进；可选明天、下周一或自选日期。下一步留空默认为「明确推进计划」。</dd></div>
              <div><dt>责任领域</dt><dd>更多设置中选填，默认其他事项。期限、关联目标、重要程度也可选填。</dd></div>
              <div><dt>关联范围</dt><dd>可选。站点、产品线、团队或 SKU，方便别人一眼看懂覆盖面。</dd></div>
            </dl>
          </section>
          <section className="surface detail-section">
            <h2>创建之后怎么跟进</h2>
            <p className="section-help">主负责人更新整体情况，协作者只更新自己的交付。</p>
            <dl className="summary-grid">
              <div className="span-all"><dt>更新进展</dt><dd>先选「现在怎么样」，再写进展。风险或卡住必须写原因与支持；等待时可写在等谁；完成写最后结果。没有变化选「没变化」，再选跟进日。</dd></div>
              <div className="span-all"><dt>安排协作</dt><dd>写清对方交付内容和期限。完成某个协作或关键节点，不会自动把整件事标成完成。</dd></div>
              <div><dt>周期汇报</dt><dd>本周更新进展即视为已汇报，不用再写一遍；确认没变化也算。月复盘看关键结果，季评估看目标。</dd></div>
              <div><dt>结束任务</dt><dd>完成选「做完了」，不再做从次要入口选「不做了（取消）」并写原因。然后可以归档，需要时再恢复。</dd></div>
            </dl>
          </section>
        </div>
        <FillingGuide example={example} fullPage writable={writable} />
      </div>
    </div>
  );
}
