"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="page empty-state"><h1>暂时无法加载看板</h1><p>请重试。尚未提交的内容不会自动保存。</p><button className="button" onClick={reset}>重新加载</button></div>; }
