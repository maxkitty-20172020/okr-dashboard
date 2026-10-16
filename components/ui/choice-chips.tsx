import type { ReactNode } from "react";
export type ChoiceOption = { value: string; label: string; tone?: "risk" | "done"; disabled?: boolean };
export type ChoiceChipsProps = { name: string; legend: ReactNode; help?: string; options: ChoiceOption[]; defaultValue?: string; value?: string; required?: boolean; onChange?: (value: string) => void; className?: string };
export function ChoiceChips({ name, legend, help, options, defaultValue, value, required, onChange, className = "" }: ChoiceChipsProps) {
  return <fieldset className={`choice-field ${className}`}><legend>{legend}</legend>{help && <p className="field-hint">{help}</p>}<div className="choice-chips">{options.map(option => <label className={`choice-chip ${option.tone ?? ""}`} key={option.value}>
    <input type="radio" name={name} value={option.value} required={required} disabled={option.disabled} {...(value !== undefined ? { checked: value === option.value } : { defaultChecked: defaultValue === option.value })} onChange={onChange ? () => onChange(option.value) : undefined} /><span>{option.label}</span>
  </label>)}</div></fieldset>;
}
