/* LyniaGo Browse v2 kit: tokens, every user-facing string (B), sample data and shared parts.
   Copy in B ships verbatim. {x} = runtime value. */
(function(){
const B={
  svc:{
    food:{title:'Restaurants',short:'Food',search:'Search restaurants or dishes',search320:'Search food',noun:'restaurants',place:'kitchen',places:'kitchens',item:'dish',items:'dishes',itemsCap:'DISHES',note:'Note for the kitchen',time:'Ready in ~{m} min',
      none:{t:'No restaurants deliver to {area} yet',s:'We’re bringing kitchens to your area. Try another address, or send a parcel today.'},
      err:'Couldn’t load restaurants',end:'That’s all {n} restaurants delivering to {area}.',off:{t:'Restaurants are coming soon',s:'Meals from kitchens near you, cooked to order. We’ll message you on WhatsApp the day they open in your area.'}},
    shops:{title:'Shops',short:'Shops',search:'Search shops or items',search320:'Search shops',noun:'shops',place:'shop',places:'shops',item:'item',items:'items',itemsCap:'ITEMS',note:'Note for the shop',time:'Packed in ~{m} min',
      none:{t:'No shops deliver to {area} yet',s:'We’re signing up shops near you. Try another address, or send a parcel today.'},
      err:'Couldn’t load shops',end:'That’s all {n} shops delivering to {area}.',off:{t:'Shops are coming soon',s:'Groceries, butcheries, fashion and auto parts from shops near you. We’ll message you on WhatsApp the day they open in your area.'}},
    pharmacy:{title:'Pharmacy',short:'Pharmacy',search:'Search pharmacy items',search320:'Search pharmacy',noun:'pharmacies',place:'pharmacy',places:'pharmacies',item:'item',items:'items',itemsCap:'ITEMS',note:'Note for the pharmacy',time:'Packed in ~{m} min',
      none:{t:'No pharmacies deliver to {area} yet',s:'We’re signing up pharmacies near you. Try another address, or send a parcel today.'},
      err:'Couldn’t load pharmacies',end:'That’s all {n} pharmacies delivering to {area}.',off:{t:'Pharmacy is coming soon',s:'Over-the-counter medicine, baby care and first aid from pharmacies near you. We’ll message you on WhatsApp the day it opens in your area.'}}
  },
  kinds:['All','Grocery','Butchery','Fashion','Auto parts','Hardware','Electronics','Other'],
  list:{delivering:'DELIVERING TO',noAddr:'NO ADDRESS YET',setLoc:'Set your location',all:'All',free:'Free delivery',sortBy:'Sort: {s}',
    summary:'{n} places · {a}–{b} min',summaryNoLoc:'{n} places in Harare',closedNow:'Closed now',opens:'Opens {t}',opensTmr:'Opens tomorrow {t}',closesIn:'Closes in {m} min',isNew:'New',
    otc:'Over-the-counter only. No prescription medicine yet.',
    noMatch:{t:'No places match',s:'Nothing in {f} delivers to {area} right now.',clear:'Clear filters'},
    kindNone:{t:'No {kind} shops here yet',s:'We’re signing up {kind} shops in Harare. Try All shops in the meantime.',cta:'See all shops'},
    noLoc:{t:'Where should we deliver?',s:'Set your address to see delivery fees, times and distance.',cta:'Use my location',alt:'Type an address'},
    noLocMeta:'Set your location to see fee and time',
    retry:'↻ Try again',errS:'Check your data connection. Nothing was lost.',
    offline:'You’re offline · showing places from {t}',offNone:{t:'You’re offline',s:'Connect to see places near you. We’ll load them as soon as you’re back.'},
    more:'Loading more…',changeAddr:'Change address',sendParcel:'Send a parcel'},
  sort:{title:'Sort by',opts:['Recommended','Nearest','Fastest','Top rated','Lowest delivery fee'],needsLoc:'Set your location to use this',apply:'Show results'},
  store:{ratings:'{n} ratings',noRatings:'No ratings yet',min:'min',delivery:'delivery',away:'away',free:'Free',
    openUntil:'Open until {t}',busy:'Busy · +10 min',closingSoon:'Closes in {m} min · order by {t}',closed:'Closed · opens {t}',closedTmr:'Closed · opens tomorrow {t}',
    remind:'Remind me when they open',remindOn:'We’ll message you when {v} opens.',
    closedRow:'Ordering opens at {t}',
    oos:'Out of stock today',window:'Served {a}–{b}',windowNote:'Available from {a}. You can look now.',
    searchIn:'Search {v}',noHits:{t:'Nothing called “{q}” at {v}',s:'Check the spelling, or search all {noun}.',cta:'Search all {noun}'},
    errT:'Couldn’t load this {place}',emptyT:'No items yet',emptyS:'{v} is still adding items. Check back soon.'},
  item:{qty:'Quantity',noteHint:'No chilli, please',noteShop:'Please pick ones with the longest date',notePharm:'Blister packs, not loose',noteRule:'Notes can’t change the price.',
    add:'Add · {p}',addN:'Add {n} · {p}',update:'Update · {p}',remove:'Remove from cart',closedCta:'Opens at {t}',close:'Close'},
  cart:{bar:'{n} items · {p}',bar1:'1 item · {p}',view:'View cart',minHint:'Add {d} to skip the {f} small-order fee'},
  newCart:{t:'Start a new cart?',s:'Your cart from {v} ({n} items, {p}) will be cleared.',adding:'You’re adding {i} from {w}.',yes:'Start new cart',no:'Keep my cart'},
  justClosed:{t:'{v} just closed',s:'They stopped taking orders. Your cart is saved — nothing was ordered.',yes:'See open places',no:'OK'},
  search:{home:'Search food, shops or parcels',home320:'Search food or shops',recent:'Recent',clear:'Clear',popular:'Popular near you',
    places:'PLACES',groups:{food:'RESTAURANTS',shops:'SHOPS',pharmacy:'PHARMACY',items:'DISHES & ITEMS'},
    parcel:{t:'Send a parcel',s:'Documents, keys, anything. Name your price.'},
    none:{t:'No matches for “{q}”',s:'Try a shorter word, or a dish or shop name.'},
    offline:{t:'You’re offline',s:'Search needs a connection. Your recent searches still work.'},seeAll:'See all {n}'},
  toast:{added:'Added {i}',err:'Couldn’t add that. Try again.',reminder:'We’ll message you when {v} opens.'},
  off:{cta:'Notify me',no:'Not now'}
};
const f=(s,o)=>s.replace(/\{(\w+)\}/g,(m,k)=>o&&o[k]!=null?o[k]:m);
const z=n=>`calc(${n}px*var(--fs))`;
const A='assets/',F=A+'food/';
const TK={ink:'#14181B',muted:'#5B6670',line:'#E2E6EA',surface:'#F6F7F8',brand:'#00B14F',green:'#006630',cta:'#00812F',mint:'#E9F8EF',forest:'#063B22',hi:'#FFD23F',hiInk:'#3D3100',free:'#4B2FBF',
  tile:{food:'#FFD9CC',shops:'#DDD5FF',pharmacy:'#C5E9DF'},
  kind:{Pharmacy:['#DFF4EE','#006630'],Grocery:['#E9F8EF','#006630'],Butchery:['#FFE7E0','#8F2418'],Fashion:['#FFE4F2','#8A1F5C'],'Auto parts':['#E3F6FE','#0B5A7A'],Hardware:['#F6F7F8','#14181B'],Electronics:['#F6F7F8','#14181B'],Other:['#F6F7F8','#14181B'],Food:['#FFE7E0','#8F2418']}};
document.head.insertAdjacentHTML('beforeend',`<style>
.ph{--fs:1;width:360px;height:720px;overflow:hidden;position:relative;background:#fff;border-radius:24px;box-shadow:0 0 0 1px #e2e6ea,0 12px 40px rgba(20,24,27,.10);isolation:isolate;font:400 ${z(14)} Inter,system-ui,sans-serif;color:#14181b;font-variant-numeric:tabular-nums}
.ph.w320{width:320px;height:640px}.ph.fs13{--fs:1.3}.ph *{box-sizing:border-box}
.sb{height:28px;display:flex;justify-content:space-between;align-items:center;padding:0 16px;font:600 12px Inter;position:relative;z-index:2;flex:none}
.circ{position:absolute;border-radius:50%;z-index:0}
.t44{width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex:none;border-radius:50%}.back svg{transform:rotate(180deg)}
.bh{background:#E9F8EF;position:relative;overflow:hidden;border-radius:0 0 28px 28px;padding-bottom:16px}
.bh-top{position:relative;z-index:1;display:flex;align-items:center;gap:4px;padding:4px 16px 0 6px}
.addr{min-width:0;min-height:44px;display:flex;flex-direction:column;justify-content:center}.addr small{font:600 ${z(11)} Inter;color:#5b6670;letter-spacing:.2px}.addr span{font:700 ${z(15)} Inter;display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden}.addr em{font-style:normal;overflow:hidden;text-overflow:ellipsis}.addr svg{flex:none}
.bh-title{position:relative;z-index:1;display:flex;align-items:center;gap:10px;padding:6px 16px 12px;font:700 ${z(24)}/1.15 Inter;letter-spacing:-.4px}
.stk{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none}.stk img{width:32px;height:32px}
.search{min-height:48px;border-radius:12px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 14px;color:#5b6670;font-size:${z(14)};position:relative;z-index:1}.search span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chips{display:flex;gap:8px;padding:8px 16px 0;overflow:hidden}.chip{min-height:44px;display:flex;align-items:center;flex:none}.chip span{min-height:36px;display:flex;align-items:center;gap:6px;padding:0 14px;border-radius:999px;border:1px solid #e2e6ea;font:600 ${z(13)} Inter;white-space:nowrap}.chip.on span{background:#E9F8EF;border-color:#006630;color:#006630}.chip.fr span{color:#4B2FBF}.chip.fr.on span{background:#ECE8FF;border-color:#4B2FBF}
.sortrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 6px 0 16px;min-height:44px}.sortrow small{flex:1 1 auto;font-size:${z(12.5)};color:#5b6670;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.sortbtn{min-height:44px;display:flex;align-items:center;gap:4px;padding:0 10px;font:600 ${z(13)} Inter;color:#006630;white-space:nowrap;flex:none}
.vlist{padding:4px 16px 0;display:flex;flex-direction:column}
.vf{padding:8px 0 16px}.vf .im{aspect-ratio:2/1;border-radius:14px;background-size:cover;background-position:center;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden}
.vname{font:700 ${z(16)}/1.25 Inter;margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vsub,.vmeta{font-size:${z(12.5)};color:#5b6670;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:4px}.vmeta b{color:#14181b;font-weight:600}.vmeta svg{flex:none}
.vr{display:flex;gap:12px;padding:12px 0;border-top:1px solid #e2e6ea;align-items:center;min-height:${z(96)}}.vr .im{width:96px;height:80px;border-radius:14px;flex:none;background-size:cover;background-position:center;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden}.vr .vname{font-size:${z(15)};margin-top:0}.vr>div:last-child{min-width:0;flex:1}
.eta{position:absolute;right:6px;bottom:6px;background:#fff;color:#14181b;font:700 ${z(11)} Inter;padding:3px 8px;border-radius:999px;white-space:nowrap}
.freet{position:absolute;left:6px;top:6px;background:#4B2FBF;color:#fff;font:700 ${z(10.5)} Inter;padding:4px 8px;border-radius:999px;white-space:nowrap}
.kindt{position:absolute;left:6px;bottom:6px;background:#fff;font:700 ${z(10.5)} Inter;padding:3px 8px;border-radius:999px;white-space:nowrap}
.soont{position:absolute;left:6px;bottom:6px;background:#FFD23F;color:#3D3100;font:700 ${z(11)} Inter;padding:3px 8px;border-radius:999px;white-space:nowrap}
.dimimg{filter:grayscale(1);opacity:.5}
.ini{font:700 40px Inter}
.ghd{display:flex;align-items:center;gap:8px;font:700 ${z(16)} Inter;padding:20px 0 4px}.ghd small{font:400 ${z(12.5)} Inter;color:#5b6670}
.phd{background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.55) 0 6px,transparent 6px 12px)}.phd code{font:600 9.5px ui-monospace,Menlo,monospace;color:#5b6670;background:rgba(255,255,255,.8);padding:2px 5px;border-radius:4px;text-align:center;max-width:90%}
.note{display:flex;gap:10px;align-items:flex-start;font-size:${z(13)};line-height:1.45;padding:12px 14px;background:#F6F7F8;border-radius:12px}.note svg{flex:none;margin-top:1px}
.btn{min-height:52px;border-radius:999px;display:flex;align-items:center;justify-content:center;font:600 ${z(16)} Inter;gap:8px;text-align:center;padding:0 16px}.btn.p{background:#00812F;color:#fff}.btn.g{min-height:48px;border:1px solid #e2e6ea;color:#006630}.btn.t{min-height:44px;color:#006630}
.empty{text-align:center;padding:24px 20px}.empty h4{font:700 ${z(18)}/1.3 Inter;margin:12px 0 6px;letter-spacing:-.2px;text-wrap:balance}.empty p{margin:0 0 16px;font-size:${z(14)};color:#5b6670;line-height:1.45;text-wrap:pretty}
.mintcard{background:#E9F8EF;border-radius:20px;padding:20px;text-align:center}
.sk{background:#EEF1F3;border-radius:12px}
.dim{position:absolute;inset:0;background:rgba(20,24,27,.45);z-index:7}.sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;z-index:8;padding:8px 16px 20px}.grab{width:36px;height:4px;border-radius:2px;background:#d5dbe0;margin:0 auto 12px}
.sh-t{font:700 ${z(20)}/1.25 Inter;letter-spacing:-.3px;margin:0 0 4px}
.srow{display:flex;align-items:center;gap:12px;min-height:56px;border-bottom:1px solid #f0f2f4;font-size:${z(15)}}.srow:last-child{border:0}.srow small{display:block;color:#5b6670;font-size:${z(12.5)}}
.radio{width:22px;height:22px;border-radius:50%;border:2px solid #c9d0d6;flex:none;margin-left:auto}.radio.on{border:7px solid #00B14F}
.offb{display:flex;align-items:center;gap:8px;margin:10px 16px 0;padding:10px 12px;border-radius:12px;background:#F6F7F8;color:#5b6670;font-size:${z(12.5)}}
.toast{position:absolute;left:16px;right:16px;z-index:9;background:#14181B;color:#fff;border-radius:12px;padding:12px 14px;font-size:${z(13.5)};line-height:1.4;display:flex;gap:10px;align-items:center}
.cbar{position:absolute;left:12px;right:12px;bottom:12px;background:#063B22;color:#fff;border-radius:18px;padding:10px 8px 10px 12px;display:flex;align-items:center;gap:10px;z-index:6;min-height:64px}.cbar .av{width:40px;height:40px;border-radius:50%;background:#00B14F;display:flex;align-items:center;justify-content:center;flex:none}.cbar b{font:700 ${z(14)} Inter;display:block;white-space:nowrap}.cbar small{font-size:${z(12)};color:#BFE6CD;display:block;line-height:1.3}.cbar .go{background:#FFD23F;color:#3D3100;font:700 ${z(13)} Inter;min-height:44px;padding:0 14px;border-radius:999px;display:flex;align-items:center;gap:4px;white-space:nowrap;flex:none}
.prog{height:3px;border-radius:2px;background:rgba(255,255,255,.22);margin-top:6px;max-width:150px;position:relative}.prog i{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:#00B14F}
.cover{height:140px;background-size:cover;background-position:center;position:relative;overflow:hidden}.cover .ctl{position:absolute;top:8px;left:10px;right:10px;display:flex;justify-content:space-between;z-index:2}.cover .t44{background:#fff}
.logo{width:60px;height:60px;border-radius:50%;border:3px solid #fff;background:#fff center/cover;margin:-30px 0 0 16px;position:relative;z-index:3;display:flex;align-items:center;justify-content:center;font:700 22px Inter}
.vh{padding:8px 16px 0}.vh h1{font:700 ${z(22)}/1.2 Inter;letter-spacing:-.4px;margin:0;text-wrap:balance}.vh p{margin:3px 0 0;font-size:${z(13)};color:#5b6670}
.istrip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #e2e6ea;border-radius:14px;margin:12px 16px 0}.istrip div{padding:10px 4px;text-align:center;border-left:1px solid #e2e6ea;min-width:0}.istrip div:first-child{border:0}.istrip b{display:flex;justify-content:center;align-items:center;gap:3px;font:700 ${z(15)} Inter;white-space:nowrap}.istrip small{display:block;font-size:${z(11.5)};color:#5b6670;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ostate{display:flex;align-items:center;gap:8px;margin:10px 16px 0;min-height:40px;padding:8px 12px;border-radius:12px;font-size:${z(13)}}.ostate b{font-weight:700}.dot{width:8px;height:8px;border-radius:50%;flex:none}
.tabs{display:flex;gap:4px;padding:0 8px;border-bottom:1px solid #e2e6ea;background:#fff;overflow:hidden;margin-top:12px}.tabs span{min-height:48px;display:flex;align-items:center;padding:0 10px;font:600 ${z(14)} Inter;color:#5b6670;white-space:nowrap;border-bottom:3px solid transparent;flex:none}.tabs span.on{color:#14181b;border-color:#00B14F;font-weight:700}.tabs .ts{margin-left:auto}
.sec{padding:18px 16px 2px;font:700 ${z(18)} Inter;letter-spacing:-.3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sec small{font:600 ${z(12)} Inter;padding:4px 8px;border-radius:999px;background:#F6F7F8;color:#5b6670;letter-spacing:0}
.dr{display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid #f0f2f4}.dr>div:first-child{flex:1;min-width:0}.dr b{display:block;font:700 ${z(15)}/1.3 Inter}.dr p{margin:3px 0 6px;font-size:${z(13)};color:#5b6670;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.dr .pr{font:700 ${z(14)} Inter}
.dr .im{width:96px;height:96px;border-radius:12px;flex:none;background-size:cover;background-position:center;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden}
.plus{position:absolute;right:0;bottom:0;width:44px;height:44px;display:flex;align-items:center;justify-content:center}.plus .pd{width:32px;height:32px;border-radius:50%;background:#00B14F;display:flex;align-items:center;justify-content:center;color:#fff;font:700 ${z(14)} Inter}
.plus.out .pd{background:#fff;border:1.5px solid #00B14F}
.step{display:inline-flex;align-items:center;border:1px solid #e2e6ea;border-radius:999px;height:44px;margin-top:8px}.step span{width:44px;height:44px;display:flex;align-items:center;justify-content:center}.step b{min-width:28px;text-align:center;font:700 ${z(15)} Inter!important;display:block}
.step.wide{display:flex;justify-content:space-between;width:100%}
.oosc{display:inline-block;font:600 ${z(12)} Inter;color:#5b6670;background:#F6F7F8;padding:3px 8px;border-radius:999px;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 12px;padding:10px 16px 0}.gt .im{aspect-ratio:1;border-radius:14px;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;background-size:cover}.gt b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font:600 ${z(14)}/1.3 Inter;margin-top:8px}.gt .pr{font:700 ${z(14)} Inter;margin-top:2px;display:block}
.ir{display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid #f0f2f4;align-items:flex-start}.ir .im{width:64px;height:64px;border-radius:12px;flex:none;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden}.ir>div:nth-child(2){flex:1;min-width:0}.ir b{display:block;font:600 ${z(15)}/1.3 Inter}.ir .pr{font:700 ${z(14)} Inter;margin-top:2px;display:block}.ir .plus{position:relative;flex:none;margin:-0px -6px 0 0}
.kb{position:absolute;left:0;right:0;bottom:0;height:252px;background:#D7DCE0;padding:8px 4px;display:flex;flex-direction:column;gap:10px;z-index:10}.kb div{display:flex;gap:5px;justify-content:center}.kb i{height:42px;flex:1;max-width:32px;background:#fff;border-radius:6px}
.modal{position:absolute;left:20px;right:20px;top:50%;transform:translateY(-50%);background:#fff;border-radius:24px;z-index:8;padding:20px}
.shead{display:flex;align-items:center;gap:4px;padding:4px 16px 8px 6px}.sfield{flex:1;min-width:0;min-height:48px;border-radius:12px;background:#F6F7F8;display:flex;align-items:center;gap:10px;padding:0 4px 0 14px;font-size:${z(15)};border:1.5px solid #00B14F;background:#fff}.sfield span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.slab span{white-space:nowrap}.slab{font:700 ${z(11.5)} Inter;letter-spacing:.6px;color:#5b6670;padding:16px 16px 4px;display:flex;justify-content:space-between}.slab a{color:#006630;letter-spacing:0;font-size:${z(13)}}
.hr{display:flex;align-items:center;gap:12px;padding:8px 16px;min-height:64px}.hr .im{width:48px;height:48px;border-radius:12px;flex:none;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}.hr>div:nth-child(2){flex:1;min-width:0}.hr b{display:block;font:700 ${z(15)} Inter;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hr small{display:block;font-size:${z(12.5)};color:#5b6670;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hr mark{background:none;color:#006630;font-weight:700}
.chdr{display:flex;align-items:center;gap:4px;padding:0 6px;min-height:56px;border-bottom:1px solid #e2e6ea;background:#fff}.chdr b{flex:1;min-width:0;font:700 ${z(17)} Inter;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nb{white-space:nowrap;display:inline-block;border:1px dashed #C0392B;color:#8F2418;background:#FAEDEB;font:700 9px Inter;letter-spacing:.3px;padding:2px 6px;border-radius:6px}
.st svg{fill:#FFD23F;stroke:#C99500}.sw{width:44px;height:26px;border-radius:999px;background:#c9d0d6;position:relative;flex:none}.sw:after{content:"";position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff}.sw.on{background:#00B14F}.sw.on:after{left:21px}
</style>`);
const i=(n,s,c,x)=>`<i data-lucide="${n}" style="width:${s||18}px;height:${s||18}px;color:${c||'currentColor'};display:inline-flex;flex:none;${x||''}"></i>`;
const nb=t=>`<span class="nb">NEEDS BACKEND${t?' · '+t:''}</span>`;
const sb=()=>`<div class="sb"><span>9:41</span><span>3G 84%</span></div>`;
const usd=n=>'$'+n.toFixed(2);
const star=(s)=>`<span class="st" style="display:inline-flex;flex:none"><i data-lucide="star" style="width:${s||12}px;height:${s||12}px;display:inline-flex;color:#C99500"></i></span>`;
/* placeholder for a real photo the merchant uploads */
const phd=(label,tint)=>`background-color:${tint||'#EEF1F3'}" data-ph="${label}`;
const imgStyle=x=>x.img?`background-image:url(${F}${x.img}.jpg)`:x.ph?`background-color:${x.pt||'#EEF1F3'}`:`background-color:${x.tint}`;
const imgCls=x=>x.ph&&!x.img?' phd':'';
const phLabel=x=>x.ph&&!x.img?`<code>${x.ph}</code>`:'';
/* ---------- data ---------- */
const AREA='Belgravia',ADDR='12 Lanark Rd, Belgravia';
const V={
 gava:{s:'food',n:'Gava’s Kitchen',cu:'Zimbabwean · Grills',lv:'$$',r:4.7,rc:210,km:1.2,fee:1.5,eta:'25–35',img:'rice-3',logo:'butter-chicken-3',prep:20,until:'22:00'},
 golden:{s:'food',n:'Golden Bao',cu:'Chinese',lv:'$$',r:4.9,rc:388,km:2.1,fee:0,eta:'25–35',img:'biryani-1',until:'21:30'},
 mbuya:{s:'food',n:'Mbuya’s Kitchen',cu:'Traditional',lv:'$',r:4.8,rc:156,km:1.8,fee:1.5,eta:'30–40',img:'rice-1'},
 sadza:{s:'food',n:'Sadza Republic',cu:'Zimbabwean',lv:'$',r:4.6,rc:96,km:2.4,fee:2,eta:'30–40',img:'butter-chicken-2',closing:15},
 slice:{s:'food',n:'Chicken Slice',cu:'Chicken · Fast food',lv:'$',r:0,km:3.1,fee:2.5,eta:'35–45',img:'burger-1'},
 pizza:{s:'food',n:'Pizza Inn',cu:'Pizza',lv:'$$',r:4.8,rc:44,km:2.8,fee:2,eta:'30–40',img:'pizza-1',closed:'10:00'},
 avfresh:{s:'shops',n:'Avondale Fresh',kind:'Grocery',r:4.6,rc:128,km:1.6,fee:1.5,eta:'20–30',ph:'shop front photo',prep:10,until:'20:00'},
 mbare:{s:'shops',n:'Mbare Auto Spares',kind:'Auto parts',r:4.4,rc:37,km:4.2,fee:3.5,eta:'35–50',ph:'shop front photo',prep:10,until:'17:30'},
 borrow:{s:'shops',n:'Borrowdale Butchery',kind:'Butchery',r:4.8,rc:92,km:5.0,fee:0,eta:'35–45',ph:'shop front photo'},
 kens:{s:'shops',n:'Kensington Hardware',kind:'Hardware',r:0,km:2.6,fee:2,eta:'30–40'},
 samlevy:{s:'shops',n:'Sam Levy’s Boutique',kind:'Fashion',r:4.7,rc:61,km:5.6,fee:4.5,eta:'40–55',ph:'shop front photo',closed:'09:00',tmr:1},
 avpharm:{s:'pharmacy',n:'Avondale Pharmacy',kind:'Pharmacy',r:4.7,rc:83,km:1.4,fee:1.5,eta:'20–30',ph:'pharmacy front photo',prep:10,until:'21:00'},
 belg:{s:'pharmacy',n:'Belgravia Pharmacy',kind:'Pharmacy',r:4.5,rc:40,km:0.6,fee:1.5,eta:'15–25',closing:15,prep:10,until:'18:00'},
 eastgate:{s:'pharmacy',n:'Eastgate Pharmacy',kind:'Pharmacy',r:4.6,rc:112,km:2.9,fee:2.5,eta:'25–35',ph:'pharmacy front photo',closed:'08:00',tmr:1}
};
Object.values(V).forEach(v=>{const k=TK.kind[v.kind||'Food'];v.tint=k[0];v.ink=k[1];if(v.ph)v.pt=k[0];});
const D={
 stew:{n:'Sadza & beef stew',d:'Slow-cooked beef in tomato gravy, with white sadza and covo.',p:4.5,img:'butter-chicken-2'},
 roast:{n:'Roast chicken (half)',d:'Flame-roasted with peri-peri or lemon. Chips not included.',p:6,img:'butter-chicken-1'},
 rice:{n:'Rice & chicken',d:'Quarter chicken on spiced rice with coleslaw.',p:5,img:'rice-1'},
 burger:{n:'Beef burger',d:'Grilled beef patty, tomato, onion and house sauce.',p:5.5,img:'burger-2'},
 tbone:{n:'T-bone & sadza',d:'Char-grilled T-bone with sadza and gravy.',p:8.5,img:'rice-2'},
 chips:{n:'Chips (large)',d:'',p:2,img:'burger-3'},
 covo:{n:'Covo & rape',d:'Fried greens with onion and tomato.',p:1.5,ph:'dish photo',pt:'#E9F8EF'},
 mazoe:{n:'Mazoe orange 2L',d:'',p:3.2,ph:'product photo',pt:'#FFE7E0'},
 eggs:{n:'Eggs (tray of 30)',p:5.5,ph:'product photo',pt:'#E9F8EF'},
 bread:{n:'Bread (Lobels 700g)',p:1.1,ph:'product photo',pt:'#E9F8EF'},
 milk:{n:'Milk (Dairibord 2L)',p:2.4,ph:'product photo',pt:'#E9F8EF'},
 mazoeS:{n:'Mazoe orange 2L',p:3.2,ph:'product photo',pt:'#E9F8EF'},
 tbonek:{n:'T-bone steak (1 kg)',p:9.8,ph:'product photo',pt:'#FFE7E0'},
 pads:{n:'Brake pads (front)',d:'Fits Toyota Corolla 2008–2014 and Honda Fit. Set of 4.',p:24,ph:'product photo',pt:'#E3F6FE'},
 discs:{n:'Brake discs (pair)',p:48,ph:'product photo',pt:'#E3F6FE'},
 oilf:{n:'Oil filter',p:6.5,ph:'product photo',pt:'#E3F6FE'},
 airf:{n:'Air filter',p:9,ph:'product photo',pt:'#E3F6FE'},
 oil:{n:'Engine oil 5L',p:28,ph:'product photo',pt:'#E3F6FE'},
 bulb:{n:'Headlight bulb H4',p:4.5,ph:'product photo',pt:'#E3F6FE'},
 para:{n:'Paracetamol 500mg (20 tabs)',p:1.5,ph:'pack photo',pt:'#DFF4EE'},
 ors:{n:'ORS sachets (x5)',p:2,ph:'pack photo',pt:'#DFF4EE'},
 plast:{n:'Plasters (20)',p:1.8,ph:'pack photo',pt:'#DFF4EE'},
 vitc:{n:'Vitamin C 1000mg (10)',p:3.4,ph:'pack photo',pt:'#DFF4EE'},
 lozg:{n:'Throat lozenges (16)',p:2.6,ph:'pack photo',pt:'#DFF4EE'},
 nappy:{n:'Nappies size 3 (30)',p:9.5,ph:'pack photo',pt:'#DFF4EE'}
};
/* ---------- parts ---------- */
const S=k=>B.svc[k];
const circles=(w)=>`<span class="circ" style="width:150px;height:150px;background:#FFD23F;right:-62px;top:-58px"></span><span class="circ" style="width:26px;height:26px;background:#FF6B4A;right:${w===320?40:70}px;top:${w===320?104:100}px"></span><span class="circ" style="width:14px;height:14px;background:#3EC1F3;right:${w===320?18:32}px;top:${w===320?126:124}px"></span>`;
const backB=(bg)=>`<span class="t44 back" style="${bg?'background:'+bg:''}">${i('chevron-right',22)}</span>`;
const addr=(o)=>`<div class="addr"><small>${o.noloc?B.list.noAddr:B.list.delivering}</small><span style="color:${o.noloc?'#8F2418':'#14181b'}">${i('map-pin',16,o.noloc?'#C0392B':'#00B14F')}<em>${o.noloc?B.list.setLoc:ADDR}</em>${i('chevron-down',16)}</span></div>`;
const listHeader=(k,o)=>{o=o||{};const s=S(k);return `<div class="bh">${circles(o.w)}${sb()}<div class="bh-top">${backB()}${addr(o)}</div><div class="bh-title"><span class="stk" style="background:${TK.tile[k]}"><img src="${A}service-icons/v2/${k==='food'?'restaurants':k}.svg" alt=""></span><span style="min-width:0">${s.title}</span></div><div style="padding:0 16px"><div class="search">${i('search',18)}<span>${o.w===320?s.search320:s.search}</span></div></div></div>`};
const chips=(list,sel,o)=>`<div class="chips">${list.map(c=>`<div class="chip ${(Array.isArray(sel)?sel.includes(c):sel===c)?'on':''} ${c===B.list.free?'fr':''}"><span>${(Array.isArray(sel)?sel.includes(c):sel===c)&&c!=='All'?i('check',14):''}${c}</span></div>`).join('')}</div>`;
const sortRow=(sum,s)=>`<div class="sortrow"><small>${sum}</small><span class="sortbtn">${f(B.list.sortBy,{s:s||'Recommended'})}${i('chevron-down',16)}</span></div>`;
const fallback=(v,big)=>`<span class="ini" style="color:${v.ink};${big?'width:76px;height:76px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:34px':'font-size:30px'}">${v.n[0]}</span>${v.kind&&v.kind!=='Pharmacy'?`<span class="kindt" style="color:${v.ink}">${v.kind}</span>`:''}`;
const imInner=(v,o,big)=>{let h='';if(!v.img&&!v.ph)h+=fallback(v,big);else if(v.ph&&!v.img)h+=`<code>${v.ph}</code>`;
 if(v.closed)h+=`<span class="eta">${f(v.tmr?B.list.opensTmr:B.list.opens,{t:v.closed})}</span>`;else if(!o.noloc)h+=`<span class="eta">${v.eta} min</span>`;
 if(v.closing&&!v.closed)h+=`<span class="soont">${f(B.list.closesIn,{m:v.closing})}</span>`;
 if(v.fee===0&&!o.noloc&&!v.closed)h+=`<span class="freet">${B.list.free}</span>`;return h};
const rate=v=>v.r?`${star()}<b>${v.r}</b>${v.rc?` (${v.rc})`:''}`:`<b>${B.list.isNew}</b>`;
const metaFull=(v,o)=>o.noloc?`${rate(v)}`:`${rate(v)}<span>·</span><span>${v.km} km</span>${v.fee?`<span>·</span><span>${usd(v.fee)} delivery</span>`:''}`;
const sub=v=>v.cu||v.kind;
const vcard=(v,o)=>{o=o||{};return `<div class="vf" style="${v.closed?'':''}"><div class="im${imgCls(v)}" style="${imgStyle(v)}"><div class="${v.closed?'dimimg':''}" style="position:absolute;inset:0;${imgStyle(v)};background-size:cover;background-position:center"></div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${imInner(v,o,1)}</div></div><div class="vname" style="${o.long?'white-space:normal':''}">${o.longName||v.n}</div><div class="vsub">${sub(v)}${v.lv&&v.s==='food'?' · '+v.lv:''}</div><div class="vmeta">${metaFull(v,o)}</div></div>`};
const vrow=(v,o)=>{o=o||{};const m1=o.noloc?sub(v):`${sub(v)} · ${v.km} km`;const m2=o.noloc?rate(v):`${rate(v)}${v.fee?`<span>·</span><span>${usd(v.fee)} delivery</span>`:`<span>·</span><b style="color:#4B2FBF">Free delivery</b>`}`;
 return `<div class="vr"><div class="im${imgCls(v)}" style="${v.closed?'':imgStyle(v)}">${v.closed?`<div class="dimimg${imgCls(v)}" style="position:absolute;inset:0;${imgStyle(v)};background-size:cover;background-position:center"></div>`:''}<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${(!v.img&&!v.ph)?`<span class="ini" style="color:${v.ink};font-size:28px">${v.n[0]}</span>`:v.ph&&!v.img?`<code style="font-size:8.5px">${v.ph.replace(' front','')}</code>`:''}${v.closed?'':o.noloc?'':`<span class="eta" style="font-size:${z(10.5)}">${v.eta} min</span>`}${v.closing&&!v.closed?`<span class="soont" style="font-size:${z(10)}">${f(B.list.closesIn,{m:v.closing})}</span>`:''}</div></div><div><div class="vname" style="${o.long?'white-space:normal;line-height:1.25':''}">${o.longName||v.n}</div><div class="vsub">${v.closed?`<b style="color:#14181b;font-weight:600">${f(v.tmr?B.list.opensTmr:B.list.opens,{t:v.closed})}</b>`:m1}</div><div class="vmeta">${v.closed?`${sub(v)}`:m2}</div></div></div>`};
const closedHd=()=>`<div class="ghd">${B.list.closedNow}</div>`;
const otc=(m)=>`<div class="note" style="margin:${m||'12px 16px 0'}">${i('circle-alert',18,'#006630')}<span><b>${B.list.otc.split('. ')[0]}.</b> ${B.list.otc.split('. ')[1]}</span></div>`;
const offBanner=()=>`<div class="offb">${i('wifi-off',16)}<span>${f(B.list.offline,{t:'09:24'})}</span></div>`;
const cartBar=(o)=>{o=o||{};const under=o.sub<4;return `<div class="cbar"><span class="av">${i('shopping-bag',20,'#fff')}</span><div style="flex:1;min-width:0"><b>${f(o.n===1?B.cart.bar1:B.cart.bar,{n:o.n,p:usd(o.sub)})}</b><small>${under?f(B.cart.minHint,{d:usd(4-o.sub),f:'$1.00'}):o.v}</small>${under?`<div class="prog"><i style="width:${o.sub/4*100}%"></i></div>`:''}</div><span class="go">${B.cart.view}${i('chevron-right',16)}</span></div>`};
const toast=(t,b,ic)=>`<div class="toast" style="bottom:${b||88}px">${ic?i(ic,18,'#BFE6CD'):''}<span>${t}</span></div>`;
const stepper=(n,wide)=>`<div class="step ${wide?'wide':''}"><span>${n===1?i('trash-2',16,'#5b6670'):i('minus',18)}</span><b>${n}</b><span>${i('plus',18,'#006630')}</span></div>`;
const plus=(n)=>`<span class="plus"><span class="pd">${n?n:i('plus',18,'#fff')}</span></span>`;
const dish=(k,o)=>{o=o||{};const d=D[k];const off=o.oos||o.win;return `<div class="dr"><div><b style="${off?'color:#5b6670':''}">${o.hl?d.n.replace(new RegExp('('+o.hl+')','i'),'<mark style="background:none;color:#006630">$1</mark>'):d.n}</b>${d.d?`<p>${d.d}</p>`:'<p style="margin:3px 0 0"></p>'}<span class="pr" style="${off?'color:#5b6670':''}">${usd(d.p)}</span>${o.oos?`<br><span class="oosc">${B.store.oos}</span>`:''}${o.n?`<div>${stepper(o.n)}</div>`:''}</div><div class="im${imgCls(d)}" style="${imgStyle(d)}">${off?`<div class="dimimg${imgCls(d)}" style="position:absolute;inset:0;${imgStyle(d)};background-size:cover"></div>`:phLabel(d)}${off||o.closed?'':plus(o.n)}</div></div>`};
const tile=(k,o)=>{o=o||{};const d=D[k];return `<div class="gt"><div class="im${imgCls(d)}" style="${o.oos?'':imgStyle(d)}">${o.oos?`<div class="dimimg${imgCls(d)}" style="position:absolute;inset:0;${imgStyle(d)}"></div>`:phLabel(d)}${o.oos||o.closed?'':plus(o.n)}</div><b style="${o.oos?'color:#5b6670':''}">${d.n}</b><span class="pr" style="${o.oos?'color:#5b6670':''}">${usd(d.p)}</span>${o.oos?`<span class="oosc">${B.store.oos}</span>`:''}${o.n?stepper(o.n,1):''}</div>`};
const irow=(k,o)=>{o=o||{};const d=D[k];return `<div class="ir"><div class="im${imgCls(d)}" style="${imgStyle(d)}"><code style="font-size:8px">${d.ph.replace(' photo','')}</code></div><div><b>${o.hl?d.n.replace(new RegExp('('+o.hl+')','i'),'<mark style="background:none;color:#006630">$1</mark>'):d.n}</b><span class="pr">${usd(d.p)}</span>${o.n?stepper(o.n):''}</div>${o.closed?'':`<span class="plus" style="position:relative;margin-right:-6px"><span class="pd">${o.n?o.n:i('plus',18,'#fff')}</span></span>`}</div>`};
const sheet=(c,o)=>`<div class="dim"></div><div class="sheet" style="${o||''}"><div class="grab"></div>${c}</div>`;
const svcEmpty=(k,o)=>`<div class="empty"><div class="mintcard" style="padding:20px 16px"><img src="${A}illustrations/trust-tracking.svg" style="height:96px" alt=""><h4>${f(S(k).none.t,{area:AREA})}</h4><p>${S(k).none.s}</p><div class="btn p">${i('map-pin',18,'#fff')}${B.list.changeAddr}</div><div class="btn t" style="margin-top:4px">${B.list.sendParcel}</div></div></div>`;
const skList=(n,full)=>`<div class="vlist">${full?`<div class="vf"><div class="sk" style="aspect-ratio:2/1;border-radius:14px"></div><div class="sk" style="height:14px;width:60%;margin-top:12px"></div><div class="sk" style="height:10px;width:40%;margin-top:8px"></div></div>`:''}${Array.from({length:n}).map(()=>`<div class="vr" style="border-color:#f0f2f4"><div class="sk" style="width:96px;height:80px;border-radius:14px;flex:none"></div><div style="flex:1"><div class="sk" style="height:13px;width:70%"></div><div class="sk" style="height:10px;width:50%;margin-top:8px"></div><div class="sk" style="height:10px;width:60%;margin-top:6px"></div></div></div>`).join('')}</div>`;
const compactBar=(t,k)=>`${sb()}<div class="chdr">${backB()}<b>${t}</b><span class="t44">${i('search',20)}</span></div>`;
window.BK={B,f,z,i,nb,sb,usd,star,TK,V,D,AREA,ADDR,S,circles,backB,addr,listHeader,chips,sortRow,vcard,vrow,closedHd,otc,offBanner,cartBar,toast,stepper,plus,dish,tile,irow,sheet,svcEmpty,skList,compactBar,rate,imgStyle,imgCls,phLabel};
})();

