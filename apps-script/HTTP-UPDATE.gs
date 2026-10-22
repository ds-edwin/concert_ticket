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
    if (request.action === 'health') {
      result = {ok:true,data:{version:1,depositLedger:true}};
    } else if (request.action === 'deposit') {
      result = {ok:true,data:recordDeposit_(request.payload)};
    } else {
      if (['issue','restore','check'].indexOf(request.action) < 0) fail_('ACTION', '지원하지 않는 요청입니다.');
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
