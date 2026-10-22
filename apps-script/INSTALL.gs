/** JUKEBOX ticket service. Paste into a spreadsheet-bound Apps Script project.
 * Public functions: setup (owner only via editor), doGet, doPost, bridgeRequest.
 * All helpers end with _ so google.script.run cannot call them directly.
 * Never publish the registration sheet or include its rows in frontend files.
 */
var CAPACITY_ = 1000;
var REGISTRATION_SHEET_ = '참석자';
var SETLIST_SHEET_ = '셋리스트';
var HEADERS_ = ['입력일시', '연번', '이름', '연락처_뒷번호', '하고 싶은 말', '_요청키', '체크여부'];

/** Run once in the Apps Script editor, then deploy as web app. */
function setup() {
  // Also blocks calls through google.script.run by requiring the owner's
  // interactive identity. Anonymous web-app callers have no active email.
  var active = Session.getActiveUser().getEmail();
  var effective = Session.getEffectiveUser().getEmail();
  if (!active || active !== effective) throw new Error('소유자 계정의 스크립트 편집기에서 실행해 주세요.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('티켓관리 시트의 확장 프로그램 > Apps Script에서 실행하세요.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('ALLOWED_ORIGINS')) props.setProperty('ALLOWED_ORIGINS', 'https://ds-edwin.github.io');
  ss.setSpreadsheetTimeZone('Asia/Seoul');
  var sheet = ss.getSheetByName(REGISTRATION_SHEET_) || ss.insertSheet(REGISTRATION_SHEET_);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,HEADERS_.length).setValues([HEADERS_]);
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange('B:B').setNumberFormat('0000');
    sheet.getRange('C:F').setNumberFormat('@');
    sheet.getRange(1,1,1,6).setBackground('#191329').setFontColor('#f6eafa').setFontWeight('bold');
    sheet.setColumnWidth(1,165); sheet.setColumnWidth(2,80); sheet.setColumnWidth(3,140); sheet.setColumnWidth(4,125); sheet.setColumnWidth(5,360);
  } else {
    var existing=sheet.getRange(1,1,1,7).getValues()[0];
    // Match by column title. The owner's order is retained, including E=체크여부.
    HEADERS_.slice(0,4).forEach(function(h){if(existing.indexOf(h)<0)throw new Error('필수 열을 확인하세요: '+h);});
    var additions=[];
    existing.forEach(function(h,i){if(h && (HEADERS_.indexOf(h)<0 || existing.indexOf(h)!==i))throw new Error(String.fromCharCode(65+i)+'열의 제목이 충돌합니다.');});
    HEADERS_.slice(5).forEach(function(h){
      if(existing.indexOf(h)>=0)return;
      var i=existing.indexOf('');
      if(i<0)throw new Error('추가 열을 위한 빈 칸이 없습니다.');
      if(sheet.getLastRow()>1 && sheet.getRange(2,i+1,sheet.getLastRow()-1,1).getValues().some(function(row){return row[0]!=='';}))throw new Error(String.fromCharCode(65+i)+'열에 기존 데이터가 있습니다.');
      existing[i]=h;additions.push([i+1,h]);
    });
    additions.forEach(function(item){sheet.getRange(1,item[0]).setValue(item[1]);});
  }
  var map=headerMap_(sheet);
  ['이름','연락처_뒷번호','체크여부','_요청키'].forEach(function(h){sheet.getRange(1,map[h]+1,sheet.getMaxRows(),1).setNumberFormat('@');});
  sheet.hideColumns(map['_요청키']+1);
  var setlist = ss.getSheetByName(SETLIST_SHEET_) || ss.insertSheet(SETLIST_SHEET_);
  if (setlist.getLastRow() === 0) {
    setlist.getRange(1,1,1,4).setValues([['연번','제목','아티스트','url']]);
    setlist.setFrozenRows(1);
    setlist.getRange(1,1,1,4).setBackground('#191329').setFontColor('#f6eafa').setFontWeight('bold');
    setlist.setColumnWidth(1,70); setlist.setColumnWidth(2,260); setlist.setColumnWidth(3,180); setlist.setColumnWidth(4,380);
  }
  // Never reset this property on repeated setup, even if a sheet was edited.
  if (!props.getProperty('LAST_ISSUED')) props.setProperty('LAST_ISSUED','0');
  SpreadsheetApp.flush();
  migrateGuestbook_();
  console.log('준비 완료: 참석자 / 셋리스트. 웹 앱으로 배포 후 /exec 주소를 config.js에 입력하세요.');
}

