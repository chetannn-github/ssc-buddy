import { useEffect, useState, type ReactNode } from "react";
import "./animated-dropdown.css";

export function AnimatedDropdown({ open, className = "", children }: { open: boolean; className?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const timeout = window.setTimeout(() => setMounted(false), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150);
    return () => window.clearTimeout(timeout);
  }, [open]);
  if (!open && !mounted) return null;
  return <div className={`smooth-dropdown ${className}`} data-state={open ? "open" : "closed"} aria-hidden={!open} inert={!open}>{children}</div>;
}
