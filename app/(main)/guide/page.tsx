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
          <p className="muted">先把责任和交付写清楚，再记录已经发生的进展。任务跨周保留，不要指望靠删除抹掉记录。</p>
        </div>
        <div className="heading-actions">
          {example ? <Link className="button secondary" href={`/tasks/${example.id}`}>打开填写案例</Link> : null}
          {writable ? <Link className="button" href="/tasks/new">＋ 新建任务</Link> : <span className="readonly-label">老板账号 · 只读</span>}
        </div>
      </header>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="surface detail-section">
            <h2>创建任务时必填</h2>
            <p className="section-help">这些字段决定别人能不能接手跟进。写不清楚，后面只能反复问。</p>
            <dl className="summary-grid">
              <div className="span-all"><dt>任务名称</dt><dd>写具体动作，例如「完成旺季备货方案并确认出货排期」，不要只写「备货」或「跟进」。</dd></div>
              <div className="span-all"><dt>完成标准</dt><dd>写交付什么、做到什么程度才算完成。例如确认销量预测、补货数量和供应商出货排期，并同步给协作人。</dd></div>
              <div><dt>主负责人</dt><dd>只能选填报成员。老板账号不参与填报。</dd></div>
              <div><dt>下一步 / 跟进日</dt><dd>创建时必须写。完成期限不确定可以留空。</dd></div>
              <div><dt>责任领域</dt><dd>业务、团队、库存或其他。用来筛选，不替代任务名称。</dd></div>
              <div><dt>关联范围</dt><dd>可选。站点、产品线、团队或 SKU，方便别人一眼看懂覆盖面。</dd></div>
            </dl>
          </section>
          <section className="surface detail-section">
            <h2>创建之后怎么跟进</h2>
            <p className="section-help">主负责人更新整体情况，协作者只更新自己的交付。</p>
            <dl className="summary-grid">
              <div className="span-all"><dt>更新进展</dt><dd>写已经发生的变化，不要只写计划。没有变化就选「确认暂无变化」，并改下次跟进日期。</dd></div>
              <div className="span-all"><dt>安排协作</dt><dd>写清对方交付内容和期限。完成某个协作或关键节点，不会自动把整件事标成完成。</dd></div>
              <div><dt>周期汇报</dt><dd>周更新看任务，月复盘看关键结果，季评估看目标。没有记录就是未汇报。</dd></div>
              <div><dt>结束任务</dt><dd>完成后标「已完成」，不再做就标「已取消」。然后可以归档，需要时再恢复。</dd></div>
            </dl>
          </section>
        </div>
        <FillingGuide example={example} fullPage writable={writable} />
      </div>
    </div>
  );
}
