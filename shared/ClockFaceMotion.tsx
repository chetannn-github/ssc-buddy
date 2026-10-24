import type { ReactNode } from "react";

/** Keep the dial stable while only the hour/minute highlight moves. */
export function ClockFaceMotion({ mode, children }: { mode: string; children: ReactNode }) {
  return <div className="clock-face-motion" data-clock-mode={mode} style={{position:"absolute",inset:0}}>{children}</div>;
}
