'use strict';
const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../docs'),base='https://ds-edwin.github.io/concert_ticket/';
let browser;
before(async()=>{browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});});
after(async()=>{await browser?.close();});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function app(options={}){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 context.setDefaultTimeout(5000);
 const page=await context.newPage(),calls=[],errors=[],messages=options.messages||[],tickets=new Map(),posts=new Map(),deposits=new Map();
 const state={page,context,calls,errors,messages,tickets,posts,deposits};
 page.on('pageerror',e=>errors.push(e.message));
 await context.route(base+'**',async route=>{
  let relative=decodeURIComponent(new URL(route.request().url()).pathname.slice('/concert_ticket/'.length))||'index.html';
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep))return route.abort();
  try{const body=await fs.readFile(file);await route.fulfill({body,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});}
  catch{await route.fulfill({status:404,body:'Not found'});}
 });
 await context.route('https://script.google.com/**',async route=>{
  const request=JSON.parse(route.request().postData());calls.push(request);
  const reply=async(data,extra={})=>route.fulfill({contentType:'application/json',body:JSON.stringify({protocol:'jukebox-http-v1',requestId:request.requestId,ok:true,data,...extra})});
  if(options.handle&&await options.handle({route,request,reply,state})===true)return;
  const p=request.payload;let data;
  if(request.action==='guestbook')data={messages:[...messages]};
  else if(request.action==='restore')data=tickets.get(p.token)||null;
  else if(request.action==='issue'){
   if(!tickets.has(p.token))tickets.set(p.token,{serial:tickets.size+1,name:p.name,issuedAt:new Date().toISOString(),checked:false});
   data=tickets.get(p.token);
  }else if(request.action==='postGuestbook'){
   const key=p.token+'|'+p.messageToken;
   if(!posts.has(key)){posts.set(key,p.message);messages.push(p.message);}
   data={recorded:true};
  }else if(request.action==='check'){
   data={...tickets.get(p.token),checked:true};tickets.set(p.token,data);
  }else if(request.action==='deposit'){
   deposits.set(p.orderToken,p);data={recorded:true,quantity:p.quantity};
  }else throw Error('Unexpected action '+request.action);
  await reply(data);
 });
 state.open=()=>page.goto(base+(options.landing?'index.html':'ticket.html'),{waitUntil:'domcontentloaded'});
 state.close=async()=>{assert.deepEqual(errors,[]);await context.close();};
 await state.open();return state;
}
async function waitFor(page,fn,arg){await page.waitForFunction(fn,arg,{timeout:10000});}
async function register(page,name='참가자'){
 await page.locator('#name').fill(name);await page.locator('#phoneLast4').fill('0007');
 await page.locator('#consent').check();await page.locator('#ticketForm').dispatchEvent('submit');
 await waitFor(page,()=>!document.querySelector('#issuedSection').hidden);
}
async function write(page,text){
 await page.locator('#guestbookCompose').evaluate(el=>el.open=true);
 await page.locator('#message').fill(text);await page.locator('#guestbookConsent').check();
 await page.locator('#guestbookForm').dispatchEvent('submit');
}
test('public guestbook recovers a dropped request and new visitors skip ticket/health lookups',async()=>{
 let reads=0;const a=await app({messages:['첫 글','<img src=x onerror=alert(1)>'],handle:async({request,route})=>{
  if(request.action==='guestbook'&&++reads===1){await route.abort();return true;}
 }});
 try{
  await waitFor(a.page,()=>document.querySelectorAll('#guestbookList li').length===2);
  assert.equal(reads,2);assert.equal(a.calls.filter(x=>['health','restore'].includes(x.action)).length,0);
  assert.equal(await a.page.locator('#guestbookList img').count(),0);
  assert.equal(await a.page.locator('#sendGuestbook').isDisabled(),true);
  a.messages.push('다른 방문자의 새 글');await a.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await waitFor(a.page,()=>document.querySelector('#guestbookList').textContent.includes('다른 방문자의 새 글'));
 }finally{await a.close();}
});
test('cached messages render before a slow read, and an empty server list clears them',async()=>{
 let hold=null;
 const a=await app({messages:['이미 공개된 글'],handle:async({request,reply})=>{
  if(request.action==='guestbook'&&hold){await hold.promise;await reply({messages:[]});return true;}
 }});
 try{
  await waitFor(a.page,()=>document.querySelectorAll('#guestbookList li').length===1);
  hold=deferred();await a.page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await a.page.locator('#guestbookList li').textContent(),'이미 공개된 글');
  assert.match(await a.page.locator('#guestbookStatus').textContent(),/확인/);
  hold.resolve();await waitFor(a.page,()=>document.querySelectorAll('#guestbookList li').length===0);
  const saved=await a.page.evaluate(()=>JSON.parse(localStorage.getItem(window.JukeboxPurchase.baseKey+':guestbook-v1')));
  assert.equal(saved.messages.length,0);
 }finally{hold?.resolve();await a.close();}
});
test('a confirmed post stays visible through an older read and the editor unlocks immediately',async()=>{
 const old=deferred();let reads=0;
 const a=await app({messages:['다른 사람의 글'],handle:async({request,reply})=>{
  if(request.action==='guestbook'&&++reads===1){await old.promise;await reply({messages:[]});return true;}
 }});
 try{
  await register(a.page);await write(a.page,'새로 남긴 글');
  await waitFor(a.page,()=>document.querySelector('#guestbookList').textContent.includes('새로 남긴 글'));
  assert.equal(await a.page.locator('#sendGuestbook').isDisabled(),false);
  assert.equal(await a.page.locator('#message').evaluate(el=>el.readOnly),false);
  old.resolve();
  await waitFor(a.page,()=>document.querySelector('#guestbookList').textContent.includes('다른 사람의 글'));
  assert.equal(JSON.stringify(await a.page.locator('#guestbookList li').allTextContents()),JSON.stringify(['새로 남긴 글','다른 사람의 글']));
  assert.equal(reads,2);
 }finally{old.resolve();await a.close();}
});
test('a lost post response survives reload and retries the same message token without duplication',async()=>{
 let dropped=false;
 const a=await app({handle:async({request,route,state})=>{
  if(request.action==='postGuestbook'&&!dropped){
   dropped=true;const p=request.payload;state.posts.set(p.token+'|'+p.messageToken,p.message);state.messages.push(p.message);
   await route.abort();return true;
  }
 }});
 try{
  await register(a.page);await write(a.page,'한 번만 남길 글');
  await waitFor(a.page,()=>document.querySelector('#guestbookFormStatus').textContent.includes('중복'));
  const first=a.calls.find(x=>x.action==='postGuestbook').payload;
  await a.page.reload({waitUntil:'domcontentloaded'});
  await waitFor(a.page,()=>!document.querySelector('#sendGuestbook').disabled);
  assert.equal(await a.page.locator('#message').inputValue(),'한 번만 남길 글');
  await a.page.locator('#guestbookForm').dispatchEvent('submit');
  await waitFor(a.page,()=>document.querySelector('#guestbookFormStatus').textContent.includes('남겼어요'));
  await waitFor(a.page,()=>document.querySelectorAll('#guestbookList li').length===1);
  const attempts=a.calls.filter(x=>x.action==='postGuestbook');
  assert.equal(attempts.length,2);assert.equal(attempts[1].payload.messageToken,first.messageToken);
  assert.equal(a.posts.size,1);
 }finally{await a.close();}
});
test('a failed refresh preserves the cached ticket; an explicit missing record resets it',async()=>{
 let failRestore=false;
 const a=await app({handle:async({request,route})=>{
  if(request.action==='restore'&&failRestore){await route.abort();return true;}
 }});
 try{
  await register(a.page);failRestore=true;await a.page.reload({waitUntil:'domcontentloaded'});
  await waitFor(a.page,()=>!document.querySelector('#restoreButton').disabled);
  assert.equal(await a.page.locator('#issuedSection').evaluate(el=>el.hidden),false);
  failRestore=false;a.tickets.clear();await a.page.locator('#restoreButton').click();
  await waitFor(a.page,()=>document.querySelector('#issuedSection').hidden);
  assert.equal(await a.page.locator('#registration').evaluate(el=>el.hidden),false);
 }finally{await a.close();}
});
test('manager confirmation tears immediately while the sheet response is pending',async()=>{
 const hold=deferred();
 const a=await app({handle:async({request,reply,state})=>{
  if(request.action==='check'){await hold.promise;await reply({...state.tickets.get(request.payload.token),checked:true});return true;}
 }});
 try{
  await register(a.page);await a.page.locator('#managerButton').click();
  await a.page.locator('.cut-line').press('Enter');
  await waitFor(a.page,()=>document.querySelector('#ticket').classList.contains('checked'));
  assert.match(await a.page.locator('#cutStatus').textContent(),/기록/);
  hold.resolve();await waitFor(a.page,()=>document.querySelector('#managerButton').textContent.includes('확인 완료'));
 }finally{hold.resolve();await a.close();}
});
test('a purchase retry retains its key and each recipient still registers their own name',async()=>{
 let dropped=false;
 const a=await app({landing:true,handle:async({request,route,state})=>{
  if(request.action==='deposit'&&!dropped){dropped=true;state.deposits.set(request.payload.orderToken,request.payload);await route.abort();return true;}
 }});
 try{
  await a.page.locator('#buyButton').click();
  await a.page.locator('#plusButton').click();await a.page.locator('#plusButton').click();
  await a.page.locator('[data-next]').click();
  await a.page.locator('#payerInput').fill('입금자1234');await a.page.locator('#purchaseConsent').check();
  await a.page.locator('#payerForm').dispatchEvent('submit');
  await a.page.locator('#paidButton').click();
  await waitFor(a.page,()=>document.querySelector('#paidButton').textContent==='입금 신고 다시 확인');
  await a.page.locator('#paidButton').click();await a.page.waitForURL(/ticket.html.*#ticket=/);
  assert.equal(a.calls.filter(x=>x.action==='issue').length,0);
  const attempts=a.calls.filter(x=>x.action==='deposit');
  assert.equal(attempts.length,2);assert.equal(attempts[0].payload.orderToken,attempts[1].payload.orderToken);
  assert.equal(a.deposits.size,1);assert.equal(attempts[0].payload.quantity,3);
  await waitFor(a.page,()=>!document.querySelector('#restoreButton').disabled);
  await register(a.page,'실제 참가자');
  assert.equal(a.calls.find(x=>x.action==='issue').payload.name,'실제 참가자');
  assert.equal(await a.page.locator('#ticketSharing').evaluate(el=>el.hidden),false);
  assert.equal(await a.page.locator('#ticketChoices').locator('a').count(),3);
 }finally{await a.close();}
});
test('single-ticket owners see no sharing section and returning visitors keep only five messages initially',async()=>{
 const a=await app({landing:true,messages:['1','2','3','4','5','6']});
 try{
  await a.page.locator('#buyButton').click();await a.page.locator('[data-next]').click();
  await a.page.locator('#payerInput').fill('입금자0007');await a.page.locator('#purchaseConsent').check();await a.page.locator('#payerForm').dispatchEvent('submit');
  await a.page.locator('#paidButton').click();await a.page.waitForURL(/ticket.html.*#ticket=/);
  await waitFor(a.page,()=>!document.querySelector('#restoreButton').disabled);await register(a.page);
  assert.equal(await a.page.locator('#ticketSharing').evaluate(el=>el.hidden),true);
  await waitFor(a.page,()=>document.querySelectorAll('#guestbookList li').length===5);
  await a.page.locator('#moreGuestbook').click();assert.equal(await a.page.locator('#guestbookList li').count(),6);
  assert.equal(await a.page.locator('.event-strip').count(),0);
 }finally{await a.close();}
});