/* ---------- round 2 polish: overrides the round-1 parts of the same name ---------- */
(function(){
const K=BK,{B,f,z,i,usd,star,TK,V,D}=K;
Object.assign(B.list,{count:'{n} places',range:'{a}–{b} min',closedSub:'Look now, order when they open.'});
document.head.insertAdjacentHTML('beforeend',`<style>
.bh-title{font-size:${z(26)};letter-spacing:-.6px}
.cats{display:flex;gap:2px;padding:14px 8px 0;overflow:hidden}
.cat{flex:0 0 72px;display:flex;flex-direction:column;align-items:center;gap:7px;font:600 ${z(12)} Inter;color:#14181b;white-space:nowrap;padding:4px 0}
.cat .cc{width:60px;height:60px;border-radius:50%;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font:700 22px Inter;flex:none}.cat .cc img{width:40px;height:40px}
.cat.on .cc{outline:2.5px solid #00B14F;outline-offset:2px}.cat.on{color:#006630;font-weight:700}
.fbar{display:flex;gap:8px;padding:8px 16px 0;overflow:hidden}
.fp{min-height:44px;display:flex;align-items:center;flex:none}.fp span{min-height:36px;display:flex;align-items:center;gap:6px;padding:0 12px 0 14px;border-radius:999px;background:#F6F7F8;font:600 ${z(13)} Inter;white-space:nowrap}
.fp.free span{color:#4B2FBF}.fp.free.on span{background:#ECE8FF}.fp.on.sort span{background:#E9F8EF;color:#006630}
.lhd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:16px 16px 4px}.lhd b{font:700 ${z(20)} Inter;letter-spacing:-.4px;white-space:nowrap}.lhd small{font-size:${z(13)};color:#5b6670;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vlist{padding:0 16px}
.vf{padding:10px 0 18px}.vf .im{aspect-ratio:16/9;border-radius:16px}
.vtop{display:flex;align-items:center;gap:8px;margin-top:12px}.vtop .vname{margin:0;flex:1;min-width:0;font-size:${z(17)};letter-spacing:-.2px}
.rb{flex:none;display:inline-flex;align-items:center;gap:4px;background:#F6F7F8;border-radius:999px;padding:4px 9px 4px 7px;font:700 ${z(12.5)} Inter}.rb em{font-style:normal;font-weight:400;color:#5b6670}.rb.new{background:#E9F8EF;color:#006630;padding:4px 9px}
.vf .vsub{margin-top:3px;font-size:${z(13)}}.vf .vmeta{font-size:${z(13)};margin-top:3px}
.vr{border:0;padding:10px 0;gap:14px;align-items:center;min-height:0}.vr .im{width:104px;height:104px;border-radius:16px}.vr .vname{font-size:${z(16)};letter-spacing:-.2px}.vr .vsub,.vr .vmeta{font-size:${z(13)};margin-top:3px}
.ghd{display:block;padding:24px 0 6px;font-size:${z(20)};letter-spacing:-.4px}.ghd small{display:block;margin-top:2px;font-size:${z(13)}}
.cover{height:196px}.logo{width:76px;height:76px;margin-top:-38px;border-width:4px;font-size:28px}
.vh{padding:10px 16px 0}.vh h1{font-size:${z(26)};letter-spacing:-.6px}.vh p{font-size:${z(13.5)};margin-top:4px}
.oline{display:flex;align-items:center;gap:6px;padding:8px 16px 0;font-size:${z(13.5)};color:#5b6670;flex-wrap:wrap}.oline>*{flex:none;white-space:nowrap}.oline b{color:#006630;font-weight:700}
.istrip{border:0;background:#F6F7F8;border-radius:16px;margin-top:14px}.istrip div{padding:12px 4px;border-left:1px solid #E2E6EA}.istrip b{font-size:${z(16)}}.istrip small{font-size:${z(12)};margin-top:1px}
.tabs{margin-top:16px;padding:0 6px}.tabs span{font-size:${z(15)};padding:0 12px}
.sec{padding:26px 16px 6px;font-size:${z(20)};letter-spacing:-.4px}
.dr{margin:0 16px;padding:16px 0;gap:14px}.dr b{font:600 ${z(16)}/1.3 Inter}.dr p{font-size:${z(13.5)};margin:4px 0 8px}.dr .pr{font:600 ${z(15)} Inter}.dr .im{width:112px;height:112px;border-radius:14px}
.plus{width:48px;height:48px}.plus .pd{width:36px;height:36px;font-size:${z(15)}}
.pc{display:flex;gap:12px;padding:6px 16px 6px;overflow:hidden}.pci{flex:0 0 148px;min-width:0}.pci .im{width:148px;height:148px;border-radius:16px;position:relative;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;overflow:hidden}.pci b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font:600 ${z(14)}/1.3 Inter;margin-top:8px}.pci .pr{display:block;font:600 ${z(14)} Inter;margin-top:2px;color:#5b6670}
.grid{gap:20px 12px;padding:8px 16px 0}.gt .im{border-radius:16px}.gt .pr{font:700 ${z(16)} Inter;margin-top:10px}.gt b{font:400 ${z(13.5)}/1.35 Inter;margin-top:2px;color:#14181b}
.ir{margin:0 16px;padding:14px 0;align-items:center;gap:14px}.ir .im{width:72px;height:72px;border-radius:14px}.ir b{font:600 ${z(15)}/1.3 Inter}.ir .pr{font:700 ${z(15)} Inter;margin-top:4px}
</style>`);
const CATS={food:[['All',null,'restaurants'],['Zimbabwean','butter-chicken-2'],['Grills','rice-2'],['Chinese','biryani-2'],['Chicken','butter-chicken-1'],['Pizza','pizza-2']],
 shops:[['All',null,'shops']].concat(['Grocery','Butchery','Fashion','Auto parts','Hardware','Electronics','Other'].map(k=>[k]))};
K.cats=(svc,sel)=>{K._cat=sel;return '';let list=CATS[svc];if(sel!=='All'){const s=list.find(c=>c[0]===sel);list=[list[0],s].concat(list.filter(c=>c!==s&&c!==list[0]));}
 return `<div class="cats">${list.map(c=>{const kt=TK.kind[c[0]];const bg=c[2]?`background:${TK.tile[svc==='food'?'food':'shops']}`:c[1]?`background-image:url(assets/food/${c[1]}.jpg)`:`background:${kt[0]};color:${kt[1]}`;
 return `<div class="cat ${c[0]===sel?'on':''}"><span class="cc" style="${bg}">${c[2]?`<img src="assets/service-icons/v2/${c[2]}.svg" alt="">`:c[1]?'':c[0][0]}</span><span>${c[0]}</span></div>`}).join('')}</div>`};
K.fbar=(o)=>{o=o||{};const c=K._cat;K._cat=null;return `<div class="fbar" style="padding-top:12px"><div class="fp sort ${o.sort||(c&&c!=='All')?'on':''}"><span>${c&&c!=='All'?c+' · ':''}${f(B.list.sortBy,{s:o.sort||'Recommended'})}${i('chevron-down',16)}</span></div>${o.nofree?'':`<div class="fp free ${o.free?'on':''}"><span>${o.free?i('check',14):''}${B.list.free}</span></div>`}</div>`};
K.lhd=(t,s)=>`<div class="lhd"><b>${t}</b><small>${s}</small></div>`;
const rb=v=>v.r?`<span class="rb">${star(13)}${v.r}<em>(${v.rc})</em></span>`:`<span class="rb new">${B.list.isNew}</span>`;
const feeTxt=v=>v.fee?`${usd(v.fee)} delivery`:`<b style="color:#4B2FBF;font-weight:700">${B.list.free}</b>`;
const imgS=K.imgStyle,imgC=K.imgCls;
const inner=(v,o,big)=>{let h='';if(!v.img&&!v.ph)h+=`<span class="ini" style="color:${v.ink};${big?'width:76px;height:76px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:34px':'font-size:30px'}">${v.n[0]}</span>${v.kind&&v.kind!=='Pharmacy'?`<span class="kindt" style="color:${v.ink}">${v.kind}</span>`:''}`;else if(v.ph&&!v.img)h+=`<code>${big?v.ph:v.ph.replace(' front','')}</code>`;
 if(v.closed)h+=big?`<span class="eta">${f(v.tmr?B.list.opensTmr:B.list.opens,{t:v.closed})}</span>`:'';else if(!o.noloc)h+=`<span class="eta">${v.eta} min</span>`;
 if(v.closing&&!v.closed)h+=`<span class="soont">${f(B.list.closesIn,{m:v.closing})}</span>`;
 if(v.fee===0&&!o.noloc&&!v.closed&&big)h+=`<span class="freet">${B.list.free}</span>`;return h};
K.vcard=(v,o)=>{o=o||{};return `<div class="vf"><div class="im${imgC(v)}" style="${imgS(v)}"><div class="${v.closed?'dimimg':''}" style="position:absolute;inset:0;${imgS(v)};background-size:cover;background-position:center"></div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${inner(v,o,1)}</div></div><div class="vtop"><div class="vname" style="${o.long?'white-space:normal':''}">${o.longName||v.n}</div>${rb(v)}</div><div class="vsub">${v.cu||v.kind}${v.lv&&v.s==='food'?' · '+v.lv:''}</div>${o.noloc?'':`<div class="vmeta">${i('bike',14,'#5b6670')}<span>${feeTxt(v)}</span><span>·</span><span>${v.km} km</span></div>`}</div>`};
K.vrow=(v,o)=>{o=o||{};const rate=v.r?`${star(12)}<b>${v.r}</b> (${v.rc})`:`<b style="color:#006630">${B.list.isNew}</b>`;
 return `<div class="vr"><div class="im${imgC(v)}" style="${v.closed?'':imgS(v)}">${v.closed?`<div class="dimimg${imgC(v)}" style="position:absolute;inset:0;${imgS(v)};background-size:cover;background-position:center"></div>`:''}<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${inner(v,o,0)}</div></div><div><div class="vname" style="${o.long?'white-space:normal;line-height:1.25':''}">${o.longName||v.n}</div>${v.closed?`<div class="vsub"><b style="color:#14181b;font-weight:600">${f(v.tmr?B.list.opensTmr:B.list.opens,{t:v.closed})}</b></div><div class="vmeta">${v.cu||v.kind}</div>`:`<div class="vmeta">${rate}<span>·</span><span>${v.cu||v.kind}</span></div>${o.noloc?'':`<div class="vmeta">${i('bike',14,'#5b6670')}<span>${feeTxt(v)}</span><span>·</span><span>${v.km} km</span></div>`}`}</div></div>`};
K.closedHd=()=>`<div class="ghd">${B.list.closedNow}<small>${B.list.closedSub}</small></div>`;
K.tile=(k,o)=>{o=o||{};const d=D[k];return `<div class="gt"><div class="im${imgC(d)}" style="${o.oos?'':imgS(d)}">${o.oos?`<div class="dimimg${imgC(d)}" style="position:absolute;inset:0;${imgS(d)}"></div>`:K.phLabel(d)}${o.oos||o.closed?'':K.plus(o.n)}</div><span class="pr" style="${o.oos?'color:#5b6670':''}">${usd(d.p)}</span><b style="${o.oos?'color:#5b6670':''}">${d.n}</b>${o.oos?`<span class="oosc">${B.store.oos}</span>`:''}${o.n?K.stepper(o.n,1):''}</div>`};
K.pcard=(k,o)=>{o=o||{};const d=D[k];return `<div class="pci"><div class="im${imgC(d)}" style="${imgS(d)}">${K.phLabel(d)}${o.closed?'':K.plus(o.n)}</div><b>${d.n}</b><span class="pr">${usd(d.p)}</span>${o.n?K.stepper(o.n,1):''}</div>`};
})();
