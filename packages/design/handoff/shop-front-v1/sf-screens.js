(function(){
const S=window.SF;
const P={
back:'<path d="m15 18-6-6 6-6"/>',
camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
image:'<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',minus:'<path d="M5 12h14"/>',
check:'<path d="M20 6 9 17l-5-5"/>',
alert:'<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
rotate:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
lock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
store:'<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>',
wifioff:'<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
move:'<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
enter:'<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
del:'<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/>',
shift:'<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'
};
const I=(n,s=20)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${P[n]}</svg>`;
const spin=(s=16)=>`<span class="spin" style="width:${s}px;height:${s}px"></span>`;
const caret='<span class="caret"></span>';
const mono=t=>`<span style="font:600 11px/1 ui-monospace,Menlo,monospace;color:var(--muted);background:var(--bg);padding:4px 6px;border-radius:4px;white-space:nowrap">${t}</span>`;
const stripes=d=>`background-color:${d.st};background-image:repeating-linear-gradient(135deg,transparent 0 10px,rgba(255,255,255,.4) 10px 20px)`;
const SL=t=>`<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--muted)">${t}</div>`;

const K={
food:{v:'food',sug:'food',name:'Sadza Republic',desc:'Home-cooked sadza, grills and stews since 2015',tags:['Sadza','Grill','Traditional'],price:1,ini:'SR',lbg:'var(--tile-peach)',lfg:'var(--coral-ink)',st:'var(--tile-food-blob)'},
shop:{v:'shop',sug:'auto_parts',name:'Mbare Auto Spares',desc:'Genuine spares, Mbare Musika',tags:['Brake pads','Batteries'],price:2,ini:'MA',lbg:'var(--kind-auto)',lfg:'var(--kind-auto-ink)',st:'var(--kind-auto)'},
rx:{v:'shop',sug:'pharmacy',name:'Avondale Family Pharmacy',desc:'Medicines and baby care, delivered to your gate',tags:['Pain relief','Vitamins','Cold & flu'],price:2,ini:'AF',lbg:'var(--tile-pharmacy)',lfg:'var(--accent-text)',st:'var(--tile-pharmacy-blob)'}
};

/* ── shared parts ── */
function strip(t,icon,main,sub,action,below){const bad=t==='bad';if(below){return `<div style="display:flex;gap:10px;padding:12px 14px;border-radius:12px;background:${bad?'var(--danger-wash)':'var(--surface)'};${bad?'border:1px solid var(--danger);':''}font-size:14px;line-height:1.4;color:${bad?'var(--danger-ink)':'var(--ink)'}"><span style="display:flex;flex:none;padding-top:2px">${icon}</span><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px"><div><div style="font-weight:700">${main}</div><div style="font-size:13px">${sub}</div></div><div style="display:flex">${action}</div></div></div>`;}
return `<div style="display:flex;align-items:center;gap:10px;padding:${action?'8px 8px 8px 14px':'12px 14px'};border-radius:12px;background:${bad?'var(--danger-wash)':'var(--surface)'};${bad?'border:1px solid var(--danger);':''}font-size:14px;line-height:1.4;color:${bad?'var(--danger-ink)':'var(--ink)'}"><span style="display:flex;flex:none;color:${bad?'var(--danger-ink)':'var(--muted)'}">${icon}</span><div style="flex:1;min-width:0">${main?`<div style="font-weight:700">${main}</div>`:''}${sub?`<div style="${main?`font-size:13px;color:${bad?'var(--danger-ink)':'var(--muted)'}`:(bad?'font-weight:600':'')}">${sub}</div>`:''}</div>${action||''}</div>`;}
const pill=(html,bad)=>`<div style="height:44px;padding:0 16px;border-radius:999px;background:var(--bg);display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:${bad?'var(--danger-ink)':'var(--accent-text)'};flex:none">${html}</div>`;
function busyStrip(t,pct){return `<div style="display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:12px;background:var(--surface);font-size:14px"><div style="display:flex;align-items:center;gap:10px"><span style="color:var(--muted);display:flex">${spin(16)}</span><div style="flex:1;font-weight:700">${t}</div>${pct!=null?`<div style="font-size:13px;font-weight:600;color:var(--muted)">${pct}%</div>`:''}</div>${pct!=null?`<div style="height:4px;border-radius:2px;background:var(--line)"><div style="width:${pct}%;height:4px;border-radius:2px;background:var(--accent)"></div></div>`:''}<div style="font-size:13px;color:var(--muted)">${S.waitSave}</div></div>`;}
const cta=t=>`<div style="height:52px;border-radius:999px;background:var(--cta-fill);color:var(--on-accent);display:flex;align-items:center;justify-content:center;gap:10px;font-size:16px;font-weight:700">${t}</div>`;
const btn2=(t,c='var(--ink)')=>`<div style="height:48px;border-radius:999px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:700;color:${c}">${t}</div>`;

/* ── WHAT CUSTOMERS SEE: the storefront header, which is also where photos are edited ── */
function pv(d,o){
const cw=o.cw,h=Math.round(cw/3),B=o.b||'photo',L=o.l||'photo';
const name=o.name??d.name,desc=o.desc??d.desc,tags=o.tags??d.tags,price=o.price===undefined?d.price:o.price;
const ov=(st,s)=>st==='busy'||st==='fail'?`<div style="position:absolute;inset:0;border-radius:inherit;background:rgba(20,24,27,.5);display:flex;align-items:center;justify-content:center;color:var(--on-accent)">${st==='busy'?spin(s):I('alert',s)}</div>`:'';
const ban=B==='empty'
?`<div style="height:${h}px;background:var(--accent-wash);padding:8px 8px 8px 92px;box-sizing:border-box"><div style="height:100%;box-sizing:border-box;border:2px dashed var(--accent);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0 8px;color:var(--accent-text);text-align:center">${I('camera')}<div style="font-size:15px;font-weight:700;line-height:1.3">${S.addBanner}</div><div style="font-size:13px;color:var(--muted);line-height:1.3">${S.addBannerSub[d.v]}</div></div></div>`
:`<div style="height:${h}px;position:relative;${stripes(d)}"><div style="position:absolute;right:8px;top:8px">${mono('banner photo')}</div>${ov(B,24)}${o.edit&&B==='photo'?`<div style="position:absolute;right:8px;bottom:8px;height:44px;padding:0 14px;border-radius:999px;background:var(--bg);box-shadow:var(--shadow-card);display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700">${I('camera',16)}${S.change}</div>`:''}</div>`;
const lin=L==='empty'
?`<div style="width:64px;height:64px;box-sizing:border-box;border-radius:50%;border:2px dashed var(--accent);background:var(--accent-wash);color:var(--accent-text);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:12px;font-weight:700">${I('camera',16)}${S.logoSlot}</div>`
:`<div style="width:64px;height:64px;border-radius:50%;background:${d.lbg};color:${d.lfg};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;position:relative">${d.ini}${ov(L,20)}</div>`;
const badge=o.edit&&L==='photo'?`<div style="position:absolute;right:0;bottom:0;width:26px;height:26px;border-radius:50%;background:var(--bg);box-shadow:var(--shadow-badge);display:flex;align-items:center;justify-content:center">${I('camera',16)}</div>`:'';
const tg=tags.length?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${tags.map(t=>`<span style="font-size:12px;font-weight:700;color:var(--accent-text);background:var(--accent-wash);border-radius:999px;padding:4px 10px">${t}</span>`).join('')}</div>`:'';
return `<div style="position:relative;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--bg)">${ban}<div style="position:absolute;left:11px;top:${h-35}px;padding:3px;border-radius:50%;background:var(--bg)">${lin}${badge}</div><div style="padding:40px 14px 14px"><div style="font-size:18px;font-weight:700;line-height:1.3;text-wrap:pretty">${name||S.nameFallback}${price?' ':''}${price?`<span style="font-size:14px;font-weight:700;color:var(--muted);white-space:nowrap">· ${S.price[price-1]}</span>`:''}</div><div style="font-size:14px;color:var(--muted);margin-top:4px;line-height:1.4;text-wrap:pretty">${desc||S.descFallback}</div>${tg}</div></div>`;}

/* ── fields ── */
function fld(label,val,o={}){
const bd=o.err?'2px solid var(--danger)':o.on?'2px solid var(--accent)':'1px solid var(--line)',px=(o.err||o.on)?13:14;
const txt=val?`<span style="${o.multi?'':'white-space:nowrap;overflow:hidden;min-width:0;'}">${val}</span>`:`<span style="color:var(--muted)">${o.ph||''}</span>`;
return `<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><div style="font-size:14px;font-weight:600">${label}</div>${o.count?`<div style="font-size:13px;color:var(--muted);white-space:nowrap;flex:none">${o.count}</div>`:''}</div><div style="min-height:52px;box-sizing:border-box;border:${bd};border-radius:12px;padding:${o.multi?`13px ${px}px`:`0 ${px}px`};display:flex;align-items:center;font-size:16px;line-height:1.4">${txt}${o.on?caret:''}</div>${o.help?`<div style="font-size:13px;line-height:1.4;display:flex;gap:6px;align-items:center;color:${o.err?'var(--danger-ink)':'var(--muted)'};${o.err?'font-weight:600':''}">${o.err?I('alert',16):''}${o.help}</div>`:''}</div>`;}

function tagsBlock(d,o){
const tags=o.tags,n=tags.length,full=n>=3;
const chip=t=>`<div style="height:44px;max-width:100%;box-sizing:border-box;display:flex;align-items:center;border-radius:999px;background:var(--accent-wash);color:var(--accent-text);font-size:15px;font-weight:700;padding-left:14px;${t===o.hl?'box-shadow:inset 0 0 0 2px var(--accent);':''}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t}</span><span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex:none">${I('x',16)}</span></div>`;
const field=`<div style="display:flex;gap:8px"><div style="flex:1;min-width:0;height:52px;box-sizing:border-box;border:${o.on?'2px solid var(--accent)':'1px solid var(--line)'};border-radius:12px;padding:0 ${o.on?13:14}px;display:flex;align-items:center;font-size:16px;white-space:nowrap;overflow:hidden">${o.draft?`<span>${o.draft}</span>${caret}`:`${o.on?caret:''}<span style="color:var(--muted)">${S.tagPh}</span>`}</div><div style="height:52px;padding:0 20px;border-radius:999px;display:flex;align-items:center;font-size:15px;font-weight:700;flex:none;${o.draft?'background:var(--accent-wash);color:var(--accent-text)':'background:var(--surface);color:var(--muted)'}">${S.tagAdd}</div></div>`;
const help=o.dup?`<div style="font-size:13px;color:var(--muted)">${S.tagDup(o.dup)}</div>`:'';
const sugList=(S.suggest[d.sug]||[]).filter(s=>!tags.includes(s)&&(!o.draft||s.toLowerCase().startsWith(o.draft.toLowerCase())));
const sug=!full&&o.sug!==false&&sugList.length?`<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px"><div style="font-size:13px;color:var(--muted)">${S.tagSuggest}</div><div style="display:flex;flex-wrap:wrap;gap:8px">${sugList.map(s=>`<div style="height:44px;padding:0 14px 0 10px;border-radius:999px;border:1px solid var(--line);display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700"><span style="color:var(--accent-text);display:flex">${I('plus',16)}</span>${s}</div>`).join('')}</div></div>`:'';
return `<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><div style="font-size:14px;font-weight:600;min-width:0">${S.tagsLabel[d.v]}</div><div style="font-size:13px;color:var(--muted);white-space:nowrap;flex:none">${S.tagsCount(n)}</div></div>${n?`<div style="display:flex;flex-wrap:wrap;gap:8px">${tags.map(chip).join('')}</div>`:''}${full?`<div style="font-size:13px;color:var(--muted)">${S.tagFull}</div>`:field+help+sug}</div>`;}

function priceBlock(p){return `<div style="display:flex;flex-direction:column;gap:8px"><div style="font-size:14px;font-weight:600">${S.priceLabel} <span style="font-weight:400;color:var(--muted)">· ${S.optional}</span></div><div style="display:flex;gap:8px">${[1,2,3].map(l=>`<div style="flex:1;height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;${p===l?'background:var(--ink);color:var(--bg)':'background:var(--surface);color:var(--ink)'}">${S.price[l-1]}</div>`).join('')}</div>${p?`<div style="font-size:13px;color:var(--muted)">${S.priceHelp}</div>`:''}</div>`;}

const wrap=g=>`<div style="flex:none;padding:4px 16px 24px;display:flex;flex-direction:column;gap:24px">${g.join('')}</div>`;
function form(d,o={}){
const w=o.w||360,cw=w-32;
const name=o.name??d.name,desc=o.desc??d.desc,tags=o.tags??d.tags,price=o.price===undefined?d.price:o.price;
const g=[];
g.push(o.notLive?strip('n',I('store',16),null,S.introNotLive):`<div style="font-size:14px;color:var(--muted);line-height:1.4">${S.intro}</div>`);
g.push(`<div style="display:flex;flex-direction:column;gap:8px">${SL(S.previewLabel)}${pv(d,{...o,cw,edit:o.edit!==false})}${o.pstrip||''}${o.tip?`<div style="font-size:13px;color:var(--muted);line-height:1.45;text-wrap:pretty">${S.tip[d.v]}</div>`:''}</div>`);
g.push(fld(S.nameLabel,name,{err:o.nameErr,help:o.nameErr?S.nameErr:null,count:name.length>=100?S.counter(name.length,S.nameMax):null}));
g.push(fld(S.descLabel,desc,{multi:true,help:S.descHelp}));
g.push(tagsBlock(d,{...(o.t||{}),tags}));
if(o.until!=='tags')g.push(priceBlock(price));
return wrap(g);}

function bar(st,extra){
const lbl=st==='saving'?`${spin(18)}${S.saving}`:S.save;
const c=`<div style="height:52px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:16px;font-weight:700;${st==='off'?'background:var(--line);color:var(--muted)':'background:var(--cta-fill);color:var(--on-accent)'}">${lbl}</div>`;
const pre=st==='fail'?strip('bad',I('alert',16),null,S.saveFail):(extra||'');
return `<div style="flex:none;position:relative;padding:12px 16px 16px;background:var(--bg);box-shadow:0 -4px 16px rgba(20,24,27,.06);display:flex;flex-direction:column;gap:8px">${pre}${c}</div>`;}

function kb(w,words){
const k=(t,f=1,x='')=>`<div style="flex:${f} 1 0;min-width:0;height:42px;border-radius:6px;background:var(--bg);box-shadow:var(--shadow-badge);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--ink);${x}">${t}</div>`;
const row=(s,pad=0)=>`<div style="display:flex;gap:5px;padding:0 ${pad}px">${s}</div>`,L=s=>[...s].map(c=>k(c)).join(''),fn='background:var(--line)';
return `<div style="flex:none;position:relative;background:var(--surface);border-top:1px solid var(--line);padding:2px 4px 10px;display:flex;flex-direction:column;gap:8px"><div style="height:36px;display:flex;align-items:center;justify-content:space-around;font-size:15px">${(words||['','','']).map(x=>`<span>${x}</span>`).join('')}</div>${row(L('qwertyuiop'))}${row(L('asdfghjkl'),w===320?14:16)}${row(k(I('shift',18),1.5,fn)+L('zxcvbnm')+k(I('del',18),1.5,fn))}${row(k('?123',1.5,fn+';font-size:14px;font-weight:600')+k(',')+k('',5)+k('.')+k(I('enter',18),1.5,'background:var(--cta-fill);color:var(--on-accent)'))}</div>`;}

function phone(o){const w=o.w||360,h=o.h||(w===320?640:720);
return `<div class="ph" data-screen-label="${o.label}" style="width:${w}px;${o.full?'':`height:${h}px;`}"><div style="height:52px;flex:none;display:flex;align-items:center;gap:4px;padding:0 16px 0 4px"><span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:${o.dim?'var(--muted)':'var(--accent-text)'}">${I('back')}</span><div style="flex:1;font-size:17px;font-weight:700">${S.appBar}</div></div><div style="flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:${o.anchor==='bottom'?'flex-end':'flex-start'};${o.dim?'opacity:.5;':''}">${o.body}</div>${o.bar||''}${o.kb||''}${o.over||''}</div>`;}

const scrim='<div style="position:absolute;inset:0;background:rgba(20,24,27,.5)"></div>';
const handle='<div style="width:36px;height:4px;border-radius:2px;background:var(--line);margin:10px auto 0;flex:none"></div>';
const sT=t=>`<div style="font-size:20px;font-weight:700;line-height:1.25">${t}</div>`;
const sS=t=>`<div style="font-size:14px;color:var(--muted);line-height:1.4;margin-top:-6px;text-wrap:pretty">${t}</div>`;
const sheet=inner=>scrim+`<div style="position:absolute;left:0;right:0;bottom:0;background:var(--bg);border-radius:20px 20px 0 0;box-shadow:var(--shadow-sheet);display:flex;flex-direction:column">${handle}<div style="padding:12px 16px 16px;display:flex;flex-direction:column;gap:12px">${inner}</div></div>`;
const toast=t=>`<div style="position:absolute;left:16px;right:16px;bottom:96px;background:var(--forest);color:var(--on-accent);border-radius:14px;padding:14px 16px;display:flex;gap:10px;align-items:center;font-size:14px;font-weight:600"><span style="color:var(--accent);display:flex">${I('check')}</span>${t}</div>`;

function photoSheet(d,kind,has){
const rows=[['camera',S.takePhoto],['image',S.choosePhoto]];if(has)rows.push(['trash',S.remove[kind],1]);
const list=`<div style="border:1px solid var(--line);border-radius:16px;padding:0 14px">${rows.map((r,i)=>`<div style="min-height:56px;display:flex;align-items:center;gap:12px;font-size:16px;font-weight:600;${i?'border-top:1px solid var(--line);':''}color:${r[2]?'var(--danger-ink)':'var(--ink)'}"><span style="display:flex;color:${r[2]?'var(--danger-ink)':'var(--accent-text)'}">${I(r[0])}</span>${r[1]}</div>`).join('')}</div>`;
return sheet(sT(S.photoTitle[kind])+sS(kind==='banner'?S.tip[d.v]:S.logoSub)+list+btn2(S.cancel));}

const dim=(l,tp,fw,fh,W,H)=>{const r=(x,y,w,h)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:rgba(20,24,27,.5)"></div>`;return r(0,0,W,tp)+r(0,tp+fh,W,H-tp-fh)+r(0,tp,l,fh)+r(l+fw,tp,W-l-fw,fh);};
function cropSheet(d,kind,w){
const cw=w-32,C=S.crop[kind],badge=t=>`<span style="position:absolute;right:6px;top:6px;font-size:12px;font-weight:700;color:var(--muted);background:var(--bg);border-radius:999px;padding:3px 9px">${t}</span>`;
const drag=`<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:6px;background:rgba(20,24,27,.72);color:var(--on-accent);font-size:12px;font-weight:700;border-radius:999px;padding:6px 12px;white-space:nowrap">${I('move',16)}${S.crop.drag}</span>`;
let stage,prev;
if(kind==='banner'){const sh=Math.round(cw*.5),fw=cw-24,fh=Math.round(fw/3),lg=Math.round(64*fw/328),ll=Math.round(14*fw/328);
stage=`<div style="height:${sh}px;border-radius:12px;overflow:hidden;position:relative;flex:none;${stripes(d)}">${dim(12,Math.round((sh-fh)/2),fw,fh,cw,sh)}<div style="position:absolute;left:12px;top:${Math.round((sh-fh)/2)}px;width:${fw}px;height:${fh}px;box-sizing:border-box;border:2px dashed var(--accent);border-radius:8px;overflow:hidden"><div style="position:absolute;left:${ll}px;top:${fh-Math.round(lg/2)-2}px;width:${lg}px;height:${lg}px;border-radius:50%;border:2px dashed var(--bg);box-sizing:border-box"></div>${badge('3:1')}${drag}</div></div>`;
prev=pv(d,{cw,edit:false});}
else{const sh=Math.round(cw*.72),fw=sh-36;
stage=`<div style="height:${sh}px;border-radius:12px;overflow:hidden;position:relative;flex:none;${stripes(d)}">${dim(Math.round((cw-fw)/2),18,fw,fw,cw,sh)}<div style="position:absolute;left:${Math.round((cw-fw)/2)}px;top:18px;width:${fw}px;height:${fw}px;box-sizing:border-box;border:2px dashed var(--accent);border-radius:8px"><div style="position:absolute;inset:4px;border-radius:50%;border:2px dashed var(--bg)"></div>${badge('1:1')}${drag}</div></div>`;
prev=`<div style="border:1px solid var(--line);border-radius:16px;padding:0 14px"><div style="display:flex;align-items:center;gap:12px;padding:12px 0"><div style="width:56px;height:56px;border-radius:50%;flex:none;background:${d.lbg};color:${d.lfg};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700">${d.ini}</div><div style="min-width:0"><div style="font-size:15px;font-weight:700">${d.name}</div><div style="font-size:13px;color:var(--muted)">${S.crop.logoPreviewSub}</div></div></div></div>`;}
const zb=n=>`<div style="width:44px;height:44px;border-radius:50%;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none">${I(n,16)}</div>`;
const zoom=`<div style="display:flex;align-items:center;gap:8px;flex:none">${zb('minus')}<div style="flex:1;height:44px;position:relative;display:flex;align-items:center"><div style="height:4px;border-radius:2px;background:var(--line);width:100%"></div><div style="position:absolute;left:0;width:30%;height:4px;border-radius:2px;background:var(--accent)"></div><div style="position:absolute;left:calc(30% - 12px);width:24px;height:24px;border-radius:50%;background:var(--bg);border:2px solid var(--accent);box-sizing:border-box;box-shadow:var(--shadow-badge)"></div></div>${zb('plus')}<div style="min-width:36px;text-align:right;font-size:14px;font-weight:700;color:var(--muted)">1.4×</div></div>`;
return scrim+`<div style="position:absolute;left:0;right:0;bottom:0;top:24px;background:var(--bg);border-radius:20px 20px 0 0;box-shadow:var(--shadow-sheet);display:flex;flex-direction:column">${handle}<div style="padding:12px 16px 0;display:flex;flex-direction:column;gap:12px;flex:none">${sT(C.title)}${sS(C.sub)}</div><div style="flex:1;min-height:0;overflow:hidden;padding:12px 16px 16px;display:flex;flex-direction:column;gap:12px">${stage}${zoom}${SL(S.crop.livePreview)}<div style="flex:none">${prev}</div><div style="font-size:13px;color:var(--muted);line-height:1.45">${kind==='banner'?S.tip[d.v]:S.logoSub}</div></div><div style="flex:none;padding:12px 16px 16px;box-shadow:0 -4px 16px rgba(20,24,27,.06);display:flex;flex-direction:column;gap:8px">${cta(C.save)}${btn2(S.cancel)}</div></div>`;}

/* ── frames ── */
const F=K.food,f=(o)=>form(F,o);
const long={name:'Siyaso Genuine Auto Spares & Accessories',desc:'Genuine spares for Toyota and Nissan, Mbare Musika',tags:['Batteries & alternators','Headlights & tail lamps','Toyota & Nissan parts'],price:2};
const empty={b:'empty',l:'empty',tags:[],desc:'',price:null,tip:true};
const sk=(w,h,r=8)=>`<div style="width:${w};height:${h}px;border-radius:${r}px;background:var(--surface);flex:none"></div>`;
const loading=wrap([`<div style="font-size:14px;color:var(--muted)">${S.loading}</div>`,`<div style="display:flex;flex-direction:column;gap:8px">${sk('42%',12,6)}<div style="position:relative;border:1px solid var(--line);border-radius:16px;overflow:hidden">${sk('100%',109,0)}<div style="position:absolute;left:11px;top:74px;padding:3px;border-radius:50%;background:var(--bg)">${sk('64px',64,32)}</div><div style="padding:40px 14px 14px;display:flex;flex-direction:column;gap:8px">${sk('55%',18)}${sk('85%',14)}</div></div></div>`,`<div style="display:flex;flex-direction:column;gap:8px">${sk('30%',14,6)}${sk('100%',52,12)}</div>`,`<div style="display:flex;flex-direction:column;gap:8px">${sk('50%',14,6)}${sk('100%',52,12)}</div>`]);
const loadFail=`<div style="padding:72px 32px 0;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center"><span style="width:72px;height:72px;border-radius:50%;background:var(--surface);color:var(--muted);display:flex;align-items:center;justify-content:center">${I('wifioff')}</span><div style="font-size:20px;font-weight:700;text-wrap:pretty">${S.loadFailT}</div><div style="font-size:15px;color:var(--muted);line-height:1.45;text-wrap:pretty">${S.loadFailB}</div><div style="width:100%;margin-top:8px">${btn2(`<span style="color:var(--accent-text);display:flex">${I('rotate',16)}</span><span style="color:var(--accent-text)">${S.retry}</span>`)}</div></div>`;
const staff=wrap([strip('n',I('lock',16),null,S.staff),`<div style="display:flex;flex-direction:column;gap:8px">${SL(S.previewLabel)}${pv(F,{cw:328,edit:false})}</div>`]);

const SECTIONS=[
{t:'Filled',s:'Restaurant, shop, pharmacy. Only the words change: “What you cook / What you sell”, the banner tip, the shop-not-live line.',c:[
['Restaurant filled',phone({label:'Restaurant filled',body:f(),bar:bar('off')}),'The storefront header is the top of the screen: what customers see, and where the banner and logo are changed. Fields sit directly under it, so the name you type is just above the field. Save is pinned and grey until something changes.'],
['Restaurant filled · scrolled',phone({label:'Restaurant filled · scrolled',anchor:'bottom',body:f(),bar:bar('off')}),'Tag chips are 44 px with a 44 px × hit area. Price level is a single-choice row of 44 px chips, ink when chosen (K2 “Ready in” style). Tap the chosen one again to clear it.'],
['Shop filled · not live yet',phone({label:'Shop filled · not live yet',body:form(K.shop,{notLive:true}),bar:bar('off')}),'The intro becomes a neutral strip with the store icon. With room for a third tag, the field and one-tap suggestions show.'],
['Pharmacy filled',phone({label:'Pharmacy filled',body:form(K.rx),bar:bar('off')}),'Pharmacy uses shop words. A two-line name wraps in the preview; the field scrolls.'],
['Restaurant filled · full length',phone({label:'Restaurant filled · full length',full:true,body:f(),bar:bar('off')}),'Everything on the page, top to bottom.']]},
{t:'First time, loading, staff',c:[
['Empty / first time',phone({label:'Empty / first time',body:f(empty),bar:bar('off')}),'Real empty slots: a dashed mint banner (“Add a banner photo”) with its content kept off the logo’s left edge, and a dashed logo circle. The banner tip shows under the preview until a banner is added. Suggested tags fill the tag area.'],
['Empty / first time · 320',phone({label:'Empty / first time · 320',w:320,body:form(F,{...empty,w:320}),bar:bar('off')}),'At 320 the banner is 288 × 96. The empty banner text still clears the logo.'],
['Loading',phone({label:'Loading',body:loading}),'Skeleton in the real layout, so nothing jumps when it fills in. No Save bar until the profile has loaded.'],
["Couldn't load",phone({label:"Couldn't load",body:loadFail}),'T14b. Centred like T4 Closed. “Try again” refetches; it is a 48 px outline button, as there is nothing to save.'],
['Staff (not owner)',phone({label:'Staff (not owner)',body:staff}),'Staff see the shop front exactly as customers do, with no change controls and no Save bar. The lock strip says why.']]},
{t:'Save',s:'Save lives in the pinned bottom bar, 52 px. It is the only way changes reach customers.',c:[
['Unsaved changes',phone({label:'Unsaved changes',body:f({price:2,desc:'Home-cooked sadza, grills and stews'}),bar:bar('on')}),'Any edit (a field, a tag, the price level, a photo that finished uploading) turns Save green. Undoing the edit by hand turns it grey again.'],
['Unsaved · leaving',phone({label:'Unsaved · leaving',body:f({price:2}),bar:bar('on'),over:sheet(sT(S.leaveT)+sS(S.leaveB)+cta(S.leaveKeep)+btn2(S.leaveGo,'var(--danger-ink)'))}),'Back, or the Android back gesture, with unsaved changes. The primary keeps editing; “Leave” drops the changes.'],
['Saving…',phone({label:'Saving…',dim:true,body:f({price:2}),bar:bar('saving')}),'Spinner in the button. Form at 50% and not editable; back is locked (C7 pattern).'],
['Saved',phone({label:'Saved',body:f({price:2}),bar:bar('off'),over:toast(S.saved)}),'First-run-v2 toast, 96 px from the bottom, 2.5 s. Save goes grey. A shop that isn’t live yet gets “Saved”.'],
['Save failed',phone({label:'Save failed',body:f({price:2}),bar:bar('fail')}),'Red strip above the button, which stays green. The API’s own message replaces the default text when there is one. Nothing typed is lost.'],
['Name missing',phone({label:'Name missing',body:f({name:''}),bar:bar('off')}),'An empty name: the field turns red with a helper, and Save stays grey. The preview falls back to “Your shop”.']]},
{t:'Photos',s:'Tap the banner or the logo (the whole area is the target). Uploads start as soon as the crop is saved. Save waits for them.',c:[
['Photo · choosing',phone({label:'Photo · choosing',body:f(empty),bar:bar('off'),over:photoSheet(F,'banner',false)}),'Our own sheet, not the OS chooser: “Take a photo” opens the back camera (capture="environment"); “Choose from your phone” opens the gallery. The tip is where it is needed.'],
['Photo · Shrinking…',phone({label:'Photo · Shrinking…',body:f({b:'busy',pstrip:busyStrip(S.shrinking)}),bar:bar('off')}),'The cropped photo already shows in the preview, dimmed with a spinner. The strip under the preview names the step.'],
['Photo · Uploading…',phone({label:'Photo · Uploading…',body:f({b:'busy',price:2,pstrip:busyStrip(S.uploading,40)}),bar:bar('off')}),'Progress from the upload request. Save is held grey, even with other changes, until the photo is in.'],
['Photo · upload failed',phone({label:'Photo · upload failed',body:f({b:'fail',pstrip:strip('bad',I('alert',16),S.uploadFail,S.failSub,pill(I('rotate',16)+S.retryShort,1),1)}),bar:bar('off')}),'Retry reuses the shrunk photo, so it only re-uploads. The other changes can still be saved without the photo.'],
["Photo · couldn't prepare (logo)",phone({label:"Photo · couldn't prepare (logo)",body:f({l:'fail',pstrip:strip('bad',I('alert',16),S.prepFail,S.prepSub,pill(I('rotate',16)+S.retryShort,1),1)}),bar:bar('off')}),'Same pattern for the logo. The logo is too small for text, so the message is in the strip.'],
['Photo · has photo (replace / remove)',phone({label:'Photo · has photo (replace / remove)',body:f(),bar:bar('off'),over:photoSheet(F,'banner',true)}),'With a photo, the sheet adds “Remove banner” (danger ink). No extra confirm, because removing only happens on Save and can be undone.'],
['Photo · removed',phone({label:'Photo · removed',body:f({b:'empty',pstrip:strip('n',I('trash',16),null,S.removed.banner,pill(S.undo))}),bar:bar('on')}),'The slot goes back to empty and Save turns green. Undo puts the photo back.']]},
{t:'Crop sheet',s:'Full-height sheet: max height is the viewport minus 24 px. The body scrolls; Save and Cancel stay pinned.',c:[
['Crop banner · 360',phone({label:'Crop banner · 360',body:f(),bar:bar('off'),over:cropSheet(F,'banner',360)}),'The whole photo shows; what falls outside the dashed 3:1 frame is dimmed, so “cut off” is visible. A dashed circle marks where the logo will sit. ± are 44 px; the slider track is 44 px tall.'],
['Crop logo · 360',phone({label:'Crop logo · 360',body:f(),bar:bar('off'),over:cropSheet(F,'logo',360)}),'Square frame with the circle customers see drawn inside. The preview is the logo at list size.'],
['Crop banner · 320',phone({label:'Crop banner · 320',w:320,body:form(F,{w:320}),bar:bar('off'),over:cropSheet(F,'banner',320)}),'Same layout at 288 wide. The live preview is below the fold; the body scrolls.'],
['Crop logo · 320',phone({label:'Crop logo · 320',w:320,body:form(F,{w:320}),bar:bar('off'),over:cropSheet(F,'logo',320)}),'At 320 the frame shrinks to fit. Save and Cancel stay visible.']]},
{t:'Tags on a phone',s:'Phone keyboards don’t reliably send Enter, so a tag is added with the Add button, the keyboard’s action key, a comma, or a one-tap suggestion.',c:[
['Tags · typing (keyboard up)',phone({label:'Tags · typing (keyboard up)',anchor:'bottom',body:f({until:'tags',tags:['Sadza','Grill'],t:{on:true,draft:'Road-runner'}}),kb:kb(360,['Road-runner','Road','Roadrunner'])}),'The keyboard pushes the page up so the field sits just above it. The Save bar hides while the keyboard is open. Suggestions filter as you type and hide when none match.'],
['Tags · limit of 3 reached',phone({label:'Tags · limit of 3 reached',anchor:'bottom',body:f({tags:['Sadza','Grill','Road-runner'],price:1}),bar:bar('on')}),'The third tag closes the keyboard. The field and suggestions give way to one line saying how to make room.'],
['Tags · duplicate ignored',phone({label:'Tags · duplicate ignored',anchor:'bottom',body:f({until:'tags',tags:['Sadza','Grill'],t:{on:true,dup:'Grill',hl:'Grill'}}),kb:kb(360)}),'Typing “grill” again: the field clears, the existing chip is outlined for 2 s, and a helper explains. Matching ignores case and spaces.']]},
{t:'320 · long content',c:[
['320 · 40-character name, 3 long tags',phone({label:'320 · 40-character name, 3 long tags',w:320,body:form(K.shop,{w:320,...long}),bar:bar('off')}),'320 × 640 viewport. The name wraps to two lines in the preview; the field scrolls horizontally.'],
['320 · long content · full length',phone({label:'320 · long content · full length',w:320,full:true,body:form(K.shop,{w:320,...long}),bar:bar('off')}),'24-character tags take a row each. Nothing clips.']]}
];

let html=`<div style="max-width:880px;display:flex;flex-direction:column;gap:10px"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--accent-text)">LYNIAGO MERCHANT · SHOP FRONT V1 · 2026-10-18</div><div style="font-size:34px;font-weight:700;letter-spacing:-.02em;line-height:1.15">Shop front, redrawn for the phone</div><div style="font-size:16px;line-height:1.5;color:var(--muted);text-wrap:pretty">Account → Your shop front → Profile &amp; photos. The old tablet form is gone. <b style="color:var(--ink)">What customers see is now the top of the screen</b>: tap the banner or logo to change it, and the fields below update it as you type. One pinned Save. Every target is 44 px or more; field text is 16 px.</div></div>`;
const only=new URLSearchParams(location.search).get('s');
for(const s of (only?[SECTIONS[+only]]:SECTIONS)){html+=`<div style="display:flex;flex-direction:column;gap:16px"><div><div style="font-size:20px;font-weight:700">${s.t}</div>${s.s?`<div class="note" style="max-width:760px;margin-top:4px;font-size:14px">${s.s}</div>`:''}</div><div class="row">${s.c.map(c=>{const w=c[1].includes('width:320px')?320:360;return `<div class="cell" style="width:${w}px"><div class="cap">${c[0]}</div>${c[1]}<div class="note">${c[2]}</div></div>`;}).join('')}</div></div>`;}
document.getElementById('doc').innerHTML=html;
})();
