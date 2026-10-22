(function(){
'use strict';
const $=id=>document.getElementById(id),P=window.JukeboxPurchase;
let current=null;
// Remove the retired information strip if an older HTML document is cached.
document.querySelectorAll('.event-strip').forEach(el=>el.remove());
const urlToken=new URLSearchParams(location.hash.slice(1)).get('ticket');
function render(detail){
 current=detail||null;
 $('ticketSharing').hidden=true;
 if(!current)return;
 $('ticketLinkStatus').hidden=true;
 const order=P.findOrder(current.token),isOwner=order?.tokens.includes(current.token);
 $('ticketChoices').replaceChildren();
 if(isOwner&&order.quantity>1){
  $('ticketSharing').hidden=false;
  $('shareDescription').textContent='티켓 '+order.quantity+'장의 링크를 한 분씩 보내주세요. 받는 분이 직접 이름을 등록합니다.';
  order.tokens.forEach((token,i)=>{
   
   const a=document.createElement('a');a.href=P.ticketUrl(token);
   const cached=P.readTicket(token)?.ticket;
   a.textContent=(i+1)+'번 티켓'+(cached?.serial?' · No. '+String(cached.serial).padStart(4,'0'):' · 이름 등록하기');
   if(token===current.token){a.className='selected';a.setAttribute('aria-current','page');}
   $('ticketChoices').append(a);
  });
 }

}
$('copyTicketLink').addEventListener('click',async()=>{
 if(!current)return;try{await P.copy(P.ticketUrl(current.token));$('shareStatus').textContent='현재 티켓의 링크를 복사했어요.';}catch(e){$('shareStatus').textContent=e.message;}
});
$('shareTicket').addEventListener('click',async()=>{
 if(!current)return;
 const data={title:'JUKEBOX 공연 티켓',text:'11월 21일 오후 6시, 논현 재즈클럽 그루브에서 만나요.',url:P.ticketUrl(current.token)};
 try{
  if(navigator.share){await navigator.share(data);$('shareStatus').textContent='';}
  else{await P.copy(data.url);$('shareStatus').textContent='링크를 복사했어요. 카카오톡이나 문자에 붙여넣어 주세요.';}
 }catch(e){if(e.name!=='AbortError')$('shareStatus').textContent='공유창을 열지 못했어요. 링크 복사를 이용해 주세요.';}
});
window.addEventListener('jukebox:ticket',e=>render(e.detail));
window.addEventListener('jukebox:ticket-missing',()=>{if(P.tokenPattern.test(urlToken)){render({token:urlToken});$('registration').hidden=false;}else render(null);});
window.addEventListener('jukebox:ticket-unclaimed',e=>{render(e.detail);$('registration').hidden=false;});
window.addEventListener('jukebox:ticket-error',e=>{if(!current){$('ticketLinkStatus').hidden=false;$('ticketLinkStatus').textContent=e.detail||'티켓을 불러오지 못했어요. 아래 내 티켓 다시 확인을 눌러주세요.';}});
if(urlToken){$('registration').hidden=true;$('ticketLinkStatus').hidden=false;if(!P.tokenPattern.test(urlToken))$('ticketLinkStatus').textContent='올바르지 않은 티켓 링크예요. 공유해 준 분에게 다시 받아주세요.';}
render(window.Jukebox.currentTicket);
if(!urlToken&&!window.Jukebox.currentTicket)$('ticketLinkStatus').hidden=true;
// Switching tickets reloads the controller so rotations/check state never cross tickets.
window.addEventListener('hashchange',()=>location.reload());
})();