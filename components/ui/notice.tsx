"use client";
import { useState, type ReactNode } from "react";
export function Notice({ tone = "plain", children, dismissible = false }: { tone?: "ok" | "risk" | "plain"; children: ReactNode; dismissible?: boolean }) {
  const [visible, setVisible] = useState(true);
  return visible ? <div className={`ui-notice tone-${tone}`} role={tone === "risk" ? "alert" : "status"}>{children}{dismissible && <button type="button" aria-label="关闭提示" onClick={() => setVisible(false)}>×</button>}</div> : null;
}
