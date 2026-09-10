import Link from "next/link";

const steps = [
  {
    title: "先写清这件事",
    body: "名称写具体动作，不要只写「跟进」「处理」。完成标准写清交付什么、做到什么程度才算完成。主负责人只能是填报成员。",
  },
  {
    title: "约定下一步和跟进日",
    body: "创建时必须写下一步动作和下次跟进日期。完成期限还不确定可以留空。关联范围可填站点、产品线或 SKU。",
  },
  {
    title: "需要别人时再加协作",
    body: "创建后再安排协作者，写清对方交付内容和期限。协作者只更新自己的交付，不能改整体状态。",
  },
  {
    title: "持续更新，不要删除",
    body: "有进展就记事实；没变化就点「确认暂无变化」。完成或取消后可以归档，历史会保留。任务不能删除。",
  },
  {
    title: "谁能改、谁只能看",
    body: "yjc 是老板账号，只能看。cjy、lgq、zfc 可以新建和更新。周期汇报和任务进展是两套记录，都要写已经发生的事。",
  },
];

export function FillingGuide({
  example,
  fullPage = false,
  writable = false,
}: {
  example?: { id: string; title: string } | null;
  fullPage?: boolean;
  writable?: boolean;
}) {
  return (
    <aside className="surface detail-section history-section">
      <h2>填写指南</h2>
      <p className="section-help">对照案例填关键字段。空着完成标准或下一步，后面很难跟进。</p>
      <ol className="guide-list">
        {steps.map((step, index) => (
          <li key={step.title}>
            <strong>
              <span className="guide-index">{index + 1}</span>
              {step.title}
            </strong>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="guide-actions">
        {example ? <Link href={`/tasks/${example.id}`}>打开填写案例</Link> : null}
        {fullPage ? (writable ? <Link href="/tasks/new">去新建任务</Link> : null) : <Link href="/guide">查看完整指南</Link>}
      </div>
    </aside>
  );
}
