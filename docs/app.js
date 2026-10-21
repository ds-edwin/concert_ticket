(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.TICKET_CONFIG;
  const api = new window.Jukebox.TicketAPI();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storageKey = `jukebox:${config.eventId}:${api.preview ? 'preview' : config.endpoint}`;
  let issuedTicket = null, busy = false, soldOut = false, restoring = false, toastTimer;
  function readState() { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } }
  function saveState(value) { try { localStorage.setItem(storageKey, JSON.stringify(value)); return true; } catch { return false; } }
  let local = readState() || {};
  // A random request token is retained before sending. Never store phone/message.
  if (!local.token || !/^[a-f0-9-]{36}$/.test(local.token)) local = { token: window.Jukebox.uuid() };
  const persistent = saveState(local);
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
  function count(value) { return Array.from(value).length; }
  function validate() {
    const name = $('name').value.normalize('NFC').trim();
    const phoneLast4 = $('phoneLast4').value;
    const message = $('message').value.normalize('NFC').trim();
    const errors = {
      name: !name || count(name) > 40 || /[\u0000-\u001f\u007f]/.test(name) ? '이름을 1~40자로 입력해 주세요.' : '',
      phone: !/^\d{4}$/.test(phoneLast4) ? '숫자 4자리를 입력해 주세요.' : '',
      message: count(message) > 100 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message) ? '하고 싶은 말은 100자까지 입력할 수 있어요.' : ''
    };
    [['name','name'],['phone','phoneLast4'],['message','message']].forEach(([key,id]) => { $(key+'Error').textContent = errors[key]; $(id).setAttribute('aria-invalid', Boolean(errors[key])); });
    if (Object.values(errors).some(Boolean)) { $(errors.name ? 'name' : errors.phone ? 'phoneLast4' : 'message').focus(); return null; }
    if (!$('consent').checked) { $('formStatus').textContent = '등록 정보 제출 동의에 체크해 주세요.'; $('consent').focus(); return null; }
    return { name, phoneLast4, message, token: local.token };
  }
  $('message').addEventListener('input', () => {
    const length = count($('message').value.normalize('NFC').trim());
    $('charCount').textContent = `${length} / 100`;
    $('charCount').style.color = length > 100 ? '#ff93ad' : '';
    $('message').setAttribute('aria-invalid', length > 100);
  });
  $('phoneLast4').addEventListener('input', () => { $('phoneLast4').value = $('phoneLast4').value.normalize('NFKC').replace(/\D/g, '').slice(0,4); });
  $('name').addEventListener('input', () => { if (!issuedTicket) { $('frontName').textContent = $('name').value.trim() || 'YOUR NAME'; $('backName').textContent = $('frontName').textContent; } });
  function showTicket(ticket, celebrate = false) {
    if (!ticket || typeof ticket.name !== 'string' || (!ticket.preview && (!Number.isInteger(ticket.serial) || ticket.serial < 1 || ticket.serial > 1000))) throw new Error('잘못된 발급 응답입니다.');
    issuedTicket = ticket;
    $('ticket').classList.toggle('checked', ticket.checked === true);
    $('managerButton').hidden = false;
    $('managerButton').disabled = ticket.checked === true;
    $('managerButton').textContent = ticket.checked ? '확인 완료 ✓' : '매니저 확인';
    local.ticket = ticket;
    saveState(local);
    const serial = ticket.preview ? 'SAMPLE' : `No. ${String(ticket.serial).padStart(4,'0')}`;
    $('frontName').textContent = $('backName').textContent = ticket.name;
    $('frontSerial').textContent = $('backSerial').textContent = serial;
    $('stageEdition').textContent = ticket.preview ? 'SAMPLE · NOT ISSUED' : `EDITION ${String(ticket.serial).padStart(4,'0')} / 1000`;
    $('registration').hidden = true;
    $('issuedSection').hidden = false;
    $('issuedEyebrow').textContent = ticket.preview ? 'DESIGN PREVIEW' : "IT'S YOURS";
    $('issuedTitle').textContent = ticket.preview ? `${ticket.name}님의 샘플 티켓` : `${ticket.name}님의 티켓이 준비됐어요.`;
    $('issuedDetail').textContent = ticket.preview ? '디자인 체험용이며 실제 번호와 등록 기록은 생성되지 않습니다.' : `${serial} · 같은 브라우저에서 다시 열면 이 티켓을 확인할 수 있어요.\n이미지를 저장해 간직하세요. 발급은 결제 확인과 별개입니다.`;
    syncStub();
    $('phoneLast4').value = ''; $('message').value = '';
    if (celebrate) { rotation.y.target = Math.round(rotation.y.current / 360) * 360; rotation.x.target = 0; rotation.z.target = -1; animate(); if (!reduced) confetti(); }
  }
  function confetti() {
    for (let i=0; i<26; i++) {
      const dot = document.createElement('i'); dot.className = 'confetti-dot'; dot.style.left = `${45 + Math.random()*10}%`; dot.style.top='45%'; dot.style.background = i%2 ? '#ff68b3' : '#4bd4fb'; dot.style.setProperty('--dx',`${(Math.random()-.5)*600}px`); dot.style.setProperty('--dy',`${120+Math.random()*350}px`); document.body.append(dot); setTimeout(()=>dot.remove(),1900);
    }
  }
  $('ticketForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || soldOut) return;
    $('formStatus').textContent = '';
    const payload = validate(); if (!payload) return;
    if (!persistent && !api.preview) { $('formStatus').textContent = '이 브라우저의 저장 공간을 사용할 수 없어요. 중복 발급 방지를 위해 일반 브라우저에서 저장 기능을 허용한 뒤 다시 열어 주세요.'; return; }
    busy=true; $('issueButton').disabled=true; $('issueLabel').textContent = api.preview ? '샘플 준비 중…' : '당신의 번호를 새기는 중…';
    try {
      const ticket = api.preview ? { name: payload.name, preview:true } : await api.request('issue', payload);
      showTicket(ticket,true);
      if (!api.preview) refreshPublic(true);
    } catch (e) {
      $('formStatus').textContent = e.message || '발급 결과를 확인하지 못했어요. 다시 시도해 주세요.';
      if (e.code === 'SOLD_OUT') { soldOut = true; $('capacityText').textContent = '1,000장 발급이 모두 마감되었습니다.'; }
    } finally { busy=false; $('issueButton').disabled=soldOut; $('issueLabel').textContent = soldOut ? '발급 마감' : api.preview ? '샘플 티켓 보기' : '나의 티켓 받기'; }
  });
  async function restoreTicket(silent = false) {
    if (api.preview || restoring) return;
    if (busy) { if (!silent) $('restoreStatus').textContent = '티켓 발급을 처리하고 있어요. 완료 후 다시 확인해 주세요.'; return; }
    restoring = true;
    $('restoreButton').disabled = true;
    $('restoreButton').textContent = '내 티켓 확인 중…';
    if (!silent) $('restoreStatus').textContent = '이 브라우저에서 발급한 티켓을 확인하고 있어요.';
    try {
      const ticket = await api.request('restore', { token: local.token });
      if (ticket) {
        showTicket(ticket);
        if (!silent) $('restoreStatus').textContent = `기존 티켓 No. ${String(ticket.serial).padStart(4,'0')}을 불러왔어요.`;
      } else if (!silent) {
        $('restoreStatus').textContent = '현재 서버에서 이 브라우저의 발급 기록을 찾지 못했어요. 발급했던 브라우저에서 다시 확인해 주세요.';
      }
    } catch (e) {
      if (!silent) $('restoreStatus').textContent = e.message || '기존 티켓을 확인하지 못했어요. 잠시 후 다시 눌러 주세요.';
      else if (local.ticket) toast('저장된 티켓을 표시합니다. 서버 확인은 잠시 후 다시 시도해 주세요.');
    } finally {
      restoring = false;
      $('restoreButton').disabled = false;
      $('restoreButton').textContent = '내 티켓 다시 확인 ↻';
    }
  }
  $('restoreButton').addEventListener('click', () => restoreTicket());
  const publicCacheKey = storageKey + ':setlist';
  let publicRequest = null, lastPublicSync = 0, displayedSetlist = null;
  function validSetlist(value) {
    return value && Number.isFinite(Date.parse(value.updatedAt)) && Array.isArray(value.tracks)
      && value.tracks.length <= 1000 && value.tracks.every(track => track
        && Number.isInteger(track.number) && track.number > 0
        && typeof track.title === 'string' && track.title.trim());
  }
  function setlistTime(value) {
    return new Date(value).toLocaleString('ko-KR', {timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  }
  function renderTracks(tracks) {
    const list = document.createDocumentFragment();
    for (const track of tracks) {
      const li=document.createElement('li'); li.className='track';
      const number=document.createElement('span'); number.className='track-no'; number.textContent=String(track.number).padStart(2,'0');
      const name=document.createElement('span'); name.className='track-name'; name.textContent=track.title;
      if (typeof track.artist === 'string' && track.artist.trim()) { const artist=document.createElement('span'); artist.className='track-artist'; artist.textContent=track.artist.trim(); name.append(artist); }
      li.append(number,name);
      const url=window.Jukebox.youtubeUrl(track.url);
      if (url) { const a=document.createElement('a'); a.className='youtube-link'; a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; a.setAttribute('aria-label',track.title + ' 유튜브에서 듣기'); a.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3 17 10 6 17Z"/></svg>'; li.append(a); }
      else { const dash=document.createElement('span'); dash.className='track-unlinked'; dash.textContent='—'; li.append(dash); }
      list.append(li);
    }
    $('setlist').replaceChildren(list);
    $('setlistState').hidden=tracks.length>0;
    $('setlistState').textContent=api.preview ? '공연 셋리스트가 아직 연결되지 않았어요.' : '셋리스트를 준비하고 있어요. 곡이 등록되면 이곳에서 확인할 수 있습니다.';
  }
  function showSavedSetlist() {
    if (api.preview) return;
    let cached;
    try { cached=JSON.parse(localStorage.getItem(publicCacheKey) || 'null'); } catch {}
    const candidates=[config.setlistSnapshot,cached].filter(validSetlist);
    candidates.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
    if (!candidates.length) return;
    displayedSetlist=candidates[0];
    renderTracks(displayedSetlist.tracks);
    $('setlistUpdated').textContent=setlistTime(displayedSetlist.updatedAt)+' 확인 · 최신 목록 확인 중';
  }
  function refreshPublic(force = false) {
    if (publicRequest) return publicRequest;
    if (!force && Date.now() - lastPublicSync < 10000) return Promise.resolve();
    $('retrySetlist').disabled = true;
    $('retrySetlist').textContent = '새 목록 확인 중…';
    if (!displayedSetlist) {
      $('setlistState').hidden=false;
      $('setlistState').textContent='셋리스트를 불러오는 중입니다.';
    }
    publicRequest = (async () => {
      try {
        const data = await api.request('public');
        const snapshot={tracks:data?.tracks,updatedAt:new Date().toISOString()};
        if (!validSetlist(snapshot)) throw new Error('셋리스트 응답을 확인하지 못했어요.');
        displayedSetlist=snapshot;
        renderTracks(snapshot.tracks);
        // Store public songs only. Ticket-holder details are never included.
        if (!api.preview) { try { localStorage.setItem(publicCacheKey,JSON.stringify(snapshot)); } catch {} }
        if (Number.isInteger(data.issued)) {
          $('capacityText').textContent=data.issued.toLocaleString()+' / 1,000장 발급 완료';
          soldOut=data.issued>=1000;
          if (!busy) { $('issueButton').disabled=soldOut; $('issueLabel').textContent=soldOut?'발급 마감':'나의 티켓 받기'; }
          if (soldOut) $('capacityText').textContent='1,000장 발급이 모두 마감되었습니다.';
        }
        lastPublicSync=Date.now();
        $('setlistUpdated').textContent='방금 업데이트';
        delete $('setlistState').dataset.error;
      } catch(e) {
        $('setlistState').dataset.error=e.code || 'RESPONSE';
        if (displayedSetlist) {
          $('setlistUpdated').textContent=setlistTime(displayedSetlist.updatedAt)+' 확인 · 최신 조회 지연';
        } else {
          $('setlistState').hidden=false;
          $('setlistState').textContent='셋리스트를 불러오지 못했어요. 새로고침을 눌러 주세요.';
          $('setlistUpdated').textContent='연결을 다시 확인해 주세요';
        }
      } finally {
        publicRequest=null;
        $('retrySetlist').disabled=false;
        $('retrySetlist').textContent='새로고침 ↻';
      }
    })();
    return publicRequest;
  }
  function openPanel() {
    $('detailsPanel').hidden=false;
    $('ticket').setAttribute('aria-expanded','true');
    refreshPublic(true);
    if (matchMedia('(max-width: 760px)').matches) $('detailsPanel').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
  }
  function closePanel() { $('detailsPanel').hidden=true; $('ticket').setAttribute('aria-expanded','false'); $('ticket').focus({preventScroll:true}); }
  $('closePanel').addEventListener('click',closePanel);
  $('showSetlistButton').addEventListener('click',()=>{openPanel(); $('detailsPanel').scrollIntoView({behavior:reduced?'instant':'smooth',block:'nearest'});});
  $('retrySetlist').addEventListener('click',()=>refreshPublic(true));
  $('setlistHint').addEventListener('click',openPanel);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('detailsPanel').hidden)closePanel();});
  // Physical card: damped rotations, bounded tilt, drag inertia, cursor foil.
  const card=$('ticket');
  const stub=document.createElement('div'); stub.className='ticket-stub';stub.setAttribute('aria-hidden','true');
  for(const face of [...card.children]) {const copy=face.cloneNode(true);copy.removeAttribute('aria-hidden');for(const el of copy.querySelectorAll('[id]')){el.dataset.mirror=el.id;el.removeAttribute('id');}stub.append(copy);}
  card.append(stub);
  function syncStub(){for(const el of stub.querySelectorAll('[data-mirror]'))el.textContent=$(el.dataset.mirror).textContent;}
  $('name').addEventListener('input',syncStub);
  let checking=false;
  $('managerButton').addEventListener('click',async()=>{
    if(!issuedTicket||checking||issuedTicket.checked)return;
    checking=true;$('managerButton').disabled=true;
    try{const result=api.preview?{...issuedTicket,checked:true}:await api.request('check',{token:local.token});showTicket(result);toast(api.preview?'샘플 티켓 접힘 미리보기입니다.':'매니저 확인이 기록되었습니다.');}
    catch(e){toast(e.message||'확인 기록에 실패했습니다. 다시 눌러 주세요.');}
    finally{checking=false;$('managerButton').disabled=issuedTicket.checked===true;}
  });
  async function syncCheck(){if(api.preview||!issuedTicket||checking||restoring||busy||document.hidden)return;restoring=true;try{const result=await api.request('restore',{token:local.token});if(result)showTicket(result);}catch{}finally{restoring=false;}}
  function syncVisible() {
    if (document.hidden) return;
    syncCheck();
    if (!$('detailsPanel').hidden) refreshPublic();
  }
  setInterval(syncVisible,30000);
  document.addEventListener('visibilitychange',syncVisible);
  window.addEventListener('focus',syncVisible);

  const rotation={x:{current:5,target:5,velocity:0},y:{current:-8,target:-8,velocity:0},z:{current:-2,target:-2,velocity:0}};
  let frame=0, drag=null, dragged=false, lastFrame=0;
  function paint() { card.style.transform=`rotateX(${rotation.x.current}deg) rotateY(${rotation.y.current}deg) rotateZ(${rotation.z.current}deg)`; const back=Math.cos(rotation.y.current*Math.PI/180)<0; card.querySelector('.ticket-front').setAttribute('aria-hidden',back); card.querySelector('.ticket-back').setAttribute('aria-hidden',!back); }
  function tick(now) {
    const dt=Math.min((now-lastFrame)/16.67||1,2); lastFrame=now;
    let moving=false;
    for (const axis of Object.values(rotation)) {
      if(reduced){axis.current=axis.target;axis.velocity=0;continue;}
      axis.velocity=(axis.velocity+(axis.target-axis.current)*.085*dt)*Math.pow(.68,dt); axis.current+=axis.velocity*dt;
      if(Math.abs(axis.target-axis.current)>.015||Math.abs(axis.velocity)>.015)moving=true; else axis.current=axis.target;
    }
    paint(); if(moving)frame=requestAnimationFrame(tick); else frame=0;
  }
  function animate(){if(!frame){lastFrame=performance.now();frame=requestAnimationFrame(tick);}}
  function reset(){rotation.x.target=0;rotation.y.target=Math.round(rotation.y.current/360)*360;rotation.z.target=0;animate();}
  card.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const rect=$('perspective').getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,rx:rotation.x.target,ry:rotation.y.target,lastX:event.clientX,lastTime:performance.now(),velocity:0,width:rect.width,touch:event.pointerType==='touch'};dragged=false;card.setPointerCapture(event.pointerId);card.classList.add('dragging');
  });
  card.addEventListener('pointermove',event=>{
    const rect=$('perspective').getBoundingClientRect();const px=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));const py=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    card.style.setProperty('--mx',`${px*100}%`);card.style.setProperty('--my',`${py*100}%`);card.style.setProperty('--foil-opacity',drag?'.15':'.09');
    if(!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(drag.touch&&!dragged&&Math.abs(dy)>Math.abs(dx))return;
    if(Math.hypot(dx,dy)>6)dragged=true;
    const now=performance.now();drag.velocity=(event.clientX-drag.lastX)/Math.max(1,now-drag.lastTime);drag.lastX=event.clientX;drag.lastTime=now;
    rotation.y.target=drag.ry+dx/drag.width*270;rotation.x.target=drag.touch?0:Math.max(-48,Math.min(48,drag.rx-dy*.22));rotation.z.target=Math.max(-5,Math.min(5,dx*.008));animate();
  });
  function release(event,cancelled=false){if(!drag||event.pointerId!==drag.id)return;const velocity=performance.now()-drag.lastTime<90?drag.velocity:0;if(dragged&&!cancelled){rotation.y.target+=Math.max(-35,Math.min(35,velocity*23));rotation.x.target*=.35;rotation.z.target*=.25;animate();}if(card.hasPointerCapture(event.pointerId))card.releasePointerCapture(event.pointerId);drag=null;card.classList.remove('dragging');if(cancelled)dragged=true;}
  card.addEventListener('pointerup',e=>release(e));card.addEventListener('pointercancel',e=>release(e,true));
  card.addEventListener('click',()=>{if(!dragged)openPanel();dragged=false;});
  card.addEventListener('pointerleave',()=>{if(!drag){card.style.setProperty('--foil-opacity','.035');card.style.setProperty('--mx','50%');card.style.setProperty('--my','50%');}});
  card.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))e.preventDefault();if(e.key==='Enter'||e.key===' ')openPanel();if(e.key==='ArrowLeft')rotation.y.target-=20;if(e.key==='ArrowRight')rotation.y.target+=20;if(e.key==='ArrowUp')rotation.x.target=Math.min(48,rotation.x.target+10);if(e.key==='ArrowDown')rotation.x.target=Math.max(-48,rotation.x.target-10);if(e.key.toLowerCase()==='r')reset();animate();});
  $('flipButton').addEventListener('click',()=>{rotation.y.target=Math.round(rotation.y.target/180)*180+180;rotation.x.target=0;rotation.z.target=0;animate();});
  $('resetButton').addEventListener('click',reset);
  $('downloadButton').addEventListener('click',async()=>{
    if(!issuedTicket)return;
    try{
      const img=card.querySelector('img');await img.decode();
      const canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth;
      canvas.height=Math.round(img.naturalHeight/.85);
      const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height, cut=img.naturalHeight;
      ctx.fillStyle='#130f25';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,cut);
      ctx.strokeStyle='#e66aaf';ctx.lineWidth=w*.002;ctx.setLineDash([w*.012,w*.01]);ctx.beginPath();ctx.moveTo(w*.035,cut);ctx.lineTo(w*.965,cut);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#b5a5c5';ctx.font=`${w*.02}px sans-serif`;ctx.fillText('ADMIT ONE · 자유석',w*.07,h*.89);ctx.textAlign='right';ctx.fillText('2026.11.21',w*.93,h*.89);
      ctx.textAlign='left';ctx.fillStyle='#a494b7';ctx.font=`${w*.019}px sans-serif`;ctx.fillText('TICKET HOLDER',w*.07,h*.925);ctx.textAlign='right';ctx.fillText('LIMITED EDITION',w*.93,h*.925);
      ctx.textAlign='left';ctx.fillStyle='#f9d6ec';ctx.font=`600 ${w*.04}px sans-serif`;ctx.fillText(issuedTicket.name,w*.07,h*.956,w*.48);
      ctx.textAlign='right';ctx.fillStyle='#ff80bd';ctx.font=`${w*.042}px monospace`;ctx.fillText(issuedTicket.preview?'SAMPLE':`No. ${String(issuedTicket.serial).padStart(4,'0')}`,w*.93,h*.956);
      ctx.globalCompositeOperation='destination-out';
      for(const x of [0,w]){ctx.beginPath();ctx.arc(x,cut,w*.022,0,Math.PI*2);ctx.fill();}
      ctx.globalCompositeOperation='source-over';
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`JUKEBOX-${issuedTicket.preview?'SAMPLE':String(issuedTicket.serial).padStart(4,'0')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('티켓 이미지를 저장했습니다.');
    }catch{toast('이미지 저장에 실패했어요. 다시 시도해 주세요.');}
  });
  async function init(){
    $('previewBanner').hidden=!api.preview;
    $('restoreArea').hidden=api.preview;
    if(api.preview){$('issueLabel').textContent='샘플 티켓 보기';$('capacityText').textContent='미리보기 · 실제 번호 미발급';}
    if(!api.preview&&!persistent)$('formStatus').textContent='브라우저 저장 기능이 꺼져 있습니다. 저장 기능을 허용해야 티켓을 발급할 수 있어요.';
    paint();
    showSavedSetlist();
    if(local.ticket){try{showTicket(local.ticket);}catch{delete local.ticket;saveState(local);}}
    if(!api.preview){
      // Recover even when a previous request committed but the response was lost.
      await Promise.allSettled([restoreTicket(true), refreshPublic(true)]);
    } else {
      refreshPublic(true);
    }
  }
  init();
})();
