/* LyniaGo · Orders v2 kit. Shared parts + O (every user-facing string, ships verbatim). Calm Mint v2 tokens only. */
(function(){
const A='./assets/';
Object.assign(lucide.icons,{X:[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]],MessageCircle:[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],Settings:[["path",{d:"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"}],["circle",{cx:"12",cy:"12",r:"3"}]]});

/* ---------- O: every string ---------- */
const O={
title:'Your orders',search:'Search your orders',cancel:'Cancel',clear:'Clear',
now:'NOW',nowMany:'Tap an order to open it',
chips:{all:'All',send:'Parcels',restaurants:'Food',shops:'Shops'},
today:'TODAY',yesterday:'YESTERDAY',
out:{delivered:'Delivered',cxYou:'Cancelled by you',cxRider:'Rider cancelled',kitchen:'Restaurant didn\u2019t confirm',shopKitchen:'Shop didn\u2019t confirm',noRider:'No rider found',notDel:'Not delivered',refunded:'Refunded'},
noCharge:'No charge',back:'back',
parcelTo:(a)=>`Parcel to ${a}`,
loadingOlder:'Loading older orders\u2026',end:'That\u2019s everything',endSub:'Your orders since Mar 2025',
olderFail:'Couldn\u2019t load older orders',tryAgain:'Try again',
offline:(t)=>`You\u2019re offline. Showing your orders as of ${t}.`,offlineSearch:'You\u2019re offline. Searching orders saved on this phone.',
lastKnown:(t)=>`As of ${t}`,
searchHint:'Search by restaurant, shop, area or rider',
matches:(n,q)=>`${n} order${n===1?'':'s'} match \u201c${q}\u201d`,
noMatch:(q)=>`No orders match \u201c${q}\u201d`,noMatchSub:'Try a restaurant or shop name, an area like Belgravia, or your rider\u2019s name.',clearSearch:'Clear search',
noMatchOff:'Only orders saved on this phone were searched. We\u2019ll search everything when you\u2019re back online.',
filterNone:{send:'No parcels yet',restaurants:'No food orders yet',shops:'No shop orders yet'},
filterNoneSub:'Orders you place show here. Pick All to see everything.',showAll:'Show all orders',
emptyT:'No orders yet',
emptyB:'Parcels, food and shop orders all land here. Follow the one on its way, and look back at what you paid.',
emptyBP:'Parcels you send land here. Follow the one on its way, and look back at what you paid.',
sendParcel:'Send a parcel',findFood:'Find food or shops',
onlyNow:'Past orders show here once this one\u2019s done.',
offT:'You\u2019re offline',offB:'Your orders will show as soon as you\u2019re back online. There\u2019s nothing you need to do.',
errT:'Couldn\u2019t load your orders',errB:'Something went wrong on our side. Your orders are safe.',
toast:'Couldn\u2019t load older orders.',
acc:{title:'Account',name:'Rudo Moyo',phone:'+263 77 245 1180',since:'Customer since Mar 2025 \u00b7 18 orders',customer:'Customer',rider:'Rider',hint:'Rider side: you get jobs. Customer side: you don\u2019t.',notif:'Notifications',notifV:'3 new',help:'Help & support',helpS:'WhatsApp or call the safety line',settings:'Settings',settingsS:'Language, payment, privacy'},
tabs:['Home','Orders','Account']
};

/* ---------- data ---------- */
const TINT={send:'#CDEEDA',restaurants:'#FFD9CC',shops:'#DDD5FF'};
const SIC={send:'package',restaurants:'utensils',shops:'shopping-bag'};
const RUN={
p_find:{svc:'send',t:'Finding a rider',s:'Parcel to Belgravia \u00b7 asking $3.36',seg:1,pill:'4:12 left'},
p_assigned:{svc:'send',t:'Tendai M. is your rider',s:'Parcel to Belgravia \u00b7 Rider assigned',seg:2,eta:'18 min'},
p_pickup:{svc:'send',t:'Tendai is heading to pickup',s:'Eastgate Mall, CBD \u2192 Belgravia',seg:3,eta:'6 min'},
p_coll:{svc:'send',t:'Tendai has your parcel',s:'Parcel collected \u00b7 going to Belgravia',seg:4,eta:'15 min'},
p_way:{svc:'send',t:'Tendai is on the way',s:'Parcel to Belgravia \u00b7 $3.36',seg:6,eta:'12 min',bike:1},
p_gps:{svc:'send',t:'Tendai is on the way',s:'Location not updating \u00b7 last seen 09:18',seg:6,pill:'No ETA',bike:1},
f_wait:{svc:'restaurants',t:'Waiting for Sadza Republic',s:'Restaurants usually confirm in 5 min \u00b7 $15.50',seg:1},
f_prep:{svc:'restaurants',t:'Sadza Republic is cooking',s:'Preparing \u00b7 a rider is sent near the end',seg:2,eta:'35 min'},
f_ready:{svc:'restaurants',t:'Your food is ready',s:'Ready for pickup \u00b7 Rudo K. is collecting',seg:4,eta:'20 min'},
f_way:{svc:'restaurants',t:'Rudo is on the way',s:'Food from Sadza Republic \u00b7 $15.50',seg:6,eta:'9 min',bike:1},
s_prep:{svc:'shops',t:'Avondale Pharmacy is packing',s:'Preparing \u00b7 3 items \u00b7 $8.40',seg:2,eta:'40 min'},
s_wait:{svc:'shops',t:'Waiting for Avondale Pharmacy',s:'Shops usually confirm in 5 min \u00b7 $8.40',seg:1},
s_way:{svc:'shops',t:'Farai is on the way',s:'From Avondale Pharmacy \u00b7 $8.40',seg:6,eta:'7 min',bike:1}
};
const r=(day,svc,t,items,out,amt,time,rider,stars)=>({day,svc,t,items,out,amt,time,rider,stars});
const HIST=[
r(O.today,'restaurants','Gava\u2019s Kitchen','Sadza & beef stew, Mazoe \u00d72','delivered',12.5,'13:05','Tendai M.',4),
r(O.today,'send',O.parcelTo('Belgravia'),'Documents \u00b7 from Eastgate Mall','delivered',5,'08:40','Rudo K.'),
r(O.yesterday,'send',O.parcelTo('Mount Pleasant'),'Laptop bag \u00b7 from Avondale Shops','noRider',0,'17:20'),
r(O.yesterday,'restaurants','Nando\u2019s Avondale','Peri chicken, chips \u00d72','kitchen',0,'12:10'),
r('MONDAY','shops','Avondale Pharmacy','3 items','delivered',8.4,'16:45','Farai N.',5),
r('MONDAY','send',O.parcelTo('Belgravia'),'Keys \u00b7 from Avondale Shops','cxYou',0,'09:02'),
r('SATURDAY','send',O.parcelTo('Borrowdale'),'Shoes in a box \u00b7 from Sam Levy\u2019s','notDel',0,'15:30','Tendai M.'),
r('SATURDAY','restaurants','Caf\u00e9 Msasa','Chicken wrap, orange juice','refunded',7.5,'11:15','Rudo K.'),
r('TUE 22 SEP','send',O.parcelTo('Belgravia'),'Documents \u00b7 from Avondale Shops','cxRider',0,'10:20'),
r('TUE 22 SEP','shops','Mbare Fresh','6 items','delivered',14.2,'08:55','Farai N.',4),
r('MON 21 SEP','restaurants','Sadza Republic','Sadza & road-runner chicken','delivered',9,'19:40','Tendai M.',3)
];
const LONG=[
r(O.today,'restaurants','Mai Chipo\u2019s Traditional Kitchen & Grill House','Sadza & beef stew, rape & peanut butter, covo, Mazoe orange \u00d72, Lacto','delivered',23.75,'13:05','Tendai M.',5),
r(O.today,'send',O.parcelTo('Mount Pleasant Business Park, Gate 2'),'Documents \u00b7 from Avondale Shopping Centre, near the post office','delivered',6,'08:40','Rudo K.'),
r(O.yesterday,'restaurants','Nando\u2019s Avondale','Peri chicken, chips \u00d72','kitchen',0,'12:10'),
r(O.yesterday,'send',O.parcelTo('Borrowdale'),'Shoes in a box','notDel',0,'15:30','Tendai M.')
];

/* ---------- helpers ---------- */
const z=(n)=>`calc(${n}px * var(--fs))`;
const PC=(n)=>n.split('-').map(p=>p[0].toUpperCase()+p.slice(1)).join('');
const i=(n,s,c,x)=>{const d=lucide.icons[PC(n)]||[];s=s||18;return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s}px;height:${s}px;color:${c||'currentColor'};flex:none;${x||''}">${d.map(([t,a])=>`<${t} ${Object.entries(a).map(([k,v])=>`${k}="${v}"`).join(' ')}></${t}>`).join('')}</svg>`};
const money=(n)=>'$'+n.toFixed(2);
const nb=(t)=>`<span class="o-nb">NEEDS BACKEND${t?' \u00b7 '+t:''}</span>`;

document.head.insertAdjacentHTML('beforeend',`<style>
.ph{--fs:1;position:relative;overflow:hidden;background:#fff;border-radius:24px;box-shadow:0 0 0 1px #e2e6ea,0 12px 40px rgba(20,24,27,.10);isolation:isolate;font-family:Inter,system-ui,sans-serif;color:#14181b;font-variant-numeric:tabular-nums}
.o-body{position:absolute;left:0;right:0;top:0;bottom:60px;overflow:hidden}.o-body.end{display:flex;flex-direction:column;justify-content:flex-end}.o-body>*{flex:none}.o-body.kb{bottom:248px}
.ph.tall .o-body{position:static}.ph.tall .o-tab{position:static}
.o-fold{position:absolute;left:0;right:0;border-top:2px dashed #FF6B4A;z-index:9}.o-fold span{position:absolute;right:8px;top:-22px;font:600 11px Inter;color:#8F2418;background:#fff;padding:2px 6px;border-radius:6px}
.o-sb{height:28px;display:flex;justify-content:space-between;align-items:center;padding:0 16px;font:600 12px Inter;position:relative;z-index:2}
.o-h{background:#E9F8EF;position:relative;overflow:hidden;border-radius:0 0 28px 28px;padding-bottom:18px}.o-h .c{position:absolute;border-radius:50%;z-index:0}
.o-top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px 0}
.o-top h1{margin:0;font-weight:700;font-size:${z(24)};line-height:1.15;letter-spacing:-.4px}
.o-bell{width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;position:relative;flex:none}.o-bell:after{content:"";position:absolute;top:10px;right:11px;width:8px;height:8px;border-radius:50%;background:#FFD23F;box-shadow:0 0 0 2px #fff}
.o-search{position:relative;z-index:1;margin:14px 16px 0;height:48px;border-radius:12px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 4px 0 14px;color:#5b6670;font-size:${z(14)};box-sizing:border-box}
.o-search.f{border:2px solid #00B14F;padding-left:12px;color:#14181b}.o-search .caret{width:2px;height:20px;background:#00B14F;margin-left:-8px}
.o-search .x{margin-left:auto;min-width:44px;height:44px;display:flex;align-items:center;justify-content:center;gap:4px;color:#5b6670;font-weight:600;font-size:${z(13)}}
.o-sec{display:flex;align-items:baseline;gap:8px;padding:20px 16px 8px;font-weight:600;font-size:${z(12)};letter-spacing:.4px;color:#5b6670;text-transform:uppercase}.o-sec em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:400;margin-left:auto;font-size:${z(12.5)}}
.o-now{display:flex;flex-direction:column;gap:8px;padding:0 16px}
.o-nc{background:#063B22;color:#fff;border-radius:18px;padding:12px 12px 12px 12px;display:flex;align-items:center;gap:12px;min-height:72px;box-sizing:border-box}
.o-nc .av{width:40px;height:40px;border-radius:50%;background:#00B14F;display:flex;align-items:center;justify-content:center;flex:none}
.o-nc .m{flex:1;min-width:0}.o-nc b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:700;font-size:${z(15)};line-height:1.25}
.o-nc small{display:block;color:#BFE6CD;font-size:${z(12.5)};line-height:1.35;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.o-prog{display:flex;gap:3px;margin-top:8px;max-width:150px}.o-prog i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.22)}.o-prog i.on{background:#00B14F}
.o-eta{flex:none;background:#FFD23F;color:#3D3100;font-weight:700;font-size:${z(13)};padding:6px 10px;border-radius:999px;white-space:nowrap}
.o-pill{flex:none;background:rgba(255,255,255,.14);color:#fff;font-weight:600;font-size:${z(12)};padding:6px 10px;border-radius:999px;white-space:nowrap}
.o-chips{display:flex;gap:8px;padding:16px 16px 0;overflow:hidden}
.o-chip{flex:none;height:44px;padding:0 16px;border-radius:999px;border:1px solid #e2e6ea;display:flex;align-items:center;gap:6px;font-weight:600;font-size:${z(14)};white-space:nowrap;box-sizing:border-box}
.o-chip.on{background:#E9F8EF;border-color:#E9F8EF;color:#006630}
.o-dl{padding:20px 16px 2px;font-weight:600;font-size:${z(12)};letter-spacing:.4px;color:#5b6670}
.o-r{display:flex;gap:12px;padding:0 16px;align-items:stretch}.o-r .d{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;margin-top:12px}.o-r .d img{width:30px;height:30px}
.o-r .in{flex:1;min-width:0;display:flex;gap:10px;padding:12px 0;border-bottom:1px solid #e2e6ea}.o-r:last-child .in{border-bottom:0}
.o-r .m{flex:1;min-width:0}.o-r .t{display:block;font-weight:600;font-size:${z(15)};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.o-r .it{font-size:${z(13)};color:#5b6670;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.ph.fs .o-r .t,.ph.fs .o-r .it{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.o-r .mt{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:6px;font-size:${z(12.5)};color:#5b6670}
.o-r .a{flex:none;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:3px}.o-r .a b{font-weight:700;font-size:${z(15)}}.o-r .a .nc{font-weight:600;font-size:${z(13)};color:#5b6670}.o-r .a .bk{font-weight:600;font-size:${z(13)};color:#006630}.o-r .a small{font-size:${z(12)};color:#5b6670}
.o-tag{display:inline-flex;align-items:center;gap:4px;height:${z(22)};padding:0 8px;border-radius:999px;font-weight:600;font-size:${z(12)};white-space:nowrap}
.o-tag.ok{background:#E9F8EF;color:#006630}.o-tag.nt{background:#F6F7F8;color:#5b6670}.o-tag.bad{background:#FAEDEB;color:#8F2418}
.o-stars{display:inline-flex;gap:1px}.o-stars svg{fill:#FFD23F;stroke:#C99500}
mark{background:#E9F8EF;color:#006630;border-radius:4px;padding:0 2px}
.o-foot{display:flex;align-items:center;justify-content:center;gap:10px;min-height:56px;color:#5b6670;font-size:${z(13)};font-weight:600;padding:8px 16px}
.o-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid #CDEEDA;border-top-color:#00B14F;box-sizing:border-box}
.o-ghost{height:44px;border-radius:999px;border:1px solid #e2e6ea;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 18px;color:#006630;font-weight:600;font-size:${z(14)};white-space:nowrap}
.o-btn{height:52px;border-radius:999px;background:#00812F;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;font-size:${z(16)}}
.o-ban{margin:12px 16px 0;background:#F6F7F8;border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start;font-weight:600;font-size:${z(13)};line-height:1.4;color:#5b6670}
.o-card{margin:20px 16px 0;background:#E9F8EF;border-radius:20px;padding:20px;text-align:center}.o-card h3{margin:8px 0 0;font-weight:700;font-size:${z(18)}}.o-card p{margin:6px 0 16px;color:#5b6670;font-size:${z(14)};line-height:1.45;text-wrap:pretty}
.o-card.w{background:#fff;border:1px solid #e2e6ea}
.o-tab{position:absolute;left:0;right:0;bottom:0;height:60px;display:flex;border-top:1px solid #e2e6ea;background:#fff;z-index:5}.o-tab div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:600 11px Inter;color:#5b6670}.o-tab .on{color:#006630}
.o-kb{position:absolute;left:0;right:0;bottom:0;height:248px;background:#E3E6E9;padding:10px 4px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;z-index:6}.o-kb div{display:flex;gap:5px;justify-content:center}.o-kb span{flex:1;max-width:30px;height:44px;border-radius:6px;background:#fff;font:400 18px Inter;display:flex;align-items:center;justify-content:center}.o-kb .sp{max-width:none;flex:5}.o-kb .w{max-width:none;flex:1.6;background:#c9d0d6}.o-kb .go{background:#00812F}
.o-toast{position:absolute;left:12px;right:12px;bottom:72px;background:#14181B;color:#fff;border-radius:12px;padding:6px 6px 6px 14px;display:flex;align-items:center;gap:8px;font-size:${z(14)};z-index:7}.o-toast b{margin-left:auto;color:#FFD23F;min-height:44px;display:flex;align-items:center;gap:4px;padding:0 8px;white-space:nowrap}
.sk{background:#EEF1F3;border-radius:12px}
.o-nb{display:inline-block;border:1px dashed #C0392B;color:#8F2418;background:#FAEDEB;font:700 9px Inter;letter-spacing:.3px;padding:2px 6px;border-radius:6px}
.o-seg{display:flex;background:#F6F7F8;border-radius:999px;padding:4px;margin:16px 16px 0}.o-seg span{flex:1;height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:6px;font-weight:600;font-size:${z(14)};color:#5b6670}.o-seg .on{background:#fff;color:#006630;box-shadow:inset 0 0 0 1px #e2e6ea}
.o-rows{margin:12px 16px 0;border:1px solid #e2e6ea;border-radius:16px;padding:0 12px}.o-ar{display:flex;align-items:center;gap:12px;min-height:60px;border-bottom:1px solid #e2e6ea;font-size:${z(15)}}.o-ar:last-child{border:0}.o-ar .ic{width:40px;height:40px;border-radius:50%;background:#F6F7F8;display:flex;align-items:center;justify-content:center;flex:none}.o-ar small{display:block;color:#5b6670;font-size:${z(12.5)}}
</style>`);

/* ---------- parts ---------- */
const sb=()=>`<div class="o-sb"><span>09:41</span><span>3G 84%</span></div>`;
const circles=(w)=>{const n=w<=320;return `<span class="c" style="width:150px;height:150px;background:#FFD23F;right:-62px;top:-58px"></span><span class="c" style="width:26px;height:26px;background:#FF6B4A;right:${n?14:78}px;top:${n?100:64}px"></span><span class="c" style="width:14px;height:14px;background:#3EC1F3;right:${n?50:30}px;top:${n?128:112}px"></span>`};
const search=(o)=>{o=o||{};if(o.q!=null)return `<div class="o-search f" style="${o.compact?'margin:0;flex:1':''}">${i('search',18,'#14181b')}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.q}</span>${o.caret?'<span class="caret"></span>':''}${o.q?`<span class="x">${i('x',16)}${O.clear}</span>`:''}</div>`;
return `<div class="o-search" style="${o.dim?'opacity:.6':''}">${i('search',18)}${O.search}</div>`};
const header=(w,o)=>{o=o||{};return `<div class="o-h">${circles(w)}${sb()}<div class="o-top"><h1>${o.title||O.title}</h1><div class="o-bell">${i('bell',20,'#006630')}</div></div>${o.noSearch?'':search(o)}</div>`};
/* compact search header (focused, keyboard up) */
const sHeader=(q,caret)=>`<div class="o-h" style="padding-bottom:12px">${sb()}<div style="position:relative;z-index:1;display:flex;align-items:center;gap:4px;padding:6px 8px 0 16px">${search({q,caret,compact:1})}<span style="min-width:64px;height:44px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:${z(14)};color:#006630">${O.cancel}</span></div></div>`;
const prog=(n)=>`<div class="o-prog">${[0,1,2,3,4,5,6].map(k=>`<i class="${k<n?'on':''}"></i>`).join('')}</div>`;
const nowCard=(c,o)=>{o=o||{};const right=o.off?`<span class="o-pill">${O.lastKnown(o.off)}</span>`:c.eta?`<span class="o-eta">${c.eta}</span>`:c.pill?`<span class="o-pill">${c.pill}</span>`:'';
return `<div class="o-nc"><span class="av">${i(c.bike&&!o.off?'bike':SIC[c.svc],20,'#fff')}</span><div class="m"><b>${c.t}</b><small>${o.off?'Last known \u00b7 '+c.s:c.s}</small>${prog(c.seg)}</div>${right}</div>`};
const now=(cards,o)=>{o=o||{};return `<div class="o-sec">${O.now}${cards.length>1?` \u00b7 ${cards.length}`:''}${cards.length>1&&!o.off?`<em>${O.nowMany}</em>`:''}</div><div class="o-now">${cards.map(c=>nowCard(c,o)).join('')}</div>`};
const nowStrip=(c)=>`<div style="margin:12px 16px 0;background:#063B22;color:#fff;border-radius:14px;min-height:48px;display:flex;align-items:center;gap:10px;padding:6px 6px 6px 12px;box-sizing:border-box">${i('bike',18,'#BFE6CD')}<span style="flex:1;min-width:0;font-weight:600;font-size:${z(13.5)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.t}</span><span class="o-eta" style="font-size:${z(12)};padding:5px 9px">${c.eta}</span></div>`;
const chips=(on,svcs)=>{svcs=svcs||['send','restaurants','shops'];if(svcs.length<2)return '';on=on||'all';return `<div class="o-chips">${['all'].concat(svcs).map(k=>`<span class="o-chip ${k===on?'on':''}">${k===on?i('check',16,'#006630'):''}${O.chips[k]}</span>`).join('')}</div>`};
const OUT={delivered:['ok','check'],cxYou:['nt','ban'],cxRider:['nt','ban'],kitchen:['nt','clock'],shopKitchen:['nt','clock'],noRider:['nt','bike'],notDel:['bad','triangle-alert'],refunded:['nt','wallet']};
const tag=(k)=>`<span class="o-tag ${OUT[k][0]}">${i(OUT[k][1],12)}${O.out[k]}</span>`;
const stars=(n)=>`<span class="o-stars" aria-label="${n} stars">${Array.from({length:n},()=>i('star',12,'#C99500')).join('')}</span>`;
const hl=(s,q)=>q?s.replace(new RegExp('('+q+')','i'),'<mark>$1</mark>'):s;
const row=(h,q,dateInstead)=>{const amt=h.out==='refunded'?`<span class="bk">${money(h.amt)} ${O.back}</span>`:h.amt?`<b>${money(h.amt)}</b>`:`<span class="nc">${O.noCharge}</span>`;
return `<div class="o-r"><span class="d" style="background:${TINT[h.svc]}"><img src="${A}service-icons/v2/${h.svc}.svg" alt=""></span><div class="in"><div class="m"><span class="t">${hl(h.t,q)}</span><div class="it">${h.items}</div><div class="mt">${tag(h.out)}${h.rider?`<span>${hl(h.rider,q)}</span>`:''}${h.stars?stars(h.stars):''}</div></div><div class="a">${amt}<small>${dateInstead||h.time}</small></div></div></div>`};
const history=(list,q)=>{let out='',d=null,buf='';list.forEach(h=>{if(h.day!==d){if(buf)out+=`<div>${buf}</div>`;buf='';d=h.day;out+=`<div class="o-dl">${d}</div>`;}buf+=row(h,q);});if(buf)out+=`<div>${buf}</div>`;return out};
const loadingOlder=()=>`<div class="o-foot"><span class="o-spin"></span>${O.loadingOlder}</div>`;
const endRow=()=>`<div class="o-foot" style="flex-direction:column;gap:2px;padding:20px 16px 24px"><span style="display:flex;align-items:center;gap:6px;color:#14181b">${i('check',16,'#006630')}${O.end}</span><span style="font-weight:400">${O.endSub}</span></div>`;
const olderFail=()=>`<div class="o-foot" style="justify-content:space-between;margin:8px 16px 16px;background:#F6F7F8;border-radius:14px;padding:6px 6px 6px 14px"><span>${O.olderFail}</span><span class="o-ghost" style="background:#fff">${i('refresh-cw',16,'#006630')}${O.tryAgain}</span></div>`;
const banner=(t,ic)=>`<div class="o-ban">${i(ic||'wifi-off',16,'#5b6670','margin-top:1px')}<span>${t}</span></div>`;
const tabs=(on)=>`<div class="o-tab">${[['store',O.tabs[0]],['receipt',O.tabs[1]],['user',O.tabs[2]]].map((t,k)=>`<div class="${k===(on??1)?'on':''}">${i(t[0],22)}<span>${t[1]}</span></div>`).join('')}</div>`;
const kb=()=>`<div class="o-kb">${['qwertyuiop','asdfghjkl','zxcvbnm'].map((r,k)=>`<div>${k===2?'<span class="w"></span>':''}${[...r].map(c=>`<span>${c}</span>`).join('')}${k===2?'<span class="w"></span>':''}</div>`).join('')}<div><span class="w">?123</span><span class="sp"></span><span class="w go">${i('search',18,'#fff')}</span></div></div>`;
const toast=()=>`<div class="o-toast"><span>${O.toast}</span><b>${i('refresh-cw',16,'#FFD23F')}${O.tryAgain}</b></div>`;
const emptyCard=(parcelsOnly)=>`<div class="o-card"><img src="${A}illustrations/trust-tracking.svg" style="height:104px" alt=""><h3>${O.emptyT}</h3><p>${parcelsOnly?O.emptyBP:O.emptyB}</p><div class="o-btn">${i('package',18,'#fff')}${O.sendParcel}</div>${parcelsOnly?'':`<div class="o-ghost" style="display:flex;margin-top:8px;height:48px;border:0">${O.findFood}</div>`}</div>`;
const skRows=(n)=>`<div class="o-dl"><div class="sk" style="width:64px;height:12px"></div></div>${Array.from({length:n},()=>`<div class="o-r"><span class="d sk" style="border-radius:50%"></span><div class="in"><div class="m"><div class="sk" style="height:14px;width:70%"></div><div class="sk" style="height:11px;width:50%;margin-top:8px"></div><div class="sk" style="height:18px;width:40%;margin-top:8px;border-radius:999px"></div></div><div class="a"><div class="sk" style="height:14px;width:48px"></div></div></div></div>`).join('')}`;
const skChips=()=>`<div class="o-chips">${[56,88,68,72].map(w=>`<span class="sk" style="flex:none;width:${w}px;height:44px;border-radius:999px"></span>`).join('')}</div>`;

/* ---------- frame ---------- */
const frame=(inner,o)=>{o=o||{};const w=o.w||360,h=o.h||(w===320?640:720),fs=o.fs||1;
return `<div class="ph ${o.tall?'tall':''} ${fs>1?'fs':''}" style="width:${w}px;${o.tall?'':`height:${h}px;`}--fs:${fs}">${inner}${o.tall?`<div class="o-fold" style="top:${h}px"><span>${h} fold</span></div>`:''}</div>`};
const screen=(body,o)=>{o=o||{};return frame(`<div class="o-body ${o.end?'end':''} ${o.kb?'kb':''}"><div>${body}</div>${o.end?'':'<div style="height:16px"></div>'}</div>${o.kb?kb():tabs(o.tab)}${o.toast?toast():''}`,o)};

window.OK={O,RUN,HIST,LONG,TINT,i,nb,header,sHeader,search,nowCard,now,nowStrip,chips,row,history,loadingOlder,endRow,olderFail,banner,tabs,kb,toast,emptyCard,skRows,skChips,frame,screen,z,sb,circles,money};
})();
