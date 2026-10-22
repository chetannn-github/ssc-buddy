import { useEffect, useRef } from "react";

function SlotDigit({ value }: { value: string }) {
  const previous = useRef(value);
  const old = previous.current;
  useEffect(() => { previous.current = value; }, [value]);
  return <span className="focus-slot"><span key={value} className={old !== value ? "focus-slot-roll" : undefined} data-previous={old}>{value}</span></span>;
}

export function SlotTime({ value }: { value: string }) {
  return <span aria-label={value} className="focus-slot-time">{Array.from(value, (digit, index) => /\d/.test(digit)
    ? <SlotDigit key={value.length - index} value={digit} />
    : <span key={value.length - index}>{digit}</span>)}</span>;
}
