import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CalendarPlus } from "lucide-react";
import "./carry-task-menu.css";

export type TaskMenuPosition = { x: number; y: number };

export function CarryTaskMenu({ name, position, busy, error, onAdd, onClose }: {
  name: string; position: TaskMenuPosition; busy: boolean; error: string;
  onAdd: (offset: 0 | 1) => void; onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="carry-task-menu-dismiss" onPointerDown={() => { if (!busy) onClose(); }} onContextMenu={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div ref={menu} role="menu" aria-label={`Add ${name} again`} aria-busy={busy} className="carry-task-menu" style={{ left: Math.max(8, Math.min(window.innerWidth - 216, position.x)), top: Math.max(8, Math.min(window.innerHeight - (error ? 160 : 100), position.y)) }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={event => {
      if (event.key === "Escape" || event.key === "Tab") { if (event.key === "Escape") event.preventDefault(); if (!busy) onClose(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      <button type="button" role="menuitem" tabIndex={-1} disabled={busy} onClick={() => onAdd(0)}><CalendarDays size={16} />Add to Today</button>
      <button type="button" role="menuitem" tabIndex={-1} disabled={busy} onClick={() => onAdd(1)}><CalendarPlus size={16} />Add to Tomorrow</button>
      {error && <p role="alert">{error}</p>}
    </div>
  </div>, document.body);
}
