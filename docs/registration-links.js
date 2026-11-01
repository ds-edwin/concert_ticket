/* Registration links select existing ticket slots; they never confirm a payment. */
(function(){
'use strict';
const P=window.JukeboxPurchase;
const historyKey=P.baseKey+':registration-links-v1';
function validTokens(tokens){
 return Array.isArray(tokens)&&tokens.length>=1&&tokens.length<=10&&tokens.every(t=>typeof t==='string'&&P.tokenPattern.test(t))&&new Set(tokens.map(t=>t.toLowerCase())).size===tokens.length;
}
function readGroup(hash=location.hash){
 const params=new URLSearchParams(hash.replace(/^#/,''));
 if(params.getAll('tickets').length!==1||params.getAll('ticket').length!==1)return null;
 const tokens=params.get('tickets').split(','),current=params.get('ticket');
 return validTokens(tokens)&&tokens.includes(current)?tokens:null;
}
function groupUrl(tokens,current=tokens?.[0]){
 if(!validTokens(tokens)||!tokens.includes(current))throw new Error('티켓 링크를 확인해 주세요.');
 const url=new URL(P.ticketUrl(current));
 url.searchParams.set('v','20261101-registration');
 url.hash=new URLSearchParams({ticket:current,tickets:tokens.join(',')}).toString();
 return url.href;
}
function readHistory(){
 try{
  const rows=JSON.parse(localStorage.getItem(historyKey)||'[]');
  return Array.isArray(rows)?rows.filter(r=>r&&validTokens(r.tokens)&&typeof r.createdAt==='string'&&Number.isFinite(Date.parse(r.createdAt))).slice(0,20):[];
 }catch{return [];}
}
function create(quantity){
 if(!Number.isInteger(quantity)||quantity<1||quantity>10)throw new Error('1장부터 10장까지 선택해 주세요.');
 return {tokens:Array.from({length:quantity},()=>window.Jukebox.uuid()),createdAt:new Date().toISOString()};
}
function remember(group){
 if(!validTokens(group?.tokens))throw new Error('티켓 링크를 확인해 주세요.');
 const rows=[group,...readHistory().filter(r=>r.tokens[0]!==group.tokens[0])].slice(0,20);
 localStorage.setItem(historyKey,JSON.stringify(rows));
}
window.JukeboxRegistrationLinks={validTokens,readGroup,groupUrl,readHistory,create,remember};
})();
