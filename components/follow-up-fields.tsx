import { ChoiceChips } from "./ui/choice-chips";
import { Field } from "./ui/field";
export function FollowUpFields({ today, currentDate = "" }: { today: string; currentDate?: string }) {
  return <div className="follow-up-fields span-all"><ChoiceChips name="followPreset" legend="什么时候再看一眼？" help="选个跟进日，到时再确认进展。例：3 天后。" defaultValue="in3days" options={[{ value: "tomorrow", label: "明天" }, { value: "in3days", label: "3 天后" }, { value: "nextMonday", label: "下周一" }, { value: "custom", label: "选日期…" }]} /><div className="custom-follow-date"><Field label="跟进日期" help="不能早于今天。例：下次能拿到结果的日期。"><input name="nextFollowUpAt" type="date" min={today} defaultValue={currentDate >= today ? currentDate : today} /></Field></div></div>;
}
