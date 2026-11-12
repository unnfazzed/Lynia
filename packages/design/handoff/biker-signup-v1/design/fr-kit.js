// First Run v2 kit — shared CSS, icons and parts. Sizes scale with --fs (font scale).
(function(){
const css=`
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;color:#14181B;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
a{color:#006630;text-decoration:none}a:hover{color:#00812F}
.board{position:absolute;left:0;top:0;padding:80px;display:grid;grid-template-columns:repeat(7,360px);gap:96px 56px;align-items:start}
.intro{grid-column:1/-1}.intro h1{font-size:44px;font-weight:700;letter-spacing:-.03em}.intro p{font-size:17px;color:#5B6670;margin-top:8px}
.sec{grid-column:1/-1;display:flex;align-items:baseline;gap:16px;border-top:1px solid #E2E6EA;padding-top:24px;margin-bottom:-56px}.sec h2{font-size:22px;font-weight:700}.sec span{color:#5B6670;font-size:15px}
.cell{position:relative}.lbl{position:absolute;top:-30px;left:0;font-size:13px;font-weight:600;color:#5B6670;display:flex;gap:8px;white-space:nowrap}.lbl i{font-style:normal;color:#14181B}
.f{--fs:1;--hh:232px;background:#fff;overflow:hidden;position:relative;border-radius:4px;box-shadow:0 0 0 1px rgba(20,24,27,.06);display:flex;flex-direction:column}
.f.sm{--hh:160px}.f.fs13{--fs:1.3;--hh:176px}
.body{flex:1;min-height:0;overflow:hidden;padding:36px 16px 16px}.sm .body{padding-top:30px}
.ex{position:absolute;left:28px;top:48px;width:44px;height:44px;border-radius:50%;background:#fff;color:#14181B;display:grid;place-items:center;z-index:3}.sm .ex{top:42px}
.sb{position:absolute;left:0;right:0;top:0;height:24px;padding:0 18px;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600;color:#14181B;z-index:20;pointer-events:none}.f.dark .sb{color:#fff}
.ic{display:block}
.ic{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}.ic.i16{width:16px;height:16px}.ic.i20{width:20px;height:20px}.ic.i40{width:40px;height:40px;stroke-width:1.75}
.hero{position:relative;overflow:hidden;border-radius:28px;background-color:#E9F8EF;height:var(--hh);display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;flex:none}
.hero::before{content:"";position:absolute;width:150px;height:150px;border-radius:50%;background:#FFD23F;right:-56px;top:-56px}
.hero::after{content:"";position:absolute;width:18px;height:18px;border-radius:50%;background:#FF6B4A;left:36px;bottom:40px}
.hero.v{background-color:#ECE8FF}.hero.r{background-color:#FAEDEB;background-image:none}.hero.r::before{background:#F4D9D5}.hero.r::after{background:#C0392B;opacity:.35}
.hero.g{background-color:#00B14F}.hero.g::after{background:#fff;opacity:.5}.hero.n{background-color:#F6F7F8;background-image:none}.hero.n::before{background:#E2E6EA}.hero.n::after{background:#AEB6BD}
.hero>*{position:relative;z-index:1}
.disc{width:104px;height:104px;border-radius:50%;background:#fff;display:grid;place-items:center;color:#00B14F;position:relative}.sm .disc,.fs13 .disc{width:84px;height:84px}
.v .disc{color:#4B2FBF}.r .disc{color:#C0392B}.n .disc{color:#5B6670}
.hero:not(:has(>.disc))::after{display:none}
.disc::after{content:"";position:absolute;inset:-14px;border-radius:50%;border:1.5px solid rgba(255,255,255,.8)}
.t{font-size:calc(28px*var(--fs));line-height:1.12;font-weight:700;letter-spacing:-.025em;margin-top:24px;text-wrap:balance}.sm .t{font-size:calc(24px*var(--fs));margin-top:16px}
.t em{font-style:normal;color:#006630}.t em.vi{color:#4B2FBF}.t em.rd{color:#8F2418}
.s{font-size:calc(15px*var(--fs));line-height:1.45;color:#5B6670;margin-top:8px;text-wrap:pretty}
.ft{padding:12px 16px 16px;display:flex;flex-direction:column;gap:4px;background:#fff;flex:none}
.cta{min-height:52px;border-radius:999px;background:#00812F;color:#fff;font-weight:600;font-size:calc(16px*var(--fs));font-family:inherit;border:0;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:0 16px}
.gh{min-height:52px;border-radius:999px;background:#fff;color:#006630;font-weight:600;font-size:calc(16px*var(--fs));font-family:inherit;border:1px solid #E2E6EA;display:flex;align-items:center;justify-content:center;gap:8px;width:100%}
.lk{min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;font-weight:600;font-size:calc(15px*var(--fs));font-family:inherit;color:#006630;background:none;border:0;width:100%}
.pts{margin-top:20px;display:flex;flex-direction:column;gap:14px}.pt{display:flex;gap:12px;align-items:center;font-size:calc(15px*var(--fs));line-height:1.35}
.pt b{width:32px;height:32px;border-radius:50%;background:#ECE8FF;color:#4B2FBF;display:grid;place-items:center;flex:none}
.list{border:1px solid #E2E6EA;border-radius:16px;overflow:hidden}.li{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 14px;border-top:1px solid #E2E6EA;font-size:calc(15px*var(--fs))}.li:first-child{border-top:0}
.li .n{flex:1;font-weight:600;min-width:0}.li .n small{display:block;font-weight:400;font-size:calc(13px*var(--fs));color:#5B6670;margin-top:1px}
.li .v{font-size:calc(14px*var(--fs));color:#5B6670;font-weight:600}.li .v.ok{color:#006630}.li .ch{color:#AEB6BD}
.dd{width:36px;height:36px;border-radius:50%;background:#F6F7F8;display:grid;place-items:center;color:#5B6670;flex:none}.dd.ok{background:#E9F8EF;color:#006630}.dd.bad{background:#FAEDEB;color:#8F2418}.dd.vi{background:#ECE8FF;color:#4B2FBF}
.stp{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;flex:none;font-size:13px;font-weight:700}.stp.d{background:#00B14F;color:#fff}.stp.o{border:1.5px solid #E2E6EA;color:#5B6670}.stp.a{border:3px solid #E9F8EF;border-top-color:#00B14F}
.pill{min-height:32px;white-space:nowrap;padding:0 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;font-size:calc(13px*var(--fs));font-weight:600;font-family:inherit;border:0}
.pill.b{min-height:44px;padding:0 18px;font-size:calc(14px*var(--fs));background:#E9F8EF;color:#006630}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.chips .pill{background:#F6F7F8}.chips .ic{color:#006630}
.box{margin-top:16px;border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;font-size:calc(14px*var(--fs));line-height:1.4}
.box.ok{background:#E9F8EF;color:#006630;font-weight:600}.box.bad{background:#FAEDEB;color:#8F2418}.box.n{background:#F6F7F8;color:#14181B}
.tg{width:44px;height:26px;border-radius:999px;background:#00B14F;position:relative;flex:none}.tg::after{content:"";position:absolute;width:20px;height:20px;border-radius:50%;background:#fff;top:3px;right:3px}.tg.off{background:#E2E6EA}.tg.off::after{right:auto;left:3px}
.dim{position:absolute;inset:0;background:rgba(20,24,27,.45);z-index:5}
.sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;padding:8px 16px 16px;z-index:6}.grab{width:36px;height:4px;border-radius:2px;background:#E2E6EA;margin:0 auto 16px}
.ntf{background:#fff;border-radius:16px;padding:10px 12px;display:flex;gap:10px;align-items:center;width:268px;box-shadow:0 0 0 1px rgba(20,24,27,.06);text-align:left}
.ntf .lg{width:28px;height:28px;border-radius:8px;background:#00B14F;display:grid;place-items:center;color:#fff;flex:none}
.ntf b{display:block;font-size:13px}.ntf span{font-size:12px;color:#5B6670;line-height:1.35}
.fld{min-height:52px;border:1px solid #E2E6EA;border-radius:12px;padding:0 14px;display:flex;align-items:center;font-size:calc(16px*var(--fs))}.fld.on{border:2px solid #00B14F}.fld.err{border:2px solid #C0392B}
.caret{width:2px;height:20px;background:#00B14F;margin-left:1px}
.flab{font-size:calc(13px*var(--fs));font-weight:600;color:#5B6670;margin:0 2px 6px}.fhelp{font-size:calc(13px*var(--fs));color:#5B6670;margin:8px 2px 0;line-height:1.4}.fhelp.err{color:#8F2418;font-weight:600;display:flex;gap:6px;align-items:center}
.top{height:56px;margin-top:24px;display:flex;align-items:center;gap:8px;padding:0 12px;flex:none}.top .bk{width:44px;height:44px;border-radius:50%;background:#F6F7F8;display:grid;place-items:center}.top b{font-size:17px}
.big{font-size:calc(30px*var(--fs));font-weight:700;letter-spacing:-.025em;padding:4px 16px 0;flex:none}
.tries{display:flex;gap:6px}.tries i{width:28px;height:6px;border-radius:3px;background:#00B14F}.tries i.u{background:#E2E6EA}
.toast{position:absolute;left:16px;right:16px;bottom:96px;background:#063B22;color:#fff;border-radius:14px;padding:14px 16px;display:flex;gap:10px;align-items:center;font-size:14px;font-weight:600;z-index:7}
.toast .ic{color:#00B14F}
.mk{position:relative;width:64px;height:64px;border-radius:50%;background:#E9F8EF;color:#00B14F;display:grid;place-items:center;margin:0 auto}.mk::before{content:"";position:absolute;inset:-12px;border-radius:50%;border:1px solid #E9F8EF}.mk::after{content:"";position:absolute;width:8px;height:8px;border-radius:50%;background:#FFD23F;top:4px;right:2px;box-shadow:0 0 0 3px #fff}
/* Android 14 system dialogs (system colours, not tokens) */
.adlg{position:absolute;left:24px;right:24px;top:50%;transform:translateY(-50%);background:#ECEFF1;border-radius:28px;padding:24px;z-index:8;font-family:Roboto,Inter,sans-serif;color:#1B1B1F}
.adlg .ai{color:#3F51B5;display:flex;justify-content:center}.adlg h4{font-size:18px;font-weight:500;text-align:center;margin:16px 0 20px;line-height:1.3}
.apick{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}.apick div{text-align:center;font-size:13px;font-weight:500}
.apick span{display:block;width:88px;height:88px;border-radius:50%;margin:0 auto 8px;background:#DCE3EA;position:relative;border:2px solid transparent}.apick .on span{border-color:#3F51B5}
.apick span::after{content:"";position:absolute;inset:34px;border-radius:50%;background:#3F51B5}.apick .ap span::after{inset:14px;background:rgba(63,81,181,.25)}
.abtn{display:block;text-align:center;background:#D3DCF5;color:#1B1B1F;border-radius:999px;height:44px;line-height:44px;font-size:14px;font-weight:500;margin-top:8px}
/* board, splash */
.rh{background:#ECE8FF;border-radius:0 0 28px 28px;padding:28px 16px 16px;position:relative;overflow:hidden;flex:none}.rh::before{content:"";position:absolute;right:-70px;top:-70px;width:150px;height:150px;border-radius:50%;background:#FFD23F}
.rh>*{position:relative}.on{display:inline-flex;gap:8px;align-items:center;height:44px;padding:0 6px 0 16px;border-radius:999px;background:#fff;font-weight:600;font-size:14px}
.job{border:1px solid #E2E6EA;border-radius:16px;padding:14px;margin-top:10px}.job b{font-size:18px}.job div{font-size:13px;color:#5B6670;margin-top:2px}
.sp{background:#00B14F;position:relative;overflow:hidden}.sp .sun{position:absolute;width:220px;height:220px;border-radius:50%;background:#FFD23F;right:-70px;top:-60px}
.sp .orb{position:absolute;width:300px;height:300px;border-radius:50%;border:1.5px solid rgba(255,255,255,.25);right:-110px;top:-100px}
.wm{position:absolute;left:0;right:0;text-align:center;font-family:Fredoka,Inter,sans-serif;font-weight:600;font-size:44px;color:#fff;letter-spacing:-.01em}
.spc{position:absolute;left:16px;right:16px;background:#fff;border-radius:20px;padding:6px 14px}.spc .li{min-height:48px;padding:6px 0}
.navb{position:absolute;left:0;right:0;bottom:0;height:48px;background:#00A048;display:flex;justify-content:space-around;align-items:center}.navb i{width:16px;height:16px;border:2px solid rgba(255,255,255,.8);border-radius:3px}.navb i:nth-child(2){border-radius:50%}
.gest{position:absolute;left:0;right:0;bottom:0;height:20px;display:grid;place-items:center}.gest i{width:108px;height:4px;border-radius:2px;background:rgba(255,255,255,.85)}
.kb{flex:none;height:236px;background:#E8EAED;display:grid;grid-template-rows:repeat(4,1fr);gap:8px;padding:10px 6px}.kb div{display:flex;gap:6px}.kb span{flex:1;background:#fff;border-radius:6px}
`;
document.head.insertAdjacentHTML('beforeend',`<style>${css}</style>`);
const P={globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',doc:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',cash:'<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/>',nav:'<path d="M3 11 22 2l-9 19-2-8-8-2z"/>',pin:'<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',belloff:'<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
check:'<path d="M20 6 9 17l-5-5"/>',clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
id:'<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
cam:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
chat:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
bike:'<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
chev:'<path d="m9 18 6-6-6-6"/>',back:'<path d="m15 18-6-6 6-6"/>',arrow:'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
vol:'<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.7"/>',
mute:'<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
power:'<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
pkg:'<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
lock:'<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',wifioff:'<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
alert:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',img:'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
bat:'<rect width="16" height="10" x="2" y="7" rx="2"/><path d="M22 11v2"/><path d="M6 11v2"/>',home:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6a2 2 0 0 1 .7 1.5v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>'};
const I=(n,c='')=>`<svg class="ic ${({s:'i16',m:'i20',l:'i40'})[c.split(' ')[0]]||''} ${c.split(' ').slice(1).join(' ')}" viewBox="0 0 24 24">${P[n]||''}</svg>`;
const K={I,
cell:(id,lbl,inner,o={})=>`<div class="cell" data-id="${id}"><div class="lbl"><i>${id}</i>${lbl}</div><div class="f ${o.c||''}" style="width:${o.w||360}px;height:${o.h||720}px"><div class="sb"><span>9:41</span><span>3G 84%</span></div>${inner}</div></div>`,
sec:(h,s)=>`<div class="sec"><h2>${h}</h2><span>${s}</span></div>`,
hero:(tone,inner,h)=>`<div class="hero ${tone}"${h?` style="height:${h}px"`:''}>${inner}</div>`,
disc:(n,st='')=>`<span class="disc"${st?` style="${st}"`:''}>${I(n,'l')}</span>`,
t:(a,b,tone='')=>`<div class="t">${a} <em class="${tone}">${b}</em></div>`,
s:x=>`<div class="s">${x}</div>`,
ft:(...b)=>`<div class="ft">${b.join('')}</div>`,
cta:(x,ic)=>`<button class="cta">${ic?I(ic,'m'):''}${x}</button>`,
gh:(x,ic)=>`<button class="gh">${ic?I(ic,'m'):''}${x}</button>`,
lk:(x,ic,c='')=>`<button class="lk"${c?` style="color:${c}"`:''}>${ic?I(ic,'s'):''}${x}</button>`,
top:(x='')=>`<div class="top"><span class="bk">${I('back')}</span>${x?`<b>${x}</b>`:''}</div>`,
steps:(a,b,c)=>`<div class="list" style="margin-top:16px"><div class="li"><span class="stp o">1</span><span class="n">${a}</span></div><div class="li"><span class="stp o">2</span><span class="n">${b}</span></div><div class="li"><span class="stp o">3</span><span class="n">${c}</span></div></div>`,
kyc:(st,label)=>{const K2=window.KY;const s2=st==='a'?`<span class="stp a"></span><span class="n" style="color:#006630">${K2.s2}</span><span class="v">${label}</span>`:st==='n'?`<span class="stp o" style="border-color:#00B14F;color:#006630">2</span><span class="n">${K2.s2}</span><span class="v">${label}</span>`:`<span class="stp d">${I('check','s')}</span><span class="n">${K2.s2}</span><span class="v ok">${K2.done}</span>`;
return `<div class="list" style="margin-top:20px"><div class="li"><span class="stp d">${I('check','s')}</span><span class="n">${K2.s1}</span><span class="v ok">${K2.done}</span></div><div class="li">${s2}</div><div class="li"><span class="stp o">3</span><span class="n">${K2.s3}</span></div></div>`},
locDialog:(sel='p')=>`<div class="dim"></div><div class="adlg"><div class="ai">${I('pin')}</div><h4>Allow LyniaGo to access this device’s location?</h4><div class="apick"><div class="${sel==='p'?'on':''}"><span></span>Precise</div><div class="ap ${sel==='a'?'on':''}"><span></span>Approximate</div></div><span class="abtn">While using the app</span><span class="abtn">Only this time</span><span class="abtn">Don’t allow</span></div>`,
notifDialog:()=>`<div class="dim"></div><div class="adlg"><div class="ai">${I('bell')}</div><h4>Allow LyniaGo to send you notifications?</h4><span class="abtn">Allow</span><span class="abtn">Don’t allow</span></div>`,
ntf:(ic,b,s,st='')=>`<div class="ntf" style="${st}"><span class="lg">${I(ic,'s')}</span><div><b>${b}</b><span>${s}</span></div></div>`,
homeHd:(noloc)=>`<div style="background:#E9F8EF;border-radius:0 0 28px 28px;position:relative;overflow:hidden;padding:30px 16px 18px;flex:none"><span style="position:absolute;width:150px;height:150px;border-radius:50%;background:#FFD23F;right:-62px;top:-58px"></span><span style="position:absolute;width:26px;height:26px;border-radius:50%;background:#FF6B4A;right:78px;top:64px"></span><span style="position:absolute;width:14px;height:14px;border-radius:50%;background:#3EC1F3;right:30px;top:112px"></span><div style="position:relative;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:11px;font-weight:600;color:#5B6670;letter-spacing:.2px">${noloc?'NO ADDRESS YET':'DELIVERING TO'}</div><div style="display:flex;gap:4px;align-items:center;font-weight:700;font-size:15px;color:${noloc?'#8F2418':'#14181B'};margin-top:2px"><span style="color:${noloc?'#C0392B':'#00B14F'}">${I('pin','s')}</span>${noloc?'Set your location':'12 Samora Machel Ave'}<span style="transform:rotate(90deg)">${I('chev','s')}</span></div></div><span style="width:44px;height:44px;border-radius:50%;background:#fff;display:grid;place-items:center;color:#006630">${I('bell','m')}</span></div><div style="position:relative;font-size:24px;line-height:1.15;font-weight:700;letter-spacing:-.4px;margin-top:10px">Good morning, <span style="color:#006630">Rudo</span></div><div style="position:relative;margin-top:12px;height:48px;border-radius:12px;background:#fff;display:flex;gap:8px;align-items:center;padding:0 14px;color:#5B6670;font-size:14px">${I('search','m')}Search food, shops or parcels</div></div>`,
tiles:()=>`<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:16px 16px 0;flex:none">${[['send','Send','#CDEEDA'],['restaurants','Restaurants','#FFD9CC'],['shops','Shops','#DDD5FF'],['pharmacy','Pharmacy','#C5E9DF']].map(([k,n,c])=>`<div style="text-align:center;font-size:12px;font-weight:600;letter-spacing:-.2px;min-width:0"><div style="height:76px;border-radius:16px;background:${c};display:grid;place-items:center;margin-bottom:6px"><img src="assets/service-icons/v2/${k}.svg" alt="" style="width:54px;height:54px"></div>${n}</div>`).join('')}</div>`
};
window.K=K;
})();
