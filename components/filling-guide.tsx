import Link from "next/link";

const steps = [
  { title: "只回答 3 个问题", body: "这件事是什么？做到什么算完成？谁负责？默认由你负责。例：确认旺季备货；拿到排期并定下补货数量。" },
  { title: "选个日子再看一眼", body: "默认 3 天后跟进，也可选明天、下周一或具体日期。更多设置可以以后再补；下一步留空会记为「明确推进计划」。" },
  { title: "先选现在怎么样", body: "顺利推进、有风险、在等别人、卡住了、做完了、没变化。风险或卡住时写明需要什么支持；做完时写最后结果；不做了则写取消原因。" },
  { title: "本周进展自动记录", body: "主负责人更新进展或确认没变化，就算完成本周汇报，不用再写一遍。没变化只确认情况和调整跟进日，保留已有事实。月复盘看关键结果，季评估看目标。" },
  { title: "需要别人时再加协作", body: "创建后再安排协作者，写清对方交付内容和期限。协作者更新自己的交付，主负责人维护整体进展。老板只读；完成或取消后可以归档，历史保留。" },
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
      <p className="section-help">先记下一件事，再按当前情况持续更新。每个问题旁都有帮助和例子。</p>
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
