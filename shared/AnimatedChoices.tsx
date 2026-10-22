import { type CSSProperties, useEffect, useState } from "react";
import "./animated-choices.css";

type Choice = { value: string; label: string; disabled?: boolean };

/** Shared by web setup screens and Windows widgets. */
export function AnimatedChoices({ options, value, onChange, label, className = "" }: {
  options: readonly Choice[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  const selected = options.findIndex(option => option.value === value);
  const [lastSelected, setLastSelected] = useState(Math.max(0, selected));
  // Keep the highlight in place when a custom value clears the preset selection.
  useEffect(() => { if (selected >= 0) setLastSelected(selected); }, [selected]);
  const index = selected >= 0 ? selected : lastSelected;
  return <div role="group" aria-label={label} className={`animated-choices ${className}`} style={{ "--choice-count": options.length } as CSSProperties}>
    <span aria-hidden="true" className="animated-choice-indicator" style={{ left: `calc(${index} * (100% + var(--choice-gap)) / var(--choice-count))`, opacity: selected < 0 ? 0 : 1 }} />
    {options.map(option => <button key={option.value} type="button" disabled={option.disabled} aria-pressed={value === option.value} onClick={() => onChange(option.value)}><span>{option.label}</span></button>)}
  </div>;
}
