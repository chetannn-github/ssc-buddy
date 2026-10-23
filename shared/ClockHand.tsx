import { useLayoutEffect, useRef, useState } from "react";
import { nearestClockAngle } from "./clock-motion";

export function ClockHand({angle,dragging=false,radius=82}:{angle:number;dragging?:boolean;radius?:number}) {
  const initial=Number.isFinite(angle)?angle:0;
  const hand=useRef<SVGGElement>(null),last=useRef(initial);
  const [rotation,setRotation]=useState(initial);
  const reduced=typeof matchMedia!=="undefined"&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  useLayoutEffect(()=>{
    let current=last.current;
    const matrix=hand.current?getComputedStyle(hand.current).transform:'none';
    if(matrix!=='none'&&typeof DOMMatrixReadOnly!=='undefined'){
      const value=new DOMMatrixReadOnly(matrix);
      current=nearestClockAngle(current,Math.atan2(value.b,value.a)*180/Math.PI);
    }
    last.current=nearestClockAngle(current,angle);setRotation(last.current);
  },[angle,dragging,reduced]);
  return <svg viewBox="0 0 220 220" aria-hidden="true">
    <g ref={hand} data-clock-hand style={{transform:`rotate(${rotation}deg)`,transformOrigin:"110px 110px",transition:dragging||reduced?"none":"transform 220ms cubic-bezier(.2,.7,.2,1)"}}>
      <line x1={110} y1={110} x2={110} y2={110-radius}/><circle cx={110} cy={110-radius} r={17}/>
    </g><circle cx={110} cy={110} r={4}/>
  </svg>;
}
