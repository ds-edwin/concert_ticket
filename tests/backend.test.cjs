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
  const guestRows=[];let guestExists=false;const deposits=[]; let depositExists=false; const data=[headers];const songs=[['연번','제목','아티스트','url']];const events=[];
  let locked=false,contended=false,propertyFailure=false,settingUp=false;
  function sheet(rows){return {
    getLastRow:()=>rows.length,getMaxRows:()=>1000,insertRowsAfter(){events.push('grow');},
    deleteColumn(c){rows.forEach(r=>r.splice(c-1,1));},setFrozenRows(){return this;},setColumnWidth(){return this;},hideColumns(){return this;},
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
  const ss={getId:()=>targetId,setSpreadsheetTimeZone(){},getSheetByName:n=>n==='참석자'?reg:n==='셋리스트'?setlist:n==='입금내역'&&depositExists?sheet(deposits):n==='방명록'&&guestExists?sheet(guestRows):null,insertSheet(n){if(n==='방명록'){guestExists=true;return sheet(guestRows);}assert.equal(n,'입금내역');depositExists=true;return sheet(deposits);}};
  const context=vm.createContext({console,Date,Array,Number,String,Error,JSON,Math,
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
    Session:{getActiveUser:()=>({getEmail:()=> 'owner@example.test'}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:id=>{assert.equal(id,targetId);return ss;},flush:()=>{assert.ok(locked||settingUp);events.push('flush');}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>{if(propertyFailure){propertyFailure=false;throw new Error('simulated lost response after sheet commit');}props.set(k,v);}})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(contended)return false;assert.equal(locked,false);locked=true;events.push('lock');return true;},releaseLock:()=>{locked=false;events.push('release');}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest())}
  });
  vm.runInContext(code,context);
  return {context,data,deposits,guestRows,songs,props,events,call:(action,payload={},origin='https://ds-edwin.github.io')=>context.bridgeRequest(action,payload,origin),setup:()=>{settingUp=true;try{return context.setup();}finally{settingUp=false;}},contend:()=>contended=true,failPropertyOnce:()=>propertyFailure=true};
}

