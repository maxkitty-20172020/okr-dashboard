export default function Loading() {
  return <div className="page" role="status" aria-label="正在加载"><span className="sr-only">正在加载事项…</span><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-heading" /><div className="lanes-grid" aria-hidden="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div></div>;
}
