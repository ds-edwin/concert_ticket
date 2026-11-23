(function(){
'use strict';
const P=window.JukeboxPurchase,link=document.getElementById('continueTicket');
const order=P.readOrder();
const tokens=order?.complete?[...order.tokens]:[];
try {
 for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);
  if(key!==P.baseKey&&!key.startsWith(P.baseKey+':ticket:'))continue;
  const saved=JSON.parse(localStorage.getItem(key)||'null');
  if(saved?.ticket?.serial&&P.tokenPattern.test(saved.token)&&!tokens.includes(saved.token))tokens.push(saved.token);
 }
}catch{}
if(tokens.length){
 const selected=tokens.slice(0,10);
 link.href=selected.length>1?window.JukeboxRegistrationLinks.groupUrl(selected,selected[0]):P.ticketUrl(selected[0]);
}
})();
