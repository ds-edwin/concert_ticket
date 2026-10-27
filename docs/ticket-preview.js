(function(){
'use strict';
const ticket=document.getElementById('ticket'),area=document.getElementById('previewRotateArea');
// Anchor the control to the unrotated card's lower edge, including capped desktop sizes.
const controls=document.querySelector('.preview-controls'),viewer=document.querySelector('.preview-viewer');
function positionFlip(){
 controls.style.bottom=Math.max(0,viewer.clientHeight-area.offsetTop-ticket.offsetTop-ticket.offsetHeight+2)+'px';
}
const previewResize=new ResizeObserver(positionFlip);
previewResize.observe(area);previewResize.observe(ticket);positionFlip();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const restingAngle=-18;
let angle=restingAngle,target=restingAngle,raf=0,gesture=null;
let cueActive=false,cueStart=null,interacted=false;
function draw(time){
 if(cueActive){
  if(cueStart===null)cueStart=time;
  const progress=Math.min((time-cueStart)/1800,1);
  // A single slow turn demonstrates the gesture, then leaves the card angled.
  angle=target=restingAngle+26*Math.pow(Math.sin(Math.PI*progress),2);
  if(progress===1){cueActive=false;angle=target=restingAngle;}
 }else{
  angle=reduced?target:angle+(target-angle)*.22;
  if(Math.abs(target-angle)<.05)angle=target;
 }
 ticket.style.transform='rotateX(0deg) rotateY('+angle+'deg)';
 const back=Math.cos(angle*Math.PI/180)<0;
 ticket.querySelector('.ticket-front').setAttribute('aria-hidden',String(back));
 ticket.querySelector('.ticket-back').setAttribute('aria-hidden',String(!back));
 raf=cueActive||angle!==target?requestAnimationFrame(draw):0;
}
function render(){if(!raf)raf=requestAnimationFrame(draw);}
function takeControl(freeze=false){
 // Interrupt the cue from its visible pose; keep queued key/flip rotations intact.
 if(cueActive||freeze)target=angle;
 interacted=true;cueActive=false;
}
function startCue(){
 if(reduced||interacted)return;
 cueActive=true;cueStart=null;render();
}
area.addEventListener('pointerdown',e=>{
 if(!e.isPrimary||e.button!==0)return;
 takeControl(true);
 gesture={id:e.pointerId,x:e.clientX,angle};
 area.setPointerCapture(e.pointerId);
});
area.addEventListener('pointermove',e=>{
 if(!gesture||e.pointerId!==gesture.id)return;
 const dx=e.clientX-gesture.x;
 target=gesture.angle+dx*.85;ticket.classList.add('dragging');render();
});
function end(e){
 if(!gesture||e.pointerId!==gesture.id)return;
 gesture=null;ticket.classList.remove('dragging');
 if(area.hasPointerCapture(e.pointerId))area.releasePointerCapture(e.pointerId);
}
area.addEventListener('pointerup',end);area.addEventListener('pointercancel',end);area.addEventListener('lostpointercapture',end);
document.getElementById('previewFlip').addEventListener('click',()=>{takeControl();target=Math.round(target/180)*180+180;render();});
ticket.addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','Enter',' '].includes(e.key))return;
 e.preventDefault();takeControl();target+=e.key==='ArrowLeft'?-30:e.key==='ArrowRight'?30:180;render();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();parent.postMessage({type:'jukebox-preview-close'},location.origin);}});
draw(0);
// Wait for the poster so the cue remains visible on a slower connection.
const art=ticket.querySelector('.ticket-art');
if(art.complete)startCue();else art.addEventListener('load',startCue,{once:true});
})();
