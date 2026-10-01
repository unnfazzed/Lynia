addEventListener('DOMContentLoaded',()=>{
const K=BK,{B,f,i,nb,sb,usd,star,TK,V,D,AREA,S}=K;
Object.assign(D,{
 pz1:{n:'Chicken & mushroom pizza (medium)',d:'Tomato base, mozzarella, grilled chicken and mushroom.',p:7.5,img:'pizza-1'},
 pz2:{n:'Margherita (medium)',d:'Tomato, mozzarella and basil.',p:6,img:'pizza-2'},
 brk:{n:'Full breakfast',d:'Two eggs, boerewors, beans and toast.',p:4,ph:'dish photo',pt:'#FFE7E0'},
 porr:{n:'Maize-meal porridge',d:'With peanut butter and sugar.',p:1.5,ph:'dish photo',pt:'#FFE7E0'},
 hammer:{n:'Claw hammer',p:8.5,ph:'product photo',pt:'#F6F7F8'},cement:{n:'Cement (50 kg)',p:11,ph:'product photo',pt:'#F6F7F8'},brush:{n:'Paint brush set (3)',p:4,ph:'product photo',pt:'#F6F7F8'},pipe:{n:'PVC pipe 40mm (3 m)',p:6.8,ph:'product photo',pt:'#F6F7F8'},
 chk:{n:'Chicken pieces (1 kg)',p:5.2,ph:'product photo',pt:'#FFE7E0'}
});
V.belg.ph='pharmacy front photo';V.belg.pt=V.belg.tint;
const ph=(c,cls)=>`<div class="ph ${cls||''}">${c}</div>`;
const W=cls=>cls&&cls.includes('w320')?320:360;
const fill=c=>`<div style="position:absolute;inset:0;overflow:hidden">${c}</div>`;
/* ---------- list ---------- */
const FOODCH=['All','Zimbabwean','Grills','Chinese','Chicken','Pizza',B.list.free];
const SHOPCH=B.kinds.concat([B.list.free]);
const L={
 food:(w,o)=>{o=o||{};return K.listHeader('food',{w,noloc:o.noloc})+(o.off?K.offBanner():'')+K.cats('food','All')+K.fbar()+K.lhd(f(B.list.count,{n:6}),o.noloc?'in Harare':f(B.list.range,{a:25,b:45}))+(o.noloc?nlCard():'')+`<div class="vlist">${K.vcard(V.gava,o)}${K.vcard(V.golden,o)}${K.vrow(V.mbuya,o)}${K.vrow(V.sadza,o)}${K.vrow(V.slice,o)}${K.closedHd()}${K.vrow(V.pizza,o)}</div><div style="height:24px"></div>`},
 shops:(w)=>K.listHeader('shops',{w})+K.cats('shops','All')+K.fbar()+K.lhd(f(B.list.count,{n:5}),f(B.list.range,{a:20,b:55}))+`<div class="vlist">${K.vcard(V.avfresh)}${K.vcard(V.kens)}${K.vrow(V.mbare)}${K.vrow(V.borrow)}${K.closedHd()}${K.vrow(V.samlevy)}</div><div style="height:24px"></div>`,
 pharm:(w)=>K.listHeader('pharmacy',{w})+K.otc()+K.fbar()+K.lhd(f(B.list.count,{n:3}),f(B.list.range,{a:15,b:30}))+`<div class="vlist">${K.vcard(V.avpharm)}${K.vcard(V.belg)}${K.closedHd()}${K.vrow(V.eastgate)}</div><div style="height:24px"></div>`
};
const nlCard=()=>`<div class="mintcard" style="margin:4px 16px 4px;padding:16px;text-align:left;display:flex;gap:12px;align-items:center"><div style="flex:1;min-width:0"><b style="font-size:${K.z(15)}">${B.list.noLoc.t}</b><p style="margin:4px 0 10px;font-size:${K.z(13)};color:#5b6670;line-height:1.4">${B.list.noLoc.s}</p><div class="btn p" style="min-height:44px;font-size:${K.z(14)};display:inline-flex">${i('navigation',16,'#fff')}${B.list.noLoc.cta}</div></div></div>`;
const sortSheet=(noloc,svc)=>K.sheet(`<div class="sh-t">${B.sort.title}</div><div style="display:flex;gap:8px;margin:10px 0 4px">${(svc==='shops'?[['Shop type','All']]:[['Cuisine','All']]).map(d=>`<div style="flex:1;min-height:52px;border:1px solid #e2e6ea;border-radius:12px;padding:6px 12px;display:flex;align-items:center;justify-content:space-between"><div><small style="display:block;font-size:12px;color:#5b6670">${d[0]}</small><b style="font-size:15px">${d[1]}</b></div>${i('chevron-down',18)}</div>`).join('')}</div><div style="margin-top:4px">${B.sort.opts.map((o,k)=>{const dis=noloc&&[1,2,4].includes(k);return `<div class="srow" style="${dis?'color:#5b6670':''}"><div><span style="font-weight:${k===0?700:400}">${o}</span>${dis?`<small>${B.sort.needsLoc}</small>`:''}${k===0||k===2?`<div style="margin-top:2px">${k===0?nb('Recommended ranking'):nb('live prep signal')}</div>`:''}</div><span class="radio ${k===0?'on':''}" style="${dis?'opacity:.4':''}"></span></div>`}).join('')}</div>`);
const listEmpty=(k,t,s,btn,ic)=>`<div class="empty" style="padding-top:36px">${ic?`<span class="t44" style="background:#F6F7F8;margin:0 auto;width:56px;height:56px">${i(ic,24,'#5b6670')}</span>`:''}<h4>${t}</h4><p>${s}</p>${btn||''}</div>`;
/* ---------- storefront ---------- */
const MENU={
 gava:[['Popular',['stew','roast','rice']],['Mains',['rice','tbone','burger']],['Sides',['chips','covo']],['Drinks',['mazoe']]],
 pizza:[['Popular',['pz1','pz2','burger']],['Sides',['chips']],['Drinks',['mazoe']]],
 avfresh:[['Bakery & eggs',['bread','eggs']],['Dairy',['milk','mazoeS']],['Drinks',[]],['Household',[]]],
 mbare:[['Brakes',['pads','discs']],['Filters',['oilf','airf']],['Oils',['oil']],['Lights',['bulb']]],
 avpharm:[['Pain & fever',['para']],['Cold & flu',['lozg']],['First aid',['ors','plast']],['Vitamins',['vitc']],['Baby',['nappy']],['Personal care',[]]],
 kens:[['Tools',['hammer','brush']],['Building',['cement','pipe']],['Paint',[]]]
};
MENU.belg=MENU.avpharm;MENU.eastgate=MENU.avpharm;
const coverOf=(v,w)=>{const ctl=`<div class="ctl">${K.backB('#fff')}<span class="t44" style="background:#fff">${i('search',20)}</span></div>`;
 if(v.img)return `<div class="cover" style="background-image:url(assets/food/${v.img}.jpg)">${ctl}</div>`;
 if(v.ph)return `<div class="cover phd" style="background-color:${v.pt};display:flex;align-items:center;justify-content:center">${ctl}<code>cover photo · 3:1</code></div>`;
 return `<div class="cover" style="background:${TK.tile[v.s]};height:150px">${K.circles(w)}${ctl}</div>`};
const logoOf=v=>v.logo?`<div class="logo" style="background-image:url(assets/food/${v.logo}.jpg)"></div>`:`<div class="logo" style="background:${v.tint};color:${v.ink}">${v.n[0]}</div>`;
const strip=v=>`<div class="istrip"><div><b>${v.r?star(14)+v.r:B.list.isNew}</b><small>${v.r?f(B.store.ratings,{n:v.rc}):B.store.noRatings}</small></div><div><b>${v.eta}</b><small>${B.store.min}</small></div><div><b style="${v.fee?'':'color:#4B2FBF'}">${v.fee?usd(v.fee):B.store.free}</b><small>${B.store.delivery}</small></div><div><b>${v.km} km</b><small>${B.store.away}</small></div></div>`;
const ostate=(v,o)=>{const s=S(v.s);const tw=f(s.time,{m:v.prep||20});
 if(v.closed)return `<div class="ostate" style="background:#F6F7F8"><span class="dot" style="background:#5b6670"></span><span><b>${f(v.tmr?B.store.closedTmr:B.store.closed,{t:v.closed})}</b></span></div><div class="ostate" style="border:1px solid #e2e6ea;justify-content:space-between;min-height:52px">${i('bell',18,'#006630')}<span style="flex:1;font-weight:600">${B.store.remind}</span><span class="sw ${o.remind?'on':''}"></span></div>`;
 if(v.closing)return `<div class="ostate" style="background:#FFF6D6;color:#3D3100"><span class="dot" style="background:#FFD23F;box-shadow:0 0 0 2px #3D3100 inset"></span><span><b>${f(B.store.closingSoon,{m:v.closing,t:'17:45'})}</b></span></div>`;
 return `<div class="oline"><span class="dot" style="background:#00B14F"></span><b>${f(B.store.openUntil,{t:v.until||'21:00'})}</b><span>·</span><span>${tw}</span></div>`};
const tabs=(vk,act)=>`<div class="tabs">${MENU[vk].map(c=>`<span class="${c[0]===act?'on':''}">${c[0]}</span>`).join('')}</div>`;
const row=(v,k,o)=>v.s==='food'?K.dish(k,o):v.s==='pharmacy'?K.irow(k,o):'';
const sections=(vk,o)=>{o=o||{};const v=V[vk],cart=o.cart||{};return MENU[vk].filter(c=>c[1].length&&(!o.from||MENU[vk].findIndex(x=>x[0]===o.from)<=MENU[vk].indexOf(c))).map(c=>{const ro={closed:!!v.closed};
 let body=v.s==='shops'?`<div class="grid">${c[1].map(k=>K.tile(k,Object.assign({},ro,{n:cart[k],oos:(o.oos||[]).includes(k)}))).join('')}</div>`:c[1].map(k=>row(v,k,Object.assign({},ro,{n:cart[k],oos:(o.oos||[]).includes(k)}))).join('');
 if(v.s==='food'&&c[0]==='Popular')body=`<div class="pc">${c[1].map(k=>K.pcard(k,{closed:!!v.closed,n:cart[k]})).join('')}</div>`;
 return `<div class="sec">${c[0]}</div>${body}`}).join('')};
const storeTop=(vk,o)=>{o=o||{};const v=V[vk];return `<div style="background:#fff">${sb()}</div>${coverOf(v,o.w)}${logoOf(v)}<div class="vh"><h1>${v.n}</h1><p>${v.cu?v.cu+' · '+v.lv:v.kind}</p></div>${v.closed||v.closing?'':ostate(v,o)}${strip(v)}${v.closed||v.closing?ostate(v,o):''}${v.s==='pharmacy'?K.otc('10px 16px 0'):''}${tabs(vk,o.tab||MENU[vk][0][0])}`};
const store=(vk,o)=>storeTop(vk,o)+sections(vk,o)+'<div style="height:96px"></div>';
const scrolled=(vk,o)=>K.compactBar(V[vk].n)+tabs(vk,o.tab)+sections(vk,o)+'<div style="height:96px"></div>';
const vSearch=(q,ph,body)=>`${sb()}<div class="shead">${K.backB()}<div class="sfield">${i('search',18,'#5b6670')}<span style="${q?'':'color:#5b6670'}">${q||ph}</span>${q?`<span class="t44">${i('x',18,'#5b6670')}</span>`:''}</div></div>${body}`;
/* ---------- item sheets ---------- */
const itemSheet=(k,svc,o)=>{o=o||{};const d=D[k],n=o.n||1,s=S(svc);
 return K.sheet(`${o.typing?`<span class="t44" style="position:absolute;right:8px;top:8px;background:#F6F7F8">${i('x',20)}</span>`:`<div style="position:relative;margin:-2px -4px 0"><div class="${K.imgCls(d)}" style="${K.imgStyle(d)};aspect-ratio:16/9;border-radius:16px;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center">${K.phLabel(d)}</div><span class="t44" style="position:absolute;right:8px;top:8px;background:#fff">${i('x',20)}</span></div>`}<div style="display:flex;justify-content:space-between;gap:12px;margin-top:${o.typing?'4px;padding-right:48px':'14px'};align-items:baseline"><div class="sh-t" style="margin:0">${d.n}</div><b style="font-size:${K.z(17)};flex:none">${usd(d.p)}</b></div>${d.d?`<p style="margin:6px 0 0;color:#5b6670;font-size:${K.z(14)};line-height:1.45">${d.d}</p>`:''}${o.closed?'':`<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;border-top:1px solid #f0f2f4;padding-top:4px"><b style="font-size:${K.z(15)}">${B.item.qty}</b>${K.stepper(n)}</div><div style="margin-top:12px"><div style="font:600 ${K.z(13)} Inter;color:#5b6670;margin-bottom:6px">${s.note} <span style="font-weight:400">(optional)</span></div><div style="min-height:72px;border:1px solid ${o.typing?'#00B14F':'#e2e6ea'};${o.typing?'border-width:1.5px;':''}border-radius:12px;padding:12px 14px;font-size:${K.z(15)};color:${o.note?'#14181b':'#5b6670'}">${o.note||(svc==='food'?B.item.noteHint:svc==='shops'?B.item.noteShop:B.item.notePharm)}${o.typing?'<span style="display:inline-block;width:2px;height:18px;background:#00B14F;vertical-align:-3px;margin-left:1px"></span>':''}</div><div style="display:flex;justify-content:space-between;font-size:${K.z(12)};color:#5b6670;margin-top:6px"><span>${B.item.noteRule}</span><span>${(o.note||'').length}/200</span></div></div>`}${svc==='pharmacy'?`<div style="font-size:${K.z(12.5)};color:#5b6670;margin-top:10px;display:flex;gap:6px;align-items:center">${i('circle-alert',14,'#006630')}${B.list.otc}</div>`:''}<div style="margin-top:14px">${o.closed?`<div class="btn" style="background:#F6F7F8;color:#5b6670">${f(B.item.closedCta,{t:o.closed})}</div><div class="srow" style="margin-top:4px">${i('bell',18,'#006630')}<span style="flex:1;font-weight:600">${B.store.remind}</span><span class="sw"></span></div>`:`<div class="btn p">${n>1?f(B.item.addN,{n,p:usd(d.p*n)}):f(B.item.add,{p:usd(d.p*n)})}</div>`}</div>`,o.typing?'bottom:252px;border-radius:24px 24px 0 0;padding-bottom:12px':'')};
const kb=()=>`<div class="kb">${[10,9,7].map(n=>`<div>${Array.from({length:n}).map(()=>'<i></i>').join('')}</div>`).join('')}<div><i style="max-width:60px"></i><i style="max-width:180px"></i><i style="max-width:60px"></i></div></div>`;
/* ---------- search ---------- */
const hl=(t,q)=>t.replace(new RegExp('('+q+')','i'),'<mark>$1</mark>');
const vHit=(v,q,sub)=>`<div class="hr"><div class="im${K.imgCls(v)}" style="${K.imgStyle(v)}">${!v.img&&!v.ph?`<b style="color:${v.ink};font-size:18px">${v.n[0]}</b>`:''}</div><div><b>${q?hl(v.n,q):v.n}</b><small>${sub||`${v.eta} min · ${v.fee?usd(v.fee)+' delivery':'Free delivery'} · ${v.km} km`}</small></div>${i('chevron-right',18,'#5b6670')}</div>`;
const dHit=(k,vk,q)=>{const d=D[k];return `<div class="hr"><div class="im${K.imgCls(d)}" style="${K.imgStyle(d)}"></div><div><b>${hl(d.n,q)}</b><small>${V[vk].n}</small></div><b style="flex:none;font-size:${K.z(14)}">${usd(d.p)}</b></div>`};
const parcelRow=()=>`<div class="hr" style="background:#E9F8EF;margin:10px 16px 0;border-radius:16px;padding:10px 12px"><span class="stk" style="background:#CDEEDA;width:48px;height:48px"><img src="assets/service-icons/v2/send.svg" style="width:38px;height:38px" alt=""></span><div><b>${B.search.parcel.t}</b><small style="white-space:normal">${B.search.parcel.s}</small></div>${i('chevron-right',18,'#006630')}</div>`;
const recent=()=>`<div class="slab"><span>${B.search.recent.toUpperCase()}</span><a>${B.search.clear}</a></div>${['sadza','brake pads','paracetamol'].map(r=>`<div class="hr" style="min-height:48px">${i('history',18,'#5b6670')}<div><span style="font-size:${K.z(15)}">${r}</span></div>${i('x',16,'#5b6670')}</div>`).join('')}`;
/* ---------- screens ---------- */
const gavaCart={stew:1,roast:1,chips:1};
const rows=[
['Venue list (B)','Mint header with the service sticker, Home’s address control and search. Filter chips + one Sort control. Open venues first, a “Closed now” group last. First two results are full cards, then compact rows.',[
 ['B1','Restaurants list','360×720',()=>ph(L.food(360))],
 ['B1·full','Restaurants list','full scroll',()=>ph(L.food(360),'tall')],
 ['B1·320','Restaurants list','320×640',()=>ph(L.food(320),'w320')],
 ['B1·fs','Restaurants list','font scale 1.3',()=>ph(L.food(360),'fs13')],
 ['B2','Shops list','kind chips, no-photo fallback',()=>ph(L.shops(360))],
 ['B3a','Shops · Auto parts','one kind selected',()=>ph(K.listHeader('shops',{})+K.cats('shops','Auto parts')+K.fbar()+K.lhd('1 place',f(B.list.range,{a:35,b:50}))+`<div class="vlist">${K.vcard(V.mbare)}</div>`)],
 ['B3b','Shops · Electronics','kind with no venues',()=>ph(K.listHeader('shops',{})+K.cats('shops','Electronics')+K.fbar()+listEmpty('shops',f(B.list.kindNone.t,{kind:'electronics'}),f(B.list.kindNone.s,{kind:'electronics'}),`<div class="btn g">${B.list.kindNone.cta}</div>`,'store'))],
 ['B4','Pharmacy list','OTC notice, no chips',()=>ph(L.pharm(360))],
 ['B5a','Sort sheet','',()=>ph(fill(L.food(360))+sortSheet())],
 ['B5b','Sort sheet · no location','distance sorts unavailable',()=>ph(fill(L.food(360,{noloc:1}))+sortSheet(1))],
 ['B6','Filters · no match','',()=>ph(K.listHeader('food',{})+K.cats('food','Pizza')+K.fbar({free:1})+listEmpty('food',B.list.noMatch.t,f(B.list.noMatch.s,{f:'Pizza + Free delivery',area:AREA}),`<div class="btn g">${B.list.noMatch.clear}</div>`,'search'))],
 ['B7','No location yet','no distance, fee or ETA',()=>ph(L.food(360,{noloc:1}))],
 ['B8','First load','real header, skeleton body',()=>ph(K.listHeader('food',{})+`<div class="fbar" style="padding-top:12px"><div class="sk" style="width:150px;height:36px;border-radius:999px;margin:4px 0"></div><div class="sk" style="width:110px;height:36px;border-radius:999px;margin:4px 0"></div></div><div style="height:12px"></div>`+K.skList(2,true))],
 ['B9a','Nothing delivers · Restaurants','',()=>ph(K.listHeader('food',{})+K.svcEmpty('food'))],
 ['B9b','Nothing delivers · Shops','',()=>ph(K.listHeader('shops',{})+K.svcEmpty('shops'))],
 ['B9c','Nothing delivers · Pharmacy','',()=>ph(K.listHeader('pharmacy',{})+K.svcEmpty('pharmacy'))],
 ['B10a','Offline · saved list','muted banner, no error card',()=>ph(L.food(360,{off:1}))],
 ['B10b','Offline · nothing saved','',()=>ph(K.listHeader('food',{})+listEmpty('food',B.list.offNone.t,B.list.offNone.s,`<div class="btn g">${B.list.retry}</div>`,'wifi-off'))],
 ['B11','Couldn’t load','first load failed',()=>ph(K.listHeader('food',{})+listEmpty('food',S('food').err,B.list.errS,`<div class="btn g">${B.list.retry}</div>`,'circle-alert'))],
 ['B12a','Loading more','scrolled; header compacts, Sort + Free stick',()=>ph(K.compactBar('Restaurants')+K.fbar()+K.lhd(f(B.list.count,{n:24}),f(B.list.range,{a:25,b:55}))+`<div class="vlist">${K.vrow(V.mbuya)}${K.vrow(V.sadza)}${K.vrow(V.slice)}</div>`+K.skList(2)+`<div style="text-align:center;font-size:${K.z(12.5)};color:#5b6670;padding:4px">${B.list.more}</div>`)],
 ['B12b','End of list','',()=>ph(K.compactBar('Restaurants')+K.fbar()+`<div class="vlist">${K.vrow(V.slice)}${K.closedHd()}${K.vrow(V.pizza)}</div><div style="text-align:center;font-size:${K.z(13)};color:#5b6670;padding:24px 32px">${f(S('food').end,{n:24,area:AREA})}</div>`)],
 ['B13','Service switched off','deep link → Home’s notify-me sheet',()=>ph(fill(K.listHeader('shops',{}))+K.sheet(`<div style="text-align:center"><div style="width:96px;height:96px;margin:8px auto 0;background:#DDD5FF;border-radius:28px;display:flex;align-items:center;justify-content:center"><img src="assets/service-icons/v2/shops.svg" style="width:64px" alt=""></div><div class="sh-t" style="margin-top:16px;font-size:${K.z(22)}">${S('shops').off.t}</div><p style="font-size:${K.z(14.5)};color:#5b6670;line-height:1.45;margin:8px 0 20px">${S('shops').off.s}</p><div class="btn p">${B.off.cta}</div><div class="btn t" style="margin-top:4px">${B.off.no}</div></div>`))],
 ['B14','Long names','320×640 · font scale 1.3',()=>ph(K.listHeader('food',{w:320})+K.cats('food','All')+K.fbar()+K.lhd(f(B.list.count,{n:6}),f(B.list.range,{a:25,b:45}))+`<div class="vlist">${K.vcard(V.mbuya,{long:1,longName:'Mbuya Chipo’s Traditional Kitchen & Grill'})}${K.vrow(V.sadza,{long:1,longName:'The Original Sadza Republic, Avondale'})}</div>`,'w320 fs13')]
]],
['Storefront (S)','Cover, logo, name, then the info strip answers how good, how long, how much and how far above the fold. Open state next. One scrolling menu with sticky scroll-spy tabs.',[
 ['S1','Restaurant · open','top of page',()=>ph(store('gava',{}))],
 ['S1·full','Restaurant · open','full scroll',()=>ph(store('gava',{}),'tall')],
 ['S1·320','Restaurant · open','320×640',()=>ph(store('gava',{w:320}),'w320')],
 ['S1·fs','Restaurant · open','font scale 1.3',()=>ph(store('gava',{}),'fs13')],
 ['S2','Restaurant · scrolled','name in header, tabs stuck, Sides spied',()=>ph(scrolled('gava',{tab:'Sides',from:'Sides'}))],
 ['S3','Shop · item grid','',()=>ph(store('avfresh',{}))],
 ['S4','Pharmacy · item rows','OTC notice',()=>ph(store('avpharm',{}))],
 ['S5','Items in the cart','steppers + cart bar',()=>ph(scrolled('gava',{tab:'Popular',cart:gavaCart})+K.cartBar({n:3,sub:12.5,v:'Gava’s Kitchen'}))],
 ['S5·320','Items in the cart','320×640',()=>ph(scrolled('gava',{tab:'Popular',cart:gavaCart})+K.cartBar({n:3,sub:12.5,v:'Gava’s Kitchen'}),'w320')],
 ['S5b','Shop grid in the cart','',()=>ph(scrolled('mbare',{tab:'Brakes',cart:{pads:1}})+K.cartBar({n:1,sub:24,v:'Mbare Auto Spares'}))],
 ['S6','Under the $4.00 minimum','small-order hint, never blocks',()=>ph(scrolled('avpharm',{tab:'Pain & fever',cart:{para:1,plast:1}})+K.cartBar({n:2,sub:3.3}))],
 ['S7','Closing soon','',()=>ph(store('belg',{}))],
 ['S8a','Closed · remind off','no + buttons, prices stay',()=>ph(store('pizza',{}))],
 ['S8b','Closed · remind on','',()=>ph(store('pizza',{remind:1})+K.toast(f(B.toast.reminder,{v:'Pizza Inn'}),24,'bell'))],
 ['S9','Just closed while browsing','',()=>ph(fill(scrolled('gava',{tab:'Popular',cart:gavaCart})+K.cartBar({n:3,sub:12.5,v:'Gava’s Kitchen'}))+`<div class="dim"></div><div class="modal"><span class="t44" style="background:#F6F7F8;width:56px;height:56px">${i('clock',24,'#5b6670')}</span><div class="sh-t" style="margin-top:12px">${f(B.justClosed.t,{v:'Gava’s Kitchen'})}</div><p style="margin:6px 0 18px;color:#5b6670;font-size:${K.z(14.5)};line-height:1.45">${B.justClosed.s}</p><div class="btn p">${B.justClosed.yes}</div><div class="btn t" style="margin-top:4px">${B.justClosed.no}</div></div>`)],
 ['S10','Out of stock · time window','',()=>ph(K.compactBar('Gava’s Kitchen')+`<div class="tabs" style="margin-top:0"><span class="on">Breakfast</span><span>Popular</span><span>Mains</span><span>Sides</span></div><div class="sec">Breakfast<small>${f(B.store.window,{a:'07:00',b:'11:00'})}</small></div><div style="padding:2px 16px 0;font-size:${K.z(13)};color:#5b6670">${f(B.store.windowNote,{a:'07:00 tomorrow'})}</div>${K.dish('brk',{oos:0,win:1})}${K.dish('porr',{win:1})}<div class="sec">Mains</div>${K.dish('rice')}${K.dish('tbone',{oos:1})}`)],
 ['S11','No cover, no logo, no rating','fallback',()=>ph(store('kens',{}))],
 ['S12a','Search in venue · results','',()=>ph(vSearch('chick','',`<div class="slab"><span>2 DISHES</span></div>${K.dish('roast',{hl:'chick'})}${K.dish('rice',{hl:'chick'})}`))],
 ['S12b','Search in venue · none','',()=>ph(vSearch('pizza','',`<div class="empty" style="padding-top:40px"><h4>${f(B.store.noHits.t,{q:'pizza',v:'Gava’s Kitchen'})}</h4><p>${f(B.store.noHits.s,{noun:'restaurants'})}</p><div class="btn g">${f(B.store.noHits.cta,{noun:'restaurants'})}</div></div>`))],
 ['S13a','Storefront · loading','',()=>ph(`${sb()}<div class="sk" style="height:140px;border-radius:0"></div><div class="sk" style="width:60px;height:60px;border-radius:50%;margin:-30px 0 0 16px;border:3px solid #fff"></div><div style="padding:8px 16px"><div class="sk" style="height:20px;width:60%"></div><div class="sk" style="height:12px;width:40%;margin-top:8px"></div><div class="sk" style="height:60px;margin-top:14px;border-radius:14px"></div><div class="sk" style="height:40px;margin-top:10px"></div></div>${[0,1].map(()=>`<div class="dr"><div><div class="sk" style="height:14px;width:70%"></div><div class="sk" style="height:10px;width:90%;margin-top:8px"></div><div class="sk" style="height:12px;width:30%;margin-top:10px"></div></div><div class="sk" style="width:96px;height:96px"></div></div>`).join('')}`)],
 ['S13b','Storefront · couldn’t load','',()=>ph(`${sb()}<div style="padding:0 6px">${K.backB()}</div>${listEmpty('food',f(B.store.errT,{place:'kitchen'}),B.list.errS,`<div class="btn g">${B.list.retry}</div>`,'circle-alert')}`)],
 ['S13c','Storefront · no items yet','',()=>ph(`<div style="background:#fff">${sb()}</div>${coverOf(V.avfresh)}${logoOf(V.avfresh)}<div class="vh"><h1>${V.avfresh.n}</h1><p>Grocery</p></div>${strip(V.avfresh)}${listEmpty('shops',B.store.emptyT,f(B.store.emptyS,{v:'Avondale Fresh'}),'','inbox')}`)]
]],
['Item & cart (I)','Tap + to add one straight away. Tap the row or tile to open the item sheet. One cart at a time, said up front.',[
 ['I1a','Item sheet · restaurant','',()=>ph(fill(store('gava',{}))+itemSheet('stew','food',{n:2}))],
 ['I1·320','Item sheet · restaurant','320×640',()=>ph(fill(store('gava',{}))+itemSheet('stew','food',{n:2}),'w320')],
 ['I1·fs','Item sheet · restaurant','font scale 1.3',()=>ph(fill(store('gava',{}))+itemSheet('stew','food',{n:2}),'fs13')],
 ['I1b','Item sheet · shop','',()=>ph(fill(store('mbare',{}))+itemSheet('pads','shops',{}))],
 ['I1c','Item sheet · pharmacy','',()=>ph(fill(store('avpharm',{}))+itemSheet('para','pharmacy',{}))],
 ['I1d','Item sheet · venue closed','look, don’t order',()=>ph(fill(store('pizza',{}))+itemSheet('pz1','food',{closed:'10:00'}))],
 ['I2','Item sheet · typing a note','CTA rides above the keyboard',()=>ph(fill(store('gava',{}))+itemSheet('stew','food',{n:2,typing:1,note:'No chilli, please. Extra gravy.'})+kb())],
 ['I3','Start a new cart?','adding from a second venue',()=>ph(fill(store('mbare',{}))+K.sheet(`<span class="t44" style="background:#FFF6D6;width:56px;height:56px">${i('shopping-bag',24,'#3D3100')}</span><div class="sh-t" style="margin-top:12px">${B.newCart.t}</div><p style="margin:6px 0 4px;font-size:${K.z(15)};line-height:1.45">${f(B.newCart.s,{v:'Gava’s Kitchen',n:3,p:'$12.50'})}</p><p style="margin:0 0 18px;font-size:${K.z(14)};color:#5b6670;line-height:1.45">${f(B.newCart.adding,{i:'Brake pads (front)',w:'Mbare Auto Spares'})}</p><div class="btn p">${B.newCart.yes}</div><div class="btn g" style="margin-top:8px">${B.newCart.no}</div>`))]
]],
['Search (X)','Scoped by where you came from. Home search spans every service and offers Send a parcel when the words sound like a parcel.',[
 ['X1','Home search · empty','recent + popular',()=>ph(vSearch('',B.search.home,recent()+`<div class="slab"><span>${B.search.popular.toUpperCase()}</span></div><div class="chips" style="flex-wrap:wrap;padding-top:0">${['Roast chicken','Pizza','Bread','Plasters','Brake pads'].map(c=>`<div class="chip"><span>${c}</span></div>`).join('')}</div>`+`<div style="padding:4px 16px">${nb('cross-service search')}</div>`))],
 ['X2a','Home search · results','grouped by service',()=>ph(vSearch('chicken','',`<div class="slab"><span>${B.search.groups.food}</span></div>${vHit(V.slice,'chicken')}<div class="slab"><span>${B.search.groups.shops}</span></div>${vHit(V.borrow,'',`Butchery · ${V.borrow.eta} min · Free delivery`)}<div class="slab"><span>${B.search.groups.items}</span><a>${f(B.search.seeAll,{n:7})}</a></div>${dHit('roast','gava','chicken')}${dHit('rice','gava','chicken')}${dHit('chk','borrow','chicken')}`))],
 ['X2·320','Home search · results','320×640',()=>ph(vSearch('chicken','',`<div class="slab"><span>${B.search.groups.food}</span></div>${vHit(V.slice,'chicken')}<div class="slab"><span>${B.search.groups.items}</span></div>${dHit('roast','gava','chicken')}${dHit('rice','gava','chicken')}${dHit('chk','borrow','chicken')}`),'w320')],
 ['X2b','Home search · parcel words','Send a parcel shortcut',()=>ph(vSearch('documents','',parcelRow()+`<div style="padding:16px;font-size:${K.z(13)};color:#5b6670">No restaurants, shops or items match “documents”.</div>`))],
 ['X3','Search in Restaurants','PLACES + DISHES',()=>ph(vSearch('sadza','',`<div class="slab"><span>${B.search.places}</span></div>${vHit(V.sadza,'sadza')}<div class="slab"><span>${S('food').itemsCap}</span></div>${dHit('stew','gava','sadza')}${dHit('tbone','gava','sadza')}`))],
 ['X4a','Search · no results','',()=>ph(vSearch('fufu','',`<div class="empty" style="padding-top:40px"><h4>${f(B.search.none.t,{q:'fufu'})}</h4><p>${B.search.none.s}</p></div>`))],
 ['X4b','Search · offline','recent still works',()=>ph(vSearch('',B.search.home,`<div class="offb">${i('wifi-off',16)}<span>${B.search.offline.s}</span></div>`+recent()))]
]]];
window.BROWSE_ROWS=rows;
const q=new URLSearchParams(location.search).get('screen');
if(q){const s=rows.flatMap(r=>r[2]).find(x=>x[0]===q);document.querySelector('meta[name=design_doc_mode]')?.remove();document.body.style.background='#fff';document.body.innerHTML=s?s[3]().replace('class="ph','style="border-radius:0;box-shadow:none" class="ph'):'Unknown screen';lucide.createIcons();return;}
let html=`<div class="rowh" data-y="0" style="left:80px">Browse v2 · Restaurants, Shops & Pharmacy<small>One template, three skins. Built on Calm Mint v2 tokens and parts. Open any frame alone with <code>?screen=B1</code>. Dashed red tags mark data the backend doesn’t send yet.</small></div>`;
rows.forEach(r=>{html+=`<div class="rowh sub">${r[0]}<small>${r[1]}</small></div><div class="frow">${r[2].map(s=>`<div><p class="lbl"><b>${s[0]}</b> · ${s[1]}${s[2]?' · '+s[2]:''}</p>${s[3]()}</div>`).join('')}</div>`;});
document.body.insertAdjacentHTML('beforeend',html);lucide.createIcons();
let Y=0;document.querySelectorAll('.rowh,.frow').forEach(el=>{el.style.top=Y+'px';Y+=el.offsetHeight+(el.classList.contains('frow')?100:24);});
});
