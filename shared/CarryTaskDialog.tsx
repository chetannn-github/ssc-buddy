import { useEffect, useRef } from "react";
import "./carry-task-dialog.css";

export function CarryTaskDialog({ name, busy, error, onAdd, onClose }: {
  name: string; busy: boolean; error: string;
  onAdd: (offset: 0 | 1) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="carry-task-dialog" aria-labelledby="carry-task-title" aria-describedby="carry-task-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <h2 id="carry-task-title">Add Task Again</h2>
    <p id="carry-task-description">Add “{name}” to today or tomorrow. The original task stays in your history.</p>
    {error && <p role="alert" className="carry-task-error">{error}</p>}
    <div className="carry-task-actions"><button type="button" disabled={busy} onClick={() => onAdd(0)}>Add to Today</button><button type="button" disabled={busy} onClick={() => onAdd(1)}>Add to Tomorrow</button></div>
    <button type="button" className="carry-task-cancel" disabled={busy} onClick={onClose}>{busy ? "Adding task…" : "Cancel"}</button>
  </dialog>;
}
