(function(){
'use strict';
const $=id=>document.getElementById(id),api=new window.Jukebox.TicketAPI(),P=window.JukeboxPurchase;
let current=window.Jukebox.currentTicket||null,loading=false,sending=false,pending=null;
function pendingKey(){return current?P.ticketStorageKey(current.token)+':pending-message':null;}
function updateTicket(detail){
 current=detail||null;
 try{pending=current?JSON.parse(sessionStorage.getItem(pendingKey())||'null'):null;}catch{pending=null;}
 if(pending){$('message').value=pending.message;$('guestbookConsent').checked=true;}
 $('message').readOnly=Boolean(pending);$('sendGuestbook').disabled=!current||sending;
 $('guestbookFormStatus').textContent=pending?'전송 결과를 확인하지 못한 글이 있어요. 다시 눌러 확인해 주세요.':current?'':'티켓을 발급받으면 글을 남길 수 있어요.';
}
async function refresh(){
 if(loading)return;loading=true;$('refreshGuestbook').disabled=true;
 try{
  const data=api.preview?{messages:[]}:await api.sendHTTP('guestbook',{},20000);
  if(!Array.isArray(data?.messages))throw new Error();
  const fragment=document.createDocumentFragment();
  for(const text of data.messages){if(typeof text!=='string')continue;const li=document.createElement('li');li.textContent=text;fragment.append(li);}
  $('guestbookList').replaceChildren(fragment);$('guestbookStatus').textContent=data.messages.length?'':'첫 번째 한마디를 남겨주세요.';
 }catch(e){$('guestbookStatus').textContent=e.code==='ACTION'?'방명록 서버 업데이트를 기다리고 있어요.':'방명록을 불러오지 못했어요. 새로고침을 눌러주세요.';}
 finally{loading=false;$('refreshGuestbook').disabled=false;}
}
$('message').addEventListener('input',()=>{$('charCount').textContent=Array.from($('message').value.normalize('NFC').trim()).length+' / 100';});
$('guestbookForm').addEventListener('submit',async e=>{
 e.preventDefault();if(sending||!current)return;
 const message=$('message').value.normalize('NFC').trim();
 if(!message||Array.from(message).length>100){$('guestbookFormStatus').textContent='1~100자로 입력해 주세요.';return;}
 if(!$('guestbookConsent').checked){$('guestbookFormStatus').textContent='익명 공개 동의에 체크해 주세요.';return;}
 if(api.preview){$('guestbookFormStatus').textContent='미리보기에서는 글을 저장하지 않습니다.';return;}
 sending=true;$('sendGuestbook').disabled=true;$('message').readOnly=true;$('guestbookFormStatus').textContent='방명록을 저장하고 있어요.';
 try{
  pending=pending||{messageToken:window.Jukebox.uuid(),message};
  sessionStorage.setItem(pendingKey(),JSON.stringify(pending));
  const result=await api.sendHTTP('postGuestbook',{token:current.token,...pending,publicConsent:true},40000);
  if(result?.recorded!==true)throw new Error('저장 결과를 확인하지 못했어요.');
  sessionStorage.removeItem(pendingKey());pending=null;
  $('message').value='';$('charCount').textContent='0 / 100';
  $('guestbookFormStatus').textContent='방명록에 남겼어요. 또 다른 한마디도 남길 수 있어요.';
  await refresh();
 }catch(e){
  if(['VALIDATION','NOT_FOUND','ACTION'].includes(e.code)){sessionStorage.removeItem(pendingKey());pending=null;}
  $('guestbookFormStatus').textContent=(e.code==='ACTION'?'방명록 서버 업데이트가 필요합니다.':e.message||'저장 결과를 확인하지 못했어요.')+' 다시 눌러도 같은 글은 중복 저장되지 않습니다.';
 }finally{sending=false;$('sendGuestbook').disabled=!current;$('message').readOnly=Boolean(pending);}
});
$('refreshGuestbook').addEventListener('click',refresh);
window.addEventListener('jukebox:ticket',e=>updateTicket(e.detail));
window.addEventListener('jukebox:ticket-missing',()=>updateTicket(null));
window.addEventListener('jukebox:ticket-unclaimed',()=>updateTicket(null));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
updateTicket(current);refresh();
})();