function doGet(e) {
  var origin = String(e && e.parameter && e.parameter.origin || '');
  var channel = String(e && e.parameter && e.parameter.channel || '');
  if (!isAllowedOrigin_(origin) || !validToken_(channel)) return HtmlService.createHtmlOutput('이 페이지는 등록된 JUKEBOX 티켓 웹사이트에서만 연결할 수 있습니다.');
  var template = HtmlService.createTemplate(BRIDGE_HTML_);
  template.originJson = safeJson_(origin);
  template.channelJson = safeJson_(channel);
  return template.evaluate().setTitle('JUKEBOX 발급 연결').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function bridgeRequest(action, payload, pageOrigin) {
  try {
    if (!isAllowedOrigin_(pageOrigin)) fail_('ORIGIN','등록되지 않은 웹사이트입니다.');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail_('VALIDATION','올바르지 않은 요청입니다.');
    migrateGuestbook_();
    if (action === 'postGuestbook') return {ok:true,data:postGuestbook_(payload)};
    if (action === 'guestbook') return {ok:true,data:guestbook_()};
    if (action === 'public') return {ok:true,data:publicData_()};
    if (action === 'restore') return {ok:true,data:restore_(payload.token)};
    if (action === 'check') return {ok:true,data:check_(payload.token)};
    if (action === 'deposit') return {ok:true,data:recordDeposit_(payload)};
    if (action === 'issue') return {ok:true,data:issue_(payload)};
    fail_('ACTION','지원하지 않는 요청입니다.');
  } catch(e) {
    if (e.publicCode) return {ok:false,code:e.publicCode,message:e.message};
    console.error('Ticket request failed: ' + (e && e.name || 'Error'));
    return {ok:false,code:'SERVER',message:'서버에서 처리 결과를 확인하지 못했어요. 잠시 후 같은 정보로 다시 시도해 주세요.'};
  }
}

function fail_(code,message) { var e=new Error(message); e.publicCode=code; throw e; }
function safeJson_(value) { return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'); }
function validToken_(token) { return typeof token === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(token); }
function isAllowedOrigin_(origin) {
  if (typeof origin !== 'string') return false;
  return (PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGINS') || '').split(',').map(function(v){return v.trim();}).indexOf(origin) !== -1 && /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(origin);
}
function database_() {
  var id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) fail_('CONFIG','등록 서버가 아직 준비되지 않았습니다.');
  return SpreadsheetApp.openById(id);
}
function headerMap_(sheet) {
  var actual=sheet.getRange(1,1,1,7).getValues()[0],map={};
  HEADERS_.forEach(function(h){var i=actual.indexOf(h);if(h==='하고 싶은 말'&&i<0)return;if(i<0||actual.lastIndexOf(h)!==i)fail_('CONFIG','명부 열 제목을 확인해 주세요.');map[h]=i;});
  return map;
}
function assertHeaders_(sheet) { headerMap_(sheet); }
function registration_() {
  var sheet=database_().getSheetByName(REGISTRATION_SHEET_);
  if (!sheet) fail_('CONFIG','등록 서버가 아직 준비되지 않았습니다.');
  assertHeaders_(sheet); return sheet;
}
function rows_(sheet) { var map=headerMap_(sheet);return sheet.getLastRow()<=1?[]:sheet.getRange(2,1,sheet.getLastRow()-1,7).getValues().map(function(row){return HEADERS_.map(function(h){return map[h]===undefined?'':row[map[h]];});}); }
function hash_(token) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join(''); }
function asText_(value) { return /^[=+\-@']/.test(value) ? "'"+value : value; }
function readText_(value) { return String(value == null ? '' : value); }
function ticketFromRow_(row) { return {serial:Number(row[1]),name:readText_(row[2]),issuedAt:new Date(row[0]).toISOString(),checked:String(row[6]||'').trim().toUpperCase()==='O'}; }
function findRequest_(rows,hash) { for(var i=0;i<rows.length;i++){if(rows[i][5]===hash)return ticketFromRow_(rows[i]);} return null; }
function maxIssued_(rows) {
  // An empty registration list starts a new numbering sequence.
  if (rows.length === 0) return 0;
  var saved=Number(PropertiesService.getScriptProperties().getProperty('LAST_ISSUED') || 0);
  if (!Number.isInteger(saved) || saved<0 || saved>CAPACITY_) fail_('CONFIG','연번 설정을 확인해 주세요.');
  var seen={};
  rows.forEach(function(row){var n=Number(row[1]);if(!Number.isInteger(n)||n<1||n>CAPACITY_||seen[n])fail_('CONFIG','명부 연번을 확인해 주세요.');seen[n]=true;saved=Math.max(saved,n);});
  return saved;
}
function validateInput_(input) {
  if (!validToken_(input.token)) fail_('VALIDATION','브라우저 요청 번호가 올바르지 않습니다.');
  if(typeof input.name!=='string'||typeof input.phoneLast4!=='string'||typeof input.message!=='string')fail_('VALIDATION','입력 내용을 확인해 주세요.');
  var name=input.name.normalize('NFC').trim();var phone=input.phoneLast4;var message=input.message.normalize('NFC').trim();
  if(!name||Array.from(name).length>40||/[\u0000-\u001f\u007f]/.test(name))fail_('VALIDATION','이름은 1~40자로 입력해 주세요.');
  if(!/^\d{4}$/.test(phone))fail_('VALIDATION','연락처 뒤 4자리를 입력해 주세요.');
  if(Array.from(message).length>100||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message))fail_('VALIDATION','하고 싶은 말은 100자까지 입력할 수 있어요.');
  return {name:name,phoneLast4:phone,message:message,token:input.token};
}
function issue_(payload) {
  var input=validateInput_({token:payload.token,name:payload.name,phoneLast4:payload.phoneLast4,message:''});
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))fail_('BUSY','신청이 몰리고 있어요. 잠시 후 다시 눌러 주세요.');
  try {
    var sheet=registration_();var rows=rows_(sheet);var requestHash=hash_(input.token);
    var previous=findRequest_(rows,requestHash); if(previous)return previous;
    var current=maxIssued_(rows);if(current>=CAPACITY_)fail_('SOLD_OUT','1,000장의 티켓 발급이 모두 마감되었습니다.');
    var serial=current+1;var now=new Date();var index=sheet.getLastRow()+1;
    // Contact suffix is TEXT: "0007" must remain four characters.
    var map=headerMap_(sheet),canonical=[now,serial,asText_(input.name),input.phoneLast4,asText_(input.message),requestHash,''],row=[];
    if(index>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),index-sheet.getMaxRows());
    HEADERS_.forEach(function(h,i){if(map[h]!==undefined)row[map[h]]=canonical[i];});
    ['이름','연락처_뒷번호','_요청키','체크여부'].forEach(function(h){sheet.getRange(index,map[h]+1).setNumberFormat('@');});
    sheet.getRange(index,1,1,row.length).setValues([row]);
    SpreadsheetApp.flush(); // Commit before releasing the lock.
    PropertiesService.getScriptProperties().setProperty('LAST_ISSUED',String(serial));
    return {serial:serial,name:input.name,issuedAt:now.toISOString(),checked:false};
  } finally { lock.releaseLock(); }
}
function restore_(token) {
  if(!validToken_(token))fail_('VALIDATION','브라우저 요청 번호가 올바르지 않습니다.');
  return findRequest_(rows_(registration_()),hash_(token));
}
function youtubeUrl_(value) {
  var url=String(value||'').trim();
  return /^https:\/\/(?:www\.|m\.)?youtube\.com(?:\/|\?|$)/i.test(url)||/^https:\/\/youtu\.be\//i.test(url) ? url : '';
}
function publicData_() {
  var ss=database_();var registration=registration_();var issued=maxIssued_(rows_(registration));
  var sheet=ss.getSheetByName(SETLIST_SHEET_);var tracks=[];
  if(sheet&&sheet.getLastRow()>1){
    var headers=sheet.getRange(1,1,1,4).getValues()[0];
    if (['연번','제목','아티스트','url'].some(function(v,i){return headers[i]!==v;})) fail_('CONFIG','셋리스트 탭의 열 제목을 확인해 주세요.');
    var values=sheet.getRange(2,1,Math.min(sheet.getLastRow()-1,200),4).getValues();
    values.forEach(function(row){if(String(row[1]).trim()){var n=Number(row[0]);if(Number.isInteger(n)&&n>0)tracks.push({number:n,title:String(row[1]).trim().slice(0,200),artist:String(row[2]).trim().slice(0,100),url:youtubeUrl_(row[3])});}});
    tracks.sort(function(a,b){return a.number-b.number;});
  }
  return {issued:issued,capacity:CAPACITY_,tracks:tracks};
}

