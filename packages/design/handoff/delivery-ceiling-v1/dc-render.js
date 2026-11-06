/* Renders the delivery-ceiling rows. ?screen=R1c shows one frame; ?w=320 renders every frame at 320×640; ?fs=1.3 at font scale 1.3. */
const __dcInit=()=>{
const K=OK,rows=window.OF_ROWS,qs=new URLSearchParams(location.search),W=qs.get('w'),FS=qs.get('fs');
const fix=h=>{if(W==='320')h=h.replace(/class="ph /g,'class="ph w320 ');if(FS)h=h.replace(/class="ph /g,'class="ph fs13 ');return h};
const all=rows.flatMap(r=>r[2]);
/* Review frames: scroll the list so the delivery card (or the end, for free delivery) is in view */
window.DCscroll=root=>{(root||document).querySelectorAll('.scr[data-to]').forEach(s=>{const inner=s.firstElementChild;inner.style.marginTop='0';const max=Math.max(0,inner.scrollHeight-s.clientHeight);const a=s.querySelector('[data-anchor]');const y=s.dataset.to==='end'||!a?max:Math.min(max,a.offsetTop-12);inner.style.marginTop=-y+'px';});};
const lay=()=>{K.layout();DCscroll();};
window.renderScreen=id=>{const s=all.find(x=>x[0]===id);document.body.innerHTML=s?fix(s[3]()).replace('class="ph','style="border-radius:0;box-shadow:none;margin:0" class="ph'):'Unknown screen';document.body.style.background='#fff';lay();};
const q=qs.get('screen');
if(q){document.querySelector('meta[name=design_doc_mode]')?.remove();renderScreen(q);document.fonts.ready.then(lay);return;}
const fr=s=>`<div data-screen-label="${s[0]}"><p class="lbl0"><b>${s[0]}</b> · ${s[1]}${s[2]?' · '+s[2]:''}</p>${fix(s[3]())}</div>`;
let html=`<div class="rowh">Delivery price ceiling v1 · LyniaGo<small>New states only, as variants of Order flow v2.1, Merchant v2, Orders v2 and Notifications v1, built from the same kit. Main example: items $67.00, 2.5 km, Recommended $3.00 (range $2.50–$6.00). A rider accepts at $2.50, so Rudo pays $69.50 instead of at most $70.00. Open one frame with <code>?screen=R1c</code>; every frame at 320×640 with <code>?w=320</code>; at font scale 1.3 with <code>?fs=1.3</code>. Rider offer card: <b>no change</b>, so nothing is drawn (see README).</small></div>`;
rows.forEach(r=>{html+=`<div class="rowh sub">${r[0]}<small>${r[1]}</small></div><div class="frow">${r[2].map(fr).join('')}</div>`;});
document.body.insertAdjacentHTML('beforeend',html);
const place=()=>{lay();let Y=0;document.querySelectorAll('.rowh,.frow').forEach(el=>{el.style.top=Y+'px';Y+=el.offsetHeight+(el.classList.contains('frow')?100:24);});};
place();document.fonts.ready.then(place);
};
if(document.readyState==='loading')addEventListener('DOMContentLoaded',__dcInit);else __dcInit();
