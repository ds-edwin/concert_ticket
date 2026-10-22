const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../docs/landing.js'),'utf8');
const start=source.indexOf('async function issuePurchase(){');
const end=source.indexOf("$('paidButton').addEventListener",start);
const order={id:crypto.randomUUID(),quantity:3,tokens:Array.from({length:3},()=>crypto.randomUUID()),submitted:true};
const tickets=new Map(),calls=[],elements=new Map();let failDeposit=true,failIssue=true,redirect='';
const context=vm.createContext({
order:null,quantity:3,payer:{name:'홍길동',phoneLast4:'0007',label:'홍길동0007'},price:5000,money:n=>n+'원',
crypto:crypto.webcrypto,TextEncoder,Uint8Array,Array,Error,
$:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},
P:{readOrder:()=>order,writeOrder:()=>{},readTicket:t=>tickets.get(t),saveTicket:(t,ticket)=>tickets.set(t,{ticket}),ticketUrl:t=>'#ticket='+t},
api:{sendHTTP:async(action,payload)=>{calls.push({action,payload});if(failDeposit){failDeposit=false;throw new Error('lost deposit response');}return{recorded:true,quantity:3};},
issue:async payload=>{calls.push({action:'issue',payload});if(failIssue){failIssue=false;throw new Error('lost issue response');}return{serial:tickets.size+1,name:payload.name};}},
sessionStorage:{removeItem:()=>{}},draftKey:'draft',location:{assign:url=>redirect=url}
});
vm.runInContext(source.slice(start,end),context);
(async()=>{
await assert.rejects(context.issuePurchase(),/lost deposit/);
assert.equal(calls.filter(c=>c.action==='issue').length,0);
await context.issuePurchase();
const deposits=calls.filter(c=>c.action==='deposit');
assert.equal(deposits.length,2);assert.equal(new Set(deposits.map(c=>c.payload.orderToken)).size,1);
assert.equal(deposits[0].payload.phoneLast4,'0007');assert.equal(deposits[0].payload.quantity,3);
assert.equal(tickets.size,0);assert.equal(calls.filter(c=>c.action==='issue').length,0);assert.equal(order.complete,true);assert.equal(redirect,'#ticket='+order.tokens[0]);
await context.issuePurchase();assert.equal(calls.filter(c=>c.action==='deposit').length,2);
console.log('PASS deposit-before-issuance, lost-response retries, stable purchase key and recipient registration redirect');
})().catch(e=>{console.error(e);process.exitCode=1;});