function check_(token) {
  if(!validToken_(token))fail_('VALIDATION','유효한 티켓이 필요합니다.');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))fail_('BUSY','잠시 후 다시 확인해 주세요.');
  try{
    var sheet=registration_(), rows=rows_(sheet), hash=hash_(token);
    for(var i=0;i<rows.length;i++)if(rows[i][5]===hash){
      sheet.getRange(i+2,headerMap_(sheet)['체크여부']+1).setValue('O');SpreadsheetApp.flush();rows[i][6]='O';return ticketFromRow_(rows[i]);
    }
    fail_('NOT_FOUND','발급된 티켓을 찾을 수 없습니다.');
  }finally{lock.releaseLock();}
}

var BRIDGE_HTML_ = "<!doctype html>\n<html><head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"></head><body>\n<script>\n'use strict';\nconst pageOrigin = <?!= originJson ?>;\nconst channel = <?!= channelJson ?>;\nlet connected = false;\nconst announce = () => window.top.postMessage({type:'jukebox-bridge',channel,ready:true},pageOrigin);\nconst readyTimer = setInterval(() => { if(!connected) announce(); },1000);\nsetTimeout(()=>clearInterval(readyTimer),30000);\nwindow.addEventListener('message',event=>{\n  if(event.origin!==pageOrigin || event.source!==window.top) return;\n  const data=event.data;\n  if(!data || data.channel!==channel) return;\n  if(data.type==='jukebox-connect'){connected=true;clearInterval(readyTimer);return;}\n  if(data.type!=='jukebox-request'||!['public','restore','issue','check','deposit','guestbook','postGuestbook'].includes(data.action)||typeof data.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.requestId))return;\n  const reply=result=>window.top.postMessage({type:'jukebox-bridge',channel,requestId:data.requestId,result},pageOrigin);\n  google.script.run\n    .withSuccessHandler(reply)\n    .withFailureHandler(()=>reply({ok:false,code:'NETWORK',message:'등록 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'}))\n    .bridgeRequest(data.action,data.payload||{},pageOrigin);\n});\nannounce();\n</script>\n</body></html>\n";

