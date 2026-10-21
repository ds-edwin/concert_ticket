(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.TICKET_CONFIG;
  const api = new window.Jukebox.TicketAPI();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storageKey = `jukebox:${config.eventId}:${api.preview ? 'preview' : config.endpoint}`;
  let issuedTicket = null, busy = false, soldOut = false, restoring = false, toastTimer;
  let restoreRequest = null, restoreInteractive = false;
  let cutArmed = false, cutGesture = null, checkRevision = 0;
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
    if (ticket.checked === true) delete local.pendingCheck;
    $('ticket').classList.toggle('checked', ticket.checked === true || local.pendingCheck === true);
    $('managerButton').hidden = false;
    $('managerButton').disabled = ticket.checked === true;
    $('managerButton').textContent = ticket.checked ? '확인 완료 ✓' : cutArmed ? '매니저 확인 해제' : '매니저 확인';
    if (ticket.checked) setCutArmed(false);
    $('cutStatus').textContent = ticket.checked ? '입장 확인 완료' : local.pendingCheck ? '티켓은 잘렸어요. 입장 확인 저장을 기다리고 있어요.' : cutArmed ? '점선 어디서든 좌우로 약 40%만 그어주세요.' : '';
    if (local.pendingCheck) $('managerButton').textContent = checking ? '입장 확인 저장 중…' : '입장 확인 저장 재시도';
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
    if (restoring) { $('formStatus').textContent = '기존 발급 기록을 확인 중이에요. 잠시 후 다시 눌러 주세요.'; return; }
    $('formStatus').textContent = '';
    const payload = validate(); if (!payload) return;
    if (!persistent && !api.preview) { $('formStatus').textContent = '이 브라우저의 저장 공간을 사용할 수 없어요. 중복 발급 방지를 위해 일반 브라우저에서 저장 기능을 허용한 뒤 다시 열어 주세요.'; return; }
    busy=true; $('issueButton').disabled=true; $('issueLabel').textContent = api.preview ? '샘플 준비 중…' : '당신의 번호를 새기는 중…';
    try {
      const ticket = api.preview ? { name: payload.name, preview:true } : await api.issue(payload, () => {
        $('issueLabel').textContent = '발급 기록 확인 중…';
        $('formStatus').textContent = '응답이 늦어 기존 발급 기록을 확인하고 있어요. 잠시만 기다려 주세요.';
      });
      showTicket(ticket,true);
      $('formStatus').textContent = '';
    } catch (e) {
      $('formStatus').textContent = e.message || '발급 결과를 확인하지 못했어요. 다시 시도해 주세요.';
      if (e.code === 'SOLD_OUT') { soldOut = true; $('capacityText').textContent = '1,000장 발급이 모두 마감되었습니다.'; }
    } finally { busy=false; $('issueButton').disabled=soldOut; $('issueLabel').textContent = soldOut ? '발급 마감' : api.preview ? '샘플 티켓 보기' : '나의 티켓 받기'; }
  });
  // Only a successful, explicit missing-record response may clear a cached ticket.
  function clearDeletedTicket() {
    issuedTicket = null;
    checkRevision++;
    delete local.pendingCheck;
    setCutArmed(false);
    $('cutStatus').textContent = '';
    delete local.ticket;
    saveState(local); // Keep the request token for safe retries.
    soldOut = false;
    $('ticketForm').reset();
    $('registration').hidden = false;
    $('issuedSection').hidden = true;
    $('issuedTitle').textContent = '당신의 티켓이 준비됐어요.';
    $('issuedDetail').textContent = '';
    $('managerButton').hidden = true;
    $('managerButton').disabled = false;
    $('managerButton').textContent = '매니저 확인';
    $('ticket').classList.remove('checked');
    $('ticket').setAttribute('aria-expanded', 'false');
    $('detailsPanel').hidden = true;
    $('frontName').textContent = $('backName').textContent = 'YOUR NAME';
    $('frontSerial').textContent = $('backSerial').textContent = 'No. ————';
    $('stageEdition').textContent = '001 — 1000';
    $('charCount').textContent = '0 / 100';
    $('charCount').style.color = '';
    ['nameError', 'phoneError', 'messageError', 'formStatus'].forEach(id => $(id).textContent = '');
    ['name', 'phoneLast4', 'message'].forEach(id => $(id).setAttribute('aria-invalid', 'false'));
    $('capacityText').textContent = '총 1,000장의 고유 번호 티켓';
    $('issueButton').disabled = false;
    $('issueLabel').textContent = '나의 티켓 받기';
    syncStub();
    reset();
    $('restoreStatus').textContent = '발급 기록이 삭제되어 초기 화면으로 돌아왔어요. 다시 티켓을 발급받을 수 있습니다.';
  }
  function restoreTicket(silent = false) {
    if (api.preview) return Promise.resolve();
    if (busy || checking) {
      if (!silent) $('restoreStatus').textContent = '티켓을 처리하고 있어요. 완료 후 다시 확인해 주세요.';
      return Promise.resolve();
    }
    if (!silent) {
      restoreInteractive = true;
      $('restoreStatus').textContent = '이 브라우저에서 발급한 티켓을 확인하고 있어요.';
    }
    // Manual confirmation joins an existing background lookup instead of silently returning.
    if (restoreRequest) return restoreRequest;
    restoring = true;
    $('restoreButton').disabled = true;
    $('restoreButton').textContent = '내 티켓 확인 중…';
    const revision = checkRevision;
    restoreRequest = api.request('restore', { token: local.token }).then(ticket => {
      // A lookup started before a tear must not undo its immediate visual state.
      if (revision !== checkRevision) return;
      if (ticket) {
        showTicket(ticket);
        if (restoreInteractive) $('restoreStatus').textContent = `기존 티켓 No. ${String(ticket.serial).padStart(4,'0')}을 불러왔어요.`;
      } else if (ticket === null && (issuedTicket || local.ticket)) {
        clearDeletedTicket();
      } else if (restoreInteractive) {
        $('restoreStatus').textContent = '현재 서버에서 이 브라우저의 발급 기록을 찾지 못했어요. 발급했던 브라우저에서 다시 확인해 주세요.';
      }
    }).catch(e => {
      if (restoreInteractive) $('restoreStatus').textContent = e.message || '기존 티켓을 확인하지 못했어요. 잠시 후 다시 눌러 주세요.';
    }).finally(() => {
      restoring = false;
      restoreRequest = null;
      restoreInteractive = false;
      $('restoreButton').disabled = false;
      $('restoreButton').textContent = '내 티켓 다시 확인 ↻';
    });
    return restoreRequest;
  }
  $('restoreButton').addEventListener('click', () => restoreTicket());
  function renderTracks(tracks) {
    const list = document.createDocumentFragment();
    for (const track of tracks) {
      const li=document.createElement('li'); li.className='track';
      const number=document.createElement('span'); number.className='track-no'; number.textContent=String(track.number).padStart(2,'0');
      const name=document.createElement('span'); name.className='track-name'; name.textContent=track.title;
      if (typeof track.artist === 'string' && track.artist.trim()) { const artist=document.createElement('span'); artist.className='track-artist'; artist.textContent=track.artist.trim(); name.append(artist); }
      li.append(number,name);
      const url=window.Jukebox.youtubeUrl(track.url);
      if (url) { const a=document.createElement('a'); a.className='youtube-link'; a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; a.setAttribute('aria-label',track.title + ' 유튜브에서 듣기'); a.title=track.title+' · YouTube'; a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8Z"/><path fill="#171121" d="m9.6 15.8 6.3-3.8-6.3-3.8Z"/></svg>'; li.append(a); }
      else { const dash=document.createElement('span'); dash.className='track-unlinked'; dash.textContent='—'; dash.setAttribute('aria-label','유튜브 링크 없음'); li.append(dash); }
      list.append(li);
    }
    $('setlist').replaceChildren(list);
    $('setlistState').hidden=tracks.length>0;
    $('setlistState').textContent='셋리스트를 준비하고 있어요.';
  }
  function openPanel() {
    $('detailsPanel').hidden=false;
    $('ticket').setAttribute('aria-expanded','true');
    if (matchMedia('(max-width: 760px)').matches) $('detailsPanel').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
  }
  function closePanel() { $('detailsPanel').hidden=true; $('ticket').setAttribute('aria-expanded','false'); $('ticket').focus({preventScroll:true}); }
  $('closePanel').addEventListener('click',closePanel);
  $('showSetlistButton').addEventListener('click',()=>{openPanel(); $('detailsPanel').scrollIntoView({behavior:reduced?'instant':'smooth',block:'nearest'});});
  $('setlistHint').addEventListener('click',openPanel);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('detailsPanel').hidden)closePanel();});
  // Physical card: damped rotations, bounded tilt, drag inertia, cursor foil.
  const card=$('ticket');
  const rotationSurface=card.closest('.ticket-stage');
  const stub=document.createElement('div'); stub.className='ticket-stub';stub.setAttribute('aria-hidden','true');
  for(const face of [...card.children]) {const copy=face.cloneNode(true);copy.removeAttribute('aria-hidden');for(const el of copy.querySelectorAll('[id]')){el.dataset.mirror=el.id;el.removeAttribute('id');}stub.append(copy);}
  card.append(stub);
  function syncStub(){for(const el of stub.querySelectorAll('[data-mirror]'))el.textContent=$(el.dataset.mirror).textContent;}
  $('name').addEventListener('input',syncStub);
  let checking=false;
  const cutLine = document.createElement('div');
  cutLine.className = 'cut-line';
  cutLine.tabIndex = -1;
  cutLine.setAttribute('role','button');
  cutLine.setAttribute('aria-label','점선을 따라 잘라 입장 확인. 키보드에서는 Enter를 누르세요.');
  cutLine.innerHTML = '<span class="cut-track"></span><span class="cut-trace"></span>';
  card.append(cutLine);
  function cutHaptic(pattern) {
    try { if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern); } catch {}
  }
  function cancelCutGesture() {
    if (cutGesture?.touch) cutHaptic(0);
    if(cutGesture && cutLine.hasPointerCapture(cutGesture.id)) cutLine.releasePointerCapture(cutGesture.id);
    cutGesture = null;
    card.style.setProperty('--cut-progress','0');
  }
  function setCutArmed(value) {
    cancelCutGesture();
    cutArmed = value;
    card.classList.toggle('cut-armed',value);
    card.setAttribute('role',value ? 'group' : 'button');
    $('managerButton').setAttribute('aria-pressed',String(value));
    $('managerButton').textContent = issuedTicket?.checked ? '확인 완료 ✓' : value ? '매니저 확인 해제' : '매니저 확인';
    $('flipButton').disabled = $('resetButton').disabled = value;
    cutLine.tabIndex = value ? 0 : -1;
    $('cutStatus').textContent = value ? '점선 어디서든 좌우로 약 40%만 그어주세요.' : '';
    if(value) {
      cancelTouchRotation();
      if(drag?.captureTarget.hasPointerCapture(drag.id)) drag.captureTarget.releasePointerCapture(drag.id);
      drag = null;
      card.classList.remove('dragging');
      for(const axis of Object.values(rotation)) { axis.current=0;axis.target=0;axis.velocity=0; }
      paint();
      cutLine.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});
    }
  }
  $('managerButton').addEventListener('click',()=>{
    if(!issuedTicket || checking || restoring || issuedTicket.checked) return;
    if (local.pendingCheck) { finishCut(); return; }
    setCutArmed(!cutArmed);
  });
  async function finishCut() {
    if ((!cutArmed && !local.pendingCheck) || checking || !issuedTicket || issuedTicket.checked) return;
    checking = true;
    checkRevision++;
    local.pendingCheck = true;
    saveState(local);
    setCutArmed(false);
    // Separate the visual tear from the server's confirmed check value.
    card.classList.add('checked');
    $('managerButton').disabled = true;
    $('managerButton').textContent = '입장 확인 저장 중…';
    $('cutStatus').textContent = '티켓은 잘렸어요. 입장 확인을 기록하고 있어요…';
    try {
      // Allow the torn state to paint before starting any network work.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const result = api.preview ? {...issuedTicket,checked:true} : await api.request('check',{token:local.token});
      if (!result || typeof result.checked !== 'boolean') throw new Error('입장 확인 결과를 확인하지 못했어요.');
      delete local.pendingCheck;
      showTicket(result);
      toast(result.checked ? (api.preview ? '티켓 자르기 미리보기입니다.' : '입장 확인이 기록되었습니다.') : '시트의 최종 확인 상태를 반영했습니다.');
    } catch(e) {
      // An ambiguous failure is not proof that the write failed: retain the tear.
      $('cutStatus').textContent = '잘린 상태는 유지됩니다. 저장 확인이 늦어지고 있어요. 아래 버튼으로 다시 시도할 수 있어요.';
    } finally {
      checking = false;
      $('managerButton').disabled = issuedTicket?.checked === true;
      if (local.pendingCheck) $('managerButton').textContent = '입장 확인 저장 재시도';
    }
  }
  cutLine.addEventListener('pointerdown',e=>{
    if(!cutArmed || checking || e.button!==0 || !e.isPrimary) return;
    e.stopPropagation();e.preventDefault();
    const rect=cutLine.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width;
    if(x<0 || x>1) return;
    cutGesture={id:e.pointerId,start:x,rect,progress:0,touch:e.pointerType==='touch',hapticStep:0};
    if(cutGesture.touch) cutHaptic(8);
    cutLine.querySelector('.cut-trace').style.left = `${x*100}%`;
    cutLine.querySelector('.cut-trace').style.right = 'auto';
    cutLine.querySelector('.cut-trace').style.width = '100%';
    card.style.setProperty('--cut-origin','left');
    cutLine.setPointerCapture(e.pointerId);
  });
  cutLine.addEventListener('pointermove',e=>{
    if(!cutGesture || e.pointerId!==cutGesture.id) return;
    e.stopPropagation();e.preventDefault();
    const g=cutGesture,x=(e.clientX-g.rect.left)/g.rect.width;
    if(Math.abs(e.clientY-(g.rect.top+g.rect.height/2))>42){cancelCutGesture();return;}
    const boundedX=Math.max(0,Math.min(1,x));
    g.progress=Math.abs(boundedX-g.start);
    cutLine.querySelector('.cut-trace').style.left = `${Math.min(g.start,boundedX)*100}%`;
    card.style.setProperty('--cut-progress',String(g.progress));
    const step=Math.floor(g.progress*10);
    if(g.touch && step>g.hapticStep){g.hapticStep=step;cutHaptic(8);}
    if(g.progress>=.40 - 1e-9) {
      const touch=g.touch;
      finishCut();
      if(touch) cutHaptic([18,25,25]);
    }
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>cutLine.addEventListener(type,e=>{
    e.stopPropagation();if(cutGesture && e.pointerId===cutGesture.id) cancelCutGesture();
  }));
  cutLine.addEventListener('click',e=>e.stopPropagation());
  cutLine.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Enter'||e.key===' '){e.preventDefault();finishCut();}
    if(e.key==='Escape'&&!checking)setCutArmed(false);
  });
  function syncCheck(){if(api.preview||!issuedTicket||checking||restoring||busy||cutGesture||document.hidden)return;return restoreTicket(true);}
  function syncVisible() {
    if (document.hidden) return;
    syncCheck();
  }
  setInterval(syncVisible,30000);
  document.addEventListener('visibilitychange',syncVisible);
  window.addEventListener('focus',syncVisible);

  const rotation={x:{current:5,target:5,velocity:0},y:{current:-8,target:-8,velocity:0},z:{current:-2,target:-2,velocity:0}};
  let frame=0, drag=null, dragged=false, lastFrame=0, tapOnCard=false;
  function paint() { card.style.transform=`rotateX(${rotation.x.current}deg) rotateY(${rotation.y.current}deg) rotateZ(${rotation.z.current}deg)`; const back=Math.cos(rotation.y.current*Math.PI/180)<0; card.querySelector('.ticket-front').setAttribute('aria-hidden',back); card.querySelector('.ticket-back').setAttribute('aria-hidden',!back); }
  function tick(now) {
    const dt=Math.min((now-lastFrame)/16.67||1,2); lastFrame=now;
    let moving=false;
    for (const axis of Object.values(rotation)) {
      if(reduced || drag && dragged){axis.current=axis.target;axis.velocity=0;continue;}
      axis.velocity=(axis.velocity+(axis.target-axis.current)*.085*dt)*Math.pow(.68,dt); axis.current+=axis.velocity*dt;
      if(Math.abs(axis.target-axis.current)>.015||Math.abs(axis.velocity)>.015)moving=true; else axis.current=axis.target;
    }
    paint(); if(moving)frame=requestAnimationFrame(tick); else frame=0;
  }
  function animate(){if(!frame){lastFrame=performance.now();frame=requestAnimationFrame(tick);}}
  function reset(){rotation.x.target=0;rotation.y.target=Math.round(rotation.y.current/360)*360;rotation.z.target=0;animate();}
  const rotationControls = 'button,a,input,textarea,select,.cut-line';
  let touchRotation = null;
  function startRotation(point, target, touch = false) {
    if(cutArmed || checking || drag || target.closest(rotationControls))return false;
    const rect=$('perspective').getBoundingClientRect();
    tapOnCard=card.contains(target);
    for(const axis of Object.values(rotation)){axis.target=axis.current;axis.velocity=0;}
    drag={id:point.pointerId,x:point.clientX,y:point.clientY,rx:rotation.x.target,ry:rotation.y.target,lastX:point.clientX,lastTime:performance.now(),velocity:0,width:rect.width,touch,captureTarget:rotationSurface};
    dragged=false;
    if(!touch)rotationSurface.setPointerCapture(point.pointerId);
    card.classList.add('dragging');
    return true;
  }
  function moveRotation(point) {
    if(!drag || point.pointerId!==drag.id || cutArmed || checking)return;
    const dx=point.clientX-drag.x,dy=point.clientY-drag.y;
    if(!dragged && Math.hypot(dx,dy)<=6)return;
    dragged=true;
    const now=performance.now();drag.velocity=(point.clientX-drag.lastX)/Math.max(1,now-drag.lastTime);drag.lastX=point.clientX;drag.lastTime=now;
    rotation.y.target=drag.ry+dx/drag.width*360;rotation.x.target=drag.touch?0:Math.max(-48,Math.min(48,drag.rx-dy*.22));rotation.z.target=Math.max(-5,Math.min(5,dx*.008));animate();
  }
  function release(event,cancelled=false){
    if(!drag||event.pointerId!==drag.id)return;
    const active=drag;
    drag=null;
    const velocity=performance.now()-active.lastTime<90?active.velocity:0;
    if(dragged&&!cancelled){
      rotation.y.target+=Math.max(-100,Math.min(100,velocity*55));
      rotation.x.target*=.35;rotation.z.target*=.25;animate();
    }
    if(!active.touch && active.captureTarget.hasPointerCapture(event.pointerId))active.captureTarget.releasePointerCapture(event.pointerId);
    card.classList.remove('dragging');
    if(cancelled){dragged=true;tapOnCard=false;}
  }
  rotationSurface.addEventListener('pointerdown',event=>{
    // Touch has its own direction/hold arbitration; pointercancel must not end it.
    if(event.pointerType==='touch' || event.button!==0 || !event.isPrimary)return;
    startRotation(event,event.target);
  });
  rotationSurface.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch' || cutArmed || checking)return;
    const rect=$('perspective').getBoundingClientRect();const px=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));const py=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    card.style.setProperty('--mx',`${px*100}%`);card.style.setProperty('--my',`${py*100}%`);card.style.setProperty('--foil-opacity',drag?'.15':'.09');
    if(drag && event.cancelable)event.preventDefault();
    moveRotation(event);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])rotationSurface.addEventListener(type,e=>{
    if(e.pointerType!=='touch')release(e,type!=='pointerup');
  });
  function touchPoint(t){return {pointerId:t.identifier,clientX:t.clientX,clientY:t.clientY};}
  function cancelTouchRotation(){
    if(!touchRotation)return;
    clearTimeout(touchRotation.timer);
    release({pointerId:touchRotation.id},true);
    touchRotation=null;tapOnCard=false;
  }
  function lockTouchRotation(g){
    clearTimeout(g.timer);
    if(startRotation({pointerId:g.id,clientX:g.x,clientY:g.y},g.target,true))g.mode='rotate';
    else g.mode='scroll';
  }
  rotationSurface.addEventListener('touchstart',e=>{
    if(e.touches.length!==1){cancelTouchRotation();return;}
    if(cutArmed || checking || drag || e.target.closest(rotationControls))return;
    const t=e.touches[0];
    const g=touchRotation={id:t.identifier,x:t.clientX,y:t.clientY,target:e.target,mode:'pending',timer:0};
    dragged=false;tapOnCard=card.contains(e.target);
    // A quick vertical swipe scrolls. Holding still for 240ms chooses rotation.
    g.timer=setTimeout(()=>{if(touchRotation===g && g.mode==='pending')lockTouchRotation(g);},240);
  },{passive:true});
  rotationSurface.addEventListener('touchmove',e=>{
    const g=touchRotation;if(!g)return;
    if(e.touches.length!==1 || cutArmed || checking){cancelTouchRotation();return;}
    const t=Array.from(e.touches).find(t=>t.identifier===g.id);if(!t)return;
    if(g.mode==='scroll')return;
    // If the browser already owns a scroll, never try to pull it back.
    if(!e.cancelable){cancelTouchRotation();return;}
    const dx=Math.abs(t.clientX-g.x),dy=Math.abs(t.clientY-g.y);
    if(g.mode==='pending'){
      if(Math.max(dx,dy)<6)return;
      if(dx>dy*1.15)lockTouchRotation(g);
      else {clearTimeout(g.timer);g.mode='scroll';tapOnCard=false;dragged=true;return;}
    }
    if(g.mode==='rotate'){
      e.preventDefault(); // Only the chosen rotation gesture blocks native scrolling.
      moveRotation(touchPoint(t));
    }
  },{passive:false});
  rotationSurface.addEventListener('touchend',e=>{
    const g=touchRotation;if(!g || !Array.from(e.changedTouches).some(t=>t.identifier===g.id))return;
    clearTimeout(g.timer);
    const consumed=g.mode==='rotate' && dragged;
    release({pointerId:g.id});
    touchRotation=null;
    if(consumed && e.cancelable)e.preventDefault();
  },{passive:false});
  rotationSurface.addEventListener('touchcancel',cancelTouchRotation,{passive:true});
  window.addEventListener('blur',()=>{cancelTouchRotation();if(drag)release({pointerId:drag.id},true);});
  rotationSurface.addEventListener('click',e=>{
    if(e.target.closest('button,a,input,textarea,select,.cut-line'))return;
    if(!dragged && !cutArmed && !checking && (tapOnCard||card.contains(e.target)))openPanel();
    tapOnCard=false;dragged=false;
  });
  rotationSurface.addEventListener('pointerleave',()=>{if(!drag){card.style.setProperty('--foil-opacity','.035');card.style.setProperty('--mx','50%');card.style.setProperty('--my','50%');}});
  card.addEventListener('keydown',e=>{if(cutArmed || checking){e.preventDefault();if(e.key==='Escape'&&!checking)setCutArmed(false);return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))e.preventDefault();if(e.key==='Enter'||e.key===' ')openPanel();if(e.key==='ArrowLeft')rotation.y.target-=20;if(e.key==='ArrowRight')rotation.y.target+=20;if(e.key==='ArrowUp')rotation.x.target=Math.min(48,rotation.x.target+10);if(e.key==='ArrowDown')rotation.x.target=Math.max(-48,rotation.x.target-10);if(e.key.toLowerCase()==='r')reset();animate();});
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
    renderTracks(config.setlist || []);
    if(local.ticket){try{showTicket(local.ticket);}catch{delete local.ticket;saveState(local);}}
    if(!api.preview){
      // Recover even when a previous request committed but the response was lost.
      await restoreTicket(true);
    }
  }
  init();
})();
