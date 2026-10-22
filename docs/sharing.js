(function(){
'use strict';
const $=id=>document.getElementById(id),P=window.JukeboxPurchase;
let current=null;
const urlToken=new URLSearchParams(location.hash.slice(1)).get('ticket');
function render(detail){
 current=detail||null;
 $('ticketSharing').hidden=!current;
 if(!current)return;
 $('ticketLinkStatus').hidden=true;
 const order=P.findOrder(current.token),isOwner=order?.tokens.includes(current.token);
 $('ticketChoices').replaceChildren();
 if(isOwner&&order.quantity>1){
  $('shareDescription').textContent=(order.complete?'구매한 '+order.quantity+'장 중':'발급된 티켓 중')+' 공유할 티켓을 선택하세요. 각 티켓을 한 분씩 보내주세요.';
  order.tokens.forEach((token,i)=>{
   if(!P.readTicket(token)?.ticket)return;
   const a=document.createElement('a');a.href=P.ticketUrl(token);
   const cached=P.readTicket(token)?.ticket;
   a.textContent=(i+1)+'번 티켓'+(cached?.serial?' · No. '+String(cached.serial).padStart(4,'0'):'');
   if(token===current.token){a.className='selected';a.setAttribute('aria-current','page');}
   $('ticketChoices').append(a);
  });
 }else $('shareDescription').textContent='이 링크는 현재 티켓 1장의 링크예요. 한 분에게 보내주세요.';
 const text='JUKEBOX 공연 티켓이 도착했어요. 11월 21일 오후 6시, 논현 재즈클럽 그루브에서 만나요.\n'+P.ticketUrl(current.token);
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 $('smsTicket').href='sms:'+(ios?'&':'?')+'body='+encodeURIComponent(text);
}
$('copyTicketLink').addEventListener('click',async()=>{
 if(!current)return;try{await P.copy(P.ticketUrl(current.token));$('shareStatus').textContent='현재 티켓의 링크를 복사했어요.';}catch(e){$('shareStatus').textContent=e.message;}
});
$('shareTicket').addEventListener('click',async()=>{
 if(!current)return;
 const data={title:'JUKEBOX 공연 티켓',text:'11월 21일 오후 6시, 논현 재즈클럽 그루브에서 만나요.',url:P.ticketUrl(current.token)};
 try{
  if(navigator.share){await navigator.share(data);$('shareStatus').textContent='공유창을 닫았어요.';}
  else{await P.copy(data.url);$('shareStatus').textContent='링크를 복사했어요. 카카오톡이나 문자에 붙여넣어 주세요.';}
 }catch(e){if(e.name!=='AbortError')$('shareStatus').textContent='공유창을 열지 못했어요. 링크 복사를 이용해 주세요.';}
});
window.addEventListener('jukebox:ticket',e=>render(e.detail));
window.addEventListener('jukebox:ticket-missing',()=>{render(null);$('ticketLinkStatus').hidden=false;$('ticketLinkStatus').textContent='발급 기록을 찾지 못했어요. 공유해 준 분에게 확인해 주세요.';});
window.addEventListener('jukebox:ticket-error',e=>{if(!current){$('ticketLinkStatus').hidden=false;$('ticketLinkStatus').textContent=e.detail||'티켓을 불러오지 못했어요. 아래 내 티켓 다시 확인을 눌러주세요.';}});
if(urlToken){$('registration').hidden=true;$('ticketLinkStatus').hidden=false;if(!P.tokenPattern.test(urlToken))$('ticketLinkStatus').textContent='올바르지 않은 티켓 링크예요. 공유해 준 분에게 다시 받아주세요.';}
render(window.Jukebox.currentTicket);
if(!urlToken&&!window.Jukebox.currentTicket)$('ticketLinkStatus').hidden=true;
// Switching tickets reloads the controller so rotations/check state never cross tickets.
window.addEventListener('hashchange',()=>location.reload());
})();