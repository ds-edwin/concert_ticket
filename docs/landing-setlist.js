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
const triggers=[document.getElementById('setlistButton'),document.getElementById('vinylButton')];
const closeButton=document.getElementById('closeSetlist');
let returnFocus=null;
function openSetlist(event){
 if(!panel.hidden)return;
 returnFocus=event.currentTarget;
 panel.hidden=false;
 screen.classList.add('is-setlist-open');
 closeButton.focus({preventScroll:true});
 content.inert=true;
 content.setAttribute('aria-hidden','true');
 triggers.forEach(button=>button.setAttribute('aria-expanded','true'));
 list.scrollTop=0;
}
function closeSetlist(){
 if(panel.hidden)return;
 content.inert=false;
 content.removeAttribute('aria-hidden');
 screen.classList.remove('is-setlist-open');
 panel.hidden=true;
 triggers.forEach(button=>button.setAttribute('aria-expanded','false'));
 returnFocus?.focus({preventScroll:true});
}
triggers.forEach(button=>button.addEventListener('click',openSetlist));
closeButton.addEventListener('click',closeSetlist);
panel.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeSetlist();}
});
})();
