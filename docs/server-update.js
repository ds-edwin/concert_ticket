(function(){
'use strict';
const $=id=>document.getElementById(id);
$('copyCode').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('serverCode').value);$('copyStatus').textContent='복사했습니다.';}
  catch{$('serverCode').focus();$('serverCode').select();$('copyStatus').textContent='선택된 코드를 복사해 주세요.';}
});
$('checkConnection').addEventListener('click',async()=>{
  const button=$('checkConnection');button.disabled=true;button.textContent='서버 확인 중…';
  $('connectionStatus').textContent='배포된 서버의 응답을 확인하고 있습니다.';
  try{
    const api=new window.Jukebox.TicketAPI();
    const result=await api.sendHTTP('health',{},15000);
    if(result?.version!==1)throw new Error('서버 버전을 확인하지 못했습니다.');
    $('connectionStatus').textContent='새 서버 연결 정상 ✓\n이제 티켓 페이지를 새로 열어 발급·불러오기를 이용하세요.';
    $('connectionStatus').dataset.result='success';
  }catch(e){
    $('connectionStatus').textContent=e.code==='SERVER_UPDATE'
      ?'아직 이전 서버가 응답하고 있습니다. 코드 저장 후 기존 배포의 버전을 “새 버전”으로 바꾸어 배포해 주세요.'
      :'새 서버 응답을 확인하지 못했습니다. 기존 배포를 새 버전으로 배포했는지 확인해 주세요. ('+(e.code||'RESPONSE')+')';
    $('connectionStatus').dataset.result='error';
  }finally{button.disabled=false;button.textContent='새 서버 연결 확인';}
});
})();
