(function(){
'use strict';
const list=document.getElementById('guestbookList'),status=document.getElementById('guestbookStatus'),button=document.getElementById('refreshGuestbook');
const api=new window.Jukebox.TicketAPI();let loading=false;
async function refresh(){
 if(loading)return;loading=true;button.disabled=true;
 try{
  const data=api.preview?{messages:[]}:await api.sendHTTP('guestbook',{},20000);
  if(!Array.isArray(data?.messages))throw new Error('방명록 응답을 확인하지 못했어요.');
  const fragment=document.createDocumentFragment();
  for(const text of data.messages){if(typeof text!=='string')continue;const li=document.createElement('li');li.textContent=text;fragment.append(li);}
  list.replaceChildren(fragment);status.textContent=data.messages.length?'':'첫 번째 한마디를 남겨주세요.';
 }catch(e){status.textContent=e.code==='ACTION'?'방명록 서버 업데이트를 기다리고 있어요.':'방명록을 불러오지 못했어요. 새로고침을 눌러주세요.';}
 finally{loading=false;button.disabled=false;}
}
button.addEventListener('click',refresh);
window.addEventListener('jukebox:ticket',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();
})();
