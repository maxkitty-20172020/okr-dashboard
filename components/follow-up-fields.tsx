"use client";
import { useState } from "react";

export function FollowUpFields({ today, currentDate = "" }: { today: string; currentDate?: string }) {
  const [preset, setPreset] = useState("in3days");
  return <>
    <label>什么时候再看一眼？<span className="field-hint">选个跟进日，到时再确认进展。例：3 天后。</span>
      <select name="followPreset" value={preset} onChange={e => setPreset(e.target.value)}>
        <option value="tomorrow">明天</option><option value="in3days">3 天后</option>
        <option value="nextMonday">下周一</option><option value="custom">选日期…</option>
      </select>
    </label>
    {preset === "custom" && <label>跟进日期<span className="field-hint">不能早于今天。例：选择下次能拿到结果的日期。</span>
      <input name="nextFollowUpAt" type="date" min={today} defaultValue={currentDate >= today ? currentDate : today} required />
    </label>}
  </>;
}
