const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const read=name=>fs.readFileSync(path.join(__dirname,'../docs',name),'utf8');
function environment(hash='',saved=new Map()){
 const nodes=new Map(),listeners=new Map(),copied=[];
 class Element{
  constructor(){this.children=[];this.listeners={};this.attrs={};this.style={};this.value='';this.hidden=false;this.disabled=false;}
  addEventListener(type,fn){this.listeners[type]=fn;}
  append(...els){this.children.push(...els);}
  replaceChildren(...els){this.children=els;}
  setAttribute(k,v){this.attrs[k]=v;}
  before(el){this.beforeElement=el;}
  focus(){}
  async click(){if(!this.disabled)return this.listeners.click?.({});}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k),get length(){return saved.size;},key:i=>[...saved.keys()][i]};
 const location={href:'https://example.test/concert_ticket/ticket.html'+hash,hash,reload(){}};
 const window={TICKET_CONFIG:{eventId:'test',endpoint:'test-api'},Jukebox:{uuid:()=>crypto.randomUUID()},addEventListener:(type,fn)=>listeners.set(type,fn)};
 const ctx=vm.createContext({window,location,localStorage:storage,navigator:{},URL,URLSearchParams,Date,Set,Map,document:{getElementById:get,querySelectorAll:()=>[],querySelector:()=>get('description'),createElement:()=>new Element()}});
 vm.runInContext(read('purchase.js'),ctx);vm.runInContext(read('registration-links.js'),ctx);
 window.JukeboxPurchase.copy=async text=>copied.push(text);
 return{ctx,window,location,saved,get,copied,emit:(type,detail)=>listeners.get(type)?.({detail}),G:window.JukeboxRegistrationLinks};
}
(async()=>{
 const a=environment(),G=a.G;
 for(const n of [1,3,10]){
  const group=G.create(n);assert.equal(group.tokens.length,n);assert.equal(new Set(group.tokens).size,n);
  const url=new URL(G.groupUrl(group.tokens));assert.deepEqual(Array.from(G.readGroup(url.hash)),Array.from(group.tokens));
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('ticket'),group.tokens[0]);
  G.remember(group);G.remember(group);assert.equal(G.readHistory().filter(r=>r.tokens[0]===group.tokens[0]).length,1);
 }
 for(const n of [0,11,1.5,'3'])assert.throws(()=>G.create(n));
 const group=G.create(3),other=G.create(1);
 assert.equal(G.readGroup('#ticket='+group.tokens[0]+'&tickets='+[group.tokens[0],group.tokens[0]].join(',')),null);
 assert.equal(G.readGroup('#ticket='+other.tokens[0]+'&tickets='+group.tokens.join(',')),null);
 assert.equal(G.readGroup('#ticket='+group.tokens[0]+'&tickets=bad'),null);
 assert.equal(G.readGroup('#ticket='+group.tokens[0]),null);
 assert.equal(G.readGroup(new URL(G.groupUrl(group.tokens)).hash+'&tickets=bad'),null);
 assert.throws(()=>G.groupUrl(group.tokens,other.tokens[0]));
 const s=environment();s.saved.set(s.window.JukeboxPurchase.orderKey,'existing checkout');
 vm.runInContext(read('paid-tickets.js'),s.ctx);
 await s.get('linkPlus').click();await s.get('linkPlus').click();await s.get('createShareLink').click();
 const first=s.copied.at(-1),tokens=s.G.readGroup(new URL(first).hash);
 assert.equal(tokens.length,3);assert.equal(s.saved.get(s.window.JukeboxPurchase.orderKey),'existing checkout');
 await s.get('createShareLink').click();assert.equal(s.copied.at(-1),first);
 await s.get('newRegistrationLink').click();await s.get('createShareLink').click();assert.notEqual(s.copied.at(-1),first);
 const reopened=environment('',s.saved);vm.runInContext(read('paid-tickets.js'),reopened.ctx);
 assert.equal(reopened.get('registrationUrl').value,s.copied.at(-1));
 // A recipient needs no creator localStorage to access every ticket.
 const recipient=environment(new URL(first).hash);vm.runInContext(read('sharing.js'),recipient.ctx);
 assert.equal(recipient.get('ticketChoices').children.length,3);assert.equal(recipient.get('ticketSharing').hidden,false);
 assert.equal(recipient.get('registration').beforeElement,recipient.get('ticketSharing'));
 recipient.emit('jukebox:ticket-error','test restore failure');assert.equal(recipient.get('ticketLinkStatus').textContent,'test restore failure');
 recipient.emit('jukebox:ticket-unclaimed',{token:tokens[0]});assert.equal(recipient.get('registration').hidden,false);
 recipient.emit('jukebox:ticket',{token:tokens[0],ticket:{name:'test',serial:12}});
 assert.ok(recipient.get('ticketChoices').children[0].textContent.includes('0012'));
 const second=recipient.get('ticketChoices').children[1].href,params=new URLSearchParams(new URL(second).hash.slice(1));
 assert.equal(params.get('ticket'),tokens[1]);assert.equal(recipient.G.readGroup(new URL(second).hash).length,3);
 await recipient.get('copyTicketLink').click();
 assert.equal(new URLSearchParams(new URL(recipient.copied.at(-1)).hash.slice(1)).get('ticket'),tokens[0]);
 assert.equal(new URLSearchParams(new URL(recipient.copied.at(-1)).hash.slice(1)).has('tickets'),false);
 const single=environment(new URL(G.groupUrl(other.tokens)).hash);vm.runInContext(read('sharing.js'),single.ctx);
 assert.equal(single.get('ticketSharing').hidden,true);
 // Existing checkout sharing is preserved.
 const old=environment('#ticket='+group.tokens[0]);old.window.JukeboxPurchase.writeOrder({id:crypto.randomUUID(),tokens:group.tokens,quantity:3,complete:true});
 vm.runInContext(read('sharing.js'),old.ctx);old.emit('jukebox:ticket-unclaimed',{token:group.tokens[0]});assert.equal(old.get('ticketChoices').children.length,3);
 const regular=environment('#ticket='+other.tokens[0]);vm.runInContext(read('sharing.js'),regular.ctx);regular.emit('jukebox:ticket-unclaimed',{token:other.tokens[0]});assert.equal(regular.get('ticketSharing').hidden,true);
 // Native sharing cancellation must retain the generated group for retries.
 const native=environment();native.ctx.navigator.share=async()=>{throw Object.assign(new Error('cancelled'),{name:'AbortError'});};
 vm.runInContext(read('paid-tickets.js'),native.ctx);await native.get('createShareLink').click();const retained=native.get('registrationUrl').value;
 await native.get('copyRegistrationUrl').click();assert.equal(native.copied[0],retained);
 console.log('PASS registration group validation, persistence, stable re-sharing, new groups, recipient slots, existing checkout, single ticket, and share cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});
