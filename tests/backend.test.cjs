/* Behavioral tests with an in-memory Apps Script/Sheets adapter.
   Real Google deployment and browser bridge still need an integration check. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const code = fs.readFileSync(path.join(__dirname,'../apps-script/INSTALL.gs'),'utf8');
function environment(){
  const targetId='test-spreadsheet-id';
  const props=new Map([['SPREADSHEET_ID',targetId],['ALLOWED_ORIGINS','https://ds-edwin.github.io'],['LAST_ISSUED','0']]);
  const headers=['입력일시','연번','이름','연락처_뒷번호','하고 싶은 말','_요청키','체크여부'];
  const deposits=[]; let depositExists=false; const data=[headers];const songs=[['연번','제목','아티스트','url']];const events=[];
  let locked=false,contended=false,propertyFailure=false,settingUp=false;
  function sheet(rows){return {
    getLastRow:()=>rows.length,getMaxRows:()=>1000,insertRowsAfter(){events.push('grow');},
    setFrozenRows(){return this;},setColumnWidth(){return this;},hideColumns(){return this;},
    getRange(r,c,h=1,w=1){
      if(typeof r==='string'){c=r.charCodeAt(0)-64;r=1;h=rows.length;}
      return {
        getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[r+i-1]?.[c+j-1]??'')),
        setNumberFormat(){return this;},setBackground(){return this;},setFontColor(){return this;},setFontWeight(){return this;},
        setValue(value){return this.setValues([[value]]);},
        setValues(values){assert.ok(locked||settingUp);events.push('write');values.forEach((row,i)=>{rows[r+i-1] ||= [];row.forEach((v,j)=>rows[r+i-1][c+j-1]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v);});return this;}
      };
    }
  };}
  const reg=sheet(data),setlist=sheet(songs);
  const ss={getId:()=>targetId,setSpreadsheetTimeZone(){},getSheetByName:n=>n==='참석자'?reg:n==='셋리스트'?setlist:n==='입금내역'&&depositExists?sheet(deposits):null,insertSheet(n){assert.equal(n,'입금내역');depositExists=true;return sheet(deposits);}};
  const context=vm.createContext({console,Date,Array,Number,String,Error,JSON,Math,
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
    Session:{getActiveUser:()=>({getEmail:()=> 'owner@example.test'}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:id=>{assert.equal(id,targetId);return ss;},flush:()=>{assert.ok(locked||settingUp);events.push('flush');}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>{if(propertyFailure){propertyFailure=false;throw new Error('simulated lost response after sheet commit');}props.set(k,v);}})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(contended)return false;assert.equal(locked,false);locked=true;events.push('lock');return true;},releaseLock:()=>{locked=false;events.push('release');}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest())}
  });
  vm.runInContext(code,context);
  return {context,data,deposits,songs,props,events,call:(action,payload={},origin='https://ds-edwin.github.io')=>context.bridgeRequest(action,payload,origin),setup:()=>{settingUp=true;try{return context.setup();}finally{settingUp=false;}},contend:()=>contended=true,failPropertyOnce:()=>propertyFailure=true};
}
const input=(changes={})=>({token:crypto.randomUUID(),name:'테스트 관객',phoneLast4:'0007',message:'멋진 공연 기대해요!',...changes});
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('first issue writes only one row; retry returns same serial and original name',()=>{const e=environment(),p=input();const a=e.call('issue',p);assert.equal(a.ok,true);assert.equal(a.data.serial,1);const b=e.call('issue',{...p,name:'변경 이름'});assert.equal(b.data.serial,1);assert.equal(b.data.name,p.name);assert.equal(e.data.length,2);assert.equal(e.data[1][3],'0007');assert.deepEqual(e.events.slice(0,4),['lock','write','flush','release']);});
test('1000 unique requests issue exactly 1..1000; 1001 rejected; old token still works',()=>{const e=environment(),first=input();assert.equal(e.call('issue',first).data.serial,1);for(let i=2;i<=1000;i++)assert.equal(e.call('issue',input()).data.serial,i);assert.equal(new Set(e.data.slice(1).map(r=>r[1])).size,1000);assert.equal(e.call('issue',input()).code,'SOLD_OUT');assert.equal(e.data.length,1001);assert.equal(e.call('issue',first).data.serial,1);assert.equal(e.call('restore',{token:first.token}).data.serial,1);});
test('validation: empty name, wrong digits, control chars, 101 unicode codepoints',()=>{const e=environment();for(const p of [input({name:' '}),input({phoneLast4:'007'}),input({phoneLast4:'0a07'}),input({name:'bad\nname'}),input({message:'😀'.repeat(101)})])assert.equal(e.call('issue',p).code,'VALIDATION');assert.equal(e.data.length,1);assert.equal(e.call('issue',input({message:'😀'.repeat(100)})).ok,true);});
test('formula-like names/messages remain literal text including a leading apostrophe',()=>{const e=environment(),p=input({name:'=IMPORTXML("bad")',message:"'+literal"});assert.equal(e.call('issue',p).data.name,p.name);assert.equal(e.data[1][2],p.name);assert.equal(e.data[1][4],p.message);assert.equal(e.call('restore',{token:p.token}).data.name,p.name);});
test('public setlist returns artist, exposes no registration PII, restricts links and sorts numbers',()=>{const e=environment();e.call('issue',input({name:'PRIVATE NAME',message:'PRIVATE MESSAGE'}));e.songs.push([2,'Second','Second Artist','https://youtu.be/abc'],[1,'First','First Artist','javascript:alert(1)'],[3,'Bad host','','https://youtube.com.evil.test/watch?v=x']);const result=e.call('public');assert.equal(result.data.tracks[0].number,1);assert.equal(result.data.tracks[0].artist,'First Artist');assert.equal(result.data.tracks[1].artist,'Second Artist');assert.equal(result.data.tracks[2].artist,'');assert.equal(result.data.tracks[0].url,'');assert.equal(result.data.tracks[2].url,'');assert.equal(result.data.tracks[1].url,'https://youtu.be/abc');const json=JSON.stringify(result);assert.ok(!json.includes('PRIVATE'));assert.ok(!json.includes('0007'));assert.ok(!json.includes('_요청키'));});
test('unknown bearer token cannot retrieve a ticket; wrong origin cannot issue',()=>{const e=environment();e.call('issue',input());assert.equal(e.call('restore',{token:crypto.randomUUID()}).data,null);assert.equal(e.call('issue',input(),'https://evil.test').code,'ORIGIN');assert.equal(e.data.length,2);});
test('lock contention never writes an unprotected row',()=>{const e=environment();e.contend();assert.equal(e.call('issue',input()).code,'BUSY');assert.equal(e.data.length,1);});
test('commit followed by response failure is recovered without issuing a second ticket',()=>{const e=environment(),p=input();e.failPropertyOnce();assert.equal(e.call('issue',p).ok,false);assert.equal(e.data.length,2);assert.equal(e.call('issue',p).data.serial,1);assert.equal(e.call('issue',input()).data.serial,2);assert.equal(e.data.length,3);});
test('clearing all attendee rows restarts serial at one; duplicate serial edit fails closed',()=>{const e=environment();e.call('issue',input());e.data.pop();assert.equal(e.call('issue',input()).data.serial,1);e.data.push(e.data[1].slice());assert.equal(e.call('issue',input()).code,'CONFIG');});
test('setup preserves existing five columns and setlist; only adds unused F header',()=>{
  const e=environment();e.data[0]=e.data[0].slice(0,5);e.data.push([new Date('2026-10-21T00:00:00Z'),27,'Existing attendee','0001','Existing message']);
  e.songs.push([1,'Existing song','Existing artist','https://youtu.be/abc']);e.props.set('LAST_ISSUED','27');
  const firstFive=e.data.map(row=>row.slice(0,5));const songs=e.songs.map(row=>row.slice());
  e.setup();
  assert.deepEqual(e.data.map(row=>row.slice(0,5)),firstFive);assert.deepEqual(e.songs,songs);
  assert.equal(e.data[0][5],'_요청키');assert.equal(e.data[1][5],undefined);assert.equal(e.props.get('LAST_ISSUED'),'27');
  assert.equal(e.events.filter(event=>event==='write').length,2);
});
test('setup refuses occupied F data with a blank header and preserves every cell',()=>{
  const e=environment();e.data[0]=e.data[0].slice(0,5);e.data.push([new Date('2026-10-21T00:00:00Z'),1,'Existing attendee','0001','Existing message','Keep this F value']);
  const before=e.data.map(row=>row.slice());assert.throws(()=>e.setup(),/F/);assert.deepEqual(e.data,before);assert.ok(!e.events.includes('write'));
});
test('setup refuses an unrelated occupied F header without overwriting it',()=>{
  const e=environment();e.data[0][5]='Existing owner column';const before=e.data.map(row=>row.slice());assert.throws(()=>e.setup());assert.deepEqual(e.data,before);assert.ok(!e.events.includes('write'));
});
test('frontend scripts parse without a build step',()=>{for(const f of ['config.js','api.js','app.js','purchase.js','landing.js','server-update.js'])new vm.Script(fs.readFileSync(path.join(__dirname,'../docs',f),'utf8'),{filename:f});});
test('check marks only the token owner, retries safely and reflects sheet edits',()=>{const e=environment(),p=input(),q=input();e.call('issue',p);e.call('issue',q);assert.equal(e.call('check',{token:p.token}).data.checked,true);assert.equal(e.data[1][6],'O');assert.equal(e.data[2][6],'');assert.equal(e.call('check',{token:p.token}).data.serial,1);assert.equal(e.call('check',{token:crypto.randomUUID()}).code,'NOT_FOUND');e.data[2][6]='O';assert.equal(e.call('restore',{token:q.token}).data.checked,true);e.data[1][6]='';assert.equal(e.call('restore',{token:p.token}).data.checked,false);});
test('setup migrates six-column sheet preserving checks on rerun',()=>{const e=environment();e.data[0].pop();e.setup();assert.equal(e.data[0][6],'체크여부');const p=input();e.call('issue',p);e.call('check',{token:p.token});e.setup();assert.equal(e.data[1][6],'O');});
test('setup refuses occupied G column',()=>{const e=environment();e.data[0][6]='Other';assert.throws(()=>e.setup(),/G/);assert.equal(e.data[0][6],'Other');});
test('live layout E=check F=message G=token writes and restores correctly',()=>{const e=environment();e.data[0]=['입력일시','연번','이름','연락처_뒷번호','체크여부','하고 싶은 말','_요청키'];e.setup();const p=input();assert.equal(e.call('issue',p).ok,true);assert.equal(e.data[1][4],'');assert.equal(e.data[1][5],p.message);assert.match(e.data[1][6],/^[a-f0-9]{64}$/);assert.equal(e.call('check',{token:p.token}).data.checked,true);assert.equal(e.data[1][4],'O');assert.equal(e.data[1][5],p.message);assert.equal(e.call('restore',{token:p.token}).data.checked,true);});
test('1000th ticket grows the default 1000-row sheet for the header',()=>{const e=environment();e.props.set('LAST_ISSUED','999');for(let i=1;i<=999;i++)e.data.push([new Date(),i,'Guest','0001','','','']);assert.equal(e.call('issue',input()).data.serial,1000);assert.ok(e.events.includes('grow'));});

function httpCall(e, action, payload={}, changes={}) {
  const request={protocol:'jukebox-http-v1',requestId:crypto.randomUUID(),action,payload,pageOrigin:'https://ds-edwin.github.io',...changes};
  const response=JSON.parse(e.context.doPost({postData:{contents:JSON.stringify(request)}}).text);
  assert.equal(response.protocol,'jukebox-http-v1');
  assert.equal(response.requestId,request.requestId);
  return response;
}
test('HTTP transport issues once, restores and checks the same token',()=>{
  const e=environment(),p=input();
  const health=httpCall(e,'health');
  assert.equal(health.ok,true);assert.equal(health.data.version,1);assert.equal(e.data.length,1);
  const issued=httpCall(e,'issue',p);assert.equal(issued.ok,true);assert.equal(issued.data.serial,1);
  const repeated=httpCall(e,'issue',{...p,name:'changed'});
  assert.equal(repeated.data.serial,1);assert.equal(repeated.data.name,p.name);assert.equal(e.data.length,2);
  assert.equal(httpCall(e,'restore',{token:p.token}).data.serial,1);
  assert.equal(httpCall(e,'check',{token:p.token}).data.checked,true);
  assert.equal(e.data[1][6],'O');
});
test('HTTP transport rejects other origins, unsupported actions and unknown tokens',()=>{
  const e=environment(),p=input();
  assert.equal(httpCall(e,'issue',p,{pageOrigin:'https://untrusted.test'}).code,'ORIGIN');
  assert.equal(httpCall(e,'setup').code,'ACTION');
  assert.equal(httpCall(e,'public').code,'ACTION');
  assert.equal(httpCall(e,'health',{}, {protocol:'old'}).code,'VERSION');
  assert.equal(httpCall(e,'restore',{token:p.token}).data,null);
  assert.equal(e.data.length,1);
});
test('HTTP transport rejects malformed and oversized bodies without exposing server details',()=>{
  const e=environment();
  for(const body of ['', '{', '[]', 'x'.repeat(8193)]) {
    const result=JSON.parse(e.context.doPost({postData:{contents:body}}).text);
    assert.equal(result.ok,false);assert.equal(result.code,'VALIDATION');assert.equal(e.data.length,1);
  }
});
test('HTTP transport recovers a committed row after a server response failure',()=>{
  const e=environment(),p=input();e.failPropertyOnce();
  assert.equal(httpCall(e,'issue',p).ok,false);
  const restored=httpCall(e,'restore',{token:p.token});
  assert.equal(restored.ok,true);assert.equal(restored.data.serial,1);assert.equal(e.data.length,2);
});


const depositInput=(changes={})=>({orderToken:crypto.randomUUID(),name:'홍길동',phoneLast4:'0007',quantity:3,...changes});
test('deposit records one purchase row and retry preserves timestamp without issuing tickets',()=>{
 const e=environment(),p=depositInput(),a=httpCall(e,'deposit',p),b=httpCall(e,'deposit',p);
 assert.equal(a.ok,true);assert.equal(a.data.quantity,3);assert.equal(b.data.submittedAt,a.data.submittedAt);
 assert.equal(e.deposits.length,2);assert.equal(e.deposits[1][1],'홍길동0007');assert.equal(e.deposits[1][2],3);
 assert.equal(e.data.length,1);assert.match(e.deposits[1][3],/^[a-f0-9]{64}$/);
 assert.equal(httpCall(e,'health').data.depositLedger,true);
});
test('deposit rejects changed purchases and invalid quantities without additional rows',()=>{
 const e=environment(),p=depositInput();httpCall(e,'deposit',p);
 for(const change of [{quantity:4},{name:'다른이름'},{phoneLast4:'1234'}])assert.equal(httpCall(e,'deposit',{...p,...change}).code,'CONFLICT');
 for(const q of [0,11,1.5,'3',null])assert.equal(httpCall(e,'deposit',depositInput({quantity:q})).code,'VALIDATION');
 assert.equal(e.deposits.length,2);
 assert.equal(httpCall(e,'deposit',depositInput()).ok,true);assert.equal(e.deposits.length,3);
});
test('deposit preserves literal names and supports reordered headers',()=>{
 const e=environment(),p=depositInput({name:'=SUM(1)'});httpCall(e,'deposit',p);
 assert.equal(e.deposits[1][1],'=SUM(1)0007');assert.equal(e.call('deposit',p).ok,true);
 e.deposits.forEach(r=>r.reverse());
 assert.equal(httpCall(e,'deposit',p).ok,true);
 assert.equal(httpCall(e,'deposit',depositInput({quantity:10})).ok,true);assert.equal(e.deposits[2][1],10);
});
test('deposit origin and lock failures cannot write',()=>{
 const e=environment(),p=depositInput();
 assert.equal(httpCall(e,'deposit',p,{pageOrigin:'https://evil.test'}).code,'ORIGIN');
 e.contend();assert.equal(httpCall(e,'deposit',p).code,'BUSY');assert.equal(e.deposits.length,0);
});

test('guestbook publishes only opted-in content with no author or internal purchase data',()=>{
 const e=environment();e.call('issue',input({message:'PRIVATE OLD MESSAGE'}));
 e.call('issue',input({message:'[입금신고·미확인] internal'}));
 const p=input({name:'PRIVATE AUTHOR',phoneLast4:'9274',message:'<img src=x onerror=alert(1)> 응원해요!',messagePublic:true});
 assert.equal(e.call('issue',p).ok,true);e.call('issue',p);
 const result=httpCall(e,'guestbook');assert.equal(result.ok,true);
 assert.deepEqual(result.data,{messages:[p.message]});assert.equal(e.data.length,4);
 assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('9274'));
 assert.equal(httpCall(e,'health').data.guestbook,true);
 e.data.pop();assert.equal(httpCall(e,'guestbook').data.messages.length,0);
});
test('different recipients issue their own names while a shared link issues only once',()=>{
 const e=environment(),a=input({name:'첫 관객'}),b=input({name:'두 번째 관객'});
 assert.equal(e.call('restore',{token:a.token}).data,null);
 assert.equal(e.call('issue',a).data.name,'첫 관객');
 assert.equal(e.call('issue',b).data.name,'두 번째 관객');
 assert.equal(e.call('issue',{...a,name:'another visitor'}).data.name,'첫 관객');
 assert.equal(e.data.length,3);
});
let passed=0;for(const [name,fn]of tests){try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);console.error(e);process.exitCode=1;}}
console.log(`${passed}/${tests.length} behavioral checks passed`);
