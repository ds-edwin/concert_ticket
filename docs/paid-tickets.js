(function(){
'use strict';
const $=id=>document.getElementById(id),G=window.JukeboxRegistrationLinks,P=window.JukeboxPurchase;
let active=G.readHistory()[0]||null,quantity=active?.tokens.length||1,busy=false,storageWarning='';
function status(text){$('linkToolStatus').textContent=[text,storageWarning].filter(Boolean).join('\n');}
function render(){
 $('linkQuantity').textContent=quantity;
 $('linkMinus').disabled=busy||quantity===1;$('linkPlus').disabled=busy||quantity===10;
 $('createShareLink').disabled=busy;$('copyRegistrationUrl').disabled=busy;$('newRegistrationLink').disabled=busy;
 $('linkResult').hidden=!active;
 if(active){
  const url=G.groupUrl(active.tokens);
  $('registrationUrl').value=url;$('openRegistrationUrl').href=url;
  $('linkResultTitle').textContent='티켓 '+active.tokens.length+'장 · 등록 링크';
 }
 const rows=G.readHistory();$('registrationHistory').hidden=rows.length===0;$('registrationHistoryList').replaceChildren();
 rows.slice(0,10).forEach(row=>{
  const li=document.createElement('li'),button=document.createElement('button'),label=document.createElement('span'),date=document.createElement('small');
  button.type='button';button.disabled=busy;
  label.textContent='티켓 '+row.tokens.length+'장';
  date.textContent=new Date(row.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  if(active?.tokens[0]===row.tokens[0])button.setAttribute('aria-current','true');
  button.append(label,date);li.append(button);$('registrationHistoryList').append(li);
  button.addEventListener('click',()=>{if(busy)return;active=row;quantity=row.tokens.length;storageWarning='';render();status('기존 링크를 불러왔어요.');$('registrationUrl').focus();});
 });
}
function ensureLink(){
 if(!active){
  active=G.create(quantity);
  try{G.remember(active);storageWarning='';}catch{storageWarning='이 브라우저에 저장하지 못했어요. 링크를 복사해 보관해 주세요.';}
 }
 render();return G.groupUrl(active.tokens);
}
function adjust(delta){
 if(busy)return;
 const value=Math.max(1,Math.min(10,quantity+delta));
 if(value!==quantity){quantity=value;active=null;storageWarning='';status('');render();}
}
$('linkMinus').addEventListener('click',()=>adjust(-1));$('linkPlus').addEventListener('click',()=>adjust(1));
$('createShareLink').addEventListener('click',async()=>{
 if(busy)return;
 try{
  const url=ensureLink();busy=true;render();
  if(navigator.share){await navigator.share({title:'JUKEBOX 티켓 정보 입력',text:'티켓 '+quantity+'장입니다. 각 티켓의 이름과 전화번호 뒤 4자리를 등록해 주세요.',url});status('등록 링크를 공유했어요.');}
  else{await P.copy(url);status('링크를 복사했어요. 카카오톡이나 문자에 붙여넣어 주세요.');}
 }catch(e){status(e.name==='AbortError'?'링크가 준비되어 있어요. 다시 공유하거나 복사할 수 있습니다.':'공유하지 못했어요. 링크 복사를 이용하거나 주소를 길게 눌러 복사해 주세요.');}
 finally{busy=false;render();}
});
$('copyRegistrationUrl').addEventListener('click',async()=>{
 if(busy||!active)return;
 busy=true;render();
 try{await P.copy(G.groupUrl(active.tokens));status('등록 링크를 복사했어요.');}catch{status('주소를 길게 눌러 직접 복사해 주세요.');}finally{busy=false;render();}
});
$('newRegistrationLink').addEventListener('click',()=>{
 if(busy)return;
 active=null;storageWarning='';status('새 받는 분의 티켓 수를 선택하고 공유하기를 눌러주세요.');render();$('createShareLink').focus();
});
render();
})();
