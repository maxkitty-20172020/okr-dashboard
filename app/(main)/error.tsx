"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="page surface detail-section" role="alert"><h1>没加载出来</h1><p className="muted">请重试。尚未提交的内容不会自动保存。</p><Button type="button" onClick={reset}>重试</Button></div>;
}
