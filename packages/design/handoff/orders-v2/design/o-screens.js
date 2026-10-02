addEventListener('DOMContentLoaded',()=>{
const K=OK,{O,RUN:R,HIST:H,LONG,i,nb}=K;
const S=(b,o)=>K.screen(b,o);
const hdr=(w,o)=>K.header(w||360,o);
const filt=(svc)=>H.filter(h=>h.svc===svc);
/* screen builders: (w,fs) => html */
const SC={
O1:(w,fs)=>S(hdr(w)+K.now([R.p_way])+K.chips()+K.history(H.slice(0,7)),{w,fs}),
O2:(w,fs)=>S(hdr(w)+K.now([R.f_prep,R.p_find,R.s_prep])+K.chips()+K.history(H.slice(0,4)),{w,fs}),
O3:()=>K.frame(`<div style="padding:8px 0 16px">${K.now([R.f_wait,R.f_prep,R.f_ready,R.f_way])}<div class="o-sec">Shops use the same phases</div><div class="o-now">${[R.s_wait,R.s_way].map(c=>K.nowCard(c)).join('')}</div></div>`,{tall:1,h:9999}),
O4:()=>K.frame(`<div style="padding:8px 0 16px">${K.now([R.p_find,R.p_assigned,R.p_pickup,R.p_coll,R.p_way,R.p_gps])}</div>`,{tall:1,h:9999}),
O5:(w,fs)=>S(hdr(w)+K.chips()+K.history(H.slice(0,8)),{w,fs}),
O6:(w,fs)=>S(hdr(w)+K.chips()+K.history(H)+K.loadingOlder(),{w,fs,tall:1,h:w===320?640:720}),
O7:(w,fs)=>S(hdr(w)+K.now([R.p_way])+K.chips()+K.history(H)+K.endRow(),{w,fs,tall:1,h:720}),
O8:(w,fs)=>S(hdr(w)+K.now([{...R.f_way,t:'Tatendashe is on the way',s:'Food from Mai Chipo\u2019s Traditional Kitchen & Grill House'}])+K.chips()+K.history(LONG),{w,fs:fs||1.3}),
O9a:(w,fs)=>S(hdr(w)+K.now([R.p_way])+K.chips('send')+K.history(filt('send')),{w,fs}),
O9b:(w,fs)=>S(hdr(w)+K.chips('restaurants')+K.history(filt('restaurants')),{w,fs}),
O9c:(w,fs)=>S(hdr(w)+K.chips('shops')+K.history(filt('shops')),{w,fs}),
O9d:(w,fs)=>S(hdr(w)+K.now([R.p_way])+K.chips('shops')+`<div class="o-card w"><img src="./assets/service-icons/v2/shops.svg" style="height:56px" alt=""><h3>${O.filterNone.shops}</h3><p style="margin-bottom:12px">${O.filterNoneSub}</p><span class="o-ghost">${O.showAll}</span></div>`,{w,fs}),
O9e:(w,fs)=>S(hdr(w)+K.now([R.p_way])+K.chips('all',['send'])+K.history(filt('send')),{w,fs}),
O10a:(w,fs)=>S(K.sHeader('',1)+K.nowStrip(R.p_way)+`<div class="o-foot" style="justify-content:flex-start;font-weight:400">${i('search',16,'#5b6670')}${O.searchHint}</div>`,{w,fs,kb:1}),
O10b:(w,fs)=>{const q='Belgravia',m=H.filter(h=>h.t.includes(q));return S(K.sHeader(q,1)+K.nowStrip(R.p_way)+`<div class="o-sec">${O.matches(m.length,q)}</div><div>${m.map(h=>K.row(h,q,h.day==='TODAY'?'Today':h.day==='YESTERDAY'?'Yesterday':h.day.charAt(0)+h.day.slice(1).toLowerCase())).join('')}</div>`,{w,fs,kb:1})},
O10c:(w,fs)=>{const q='Msasa Park';return S(K.sHeader(q)+K.nowStrip(R.p_way)+`<div class="o-card w"><h3 style="margin-top:0">${O.noMatch(q)}</h3><p style="margin-bottom:12px">${O.noMatchSub}</p><span class="o-ghost">${O.clearSearch}</span></div>`,{w,fs})},
O10d:(w,fs)=>{const q='Tendai',m=H.filter(h=>h.rider==='Tendai M.');return S(hdr(w,{q})+K.now([R.p_way])+K.chips()+`<div class="o-sec">${O.matches(m.length,q)}</div><div>${m.map(h=>K.row(h,q,h.day==='TODAY'?'Today':h.day.charAt(0)+h.day.slice(1).toLowerCase())).join('')}</div>`,{w,fs})},
O11:(w,fs)=>{const q='Belgravia',m=H.filter(h=>h.t.includes(q));return S(K.sHeader(q)+K.banner(O.offlineSearch)+`<div class="o-sec">${O.matches(m.length,q)}</div><div>${m.map(h=>K.row(h,q,h.day==='TODAY'?'Today':h.day.charAt(0)+h.day.slice(1).toLowerCase())).join('')}</div><div class="o-foot" style="font-weight:400;text-align:center;font-size:12.5px">${O.noMatchOff}</div>`,{w,fs})},
O12:(w,fs)=>S(K.history(H.slice(3))+K.loadingOlder(),{w,fs,end:1}),
O13:(w,fs)=>S(K.history(H.slice(4))+K.endRow(),{w,fs,end:1}),
O14:(w,fs)=>S(K.history(H.slice(4))+K.olderFail(),{w,fs,end:1}),
O14t:(w,fs)=>S(K.history(H.slice(4))+K.olderFail(),{w,fs,end:1,toast:1}),
O15:(w,fs)=>S(hdr(w,{dim:1})+K.skChips()+K.skRows(5),{w,fs}),
O16:(w,fs)=>S(hdr(w,{noSearch:1})+K.emptyCard(),{w,fs}),
O17:(w,fs)=>S(hdr(w,{noSearch:1})+K.emptyCard(1),{w,fs}),
O18:(w,fs)=>S(hdr(w,{noSearch:1})+K.now([R.f_prep])+`<div class="o-foot" style="font-weight:400;margin-top:8px">${i('receipt',16,'#5b6670')}${O.onlyNow}</div>`,{w,fs}),
O19:(w,fs)=>S(hdr(w)+K.banner(O.offline('09:24'))+K.now([R.p_coll],{off:'09:24'})+K.chips()+K.history(H.slice(0,6)),{w,fs}),
O20:(w,fs)=>S(hdr(w,{noSearch:1})+`<div class="o-card w"><div style="width:64px;height:64px;border-radius:50%;background:#F6F7F8;margin:0 auto;display:flex;align-items:center;justify-content:center">${i('wifi-off',28,'#5b6670')}</div><h3>${O.offT}</h3><p style="margin-bottom:0">${O.offB}</p></div>`,{w,fs}),
O21:(w,fs)=>S(hdr(w,{noSearch:1})+`<div class="o-card w"><div style="width:64px;height:64px;border-radius:50%;background:#FAEDEB;margin:0 auto;display:flex;align-items:center;justify-content:center">${i('circle-alert',28,'#8F2418')}</div><h3>${O.errT}</h3><p>${O.errB}</p><div class="o-btn">${i('refresh-cw',18,'#fff')}${O.tryAgain}</div></div>`,{w,fs}),
O22:(w,fs)=>{const a=O.acc;return S(`<div class="o-h">${K.circles(w)}${K.sb()}<div class="o-top"><h1>${a.title}</h1><div class="o-bell">${i('bell',20,'#006630')}</div></div><div style="position:relative;z-index:1;display:flex;gap:12px;align-items:center;padding:14px 16px 0"><span style="width:52px;height:52px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font:700 20px Inter;color:#006630;flex:none">R</span><div style="min-width:0"><b style="font-size:${K.z(16)}">${a.name}</b><div style="font-size:${K.z(13)};color:#5b6670">${a.phone}</div><div style="font-size:${K.z(12.5)};color:#5b6670">${a.since}</div></div></div></div><div class="o-seg"><span class="on">${i('shopping-bag',16)}${a.customer}</span><span>${i('bike',16)}${a.rider}</span></div><div style="text-align:center;font-size:${K.z(12)};color:#5b6670;margin-top:6px">${a.hint}</div><div class="o-rows">${[['bell',a.notif,'',a.notifV],['message-circle',a.help,a.helpS],['settings',a.settings,a.settingsS]].map(r=>`<div class="o-ar"><span class="ic">${i(r[0],18)}</span><div style="flex:1;min-width:0"><b style="font-weight:600">${r[1]}</b>${r[2]?`<small>${r[2]}</small>`:''}</div>${r[3]?`<span class="o-tag ok">${r[3]}</span>`:''}${i('chevron-right',18,'#5b6670')}</div>`).join('')}</div><div style="margin:12px 16px 0;border:1px dashed #C0392B;border-radius:12px;padding:10px 12px;font-size:12px;color:#8F2418;background:#FAEDEB">Removed: <b>Trip history</b> (Rider v2 C13). Orders is the customer\u2019s only order history.</div>`,{w,fs,tab:2})}
};
const META={O1:'One running parcel + history',O2:'3 running · landing from Home “+1 order”',O3:'Now card · food & shop phases',O4:'Now card · parcel stages',O5:'History only, nothing running',O6:'Every outcome (full scroll)',O7:'Day grouping, mixed services (full scroll)',O8:'Long content @ font 1.3',O9a:'Filter · Parcels',O9b:'Filter · Food',O9c:'Filter · Shops',O9d:'Filter with no matches',O9e:'One service on · no chips',O10a:'Search focused',O10b:'Typing · results',O10c:'No results',O10d:'Results, keyboard down',O11:'Search while offline',O12:'Loading older',O13:'End of history',O14:'Older page failed',O14t:'Retry failed again · toast 4 s',O15:'First load',O16:'Empty · every service',O17:'Empty · parcels only',O18:'Only a running order',O19:'Offline cold start, saved list',O20:'Offline, nothing saved',O21:'Couldn’t load',O22:'Customer Account · Trip history removed'};
const q=new URLSearchParams(location.search),one=q.get('screen');
if(one&&SC[one]){const w=+(q.get('w')||360),fs=+(q.get('fs')||1);document.body.innerHTML=`<div style="padding:24px">${SC[one](w,fs)}</div>`;document.body.style.background='#EEF1F3';return;}
const rows=[
['Populated','Forest Now cards on top (one per running order), then chips, then day-grouped history. Every row: outcome in words, what you paid, rider + your rating, what was in it.',['O1','O2','O3','O4','O5','O6','O7','O8']],
['Filters','Chips filter history only; the Now section always stays. A chip exists only for a service that\u2019s on.',['O9a','O9b','O9c','O9d','O9e']],
['Search','Focus collapses the header to a search bar; running orders stay as a slim forest strip. Matches restaurant/shop, area and rider.',['O10a','O10b','O10c','O10d','O11']],
['Paging','Older orders load by themselves near the bottom. No button until a page fails.',['O12','O13','O14','O14t']],
['Empty, loading, offline, error','No pull-to-refresh, no Refresh button. Only a failed first load offers Try again.',['O15','O16','O17','O18','O19','O20','O21']],
['Account side effect','',['O22']],
['@ 320×640','Key states at the small width.',['O1@320','O2@320','O6@320','O10b@320','O16@320','O19@320']],
['@ font scale 1.3','Titles and items wrap to 2 lines; chips scroll sideways; amounts stay right.',['O1@fs','O2@fs','O6@fs','O16@fs','O19@fs']]];
let html=`<div style="position:absolute;left:80px;top:0;font:700 40px Inter;letter-spacing:-.8px">Orders v2<div style="font:400 18px Inter;color:#5b6670;letter-spacing:0;margin-top:6px;max-width:980px">Customer Orders tab in Calm Mint v2. Single screen: <code>?screen=O1</code> (add <code>&w=320</code> or <code>&fs=1.3</code>). Strings live in <code>OK.O</code> (o-kit.js).</div></div>`,Y=150;
rows.forEach(rw=>{html+=`<div style="position:absolute;left:80px;top:${Y}px;font:700 28px Inter;letter-spacing:-.5px">${rw[0]}<div style="font:400 16px Inter;color:#5b6670;letter-spacing:0;margin-top:4px;max-width:1100px">${rw[1]}</div></div>`;Y+=96;let x=80,mh=760;
rw[2].forEach(id=>{const [k,v]=id.split('@'),w=v==='320'?320:360,fs=v==='fs'?1.3:1;const out=SC[k](w,fs);const tall=/class="ph tall/.test(out);if(tall)mh=Math.max(mh,k==='O3'||k==='O4'?820:1640);
html+=`<div style="position:absolute;left:${x}px;top:${Y}px"><p style="font:600 13px Inter;color:#5b6670;margin:0 0 10px;max-width:${w}px"><b style="color:#14181b">${k}${v==='320'?' @320':v==='fs'?' @1.3':''}</b> · ${META[k]}</p>${out}</div>`;x+=w+50;});Y+=mh+80;});
document.body.insertAdjacentHTML('beforeend',html);
/* re-flow rows by measured height so tall frames never overlap the next row */
let shift=0,rowMax=0;
[...document.body.children].filter(e=>e.style&&e.style.position==='absolute').forEach(e=>{const t=parseFloat(e.style.top)+shift;
if(e.querySelector('.ph')){e.style.top=t+'px';rowMax=Math.max(rowMax,t+e.offsetHeight);}
else{if(rowMax&&t<rowMax+80){shift+=rowMax+80-t;e.style.top=(rowMax+80)+'px';}else e.style.top=t+'px';rowMax=0;}});
});
