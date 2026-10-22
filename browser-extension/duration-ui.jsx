import React from 'react';
import { createRoot } from 'react-dom/client';
import { StudyDurationPicker } from '../desktop-widget/src/components/StudyDurationPicker';
const button=document.getElementById('duration-trigger'), value=document.getElementById('session-time');
let overlay;
function close() { overlay?.remove(); overlay=null; button.focus(); }
button.addEventListener('click',()=>{
  if(overlay)return;
  overlay=document.createElement('div');overlay.className='duration-overlay';
  const panel=document.createElement('section');panel.className='browser-study-dialog';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Study time');overlay.append(panel);document.body.append(overlay);
  const root=createRoot(panel);
  const dismiss=()=>{root.unmount();close();};
  root.render(<StudyDurationPicker minutes={Number(value.value)} onCancel={dismiss} onConfirm={minutes=>{value.value=String(minutes);document.getElementById('duration-label').textContent=minutes>=60?`${Math.floor(minutes/60)}h${minutes%60?` ${minutes%60}m`:''}`:`${minutes} min`;dismiss();}}/>);
});
document.addEventListener('keydown',event=>{if(!overlay)return;if(event.key==='Escape'){event.preventDefault();overlay.querySelector('button[aria-label]')?.focus();overlay.querySelectorAll('button')[overlay.querySelectorAll('button').length-2]?.click();}if(event.key==='Tab'){const nodes=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')];if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}}});
