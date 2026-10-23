(function(){
'use strict';
const vinyl=document.getElementById('vinylButton');
const end=document.getElementById('tonearmEnd');
const screen=vinyl?.closest('.kiosk-screen');
const crop=vinyl?.querySelector('.tonearm-window');
if(!vinyl||!end||!screen||!crop)return;
let frame=0;
function position(){
 frame=0;
 if(!vinyl.offsetWidth)return;
 const letter=end.getBoundingClientRect();
 const bounds=crop.getBoundingClientRect();
 const panel=screen.getBoundingClientRect();
 // The visible arm ends at the middle of “스”; its virtual pivot stays offscreen.
 crop.style.setProperty('--tonearm-cut',Math.max(0,letter.left+letter.width/2-bounds.left)+'px');
 crop.style.setProperty('--tonearm-length',Math.max(12,panel.right-screen.clientLeft+28-bounds.left-4)+'px');
}
function schedule(){if(!frame)frame=requestAnimationFrame(position);}
if(window.ResizeObserver){
 const observer=new ResizeObserver(schedule);
 [screen,vinyl,end].forEach(element=>observer.observe(element));
}
window.addEventListener('resize',schedule,{passive:true});
document.fonts?.ready.then(schedule);
position();
})();
