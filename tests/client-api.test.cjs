'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../docs/api.js'), 'utf8');

function harness() {
  let sequence = 0, timerId = 0;
  const timers = new Map(), listeners = [], frames = [], posts = [];
  const window = { TICKET_CONFIG: { endpoint:'https://script.google.com/macros/s/test-deployment/exec',capacity:1000 },
    addEventListener(type,fn) { if(type==='message') listeners.push(fn); } };
  const document = {
    createElement() { return { style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},
      addEventListener(){},remove(){this.removed=true;} }; },
    body: { append(frame) { frames.push(frame); } }
  };
  vm.runInNewContext(source, { window, document, URL, Uint8Array,
    crypto:{randomUUID:()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')},
    location:{origin:'https://ds-edwin.github.io',protocol:'https:'},
    setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId;},
    clearTimeout(id){timers.delete(id);}
  });
  const api = new window.Jukebox.TicketAPI();
  const emit = (data,remote,origin='https://example-script.googleusercontent.com') =>
    listeners.forEach(fn=>fn({data,source:remote,origin}));
  const ready = () => {
    const remote={postMessage(message,origin){posts.push({message,origin,remote});}};
    emit({type:'jukebox-bridge',channel:api.channel,ready:true},remote);
    return remote;
  };
  const reply=(post,data,remote=post.remote,origin) =>
    emit({type:'jukebox-bridge',channel:post.message.channel,requestId:post.message.requestId,result:{ok:true,data}},remote,origin);
  const fire=delay=>{
    const timer=[...timers.entries()].find(([,value])=>value.delay===delay);
    assert.ok(timer,'Expected timer '+delay);
    timers.delete(timer[0]);timer[1].fn();
  };
  const requests=()=>posts.filter(p=>p.message.type==='jukebox-request');
  return {api,frames,posts,timers,ready,reply,fire,requests,emit};
}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}

test('a dropped read reconnects once and ignores replies from the old channel',async()=>{
  const h=harness(), result=h.api.request('public');
  h.ready();await flush();
  const old=h.requests()[0];
  h.fire(20000);await flush();
  assert.equal(h.frames.length,2);
  assert.equal(h.frames[0].removed,true);
  h.ready();await flush();
  const current=h.requests()[1];
  assert.notEqual(current.message.channel,old.message.channel);
  h.reply(old,{tracks:[{title:'stale'}]});
  h.reply(current,{tracks:[{title:'current'}]});
  assert.equal((await result).tracks[0].title,'current');
  assert.equal(h.api.pending.size,0);
});

test('a failed handshake is bounded and does not leave a dead cached connection',async()=>{
  const h=harness(), result=h.api.request('public').catch(e=>e);
  h.fire(15000);await flush();
  assert.equal(h.frames.length,2);
  h.fire(15000);await flush();
  assert.equal((await result).code,'CONNECT');
  assert.equal(h.api.connection,null);
  assert.equal(h.timers.size,0);
});

test('ticket issuance is never automatically replayed after an uncertain response',async()=>{
  const h=harness(), result=h.api.request('issue',{token:'same-token'}).catch(e=>e);
  h.ready();await flush();h.fire(40000);await flush();
  assert.equal((await result).code,'TIMEOUT');
  assert.equal(h.requests().length,1);
  assert.equal(h.frames.length,1);
  assert.equal(h.api.connection,null);
});

test('simultaneous reads recover through one shared replacement connection',async()=>{
  const h=harness(), a=h.api.request('public'),b=h.api.request('restore',{token:'same-token'});
  h.ready();await flush();
  assert.equal(h.requests().length,2);
  h.fire(20000);await flush();
  assert.equal(h.frames.length,2);
  h.ready();await flush();
  const retries=h.requests().slice(2);
  assert.equal(retries.length,2);
  for(const request of retries)h.reply(request,{action:request.message.action});
  assert.equal((await a).action,'public');
  assert.equal((await b).action,'restore');
  assert.equal(h.api.pending.size,0);
});

test('untrusted origins and mismatched frame sources cannot resolve a request',async()=>{
  const h=harness(),result=h.api.request('public');
  h.ready();await flush();
  const request=h.requests()[0];
  h.reply(request,{bad:true},request.remote,'https://example-script.googleusercontent.com.evil.test');
  h.reply(request,{bad:true},{postMessage(){}});
  assert.equal(h.api.pending.size,1);
  h.reply(request,{ok:'trusted'});
  assert.equal((await result).ok,'trusted');
});
