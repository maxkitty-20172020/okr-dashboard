import Link from "next/link";
export default function MissingTask() { return <div className="page empty-state"><h1>没有找到这条任务</h1><p>链接可能已失效，请返回任务清单查找。</p><Link className="button" href="/tasks">返回任务清单</Link></div>; }
