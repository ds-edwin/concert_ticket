/* Shared checkout helpers. Each seat has its own durable, idempotent token. */
(function () {
'use strict';
const config=window.TICKET_CONFIG;
const tokenPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const baseKey=`jukebox:${config.eventId}:${config.endpoint || 'preview'}`;
const orderKey=baseKey+':purchase-v1';
function ticketStorageKey(token){return baseKey+':ticket:'+token;}
function ticketUrl(token){const u=new URL('./ticket.html',location.href);u.searchParams.set('v','20261022-share');u.hash='ticket='+encodeURIComponent(token);return u.href;}
function parsePayer(value){
 const normalized=String(value||'').normalize('NFKC').trim();
 const match=normalized.match(/^(.+?)\s*([0-9]{4})$/u);
 if(!match)return null;
 const name=match[1].trim();
 if(!name||Array.from(name).length>40||/[0-9\u0000-\u001f\u007f]/u.test(name))return null;
 return {name,phoneLast4:match[2],label:name+match[2]};
}
function readOrder(){
 try{
  const order=JSON.parse(localStorage.getItem(orderKey)||'null');
  if(!order||!tokenPattern.test(order.id)||!Number.isInteger(order.quantity)||order.quantity<1||order.quantity>10||!Array.isArray(order.tokens)||order.tokens.length!==order.quantity||order.tokens.some(t=>!tokenPattern.test(t)))return null;
  return order;
 }catch{return null;}
}
function findOrder(token){const current=readOrder();if(current?.tokens.includes(token))return current;try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith(orderKey+':history:')){const past=JSON.parse(localStorage.getItem(key));if(Array.isArray(past?.tokens)&&past.tokens.includes(token)&&past.tokens.every(t=>tokenPattern.test(t)))return past;}}}catch{}return null;}
function writeOrder(order){localStorage.setItem(orderKey,JSON.stringify(order));}
function createOrder(quantity){if(!Number.isInteger(quantity)||quantity<1||quantity>10)throw new Error('구매 수량을 확인해 주세요.');const order={id:window.Jukebox.uuid(),quantity,tokens:Array.from({length:quantity},()=>window.Jukebox.uuid()),submitted:false,complete:false};writeOrder(order);return order;}
function readTicket(token){try{return JSON.parse(localStorage.getItem(ticketStorageKey(token))||'null');}catch{return null;}}
function saveTicket(token,ticket){const previous=readTicket(token)||{};localStorage.setItem(ticketStorageKey(token),JSON.stringify({...previous,token,ticket}));}
async function copy(text){if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return;}catch{}}const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error('복사하지 못했어요. 표시된 내용을 길게 눌러 복사해 주세요.');}
window.JukeboxPurchase={baseKey,orderKey,tokenPattern,ticketStorageKey,ticketUrl,parsePayer,readOrder,findOrder,writeOrder,createOrder,readTicket,saveTicket,copy};
})();
