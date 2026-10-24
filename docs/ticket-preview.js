(function(){
'use strict';
const ticket=document.getElementById('ticket'),area=document.getElementById('previewRotateArea');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let angle=-8,target=-8,raf=0,gesture=null;
function draw(){
 angle=reduced?target:angle+(target-angle)*.22;
 if(Math.abs(target-angle)<.05)angle=target;
 ticket.style.transform='rotateX(3deg) rotateY('+angle+'deg)';
 const back=Math.cos(angle*Math.PI/180)<0;
 ticket.querySelector('.ticket-front').setAttribute('aria-hidden',String(back));
 ticket.querySelector('.ticket-back').setAttribute('aria-hidden',String(!back));
 raf=angle===target?0:requestAnimationFrame(draw);
}
function render(){if(!raf)raf=requestAnimationFrame(draw);}
area.addEventListener('pointerdown',e=>{
 if(!e.isPrimary||e.button!==0)return;
 gesture={id:e.pointerId,x:e.clientX,y:e.clientY,angle:target,axis:null};
 area.setPointerCapture(e.pointerId);
});
area.addEventListener('pointermove',e=>{
 if(!gesture||e.pointerId!==gesture.id)return;
 const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
 if(!gesture.axis){
  if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
  gesture.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';
 }
 if(gesture.axis!=='x')return;
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
// This page has no issuance, restore, check-in, or submission controller.
// The only backend operation is the public guestbook read.
const api=new window.Jukebox.TicketAPI();
const list=document.getElementById('previewMessages'),status=document.getElementById('previewMessagesStatus'),retry=document.getElementById('previewRetry');
let loading=false;
async function loadMessages(){
 if(loading)return;loading=true;retry.hidden=true;list.setAttribute('aria-busy','true');
 status.textContent='글을 불러오고 있어요.';
 try{
  const data=await api.request('guestbook');
  if(!Array.isArray(data?.messages))throw new Error('Invalid guestbook');
  const messages=data.messages.filter(x=>typeof x==='string'&&x.trim()).reverse();
  const fragment=document.createDocumentFragment();
  for(const message of messages){const li=document.createElement('li');li.textContent=message;fragment.append(li);}
  list.replaceChildren(fragment);status.textContent=messages.length?'':'아직 남겨진 글이 없어요.';
 }catch{status.textContent='글을 불러오지 못했어요. 다시 시도해 주세요.';retry.hidden=false;}
 finally{loading=false;list.setAttribute('aria-busy','false');}
}
retry.addEventListener('click',loadMessages);loadMessages();
})();
