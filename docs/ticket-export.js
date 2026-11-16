/* Prepare a real image before offering a user-initiated download or native share. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const panel=$('exportPanel'),open=$('downloadButton'),photo=$('exportImage'),download=$('exportDownload'),share=$('exportShare'),status=$('exportStatus');
  if(!panel||!open)return;
  let revision=0, attachment=null, owner=null;
  function key(detail){return detail&&detail.ticket?JSON.stringify([detail.token,detail.ticket.serial,detail.ticket.name,!!detail.ticket.preview]):null;}
  function close(restoreFocus=false){
    revision++;owner=null;attachment=null;
    panel.hidden=true;open.removeAttribute('aria-busy');open.setAttribute('aria-expanded','false');
    photo.hidden=true;photo.removeAttribute('src');download.hidden=true;download.removeAttribute('href');share.hidden=true;
    $('exportRetry').hidden=true;$('exportLinkText').hidden=true;$('exportLinkText').value='';
    if(restoreFocus)open.focus();
  }
  function dataUrl(blob){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(new Error('이미지를 열지 못했어요.'));
      reader.readAsDataURL(blob);
    });
  }
  async function makeImage(img,ticket){
    if(!img.complete||!img.naturalWidth){
      if(typeof img.decode==='function')await img.decode();
      else await new Promise((resolve,reject)=>{
        const clean=()=>{img.removeEventListener('load',loaded);img.removeEventListener('error',failed);};
        const loaded=()=>{clean();resolve();},failed=()=>{clean();reject(new Error('포스터를 불러오지 못했어요.'));};
        img.addEventListener('load',loaded);img.addEventListener('error',failed);
        if(img.complete)(img.naturalWidth?loaded:failed)();
      });
    }
    if(!img.naturalWidth||!img.naturalHeight)throw new Error('포스터를 불러오지 못했어요.');
    const canvas=document.createElement('canvas');
    const w=canvas.width=img.naturalWidth,cut=img.naturalHeight,h=canvas.height=Math.round(cut/.85),ctx=canvas.getContext('2d');
    ctx.fillStyle='#130f25';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,cut);
    ctx.strokeStyle='#e66aaf';ctx.lineWidth=w*.002;ctx.setLineDash([w*.012,w*.01]);ctx.beginPath();ctx.moveTo(w*.035,cut);ctx.lineTo(w*.965,cut);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#b5a5c5';ctx.font=`${w*.02}px sans-serif`;ctx.fillText('ADMIT ONE · 자유석',w*.07,h*.89);ctx.textAlign='right';ctx.fillText('2026.11.21',w*.93,h*.89);
    ctx.textAlign='left';ctx.fillStyle='#a494b7';ctx.font=`${w*.019}px sans-serif`;ctx.fillText('TICKET HOLDER',w*.07,h*.925);ctx.textAlign='right';ctx.fillText('LIMITED EDITION',w*.93,h*.925);
    ctx.textAlign='left';ctx.fillStyle='#f9d6ec';ctx.font=`600 ${w*.04}px sans-serif`;ctx.fillText(ticket.name,w*.07,h*.956,w*.48);
    ctx.textAlign='right';ctx.fillStyle='#ff80bd';ctx.font=`${w*.042}px monospace`;ctx.fillText(ticket.preview?'SAMPLE':`No. ${String(ticket.serial).padStart(4,'0')}`,w*.93,h*.956);
    ctx.fillStyle='#0d0b19';
    for(const x of [0,w]){ctx.beginPath();ctx.arc(x,cut,w*.022,0,Math.PI*2);ctx.fill();}
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b&&b.size?resolve(b):reject(new Error('빈 이미지입니다.')),'image/jpeg',.94));
    // Some encoders fall back to PNG. Match the name to the actual MIME type.
    const extension={'image/jpeg':'jpg','image/png':'png'}[blob.type];
    if(!extension)throw new Error('지원되지 않는 이미지 형식입니다.');
    const name='JUKEBOX-'+(ticket.preview?'SAMPLE':String(ticket.serial).padStart(4,'0'))+'.'+extension;
    return {name,blob,src:await dataUrl(blob)};
  }
  async function prepare(){
    const detail=window.Jukebox.currentTicket;
    if(!detail||!detail.ticket)return;
    close();const current=revision;owner=key(detail);
    open.setAttribute('aria-expanded','true');open.setAttribute('aria-busy','true');panel.hidden=false;
    $('exportHeading').focus();status.textContent='티켓 이미지를 준비하고 있어요.';
    $('exportCopyLink').hidden=!!detail.ticket.preview;
    try{
      const result=await makeImage(document.querySelector('#ticket .ticket-art'),detail.ticket);
      if(current!==revision)return;
      photo.src=result.src;photo.alt=detail.ticket.name+'님의 공연 티켓';photo.hidden=false;
      download.href=result.src;download.download=result.name;download.textContent=result.blob.type==='image/png'?'PNG 다운로드':'JPG 다운로드';download.hidden=false;
      try{
        const file=new File([result.blob],result.name,{type:result.blob.type});
        if(typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})){attachment=file;share.hidden=false;}
      }catch{/* The preview and download also work without file sharing. */}
      status.textContent='휴대폰에서는 이미지를 길게 눌러 저장할 수도 있어요.';
    }catch{
      if(current!==revision)return;
      status.textContent='이미지를 준비하지 못했어요. 다시 시도하거나 티켓 링크를 다른 브라우저에서 열어 주세요.';
      $('exportRetry').hidden=false;
    }finally{if(current===revision)open.removeAttribute('aria-busy');}
  }
  share.addEventListener('click',async()=>{
    if(!attachment)return;
    const current=revision;
    try{await navigator.share({files:[attachment]});}
    catch(e){if(current===revision&&e.name!=='AbortError')status.textContent='이 앱에서 파일 공유를 열지 못했어요. 다운로드하거나 티켓 링크를 다른 브라우저에서 열어 주세요.';}
  });
  $('exportCopyLink').addEventListener('click',async()=>{
    const detail=window.Jukebox.currentTicket,current=revision;if(!detail||key(detail)!==owner||detail.ticket.preview)return;
    const url=window.JukeboxPurchase.ticketUrl(detail.token);
    try{await window.JukeboxPurchase.copy(url);if(current===revision)status.textContent='이 티켓의 링크를 복사했어요. Chrome 또는 삼성 인터넷 주소창에 붙여넣어 주세요.';}
    catch{if(current===revision){const input=$('exportLinkText');input.value=url;input.hidden=false;input.focus();input.select();status.textContent='선택된 주소를 복사해 다른 브라우저에서 열어 주세요.';}}
  });
  open.addEventListener('click',prepare);$('exportRetry').addEventListener('click',prepare);
  $('exportClose').addEventListener('click',()=>close(true));
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close(true);}});
  window.addEventListener('jukebox:ticket',e=>{if(owner&&key(e.detail)!==owner)close();});
  window.addEventListener('jukebox:ticket-missing',()=>close());
})();