/**
 * JUKEBOX direct HTTP transport.
 * Existing installations: add this as HTTP.gs, save, then update the EXISTING
 * web-app deployment to a new version. No setup rerun or new permissions.
 * Do not add this file if INSTALL.gs already includes doPost.
 */
function doPost(e) {
  var requestId = '';
  var result;
  try {
    var body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || !body || body.length > 8192) fail_('VALIDATION', '올바르지 않은 요청입니다.');
    var request;
    try { request = JSON.parse(body); } catch (parseError) { fail_('VALIDATION', '올바르지 않은 요청입니다.'); }
    if (!request || typeof request !== 'object' || Array.isArray(request)) fail_('VALIDATION', '올바르지 않은 요청입니다.');
    if (!validToken_(request.requestId)) fail_('VALIDATION', '요청 번호를 확인해 주세요.');
    requestId = request.requestId;
    if (request.protocol !== 'jukebox-http-v1') fail_('VERSION', '티켓 페이지를 새로 열어 주세요.');
    if (!isAllowedOrigin_(request.pageOrigin)) fail_('ORIGIN', '등록되지 않은 웹사이트입니다.');
    migrateGuestbook_();
    if (request.action === 'health') {
      result = {ok:true,data:{version:1,depositLedger:true,guestbook:true,guestbookSheet:1}};
    } else if (request.action === 'deposit') {
      result = {ok:true,data:recordDeposit_(request.payload)};
    } else {
      if (['issue','restore','check','guestbook','postGuestbook'].indexOf(request.action) < 0) fail_('ACTION', '지원하지 않는 요청입니다.');
      result = bridgeRequest(request.action, request.payload, request.pageOrigin);
    }
  } catch (err) {
    result = {ok:false,code:err.publicCode || 'SERVER',message:err.publicCode ? err.message : '서버에서 처리 결과를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.'};
  }
  result.protocol = 'jukebox-http-v1';
  result.requestId = requestId;
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}


