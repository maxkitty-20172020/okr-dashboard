"use client";
import { useState } from "react";
import { Field } from "./ui/field";

/** Human-readable editor; the existing cycle field still submits YYYY-Qn. */
export function QuarterField({ cycle }: { cycle: string }) {
  const [year, setYear] = useState(cycle.split("-Q")[0]);
  const [quarter, setQuarter] = useState(cycle.split("-Q")[1] ?? "1");
  return <div className="quarter-field"><input type="hidden" name="cycle" value={`${year.padStart(4, "0")}-Q${quarter}`} /><Field label="年份" help="目标所属年份。"><input type="number" required min="0" max="9999" value={year} onChange={event => setYear(event.target.value)} placeholder="例：2026" /></Field><Field label="季度" help="目标所属季度。"><select value={quarter} onChange={event => setQuarter(event.target.value)}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>第 {value} 季度</option>)}</select></Field></div>;
}
