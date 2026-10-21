import { useLayoutEffect, useRef, useState } from "react";
export function SlidingTabs({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const previous = useRef(value);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, animate: false });
  useLayoutEffect(() => {
    const update = () => {
      const active = Array.from(
        row.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      ).find((button) => button.dataset["value"] === value);
      if (!active) return;
      const animate = previous.current !== value;
      setIndicator((current) =>
        current.left === active.offsetLeft && current.width === active.offsetWidth
          ? current
          : { left: active.offsetLeft, width: active.offsetWidth, animate },
      );
      const container = viewport.current;
      if (container) {
        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        const visibleRight = container.scrollLeft + container.clientWidth;
        if (left < container.scrollLeft || right > visibleRight) {
          container.scrollTo({
            left: left < container.scrollLeft ? left : right - container.clientWidth,
            behavior: "auto",
          });
        }
      }
      previous.current = value;
    };
    update();
    const observer = new ResizeObserver(update);
    if (row.current) observer.observe(row.current);
    return () => observer.disconnect();
  }, [value, options]);
  return (
    <div ref={viewport} className="min-w-0 max-w-full shrink-0 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        ref={row}
        role="group"
        aria-label={label}
        className="relative isolate flex w-max gap-1 rounded-lg bg-white/5 p-0.5"
      >
        {indicator.width > 0 && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0.5 rounded-md bg-primary motion-reduce:transition-none ${indicator.animate ? "transition-[left,width] duration-[260ms] ease-in-out" : ""}`}
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
        {options.map((option) => (
          <button
            key={option}
            type="button"
            data-value={option}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs ${value === option ? "text-primary-foreground" : "text-zinc-400 hover:text-white"}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
