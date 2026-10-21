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
      result = {ok:true,data:{version:1}};
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
