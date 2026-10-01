/* Renders OF_ROWS onto the canvas. ?screen=T4 shows one frame; ?w=320 renders every frame at 320×640; ?fs=1.3 at font scale 1.3. */
addEventListener('DOMContentLoaded',()=>{
const K=OK,rows=window.OF_ROWS,qs=new URLSearchParams(location.search),W=qs.get('w'),FS=qs.get('fs');
const fix=h=>{if(W==='320')h=h.replace(/class="ph /g,'class="ph w320 ');if(FS)h=h.replace(/class="ph /g,'class="ph fs13 ');return h};
const all=rows.flatMap(r=>r[2].flatMap(s=>s.grp?s.grp:[s]));
window.OF_ALL=all;
window.renderScreen=id=>{const s=all.find(x=>x[0]===id);document.body.innerHTML=s?fix(s[3]()).replace('class="ph','style="border-radius:0;box-shadow:none;margin:0" class="ph'):'Unknown screen';document.body.style.background='#fff';K.layout();};
/* PNG export helper: 2× slices of each frame (viewport-sized captures, stitched afterwards) */
const VAR=['R1·full','R2a','R2b','R8b','D1·full'];const ids=[...new Set(all.map(s=>s[0]))];
window.__plan=ids.flatMap(id=>{const n=VAR.includes(id)||id[0]==='G'?6:3;return Array.from({length:n},(_,k)=>[id,k*270]);});
window.__shot=k=>{const [id,off]=__plan[k];renderScreen(id);document.body.style.margin='0';document.body.style.zoom=2;const el=document.body.firstElementChild;el.style.marginTop=-off+'px';if(id[0]==='G')el.style.boxShadow='none';};
const q=qs.get('screen');
if(q){document.querySelector('meta[name=design_doc_mode]')?.remove();renderScreen(q);document.fonts.ready.then(()=>K.layout());return;}
const fr=s=>`<div><p class="lbl0"><b>${s[0]}</b> · ${s[1]}${s[2]?' · '+s[2]:''}</p>${fix(s[3]())}</div>`;
let html=`<div class="rowh" data-y="0">Order flow v${window.OF_V||"2"} · Restaurants, Shops & Pharmacy<small>${window.OF_V?"v2.1 polish: same screens and features, more pop — ETA as the hero number, grouped track, filled secondary buttons, cased routes on a richer map, forest code panel at the door, white checkout cards on grey. Every code is 6 digits. ":""}Checkout → order screen → hand-over at the venue → hand-over at the door → done, on the customer, merchant and rider phones. Built on After Send v2, Send v2, Rider v2, merchant-mobile and Calm Mint v2 parts. Open one frame with <code>?screen=T4</code>; every frame at 320×640 with <code>?w=320</code>; at font scale 1.3 with <code>?fs=1.3</code>. Dashed red tags mark data the backend doesn’t send yet.</small></div>`;
rows.forEach(r=>{html+=`<div class="rowh sub">${r[0]}<small>${r[1]}</small></div><div class="frow">${r[2].map(s=>s.grp?`<div><div class="colh">${s.title}</div><div class="grp">${s.grp.map(x=>`<div><div class="colh" style="background:#F6F7F8;color:#14181b">${x[4]||''}</div>${fr(x)}</div>`).join('')}</div></div>`:fr(s)).join('')}</div>`;});
document.body.insertAdjacentHTML('beforeend',html);
const place=()=>{K.layout();let Y=0;document.querySelectorAll('.rowh,.frow').forEach(el=>{el.style.top=Y+'px';Y+=el.offsetHeight+(el.classList.contains('frow')?100:24);});};
place();document.fonts.ready.then(place);
});
