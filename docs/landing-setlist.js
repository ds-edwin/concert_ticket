(function(){
'use strict';
const dialog=document.getElementById('setlistDialog');
const list=document.getElementById('landingTracks');
if(!dialog||!list)return;
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
function openSetlist(){
 if(dialog.open)return;
 dialog.showModal();
 document.body.classList.add('setlist-open');
 list.scrollTop=0;
}
document.getElementById('setlistButton').addEventListener('click',openSetlist);
document.getElementById('vinylButton').addEventListener('click',openSetlist);
document.getElementById('closeSetlist').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>document.body.classList.remove('setlist-open'));
// A scroll starting inside the dialog must not become a backdrop dismissal.
let backdropStart=false;
function outside(event){const box=dialog.getBoundingClientRect();return event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom;}
dialog.addEventListener('pointerdown',event=>{backdropStart=event.target===dialog&&outside(event);});
dialog.addEventListener('pointercancel',()=>{backdropStart=false;});
dialog.addEventListener('click',event=>{if(backdropStart&&event.target===dialog&&outside(event))dialog.close();backdropStart=false;});
})();
