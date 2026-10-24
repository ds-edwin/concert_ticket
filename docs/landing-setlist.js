(function(){
'use strict';
const panel=document.getElementById('setlistPanel');
const content=document.getElementById('kioskContent');
const screen=panel?.closest('.kiosk-screen');
const list=document.getElementById('landingTracks');
if(!panel||!content||!screen||!list)return;
const icon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="1" y="5" width="22" height="14" rx="4" fill="currentColor"/><path fill="#111b1c" d="m9.6 15.8 6.3-3.8-6.3-3.8Z"/></svg>';
const tracks=window.TICKET_CONFIG?.setlist||[];
tracks.forEach((track,index)=>{
 const row=document.createElement('li');row.className='setlist-track';
 const number=document.createElement('span');number.className='setlist-number';number.textContent=String(index+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
 const song=document.createElement('div');song.className='setlist-song';
 const title=document.createElement('strong');title.textContent=track.title;
 const artist=document.createElement('small');artist.textContent=track.artist;
 song.append(title,artist);row.append(number,song);
 const url=window.Jukebox.youtubeUrl(track.url);
 if(url){
  const link=document.createElement('a');link.className='setlist-youtube';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',track.title+' 유튜브에서 듣기');link.innerHTML=icon;row.append(link);
 }
 list.append(row);
});
// Both detail views stay inside the kiosk and preserve the current purchase step.
const previewMount=document.getElementById('ticketPreviewMount');
const views=[
 {panel:document.getElementById('ticketPreviewPanel'),triggers:[document.getElementById('ticketPreviewButton')],close:document.getElementById('closeTicketPreview'),mount:previewMount},
 {panel,triggers:[document.getElementById('setlistButton'),document.getElementById('vinylButton')],close:document.getElementById('closeSetlist'),scroll:list},
 {panel:document.getElementById('lineupPanel'),triggers:[document.getElementById('lineupButton')],close:document.getElementById('closeLineup'),scroll:document.getElementById('landingLineup')}
].filter(view=>view.panel&&view.close&&view.triggers.every(Boolean));
let active=null,returnFocus=null;
function openPanel(view,source){
 if(active===view)return;
 if(active){
  active.mount?.replaceChildren();
  active.panel.hidden=true;
  active.triggers.forEach(button=>button.setAttribute('aria-expanded','false'));
 }
 active=view;returnFocus=source;
 view.panel.hidden=false;
 if(view.mount){
  const frame=document.createElement('iframe');
  frame.title='회전 가능한 티켓과 공개 방명록 미리보기';
  frame.src='./ticket-preview.html?v=20261024-preview';
  view.mount.replaceChildren(frame);
 }
 screen.classList.add('is-panel-open');
 view.close.focus({preventScroll:true});
 content.inert=true;
 content.setAttribute('aria-hidden','true');
 view.triggers.forEach(button=>button.setAttribute('aria-expanded','true'));
 if(view.scroll)view.scroll.scrollTop=0;
}
function closePanel(){
 if(!active)return;
 content.inert=false;
 content.removeAttribute('aria-hidden');
 screen.classList.remove('is-panel-open');
 active.mount?.replaceChildren();
 active.panel.hidden=true;
 active.triggers.forEach(button=>button.setAttribute('aria-expanded','false'));
 active=null;
 returnFocus?.focus({preventScroll:true});
}
window.addEventListener('message',event=>{
 const frame=previewMount?.querySelector('iframe');
 if(event.origin===location.origin&&event.source===frame?.contentWindow&&event.data?.type==='jukebox-preview-close')closePanel();
});
views.forEach(view=>{
 view.triggers.forEach(button=>button.addEventListener('click',event=>openPanel(view,event.currentTarget)));
 view.close.addEventListener('click',closePanel);
 view.panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closePanel();}
 });
});
})();
