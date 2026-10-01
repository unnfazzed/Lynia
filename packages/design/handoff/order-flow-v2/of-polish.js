/* Order flow v2.1 polish: same features, more pop. Loads after of-kit.js and before the screen files.
   Ideas taken from the best delivery apps: ETA as the hero number, grouped track, filled secondary buttons,
   a richer map with cased routes, a forest code panel at the door, a filled success disc, a grey page under white checkout cards.
   Tokens only (Calm Mint v2 + After Send v2). */
(function(){
const K=OK,{O,f,z,i,V,TK,CODE}=K;
document.head.insertAdjacentHTML('beforeend',`<style>
.hb .tt{font-weight:800;letter-spacing:-.2px}
.sheet{border-radius:24px 24px 0 0;box-shadow:0 -8px 28px rgba(20,24,27,.14)}
.sc{gap:14px}
.h2{font:800 ${z(21)}/1.2 Inter;letter-spacing:-.5px}
.mut{color:#5B6670}
.etah{margin-top:10px;display:flex;flex-direction:column;gap:2px}
.etah .lab{font:700 ${z(11.5)} Inter;letter-spacing:.07em;text-transform:uppercase;color:#5B6670}
.etah .big{font:800 ${z(30)}/1.05 Inter;letter-spacing:-.9px;font-variant-numeric:tabular-nums}
.etah .row2{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.etah .live{background:#FFD23F;color:#3D3100;border-radius:12px;padding:5px 11px 6px}
.etah .at{font:700 ${z(15)} Inter}
.trk{background:#F6F7F8;border-radius:16px;padding:12px 2px 10px}
.trk .ln{top:22px;height:4px}.trk .ln.on{background:#00B14F}
.trk .c{width:24px;height:24px;font-size:12px;background:#fff}
.trk .c.n{box-shadow:0 0 0 5px rgba(0,177,79,.18);animation:ofpulse 1.8s ease-out infinite}
@keyframes ofpulse{0%{box-shadow:0 0 0 0 rgba(0,177,79,.35)}70%{box-shadow:0 0 0 8px rgba(0,177,79,0)}100%{box-shadow:0 0 0 0 rgba(0,177,79,0)}}
.trk .l{font-size:${z(12)};margin-top:3px}
.card{border-radius:16px}
.sm{background:#F6F7F8;border:0;font-weight:800}.sm.w{background:#fff}.sm.f{background:#00812F}.sm.dis{background:#F6F7F8}
.btn{font-weight:800;letter-spacing:-.1px}.btn.g,.btn.gd{background:#F6F7F8;border:0}
.av{width:52px;height:52px;font-size:17px;box-shadow:0 0 0 2px #fff,0 0 0 4px #00B14F}
.prog{height:6px;border-radius:3px}.prog i{border-radius:3px;background-color:#00B14F;background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,.28) 0 6px,transparent 6px 12px);background-size:17px 17px;animation:ofbar 1s linear infinite}
@keyframes ofbar{to{background-position:17px 0}}
.code{border-radius:16px;padding:14px}
.codebig{background:#063B22;border-radius:20px;padding:16px 14px 18px}.codebig .lbl{color:#BFE6CD!important}
.codebig .pan{background:transparent;border:2px solid #00B14F;border-radius:14px;padding:10px 0}.codebig .digits{color:#fff;font-size:58px}.w320 .codebig .digits{font-size:48px}
.codebig>div:last-child{color:#fff}
.door{border-radius:20px;padding:12px 14px}.ds .n{width:28px;height:28px}
.ds:has(.n.c){background:#E9F8EF;margin:4px -8px;padding:10px 8px;border-radius:12px;border-top:0}.ds:has(.n.c)+.ds{border-top:0}
.disc{width:72px;height:72px}.disc.ok{background:#00B14F!important}.disc.ok svg{stroke:#fff}
.toast{border-radius:14px;padding:14px 16px}
.photo{border-radius:12px}
.scr{background:#F6F7F8}
.scr .rb{border:0;border-radius:16px;background:#fff;padding:14px 16px}
.scr .note:not(.ok):not(.hi):not(.dn):not(.ink){background:#fff}
.scr>div>div[style="padding:0 2px"]{background:#fff;border-radius:16px;padding:6px 16px 14px!important}
.scr>div>div[style="padding:0 2px"] .kv:first-child{border-top:0}
.lbl{font-weight:700;letter-spacing:.07em}
.ed{font-weight:800}
.stp{background:#F6F7F8;border:0}
.seg span.on{font-weight:800}
.fbar{border-radius:20px}
.chp.on{font-weight:700}
.map{background:#EEF1F3}
.map .bl{position:absolute;background:#E6EAED;border-radius:6px}
.map .rd{background:#fff;box-shadow:none}
.vpin{width:48px;height:48px;border-width:3px;box-shadow:0 6px 18px rgba(20,24,27,.18)}.vpin img{width:30px;height:30px}
.pin .pl{font-weight:700;padding:3px 9px}
.dpin{width:22px;height:22px;border-radius:4px;box-shadow:0 0 0 6px rgba(192,57,43,.16),0 6px 18px rgba(20,24,27,.18)}
.dpin+.pl{background:#14181B;color:#fff}
.rpin{width:38px;height:38px;box-shadow:0 0 0 7px rgba(0,177,79,.20),0 6px 18px rgba(20,24,27,.2)}
.rpin.pz{box-shadow:0 6px 18px rgba(20,24,27,.2)}
.map:after{content:"";position:absolute;left:0;right:0;bottom:0;height:28px;background:linear-gradient(rgba(238,241,243,0),rgba(238,241,243,.9));z-index:6;pointer-events:none}
</style>`);
/* stage top: title, then the ETA as the hero number */
K.top=(title,eta,o)=>{o=o||{};let e='';
 if(eta){const m1=/^Arrives in (~\d+ min) · (\S+)$/.exec(eta),m2=/^Arrives (.+)$/.exec(eta);
  if(m1)e=`<div class="etah"><span class="lab">Arriving in</span><div class="row2"><span class="big live">${m1[1]}</span><span class="at">Arrives ${m1[2]}</span></div></div>`;
  else if(m2)e=`<div class="etah"><span class="lab">Estimated arrival</span><span class="big">${m2[1]}</span></div>`;
  else e=`<div class="eta">${i('clock',16,'#5b6670')}<span>${eta}</span></div>`;}
 return `<div><div class="h2">${title}</div>${e}${o.sub?`<div class="mut" style="margin-top:6px">${o.sub}</div>`:''}</div>`};
/* track: same markup contract (labels as >Label<) */
K.track=(s,cur,o)=>{o=o||{};const st=O.svc[s].st.slice();if(o.rx)st[0]=O.svc.pharmacy.stRx;return `<div class="trk">${st.map((l,k)=>{const d=k<cur,n=k===cur;return `<div>${k>0?`<span class="ln ${k<=cur?'on':''}" style="left:0;right:50%"></span>`:''}${k<3?`<span class="ln ${k<cur?'on':''}" style="left:50%;right:0"></span>`:''}<span class="c ${d?'d':n?'n':''}">${d?i('check',13,'#fff','stroke-width:3'):k+1}</span><span class="l ${d?'d':n?'n':''}">${l}</span></div>`}).join('')}</div>`};
K.riderCard=o=>{o=o||{};return `<div class="card" style="gap:12px;padding:14px"><div class="row" style="gap:14px"><span class="av">TM</span><div class="grow"><div class="row" style="gap:6px;flex-wrap:wrap"><b style="font:800 ${z(17)} Inter;letter-spacing:-.2px">Tendai M.</b><span class="ver">${i('shield-check',13,'#006630')}${O.c.verified}</span></div><div class="row mut" style="gap:10px;flex-wrap:wrap;margin-top:3px"><span class="row" style="gap:4px;color:#14181b;font-weight:700">${i('star',13,'#C99500','fill:#FFD23F')}4.8</span><span>132 ${O.c.trips}</span><span class="plate" style="color:#14181b">ABH 4721</span></div></div></div>${o.nobtn?'':`<div class="row" style="gap:8px">${K.sm(O.c.call,'phone',{fl:1})}${K.sm(O.c.whatsapp,'message-circle',{fl:1})}</div>`}</div>`};
const grp=(s)=>`<span style="background:#fff;border-radius:10px;padding:2px 8px">${s}</span>`;
K.codeCard=()=>`<div class="code"><div class="row"><div class="grow"><div class="lbl" style="color:#006630">Delivery code</div><span class="digits" style="font-size:${z(28)};gap:6px;margin-top:4px">${grp(CODE.slice(0,3))}${grp(CODE.slice(3))}</span></div>${K.sm(O.p.shareCode,'share-2',{k:'w'})}</div><div style="font-size:${z(13)};line-height:1.4">${O.t.codeHelp}</div></div>`;
K.codeBig=()=>`<div class="codebig"><div class="lbl">Delivery code</div><div class="pan">${K.digits()}</div><div style="font-size:${z(14)};line-height:1.4;text-align:center">Say it to Tendai — he types it in to finish.</div></div>`;
K.venueRow=(vk,o)=>{o=o||{};const v=V[vk];return `<div class="vrow" style="gap:12px">${K.vdisc(v.s,48).replace('border-radius:12px','border-radius:14px')}<div class="grow"><div style="font:800 ${z(16)} Inter;letter-spacing:-.2px">${v.n}</div><div class="mut">${o.sub||f(O.c.orderNo,{id:K.ID})}</div></div>${o.call===false?'':K.sm(O.c.call,'phone')}</div>`};
K.prep=(s,m,pct,nn)=>`<div style="display:flex;flex-direction:column;gap:8px"><div class="row" style="justify-content:space-between;gap:8px"><b style="font:800 ${z(14)} Inter">${O.svc[s].making}</b><span style="font:700 ${z(13)} Inter;color:#006630">about ${m} min left</span></div><div class="prog"><i style="width:${pct}%"></i></div>${nn?'':`<div class="mut">${O.t.prepNote}</div>`}</div>`;
K.OS=(o)=>K.ph(K.hdr(o.title,{help:o.help!==false})+(o.map===false?'':K.map(o.map||{}))+(o.offline?`<div style="position:absolute;left:12px;right:12px;top:87px;z-index:15">${K.note('ink','wifi-off',f(O.c.offline,{t:'12:31'}))}</div>`:'')+K.sheet(o.body,{top:o.top})+(o.bar||'')+(o.extra||''),o.cls);
/* richer faux map with city blocks and a cased route */
const VP=[24,30],DP=[74,66];
const bz=t=>{const P=[VP,[30,62],[58,34],DP],u=1-t;return [0,1].map(k=>u*u*u*P[0][k]+3*u*u*t*P[1][k]+3*u*t*t*P[2][k]+t*t*t*P[3][k])};
const blocks=[[2,4,10,16],[2,24,10,16],[2,56,10,18],[2,84,10,14],[22,4,13,14],[22,52,13,20],[22,84,13,14],[38,56,18,18],[38,84,18,14],[62,4,14,14],[62,22,14,16],[80,4,18,14],[80,22,18,16],[80,84,18,14],[62,84,14,14]];
K.map=(o)=>{o=o||{};const s=o.s||'food';
 let h=`<div class="map" data-map="1">${blocks.map(b=>`<span class="bl" style="left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%"></span>`).join('')}<span class="pk" style="left:38%;top:4%;width:20%;height:34%;border-radius:14px"></span><span class="pk" style="left:62%;top:54%;width:14%;height:24%;border-radius:14px"></span><span class="rd" style="left:0;right:0;top:44%;height:12px"></span><span class="rd" style="left:58.5%;width:10px;top:0;bottom:0"></span><span class="rd" style="left:15%;width:7px;top:0;bottom:0"></span><span class="rd" style="left:36%;width:6px;top:0;bottom:0"></span><span class="rd" style="left:0;right:0;top:80%;height:7px"></span><span class="rd" style="left:0;right:0;top:20%;height:6px"></span><span class="rd" style="left:78%;width:6px;top:0;bottom:0"></span>`;
 if(o.empty)return h+'</div>';
 const path=`M${VP[0]} ${VP[1]} C30 62, 58 34, ${DP[0]} ${DP[1]}`;
 h+=`<svg class="rt" viewBox="0 0 100 100" preserveAspectRatio="none">`;
 if(o.route==='solid')h+=`<path d="${path}" fill="none" stroke="#fff" stroke-width="11" vector-effect="non-scaling-stroke" stroke-linecap="round"/><path d="${path}" fill="none" stroke="#00B14F" stroke-width="6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
 else h+=`<path d="${path}" fill="none" stroke="#fff" stroke-width="8" vector-effect="non-scaling-stroke" stroke-linecap="round"/><path d="${path}" fill="none" stroke="#5B6670" stroke-width="3" stroke-dasharray="7 7" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
 if(o.rider&&o.rider.to)h+=`<path d="M${o.rider.at[0]} ${o.rider.at[1]} Q ${o.rider.at[0]-6} ${VP[1]+4}, ${VP[0]} ${VP[1]}" fill="none" stroke="#14181B" stroke-width="3.5" stroke-dasharray="1 7" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
 h+=`</svg>`;
 if(!o.noVenue)h+=`<div class="pin" style="left:${VP[0]}%;top:${VP[1]}%"><span class="vpin" style="background:${TK.tile[s]}">${K.sticker(s,30)}</span><span class="pl">${o.vn||V.gava.n}</span></div>`;
 h+=`<div class="pin" style="left:${DP[0]}%;top:${DP[1]}%"><span class="dpin"></span><span class="pl">${O.c.you}</span></div>`;
 if(o.rider){const p=o.rider.at||bz(o.rider.t);h+=`<div class="pin" style="left:${p[0]}%;top:${p[1]}%"><span class="rpin ${o.rider.paused?'pz':''}">${i('bike',18,'#fff')}</span><span class="pl">${o.rider.paused?O.t.lastSeen:o.rider.label||'Tendai'}</span></div>`;}
 return h+(o.dim?'<div style="position:absolute;inset:0;background:rgba(255,255,255,.5);z-index:7"></div>':'')+'</div>'};
})();
