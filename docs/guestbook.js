(function(){
'use strict';
const $=id=>document.getElementById(id),api=new window.Jukebox.TicketAPI(),P=window.JukeboxPurchase;
const cacheKey=P.baseKey+':guestbook-v1',cacheMaxAge=5*60*1000;
let current=window.Jukebox.currentTicket||null,sending=false,pending=null,messages=[],visibleCount=5;
let refreshRequest=null,refreshQueued=false,postRevision=0,refreshTimer,lastSuccess=0,hasSnapshot=false,failures=0;
function pendingKey(ticket=current){return ticket?P.ticketStorageKey(ticket.token)+':pending-message':null;}
function cleanMessages(value){return Array.isArray(value)?value.filter(text=>typeof text==='string'&&text.trim()):null;}
function readPending(){
 try{
  const value=JSON.parse(sessionStorage.getItem(pendingKey())||'null');
  return value&&P.tokenPattern.test(value.messageToken)&&typeof value.message==='string'&&value.message.trim()?value:null;
 }catch{return null;}
}
function forgetPending(key){try{sessionStorage.removeItem(key);}catch{}}
function updateTicket(detail){
 const previous=current?.token;current=detail||null;
 // Background ticket confirmation must not reset an active post.
 if(sending)return;
 if(previous!==current?.token||!pending)pending=current?readPending():null;
 if(pending){$('guestbookCompose').open=true;$('message').value=pending.message;$('guestbookConsent').checked=true;}
 $('charCount').textContent=Array.from($('message').value.normalize('NFC').trim()).length+' / 100';
 $('message').readOnly=Boolean(pending);$('sendGuestbook').disabled=!current;
 if(pending)$('guestbookFormStatus').textContent='전송 결과를 확인하지 못한 글이 있어요. 다시 눌러 확인해 주세요.';
 else if(!current)$('guestbookFormStatus').textContent='티켓을 발급받으면 글을 남길 수 있어요.';
 else if(previous!==current.token||$('guestbookFormStatus').textContent==='티켓을 발급받으면 글을 남길 수 있어요.')$('guestbookFormStatus').textContent='';
}
function saveCache(){
 // Only already-public message text is cached; never names or ticket tokens.
 try{localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),messages:messages.slice(0,100)}));}catch{}
}
function renderMessages(){
 const fragment=document.createDocumentFragment();
 for(const text of messages.slice(0,visibleCount)){const li=document.createElement('li');li.textContent=text;fragment.append(li);}
 $('guestbookList').replaceChildren(fragment);
 $('guestbookStatus').textContent=messages.length?'':'첫 번째 한마디를 남겨주세요.';
 const remaining=Math.max(0,messages.length-visibleCount);
 $('moreGuestbook').hidden=remaining===0;$('moreGuestbook').textContent='더 보기 ('+remaining+')';
}
function scheduleRefresh(delay){
 clearTimeout(refreshTimer);
 refreshTimer=setTimeout(()=>{if(!document.hidden&&navigator.onLine!==false)refresh();else scheduleRefresh(30000);},delay);
}
function refresh(afterWrite=false){
 if(refreshRequest){if(afterWrite)refreshQueued=true;return refreshRequest;}
 clearTimeout(refreshTimer);$('refreshGuestbook').disabled=true;
 $('guestbookList').setAttribute('aria-busy','true');
 if(!hasSnapshot)$('guestbookStatus').textContent='글을 불러오고 있어요.';
 let permanentFailure=false;
 refreshRequest=(async()=>{
  try{
   do{
    refreshQueued=false;
    const revision=postRevision;
    try{
     const data=await api.request('guestbook');
     const next=cleanMessages(data?.messages);
     if(!next)throw new Error('목록 응답을 확인하지 못했어요.');
     if(revision===postRevision&&!refreshQueued){
      messages=next.reverse();hasSnapshot=true;lastSuccess=Date.now();failures=0;
      renderMessages();saveCache();
     }
    }catch(e){
     failures++;
     permanentFailure=['ACTION','CONFIG','ORIGIN','VERSION','SERVER_UPDATE'].includes(e.code);
     $('guestbookStatus').textContent=permanentFailure
      ? '방명록 서버에 연결하지 못했어요. 잠시 후 새로고침해 주세요.'
      : hasSnapshot?'마지막으로 불러온 글입니다. 연결되면 다시 갱신할게요.':'연결이 늦어지고 있어요. 자동으로 다시 불러옵니다.';
    }
   }while(refreshQueued);
  }finally{
   refreshRequest=null;$('refreshGuestbook').disabled=false;$('guestbookList').setAttribute('aria-busy','false');
   if(!api.preview&&!permanentFailure)scheduleRefresh(failures?Math.min(60000,5000*2**Math.min(failures-1,4)):30000);
  }
 })();
 return refreshRequest;
}
function refreshWhenStale(){if(!document.hidden&&Date.now()-lastSuccess>15000)refresh();}
$('moreGuestbook').addEventListener('click',()=>{visibleCount+=5;renderMessages();});
$('message').addEventListener('input',()=>{$('charCount').textContent=Array.from($('message').value.normalize('NFC').trim()).length+' / 100';});
$('guestbookForm').addEventListener('submit',async e=>{
 e.preventDefault();if(sending||!current)return;
 const message=pending?.message||$('message').value.normalize('NFC').trim();
 if(!message||Array.from(message).length>100){$('guestbookFormStatus').textContent='1~100자로 입력해 주세요.';return;}
 if(!$('guestbookConsent').checked){$('guestbookFormStatus').textContent='익명 공개 동의에 체크해 주세요.';return;}
 if(api.preview){$('guestbookFormStatus').textContent='미리보기에서는 글을 저장하지 않습니다.';return;}
 const ticket=current,key=pendingKey(ticket),retrying=Boolean(pending);
 sending=true;$('sendGuestbook').disabled=true;$('message').readOnly=true;$('guestbookFormStatus').textContent='방명록을 저장하고 있어요.';
 try{
  pending=pending||{messageToken:window.Jukebox.uuid(),message};
  try{sessionStorage.setItem(key,JSON.stringify(pending));}
  catch{throw Object.assign(new Error('브라우저 저장 공간을 사용할 수 없어요. 일반 브라우저에서 다시 열어주세요.'),{code:'STORAGE'});}
  const result=await api.request('postGuestbook',{token:ticket.token,...pending,publicConsent:true});
  if(result?.recorded!==true)throw new Error('저장 결과를 확인하지 못했어요.');
  forgetPending(key);pending=null;
  $('message').value='';$('charCount').textContent='0 / 100';
  $('guestbookFormStatus').textContent='방명록에 남겼어요. 또 다른 한마디도 남길 수 있어요.';
  // Confirmed writes appear at once; an older read cannot erase them.
  postRevision++;
  // A recovered post may already be visible from a background read.
  if(!retrying||!messages.includes(message))messages.unshift(message);
  hasSnapshot=true;renderMessages();saveCache();
  // Do not keep the form locked while the separate list request is in flight.
  refresh(true);
 }catch(e){
  if(['VALIDATION','NOT_FOUND','ACTION','STORAGE'].includes(e.code)){forgetPending(key);pending=null;}
  $('guestbookFormStatus').textContent=(e.message||'저장 결과를 확인하지 못했어요.')+(pending?' 다시 눌러도 같은 글은 중복 저장되지 않습니다.':'');
 }finally{
  sending=false;
  if(current?.token!==ticket.token){pending=null;updateTicket(current);}
  $('sendGuestbook').disabled=!current;$('message').readOnly=Boolean(pending);
 }
});
$('refreshGuestbook').addEventListener('click',()=>refresh());
window.addEventListener('jukebox:ticket',e=>updateTicket(e.detail));
window.addEventListener('jukebox:ticket-missing',()=>updateTicket(null));
window.addEventListener('jukebox:ticket-unclaimed',()=>updateTicket(null));
document.addEventListener('visibilitychange',refreshWhenStale);
window.addEventListener('focus',refreshWhenStale);
window.addEventListener('online',()=>refresh());
window.addEventListener('pageshow',e=>{if(e.persisted)refreshWhenStale();});
try{
 const saved=JSON.parse(localStorage.getItem(cacheKey)||'null'),cached=cleanMessages(saved?.messages),age=Date.now()-saved?.at;
 if(cached&&age>=0&&age<cacheMaxAge){messages=cached;hasSnapshot=true;renderMessages();$('guestbookStatus').textContent='새 글을 확인하고 있어요.';}
}catch{}
updateTicket(current);refresh();
})();