/** One row per purchase. This is a customer deposit declaration, not bank verification. */
function recordDeposit_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail_('VALIDATION','입금 정보를 확인해 주세요.');
  var input=validateInput_({token:payload.orderToken,name:payload.name,phoneLast4:payload.phoneLast4,message:''});
  if (!Number.isInteger(payload.quantity) || payload.quantity<1 || payload.quantity>10) fail_('VALIDATION','매수는 1~10장이어야 합니다.');
  var payer=input.name+input.phoneLast4, quantity=payload.quantity, key=hash_(input.token);
  var lock=LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('BUSY','입금 내역을 기록 중입니다. 잠시 후 다시 눌러 주세요.');
  try {
    var ss=database_(), sheet=ss.getSheetByName('입금내역');
    if (!sheet) sheet=ss.insertSheet('입금내역');
    var headers=['입금일시','입금인명','매수','_구매키'];
    if (sheet.getLastRow()===0) {
      sheet.getRange(1,1,1,4).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1,1,1,4).setBackground('#191329').setFontColor('#f6eafa').setFontWeight('bold');
      sheet.setColumnWidth(1,190);sheet.setColumnWidth(2,210);sheet.setColumnWidth(3,80);
      sheet.hideColumns(4);
    }
    var actual=sheet.getRange(1,1,1,4).getValues()[0], map={};
    headers.forEach(function(h){var i=actual.indexOf(h);if(i<0||actual.lastIndexOf(h)!==i)fail_('CONFIG','입금내역 시트의 열 제목을 확인해 주세요.');map[h]=i;});
    var rows=sheet.getLastRow()<=1?[]:sheet.getRange(2,1,sheet.getLastRow()-1,4).getValues();
    for(var i=0;i<rows.length;i++){
      if(rows[i][map['_구매키']]!==key)continue;
      if(String(rows[i][map['입금인명']])!==payer||Number(rows[i][map['매수']])!==quantity)fail_('CONFLICT','처음 기록한 입금자 정보나 매수와 다릅니다. 처음 입력한 정보로 다시 확인해 주세요.');
      return {recorded:true,submittedAt:new Date(rows[i][map['입금일시']]).toISOString(),quantity:quantity};
    }
    var index=sheet.getLastRow()+1, now=new Date(), row=[];
    if(index>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),index-sheet.getMaxRows());
    row[map['입금일시']]=now;row[map['입금인명']]=asText_(payer);row[map['매수']]=quantity;row[map['_구매키']]=key;
    sheet.getRange(index,map['입금일시']+1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange(index,map['입금인명']+1).setNumberFormat('@');
    sheet.getRange(index,map['매수']+1).setNumberFormat('0');
    sheet.getRange(index,map['_구매키']+1).setNumberFormat('@');
    sheet.getRange(index,1,1,4).setValues([row]);
    SpreadsheetApp.flush();
    return {recorded:true,submittedAt:now.toISOString(),quantity:quantity};
  } finally {lock.releaseLock();}
}


