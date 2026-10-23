import { useLayoutEffect, useState, type RefObject } from "react";

/** One measured highlight moves between targets, including variable-width chips. */
export function SlidingHighlight({container,active,color="var(--accent,#c6dfab)",radius=12,borderColor}:{container:RefObject<HTMLDivElement|null>;active:string|undefined;color?:string;radius?:number;borderColor?:string}) {
  const [box,setBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  useLayoutEffect(()=>{
    let stopped=false,observer:ResizeObserver|undefined;
    const setup=()=>{
      const root=container.current;if(stopped||!root)return;
      const measure=()=>{
      if(stopped)return;
      const target=[...root.querySelectorAll<HTMLElement>('[data-slide-key]')].find(item=>item.dataset['slideKey']===active);
      if(!target){setBox(null);return;}
      const bounds=target.getBoundingClientRect(),parent=root.getBoundingClientRect();
      const next={left:bounds.left-parent.left+root.scrollLeft,top:bounds.top-parent.top+root.scrollTop,width:bounds.width,height:bounds.height};
      setBox(previous=>previous&&Object.keys(next).every(key=>previous[key as keyof typeof next]===next[key as keyof typeof next])?previous:next);
    };
      measure();observer=new ResizeObserver(measure);observer.observe(root);
      root.querySelectorAll<HTMLElement>('[data-slide-key]').forEach(target=>observer!.observe(target));
    };
    // Child layout effects may run before the parent's ref is attached.
    if(container.current)setup();else queueMicrotask(setup);
    return()=>{stopped=true;observer?.disconnect();};
  },[container,active]);
  const reduced=typeof matchMedia!=="undefined"&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  return box?<span aria-hidden="true" className="sliding-highlight" style={{position:"absolute",left:0,top:0,width:box.width,height:box.height,transform:`translate(${box.left}px, ${box.top}px)`,borderRadius:radius,background:color,boxSizing:"border-box",border:borderColor?`2px solid ${borderColor}`:undefined,pointerEvents:"none",zIndex:borderColor?1:-1,transition:reduced?"none":"transform 240ms cubic-bezier(.2,.7,.2,1), width 240ms cubic-bezier(.2,.7,.2,1), height 240ms ease, border-color 240ms ease"}}/>:null;
}
