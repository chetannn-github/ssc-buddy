import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Animate the dial only; the stable parent retains pointer capture and values. */
export function ClockFaceMotion({ mode, children }: { mode: string; children: ReactNode }) {
  const face=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(typeof matchMedia!=="undefined"&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const animation=face.current?.animate?.([
      {opacity:0.2,transform:"scale(.94)"},
      {opacity:1,transform:"scale(1)"},
    ],{duration:220,easing:"cubic-bezier(.2,.7,.2,1)"});
    return()=>animation?.cancel();
  },[mode]);
  return <div ref={face} className="clock-face-motion" data-clock-mode={mode} style={{position:"absolute",inset:0,transformOrigin:"center"}}>{children}</div>;
}
