(function(){
'use strict';
const $=id=>document.getElementById(id),config=window.TICKET_CONFIG,P=window.JukeboxPurchase,api=new window.Jukebox.TicketAPI();
const draftKey=P.orderKey+':draft';
let step=0,quantity=1,payer=null,busy=false,toastTimer;
let order=P.readOrder();
const bank=config.payment;
const bankReady=Boolean(bank&&typeof bank.bank==='string'&&bank.bank.trim()&&typeof bank.account==='string'&&/^[0-9 -]{6,30}$/.test(bank.account)&&typeof bank.holder==='string'&&bank.holder.trim());
const price=Number.isInteger(config.unitPrice)&&config.unitPrice>0?config.unitPrice:5000;
const money=n=>n.toLocaleString('ko-KR')+'원';
function toast(text){$('landingToast').textContent=text;$('landingToast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('landingToast').hidden=true,3500);}
function saveDraft(){try{sessionStorage.setItem(draftKey,JSON.stringify({quantity,payerInput:$('payerInput').value,consent:$('purchaseConsent').checked,step}));}catch{}}
try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft){quantity=Math.min(10,Math.max(1,Math.trunc(Number(draft.quantity))||1));$('payerInput').value=String(draft.payerInput||'').slice(0,44);$('purchaseConsent').checked=draft.consent===true;}}catch{}
function drawQuantity(){$('quantityValue').textContent=quantity;$('minusButton').disabled=quantity===1||Boolean(order?.submitted);$('plusButton').disabled=quantity===10||Boolean(order?.submitted);$('quantityTotal').textContent=money(quantity*price);}
function showStep(value,focus=true){
 step=Math.min(3,Math.max(0,value));
 document.querySelectorAll('[data-step]').forEach(el=>el.hidden=Number(el.dataset.step)!==step);
 $('stepProgress').hidden=step===0;
 [...$('stepProgress').children].forEach((el,i)=>{el.classList.toggle('active',i+1===step);el.classList.toggle('done',i+1<step);if(i+1===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 drawQuantity();saveDraft();
 if(focus)document.querySelector('[data-step="'+step+'"] h1,[data-step="'+step+'"] h2')?.focus({preventScroll:true});
}
function payment(){
 $('paymentQuantity').textContent='티켓 '+quantity+'장';$('paymentTotal').textContent=money(quantity*price);
 $('payerReminder').textContent=payer.label;
 $('bankName').textContent=bankReady?bank.bank:'입금 계좌 준비 중';
 $('accountNumber').textContent=bankReady?bank.account:'계좌를 준비하고 있어요';
 $('accountHolder').textContent=bankReady?'예금주 '+bank.holder:'주최 측에서 곧 안내할게요.';
 $('copyAccount').disabled=!bankReady;
 $('paidButton').disabled=!bankReady;
 $('paymentNotice').textContent=bankReady?'':'입금 계좌가 등록되면 구매를 진행할 수 있어요.';
}
$('buyButton').addEventListener('click',()=>{if(order?.complete){localStorage.setItem(P.orderKey+':history:'+order.id,JSON.stringify(order));localStorage.removeItem(P.orderKey);order=null;quantity=1;}if(order?.submitted&&!order.complete){quantity=order.quantity;toast('진행 중인 구매를 이어서 확인합니다.');}showStep(1);});
$('minusButton').addEventListener('click',()=>{if(!order?.submitted)quantity=Math.max(1,quantity-1);drawQuantity();saveDraft();});
$('plusButton').addEventListener('click',()=>{if(!order?.submitted)quantity=Math.min(10,quantity+1);drawQuantity();saveDraft();});
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>{if(!busy)showStep(step-1);}));
document.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>showStep(step+1)));
$('payerInput').addEventListener('input',()=>{$('payerError').textContent='';$('payerInput').removeAttribute('aria-invalid');saveDraft();});
$('purchaseConsent').addEventListener('change',saveDraft);
$('payerForm').addEventListener('submit',e=>{
 e.preventDefault();payer=P.parsePayer($('payerInput').value);
 if(!payer){$('payerError').textContent='이름과 전화번호 뒤 4자리를 입력해 주세요. 예: 홍길동1234';$('payerInput').setAttribute('aria-invalid','true');$('payerInput').focus();return;}
 if(!$('purchaseConsent').checked){$('payerError').textContent='정보 수집 동의에 체크해 주세요.';$('purchaseConsent').focus();return;}
 $('payerError').textContent='';$('payerInput').value=payer.label;payment();showStep(3);
});
$('copyAccount').addEventListener('click',async()=>{if(!bankReady)return;try{await P.copy(bank.account.replace(/[^0-9]/g,''));toast('계좌번호를 복사했어요.');}catch(e){toast(e.message);}});
function setBusy(value){
 busy=value;document.querySelectorAll('[data-back]').forEach(b=>b.disabled=value);$('paidButton').disabled=value||!bankReady;
 $('payerInput').readOnly=value;
}
async function issuePurchase(){
 // Re-read in the lock, so two tabs use exactly the same seat request tokens.
 order=P.readOrder();
 if(order?.complete){location.assign(P.ticketUrl(order.tokens[0]));return;}
 if(order?.submitted&&order.quantity!==quantity)throw new Error('진행 중인 구매 수량이 달라요. 페이지를 새로 열어 이어서 확인해 주세요.');
 if(!order||!order.submitted)order=P.createOrder(quantity);
 const payerHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payer.label)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(order.payerHash&&order.payerHash!==payerHash)throw new Error('진행 중인 구매의 입금자 정보와 달라요. 처음 입력한 이름과 뒷번호를 입력해 주세요.');
 order.payerHash=payerHash;order.submitted=true;P.writeOrder(order);
 $('paidButton').textContent='입금 내역 기록 중…';
 $('paymentStatus').textContent='입금자 정보와 매수를 기록하고 있어요.';
 let deposit;
 try{
  deposit=await api.request('deposit',{orderToken:order.id,name:payer.name,phoneLast4:payer.phoneLast4,quantity:order.quantity});
 }catch(e){
  if(['ACTION','SERVER_UPDATE'].includes(e.code))throw new Error('입금내역 저장 기능의 서버 업데이트가 필요합니다. 주최 측에 문의해 주세요.');
  throw e;
 }
 if(deposit?.recorded!==true||deposit.quantity!==order.quantity)throw new Error('입금 내역 저장 결과를 확인하지 못했어요.');
 // Each recipient enters their own details on their individual ticket link.
 order.complete=true;P.writeOrder(order);
 try{sessionStorage.removeItem(draftKey);}catch{}
 location.assign(P.ticketUrl(order.tokens[0]));
}
$('paidButton').addEventListener('click',async()=>{
 if(busy||!bankReady||!payer)return;
 if(api.preview){$('paymentStatus').textContent='미리보기에서는 실제 티켓을 발급하지 않습니다.';return;}
 setBusy(true);$('paymentStatus').textContent='';
 try{
  // Storage must succeed before a real issuance starts.
  localStorage.setItem(P.orderKey+':probe','1');localStorage.removeItem(P.orderKey+':probe');
  if(navigator.locks)await navigator.locks.request(P.orderKey,issuePurchase);else await issuePurchase();
 }catch(e){
  $('paymentStatus').textContent=(e.message||'티켓을 준비하지 못했어요.')+' 다시 누르면 같은 구매를 이어서 확인합니다.';
  $('paidButton').textContent='입금 신고 다시 확인';
  const first=order?.tokens.find(token=>P.readTicket(token)?.ticket);
  if(first){$('partialTickets').href=P.ticketUrl(first);$('partialTickets').hidden=false;}
 }finally{setBusy(false);}
});
if(order){quantity=order.quantity;if(order.complete){$('continueTicket').href=P.ticketUrl(order.tokens[0]);$('continueTicket').textContent='내 티켓 '+order.quantity+'장 보기 →';}else if(order.submitted){$('payerInput').readOnly=false;}}
const legacyKey='jukebox:'+config.eventId+':'+(api.preview?'preview':config.endpoint);
try{const old=JSON.parse(localStorage.getItem(legacyKey)||'null');if(!order?.complete&&!old?.ticket)$('continueTicket').hidden=true;}catch{$('continueTicket').hidden=true;}
showStep(0,false);
})();