/* Shop share v1 · shared drawing parts. Built from Browse v2, Calm Mint v2, First Run v2, Merchant v2 / Shop front v1,
   Own bikers v1 and Empty States v2. Design reference, not production code. */
(function(){
const P={
back:'<path d="m15 18-6-6 6-6"/>',chev:'<path d="m9 18 6-6-6-6"/>',down:'<path d="m6 9 6 6 6-6"/>',
search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
copy:'<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
qr:'<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
msg:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',check:'<path d="M20 6 9 17l-5-5"/>',plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
store:'<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>',
pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
nav:'<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
wifioff:'<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
alert:'<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
bag:'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
bike:'<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
printer:'<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
lock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
play:'<polygon points="6 3 20 12 6 21 6 3"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
arrow:'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
power:'<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',pkg:'<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
more:'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
mail:'<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
monitor:'<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>'
};
const I=(n,s=20,c)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${n==='star'?'#FFD23F':'none'}" stroke="${c||(n==='star'?'#C99500':'currentColor')}" stroke-width="${s>=40?1.75:2}" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${P[n]}</svg>`;
const A='assets/',F=A+'food/';

document.head.insertAdjacentHTML('beforeend',`<style>
:root{--ink:#14181b;--muted:#5b6670;--bg:#fff;--surface:#f6f7f8;--line:#e2e6ea;--accent:#00b14f;--accent-text:#006630;--accent-wash:#e9f8ef;--accent-wash-pressed:#d4f2e0;--cta-fill:#00812f;--on-accent:#fff;--forest:#063b22;--forest-muted:#bfe6cd;--highlight:#ffd23f;--highlight-ink:#3d3100;--highlight-wash:#fff6d6;--star-stroke:#c99500;--danger:#c0392b;--danger-wash:#faedeb;--danger-ink:#8f2418;--coral:#ff6b4a;--sky:#3ec1f3;--tile-food:#ffd9cc;--tile-shops:#ddd5ff;--tile-pharmacy:#c5e9df;--skeleton:#eef1f3;--rider-wash:#ece8ff;--rider-accent:#4b2fbf;--scrim:rgba(20,24,27,.45)}
.frame{display:flex;flex-direction:column;gap:10px;flex:none}
.flabel{font:600 12px/1.3 Inter,system-ui;color:#5b6670;max-width:360px}.flabel b{color:#14181b;font-weight:700;margin-right:6px}
.ph{width:360px;height:720px;position:relative;overflow:hidden;background:#fff;border-radius:24px;box-shadow:0 0 0 1px #e2e6ea;display:flex;flex-direction:column;font:400 14px/1.4 Inter,system-ui,sans-serif;color:var(--ink);font-variant-numeric:tabular-nums;isolation:isolate;flex:none}
.ph.w320{width:320px;height:640px}.ph *{box-sizing:border-box}
.sb{height:28px;flex:none;display:flex;justify-content:space-between;align-items:center;padding:0 16px;font:600 12px Inter;position:relative;z-index:4}
.body{flex:1;min-height:0;position:relative;overflow:hidden}
.disc{width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex:none;color:var(--ink)}
.t44{width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex:none}
.circ{position:absolute;border-radius:50%;z-index:0}
.phd{background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.6) 0 8px,transparent 8px 16px)}
.phd code,.cap{font:600 9.5px ui-monospace,Menlo,monospace;color:#5b6670;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:4px;white-space:nowrap}
.spin{display:inline-block;border-radius:50%;border:2px solid var(--line);border-top-color:var(--accent);flex:none}
.clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.new{outline:2px dashed #4b2fbf;outline-offset:3px;border-radius:inherit}
.newtag{position:absolute;z-index:60;font:700 9px Inter;letter-spacing:.3px;color:#4b2fbf;background:#ece8ff;padding:2px 6px;border-radius:6px;white-space:nowrap}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
</style>`);

/* ---------- sample data (one set across every surface) ---------- */
const V={
 ci:{n:'Chicken Inn Avondale',svc:'food',sub:'Chicken · Fast food · $',r:4.6,rc:120,eta:'25–35',fee:'$1.50',km:'1.2',until:'22:00',time:'Ready in ~15 min',cover:'rice-3',logo:'butter-chicken-3',tabs:['Popular','Meals','Sides','Drinks'],line:'Fried chicken, chips and rice meals'},
 mb:{n:'Mbuya’s Traditional Kitchen & Grill Borrowdale Village',svc:'food',sub:'Traditional · Grills · $$',r:4.8,rc:156,eta:'30–40',fee:'$2.00',km:'3.4',until:'21:30',time:'Ready in ~20 min',cover:'butter-chicken-2',logo:'rice-1',tabs:['Popular','Mains','Sides','Drinks'],line:'Sadza, stews and grills cooked the way Mbuya did'},
 af:{n:'Avondale Fresh',svc:'shops',sub:'Grocery',r:4.6,rc:128,eta:'20–30',fee:'$1.50',km:'1.6',until:'20:00',time:'Packed in ~10 min',coverPh:'cover photo · 3:1',cTint:'#E9F8EF',logoIni:'A',lTint:'#E9F8EF',lInk:'#006630',tabs:['Bakery & eggs','Dairy','Drinks','Household']},
 kh:{n:'Kensington Hardware',svc:'shops',sub:'Hardware',r:0,eta:'30–40',fee:'$2.00',km:'2.6',until:'21:00',time:'Packed in ~20 min',band:'#DDD5FF',logoIni:'K',lTint:'#F6F7F8',lInk:'#14181B',tabs:['Tools','Building','Paint']},
 bp:{n:'Belgravia Pharmacy',svc:'pharmacy',sub:'Pharmacy',r:4.5,rc:40,eta:'15–25',fee:'$1.50',km:'0.6',until:'21:00',time:'Packed in ~10 min',coverPh:'cover photo · 3:1',cTint:'#DFF4EE',logoIni:'B',lTint:'#DFF4EE',lInk:'#006630',tabs:['Pain & fever','Cold & flu','First aid','Vitamins']},
 gava:{n:'Gava’s Kitchen'}
};
const LINK='lyniago.com/s/7KQ2MX';

/* ---------- generic ---------- */
const sb=(c)=>`<div class="sb" style="${c?'color:'+c:''}"><span>9:41</span><span>3G 84%</span></div>`;
const NEW=(t,pos)=>`<span class="newtag" style="${pos}">NEW${t?' · '+t:''}</span>`;
function phone(o){return `<div class="frame" data-screen-label="${o.id}${o.label?' · '+o.label:''}" data-id="${o.id}"><div class="flabel"><b>${o.id}</b>${o.label||''}</div><div class="ph ${o.w===320?'w320':''}" style="${o.bg?'background:'+o.bg:''}">${o.html}</div></div>`;}
const cta=(t,o={})=>`<div style="min-height:52px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;font:600 16px Inter;text-align:center;padding:0 16px;${o.off?'background:var(--line);color:var(--muted)':'background:var(--cta-fill);color:#fff'}">${t}</div>`;
const ghost=(t,o={})=>`<div style="min-height:48px;border-radius:999px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;gap:8px;font:600 15px Inter;color:${o.c||'var(--accent-text)'};text-align:center;padding:0 16px">${t}</div>`;
const textBtn=(t,o={})=>`<div style="min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;font:600 ${o.s||15}px Inter;color:var(--accent-text)">${t}</div>`;
const softPill=(t)=>`<div style="height:44px;padding:0 20px;border-radius:999px;background:var(--accent-wash);color:var(--accent-text);display:inline-flex;align-items:center;gap:8px;font:600 14px Inter;white-space:nowrap">${t}</div>`;
const dim=(z=40)=>`<div style="position:absolute;inset:0;background:var(--scrim);z-index:${z}"></div>`;
const csheet=(inner,o={})=>dim()+`<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;z-index:41;padding:8px 16px 20px;display:flex;flex-direction:column;gap:${o.gap||12}px"><div style="width:36px;height:4px;border-radius:2px;background:#d5dbe0;margin:0 auto 4px;flex:none"></div>${inner}</div>`;
const sk=(w,h,r=8,x='')=>`<div style="width:${w};height:${h}px;border-radius:${r}px;background:var(--skeleton);flex:none;${x}"></div>`;

/* QR stand-in: 29×29 modules, real finder/timing pattern layout, pseudo-random data. Build uses a real encoder (EC level M). */
function qr(size,code='7KQ2MX'){const N=29,m=size/N;let seed=0;for(const ch of code)seed=(seed*31+ch.charCodeAt(0))>>>0;const rnd=()=>{seed=(seed*1103515245+12345)>>>0;return (seed>>16)&1};
const fin=(x,y)=>(x<8&&y<8)||(x>N-9&&y<8)||(x<8&&y>N-9);let r='';
const box=(x,y)=>`<rect x="${x*m}" y="${y*m}" width="${7*m}" height="${7*m}" fill="#14181b"/><rect x="${(x+1)*m}" y="${(y+1)*m}" width="${5*m}" height="${5*m}" fill="#fff"/><rect x="${(x+2)*m}" y="${(y+2)*m}" width="${3*m}" height="${3*m}" fill="#14181b"/>`;
for(let y=0;y<N;y++)for(let x=0;x<N;x++){if(fin(x,y))continue;let on=(y===6||x===6)?((x+y)%2===0):rnd();if(x>=20&&x<=24&&y>=20&&y<=24){on=(x===20||x===24||y===20||y===24||(x===22&&y===22))}if(on)r+=`<rect x="${(x*m).toFixed(2)}" y="${(y*m).toFixed(2)}" width="${(m+.15).toFixed(2)}" height="${(m+.15).toFixed(2)}" fill="#14181b"/>`;}
return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code for lyniago.com/s/${code}" style="display:block;flex:none"><rect width="${size}" height="${size}" fill="#fff"/>${r}${box(0,0)}${box(N-7,0)}${box(0,N-7)}</svg>`;}

/* logo: photo, or kind tint + initial */
const logo=(v,s,ring=4,x='')=>v.logo?`<span style="width:${s}px;height:${s}px;border-radius:50%;border:${ring}px solid #fff;background:#fff url(${F}${v.logo}.jpg) center/cover;display:block;flex:none;${x}"></span>`:`<span style="width:${s}px;height:${s}px;border-radius:50%;border:${ring}px solid #fff;background:${v.lTint||'#F6F7F8'};color:${v.lInk||'#14181B'};display:flex;align-items:center;justify-content:center;font:700 ${Math.round(s*.4)}px Inter;flex:none;${x}">${v.logoIni||v.n[0]}</span>`;
const coverBg=(v)=>v.cover?`background:#ccc url(${F}${v.cover}.jpg) center/cover`:v.band?`background:${v.band}`:`background-color:${v.cTint}`;

/* ---------- Empty State (D-78) ---------- */
function empty(o){const t={empty:['var(--accent-wash)','var(--accent)','var(--highlight)'],info:['var(--surface)','#7D8790','#AEB6BD'],error:['var(--danger-wash)','var(--danger-ink)',null]}[o.tone||'empty'];
return `<div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:${o.top||120}px 40px 0"><div style="position:relative;width:88px;height:88px;border-radius:50%;border:1px solid ${t[0]};display:flex;align-items:center;justify-content:center;margin-bottom:8px"><div style="width:64px;height:64px;border-radius:50%;background:${t[0]};display:flex;align-items:center;justify-content:center;color:${t[1]};position:relative">${I(o.icon,24)}${t[2]?`<span style="position:absolute;top:1px;right:-1px;width:14px;height:14px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center"><span style="width:8px;height:8px;border-radius:50%;background:${t[2]}"></span></span>`:''}</div></div><div style="margin-top:16px;font:600 18px/1.3 Inter;letter-spacing:-.18px;max-width:264px;text-wrap:balance">${o.t}</div>${o.s?`<div style="margin-top:4px;font:400 14px/20.3px Inter;color:var(--muted);max-width:264px;text-wrap:pretty">${o.s}</div>`:''}${o.pill?`<div style="margin-top:20px">${softPill(o.pill)}</div>`:''}</div>`;}

/* ---------- the chip (NEW) ---------- */
function chip(v,o={}){const named=!!v;const name=named?v.n:SH.chip.noName;
const mark=named?logo(v,32,0):`<span style="width:32px;height:32px;border-radius:50%;background:#fff;color:var(--accent-text);display:flex;align-items:center;justify-content:center;flex:none">${I('store',16)}</span>`;
return `<div role="status" aria-live="polite" style="position:relative;display:inline-flex;align-items:center;gap:10px;max-width:100%;min-height:44px;padding:6px 14px 6px 6px;border-radius:22px;background:var(--accent-wash);${o.x||''}">${mark}<div style="min-width:0;line-height:1.25"><div style="font:400 12px Inter;color:var(--muted)">${SH.chip.lead}</div><div class="clamp2" style="font:700 14px/1.25 Inter;color:var(--ink)">${name}</div></div>${o.tag?NEW('chip','right:-6px;top:-10px'):''}</div>`;}

window.SK={I,P,A,F,V,LINK,sb,NEW,phone,cta,ghost,textBtn,softPill,dim,csheet,sk,qr,logo,coverBg,empty,chip};
})();
