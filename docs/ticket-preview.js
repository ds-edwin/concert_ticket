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
let angle=-8,target=-8,raf=0,gesture=null;
function draw(){
 angle=reduced?target:angle+(target-angle)*.22;
 if(Math.abs(target-angle)<.05)angle=target;
 ticket.style.transform='rotateX(0deg) rotateY('+angle+'deg)';
 const back=Math.cos(angle*Math.PI/180)<0;
 ticket.querySelector('.ticket-front').setAttribute('aria-hidden',String(back));
 ticket.querySelector('.ticket-back').setAttribute('aria-hidden',String(!back));
 raf=angle===target?0:requestAnimationFrame(draw);
}
function render(){if(!raf)raf=requestAnimationFrame(draw);}
area.addEventListener('pointerdown',e=>{
 if(!e.isPrimary||e.button!==0)return;
 gesture={id:e.pointerId,x:e.clientX,angle:target};
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
document.getElementById('previewFlip').addEventListener('click',()=>{target=Math.round(target/180)*180+180;render();});
ticket.addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','Enter',' '].includes(e.key))return;
 e.preventDefault();target+=e.key==='ArrowLeft'?-30:e.key==='ArrowRight'?30:180;render();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();parent.postMessage({type:'jukebox-preview-close'},location.origin);}});
draw();
})();