function guestbookSheet_() {
 var ss=database_(),sheet=ss.getSheetByName('방명록');
 if(!sheet)sheet=ss.insertSheet('방명록');
 var headers=['입력일시','이름','방명록내용','_요청키','_공개여부'];
 if(sheet.getLastRow()===0){
  sheet.getRange(1,1,1,5).setValues([headers]);sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,5).setBackground('#191329').setFontColor('#f6eafa').setFontWeight('bold');
  sheet.setColumnWidth(1,190);sheet.setColumnWidth(2,150);sheet.setColumnWidth(3,430);sheet.hideColumns(4,2);
 }
 var actual=sheet.getRange(1,1,1,5).getValues()[0];
 if(headers.some(function(h,i){return actual[i]!==h;}))fail_('CONFIG','방명록 열 제목을 확인해 주세요.');
 return sheet;
}
function appendGuestbookRow_(sheet,date,name,message,key,isPublic) {
 var index=sheet.getLastRow()+1;
 if(index>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),index-sheet.getMaxRows());
 sheet.getRange(index,1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
 sheet.getRange(index,2,1,3).setNumberFormat('@');
 sheet.getRange(index,1,1,5).setValues([[date,asText_(name),asText_(message),key,isPublic]]);
}
function migrateGuestbook_() {
 var reg=database_().getSheetByName(REGISTRATION_SHEET_);
 if(!reg)return;
 var header=reg.getRange(1,1,1,7).getValues()[0],column=header.indexOf('하고 싶은 말');
 if(column<0&&database_().getSheetByName('방명록'))return;
 var lock=LockService.getScriptLock();if(!lock.tryLock(20000))fail_('BUSY','방명록을 준비 중입니다. 잠시 후 다시 확인해 주세요.');
 try{
  header=reg.getRange(1,1,1,7).getValues()[0];column=header.indexOf('하고 싶은 말');var sheet=guestbookSheet_();if(column<0)return;
  HEADERS_.forEach(function(h){if(header.indexOf(h)<0||header.indexOf(h)!==header.lastIndexOf(h))fail_('CONFIG','참석자 열 제목을 확인해 주세요.');});
  var saved=sheet.getLastRow()>1?sheet.getRange(2,4,sheet.getLastRow()-1,1).getValues().map(function(r){return r[0];}):[];
  var data=reg.getLastRow()>1?reg.getRange(2,1,reg.getLastRow()-1,7).getValues():[];
  data.forEach(function(row){
   var message=String(row[column]||'');if(!message.trim())return;
   var key=hash_('legacy-guestbook|'+row[header.indexOf('_요청키')]+'|'+row[header.indexOf('연번')]+'|'+row[header.indexOf('입력일시')]);
   if(saved.indexOf(key)>=0)return;
   var publicMessage=message.indexOf('[방명록] ')===0;
   appendGuestbookRow_(sheet,row[header.indexOf('입력일시')],String(row[header.indexOf('이름')]||''),publicMessage?message.slice(6):message,key,publicMessage);
   saved.push(key);
  });
  SpreadsheetApp.flush();
  reg.deleteColumn(column+1);
  SpreadsheetApp.flush();
 }finally{lock.releaseLock();}
}
function guestbook_() {
 var sheet=guestbookSheet_();
 var rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,5).getValues():[];
 return {messages:rows.filter(function(r){return r[4]===true&&String(r[2]||'').trim();}).map(function(r){return String(r[2]);})};
}
function postGuestbook_(payload) {
 if(!validToken_(payload.token)||!validToken_(payload.messageToken))fail_('VALIDATION','유효한 티켓과 전송 번호가 필요합니다.');
 var message=typeof payload.message==='string'?payload.message.normalize('NFC').trim():'';
 if(!message||Array.from(message).length>100||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message))fail_('VALIDATION','방명록은 1~100자로 입력해 주세요.');
 if(payload.publicConsent!==true)fail_('VALIDATION','익명 공개 동의를 확인해 주세요.');
 var lock=LockService.getScriptLock();if(!lock.tryLock(20000))fail_('BUSY','잠시 후 다시 보내주세요.');
 try{
  var ticket=findRequest_(rows_(registration_()),hash_(payload.token));if(!ticket)fail_('NOT_FOUND','먼저 본인 이름으로 티켓을 발급받아 주세요.');
  var sheet=guestbookSheet_(),key=hash_(payload.token+'|'+payload.messageToken);
  var rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,5).getValues():[];
  for(var i=0;i<rows.length;i++)if(rows[i][3]===key){
   if(String(rows[i][2])!==message)fail_('CONFLICT','전송 중인 글이 있습니다. 처음 보낸 내용으로 다시 확인해 주세요.');
   return {recorded:true};
  }
  appendGuestbookRow_(sheet,new Date(),ticket.name,message,key,true);
  SpreadsheetApp.flush();return {recorded:true};
 }finally{lock.releaseLock();}
}