const input=(changes={})=>({token:crypto.randomUUID(),name:'관객',phoneLast4:'0007',message:'',...changes});
const post=(token,changes={})=>({token,messageToken:crypto.randomUUID(),message:'공연 기대해요!',publicConsent:true,...changes});
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
function httpCall(e,action,payload={},changes={}){
 const request={protocol:'jukebox-http-v1',requestId:crypto.randomUUID(),action,payload,pageOrigin:'https://ds-edwin.github.io',...changes};
 const response=JSON.parse(e.context.doPost({postData:{contents:JSON.stringify(request)}}).text);
 assert.equal(response.requestId,request.requestId);return response;
}
test('migration preserves old messages privately then removes attendee message column',()=>{
 const e=environment();e.data.push([new Date(),1,'과거 관객','0007','PRIVATE OLD NOTE','old-hash','O']);
 assert.equal(httpCall(e,'health').data.guestbookSheet,1);
 assert.equal(e.data[0].includes('하고 싶은 말'),false);assert.equal(e.data[1][4],'old-hash');assert.equal(e.data[1][5],'O');
 assert.equal(e.guestRows[1][1],'과거 관객');assert.equal(e.guestRows[1][2],'PRIVATE OLD NOTE');assert.equal(e.guestRows[1][4],false);
 assert.equal(httpCall(e,'guestbook').data.messages.length,0);
 httpCall(e,'health');assert.equal(e.guestRows.length,2);
});
test('migration retains already-public messages and is resumable before column deletion',()=>{
 const e=environment();e.data.push([new Date(),1,'과거 관객','1234','[방명록] 이미 공개한 글','old-hash','']);
 httpCall(e,'health');assert.deepEqual(httpCall(e,'guestbook').data.messages,['이미 공개한 글']);
 const restored=['입력일시','연번','이름','연락처_뒷번호','하고 싶은 말','_요청키','체크여부'];
 e.data[0]=restored;e.data[1].splice(4,0,'[방명록] 이미 공개한 글');
 httpCall(e,'health');assert.equal(e.guestRows.length,2);assert.equal(e.data[0].length,6);
});
test('issue and restore work after column removal and preserve leading zero phone',()=>{
 const e=environment(),p=input();const a=httpCall(e,'issue',p);
 assert.equal(a.ok,true);assert.equal(a.data.serial,1);assert.equal(e.data[1][3],'0007');assert.equal(e.data[1].length,6);
 assert.equal(httpCall(e,'issue',{...p,name:'changed'}).data.name,p.name);assert.equal(e.data.length,2);
 assert.equal(httpCall(e,'restore',{token:p.token}).data.serial,1);
});
test('attendee issue ignores obsolete message input and never publishes it',()=>{
 const e=environment();e.call('issue',input({message:'old cached input',messagePublic:true}));
 assert.equal(e.data[0].includes('하고 싶은 말'),false);assert.equal(e.guestRows.length,1);
});
test('separate messages record server timestamp and ticket name, not client-supplied name',()=>{
 const e=environment(),p=input({name:'PRIVATE AUTHOR'});e.call('issue',p);
 const m=post(p.token,{name:'fake author'});assert.equal(httpCall(e,'postGuestbook',m).data.recorded,true);
 assert.equal(e.guestRows[1][1],'PRIVATE AUTHOR');assert.equal(e.guestRows[1][2],m.message);assert.ok(e.guestRows[1][0] instanceof Date);
 assert.deepEqual(httpCall(e,'guestbook').data,{messages:[m.message]});
 assert.ok(!JSON.stringify(httpCall(e,'guestbook')).includes('PRIVATE AUTHOR'));
});
test('lost message response retry does not duplicate; another send creates another row',()=>{
 const e=environment(),p=input();e.call('issue',p);const m=post(p.token);
 httpCall(e,'postGuestbook',m);httpCall(e,'postGuestbook',m);assert.equal(e.guestRows.length,2);
 assert.equal(httpCall(e,'postGuestbook',{...m,message:'different'}).code,'CONFLICT');
 httpCall(e,'postGuestbook',post(p.token));assert.equal(e.guestRows.length,3);
 assert.equal(e.data.length,2);
});
test('unknown tickets, missing consent, invalid tokens and invalid lengths cannot post',()=>{
 const e=environment(),p=input();e.call('issue',p);
 assert.equal(httpCall(e,'postGuestbook',post(crypto.randomUUID())).code,'NOT_FOUND');
 for(const change of [{publicConsent:false},{message:''},{message:'x'.repeat(101)},{messageToken:'bad'},{message:'bad\u0000text'}])
 assert.equal(httpCall(e,'postGuestbook',post(p.token,change)).code,'VALIDATION');
 assert.equal(e.guestRows.length,1);
 assert.equal(httpCall(e,'postGuestbook',post(p.token,{message:'😀'.repeat(100)})).ok,true);
});
test('formula-like name and message are literal text; public response contains content only',()=>{
 const e=environment(),p=input({name:'=NAME()'});e.call('issue',p);const m=post(p.token,{message:'=SUM(1) <script>alert(1)</script>'});
 e.call('postGuestbook',m);assert.equal(e.guestRows[1][1],p.name);assert.equal(e.guestRows[1][2],m.message);
 assert.deepEqual(httpCall(e,'guestbook').data,{messages:[m.message]});
});
test('deleting a guestbook row removes it from public feed',()=>{
 const e=environment(),p=input();e.call('issue',p);e.call('postGuestbook',post(p.token));e.guestRows.pop();
 assert.equal(e.call('guestbook').data.messages.length,0);
});
test('check-in still maps correctly after migration and manual sheet updates',()=>{
 const e=environment(),p=input();e.call('issue',p);assert.equal(e.call('check',{token:p.token}).data.checked,true);
 const checkColumn=e.data[0].indexOf('체크여부');assert.equal(e.data[1][checkColumn],'O');
 e.data[1][checkColumn]='';assert.equal(e.call('restore',{token:p.token}).data.checked,false);
});
test('reordered attendee headers migrate without moving unrelated values',()=>{
 const e=environment();e.data[0]=['입력일시','연번','이름','연락처_뒷번호','체크여부','하고 싶은 말','_요청키'];
 const p=input();assert.equal(e.call('issue',p).ok,true);assert.equal(e.data[1][4],'');assert.equal(e.call('check',{token:p.token}).data.checked,true);
});
test('wrong origin cannot migrate or write',()=>{
 const e=environment();assert.equal(e.call('issue',input(),'https://evil.test').code,'ORIGIN');
 assert.equal(e.data[0].includes('하고 싶은 말'),true);assert.equal(e.guestRows.length,0);
});
test('lock contention never deletes columns or writes rows',()=>{
 const e=environment();e.contend();assert.equal(e.call('issue',input()).code,'BUSY');
 assert.equal(e.data[0].includes('하고 싶은 말'),true);assert.equal(e.guestRows.length,0);
});
test('1000 numbered tickets are unique; retries still work after sold out',()=>{
 const e=environment(),p=input();assert.equal(e.call('issue',p).data.serial,1);
 for(let i=2;i<=1000;i++)assert.equal(e.call('issue',input()).data.serial,i);
 assert.equal(e.call('issue',input()).code,'SOLD_OUT');assert.equal(e.call('issue',p).data.serial,1);
});
test('clearing attendees restarts numbering at one',()=>{
 const e=environment();e.call('issue',input());e.data.pop();assert.equal(e.call('issue',input()).data.serial,1);
});
test('issue response failure is recovered by the original token',()=>{
 const e=environment(),p=input();e.failPropertyOnce();assert.equal(e.call('issue',p).ok,false);
 assert.equal(e.call('restore',{token:p.token}).data.serial,1);assert.equal(e.call('issue',p).data.serial,1);
});
test('purchase remains one row with quantity while attendees register separately',()=>{
 const e=environment(),p={orderToken:crypto.randomUUID(),name:'입금자',phoneLast4:'0007',quantity:3};
 assert.equal(httpCall(e,'deposit',p).data.quantity,3);httpCall(e,'deposit',p);
 assert.equal(e.deposits.length,2);assert.equal(e.data.length,1);
 const a=input({name:'관객A'}),b=input({name:'관객B'});
 assert.equal(e.call('issue',a).data.name,'관객A');assert.equal(e.call('issue',b).data.name,'관객B');
 assert.equal(httpCall(e,'deposit',{...p,quantity:4}).code,'CONFLICT');
});
test('all frontend files parse',()=>{
 for(const file of ['app.js','landing.js','sharing.js','purchase.js','guestbook.js','server-update.js','api.js'])
 new vm.Script(fs.readFileSync(path.join(__dirname,'../docs',file),'utf8'));
});
let passed=0;for(const [name,fn]of tests){try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);console.error(e);process.exitCode=1;}}
console.log(passed+'/'+tests.length+' behavioral checks passed');
