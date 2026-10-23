import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { StudyDurationPicker } from "./StudyDurationPicker";
import "./study-lock.css";

export function TimeOfDayField({value,onChange,label="Reminder time",disabled=false}:{value:string;onChange:(value:string)=>void;label?:string;disabled?:boolean}) {
  const [open,setOpen]=useState(false);
  const [hour=9,minute=0]=value.split(':').map(Number);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button type="button" disabled={disabled} aria-label={label} className="w-full rounded-xl border border-white/10 bg-[#121212] px-3 py-2.5 text-left text-sm text-white">{hour%12||12}:{String(minute).padStart(2,'0')} {hour>=12?'PM':'AM'}</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[220] bg-black/70"/><Dialog.Content aria-describedby={undefined} className="browser-study-dialog fixed left-1/2 top-1/2 z-[221] -translate-x-1/2 -translate-y-1/2"><Dialog.Title className="sr-only">{label}</Dialog.Title><StudyDurationPicker key={value} timeOfDay title={label} minutes={hour*60+minute} onCancel={()=>setOpen(false)} onConfirm={next=>{onChange(`${String(Math.floor(next/60)).padStart(2,'0')}:${String(next%60).padStart(2,'0')}`);setOpen(false);}}/></Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
