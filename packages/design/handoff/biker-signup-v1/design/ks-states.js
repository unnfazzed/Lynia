(function(){
const {I,cell,sec,hero,disc,t,s,ft,cta,lk,kyc}=K;const S=KS;
document.head.insertAdjacentHTML('beforeend',`<style>
.hs{height:168px}.sm .hs{height:124px}.fs13 .hs{height:136px}
.sh{height:56px;margin-top:24px;display:flex;align-items:center;gap:10px;padding:0 12px;flex:none}.sm .sh{margin-top:20px}
.sh .bk{width:44px;height:44px;border-radius:50%;background:#F6F7F8;display:grid;place-items:center;flex:none}
.bars{flex:1;display:flex;gap:4px;min-width:0}.bars i{flex:1;height:6px;border-radius:3px;background:#E2E6EA}.bars i.d{background:#00B14F}
.sh .of{font-size:calc(14px*var(--fs));font-weight:600;color:#5B6670;white-space:nowrap}
.pb{padding-top:8px}
.ph{background:repeating-linear-gradient(135deg,#E9F8EF 0 10px,#DDF2E5 10px 20px);display:grid;place-items:center;font:12px ui-monospace,Menlo,monospace;color:#5B6670;border-radius:16px}
.idv{font-size:calc(20px*var(--fs));font-weight:600;letter-spacing:.04em;white-space:nowrap}
.fld.on{display:flex;height:auto;min-height:52px;padding:0 14px;border-radius:12px;background:#fff;font-weight:inherit}
.kb2{flex:none;height:300px;background:#E8EAED;display:flex;flex-direction:column;gap:7px;padding:4px 5px 10px}.sm .kb2{height:270px}
.kb2 .sg{height:34px;display:flex;justify-content:space-around;align-items:center;font-size:14px;color:#5B6670;flex:none;white-space:nowrap}
.kb2 .r{flex:1;display:flex;gap:5px}.kb2 .r span{flex:1;background:#fff;border-radius:6px;display:grid;place-items:center;font-size:15px;color:#14181B}
.kb2 .r span.w{flex:4}.kb2 .r span.g{background:#D2D5DB;flex:1.4;font-size:12px;font-weight:600}.kb2 .r.i{padding:0 14px}
.cam{position:absolute;inset:0;background:#14181B;color:#fff;display:flex;flex-direction:column;align-items:center}
.cam .xb{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.12);display:grid;place-items:center}
.cam .ttl{font-size:calc(22px*var(--fs));font-weight:700;letter-spacing:-.02em;text-align:center;padding:0 24px;text-wrap:balance;margin-top:16px}
.hint{min-height:36px;padding:0 14px;border-radius:999px;background:rgba(255,255,255,.14);display:inline-flex;align-items:center;gap:6px;font-size:calc(14px*var(--fs));font-weight:600}
.shut{width:76px;height:76px;border-radius:50%;border:4px solid #fff;display:grid;place-items:center}.shut i{width:58px;height:58px;border-radius:50%;background:#fff}
.gal{min-height:44px;padding:0 14px;border-radius:999px;background:rgba(255,255,255,.12);display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:#fff;justify-self:start}
.th{width:52px;height:40px;border-radius:6px;flex:none;font-size:0}
.tag{font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;background:#E9F8EF;color:#006630}
.dis{background:#E2E6EA;color:#5B6670}
.bar4{height:4px;border-radius:2px;background:#E2E6EA;margin-top:10px}.bar4 i{display:block;height:4px;border-radius:2px;background:#00B14F}
.l5 .li{min-height:48px;padding:6px 14px}.li.bad{background:#FAEDEB}.li.bad .n,.li.bad .v{color:#8F2418}
</style>`);
const ex=`<span class="ex">${I('x','m')}</span>`;
const b=x=>`<div class="body">${x}</div>`,pb=x=>`<div class="body pb">${x}</div>`;
const tt=(a,bb,tone='',mt)=>t(a,bb,tone).replace('class="t"',`class="t"${mt!=null?` style="margin-top:${mt}px"`:''}`);
const hdr=(n,tot=5,lbl=`${n} ${S.of} ${tot}`)=>`<div class="sh"><span class="bk">${I('back')}</span><div class="bars">${Array.from({length:tot},(_,i)=>`<i class="${i<n?'d':''}"></i>`).join('')}</div><span class="of">${lbl}</span><span class="bk">${I('x','m')}</span></div>`;
const chips=a=>`<div class="chips">${a.map(([i,x])=>`<span class="pill">${I(i,'s')}${x}</span>`).join('')}</div>`;
const soft=x=>`<button class="pill b" style="padding:0 16px">${x}</button>`;
const done=`<span class="disc" style="background:#00B14F;color:#fff">${I('check','l')}</span>`;
// keyboard (system, ~300 at 360×720)
const kbF=(sg=['63-','63-48','63-4829'])=>{const r=(keys,c='')=>`<div class="r ${c}">${keys.map(k=>`<span class="${k.length>1&&k!=='?123'?'g':k==='?123'?'g':''}">${k}</span>`).join('')}</div>`;
return `<div class="kb2"><div class="sg">${sg.map(x=>`<span>${x}</span>`).join('')}</div>${r('1234567890'.split(''))}${r('QWERTYUIOP'.split(''))}${r('ASDFGHJKL'.split(''),'i')}<div class="r"><span class="g">${I('arrow','s').replace('viewBox','style="transform:rotate(-90deg)" viewBox')}</span>${'ZXCVBNM'.split('').map(k=>`<span>${k}</span>`).join('')}<span class="g">${I('x','s')}</span></div><div class="r"><span class="g">?123</span><span>,</span><span class="w"></span><span>.</span><span class="g">Done</span></div></div>`};const kb=kbF();
// tips
const T={light:['sun',S.tipLight],corners:['id',S.tipCorners],glare:['x',S.tipGlare],helmet:['user',S.tipHelmet],idface:['id',S.tipIdFace]};
const DOCS={2:{step:2,ic:'id',a:S.docA,b:S.docB,body:S.guideDoc,tips:[T.light,T.corners,T.glare],ph:'id card photo',cta:S.takePhoto},
3:{step:4,ic:'id',a:S.licA,b:S.licB,body:S.guideDoc,tips:[T.light,T.corners,T.glare],ph:'licence photo',cta:S.takePhoto},
4:{step:5,ic:'user',a:S.selA,b:S.selB,body:S.guideSelfie,tips:[T.light,T.helmet,T.idface],ph:'selfie with ID',cta:S.takeSelfie,selfie:1}};
const guide=(n,o={})=>{const d=DOCS[n];return hdr(o.redo?1:d.step,o.redo?1:5,o.redo?`1 ${S.fix}`:undefined)+pb(hero('hs',disc(d.ic==='user'?'user':'id'))+t(d.a,d.b)+s(d.body)+chips(d.tips))+ft(cta(d.cta,'cam'),lk(S.gallery,'img'))};
// camera
const camTop=n=>`<div style="align-self:stretch;display:flex;justify-content:space-between;align-items:center;padding:32px 12px 0"><span class="xb">${I('x')}</span><span style="font-size:13px;font-weight:600;color:rgba(255,255,255,.75)">${n} ${S.of} 5</span><span style="width:44px"></span></div>`;
const camBot=`<div style="align-self:stretch;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 16px 28px"><span class="gal">${I('img','s')}${S.galleryShort}</span><span class="shut"><i></i></span><span></span></div>`;
const hintP=(ic,x,ok)=>`<span class="hint"${ok?' style="background:#00B14F;color:#fff"':''}>${I(ic,'s')}${x}</span>`;
const camDoc=(n,hint)=>`<div class="cam">${camTop(DOCS[n].step)}<div class="ttl">${S.camDoc}</div><div style="flex:1;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px"><div style="width:84%;aspect-ratio:1.586;border-radius:16px;border:3px ${hint==='ok'?'solid #00B14F':'dashed rgba(255,255,255,.7)'};display:grid;place-items:center;font:12px ui-monospace,monospace;color:rgba(255,255,255,.5)">live camera</div>${hint==='ok'?hintP('check',S.hintStill,1):hint==='dark'?hintP('sun',S.hintDark):hintP('search',S.hintCloser)}</div>${camBot}</div>`;
const camSelfie=hint=>`<div class="cam">${camTop(5)}<div class="ttl">${S.camSelfie}</div><div style="flex:1;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px"><div style="position:relative;width:240px;height:250px;max-width:80%"><div style="position:absolute;left:0;top:0;width:170px;height:230px;border-radius:50%;border:3px ${hint==='ok'?'solid #00B14F':'dashed rgba(255,255,255,.7)'}"></div><div style="position:absolute;right:0;bottom:0;width:92px;height:58px;border-radius:8px;border:3px ${hint==='ok'?'solid #00B14F':'dashed rgba(255,255,255,.7)'};display:grid;place-items:center;color:rgba(255,255,255,.6)">${I('id','m')}</div></div>${hint==='ok'?hintP('check',S.hintStill,1):hintP('id',S.guideSelfie)}</div>${camBot}</div>`;
// preview / uploading / failed
const photo=(d,pct)=>(d.selfie?`<div class="ph" style="width:min(200px,60%);aspect-ratio:5/6;margin:8px auto 0">${d.ph}</div>`:`<div class="ph" style="width:100%;aspect-ratio:1.586;margin-top:8px">${d.ph}</div>`)+(pct!=null?`<div class="bar4" style="${d.selfie?'width:min(200px,60%);margin-left:auto;margin-right:auto':''}"><i style="width:${pct}%"></i></div>`:'');
const prev=(n,st='',o={})=>{const d=DOCS[n];const h=o.redo?hdr(1,1,`1 ${S.fix}`):hdr(d.step);
const ttl=d.selfie?t(S.prevSelA,S.prevSelB):t(S.prevA,S.prevB),bd=d.selfie?S.prevSelBody:S.prevBody;
if(st==='up')return h+pb(photo(d,62)+t(S.upA,S.upB)+s(S.sendingBody))+ft(`<button class="cta dis">${S.sending} 62%</button>`);
if(st==='fail')return h+pb(photo(d)+`<div class="box bad">${I('alert','m')}<span>${S.failBox}</span></div>`)+ft(cta(S.retry,'refresh'),lk(S.retake,'cam'));
return h+pb(photo(d)+ttl+s(bd))+ft(cta(S.use),lk(S.retake,'refresh'))};
// typed numbers: ID (step 1) and licence (step 3) share one page
const NUM={id:{step:1,a:S.idA,b:S.idB,body:S.idBody,label:S.idLabel,ph:S.idPh,sg:['63-','63-48','63-4829']},ln:{step:3,a:S.lnA,b:S.lnB,body:S.lnBody,label:S.lnLabel,ph:S.lnPh,sg:['48','4829','482913']}};
const idFld=(cls,val,o={})=>`<div class="flab">${o.N.label}</div><div class="fld ${cls} idv"${val?'':' style="color:#AEB6BD;font-weight:400;letter-spacing:0"'}>${val||o.N.ph}${o.caret?`<span class="caret"${cls==='err'?' style="background:#C0392B"':''}></span>`:''}</div>`;
const k1=({f='id',kb:k,cls='',val='',caret,help='',c=cta(S.next,'arrow'),l='',h}={})=>{const N=NUM[f];return (h||hdr(N.step))+pb((k?'':hero('hs',disc('id')))+tt(N.a,N.b,'',k?4:undefined)+s(N.body)+`<div style="margin-top:20px">${idFld(cls,val,{caret,N})}</div>${help}`)+ft(c,l)+(k?kbF(N.sg):'')};
const errF=m=>`<div class="fhelp err">${I('alert','s')}${m}</div>`,errH=errF(S.idErr);
const dupF=(a,bd)=>`<div class="box bad" style="align-items:flex-start">${I('alert','m')}<div><b>${a}</b><div style="color:#14181B;margin-top:2px">${bd}</div></div></div>`,dupH=dupF(S.dupA,S.dupBody);
const okH=`<div class="fhelp" style="display:flex;gap:6px;align-items:center;color:#006630;font-weight:600">${I('check','s')}${S.looksRight}</div>`;
// check & send
const row=(th,name,sub,r,c='')=>`<div class="li ${c}">${th}<span class="n">${name}${sub?`<small>${sub}</small>`:''}</span>${r}</div>`;
const thumb=`<span class="ph th">.</span>`;
const subOk=x=>`<span style="display:flex;gap:4px;align-items:center;color:#006630;font-weight:600">${I('check','s')}${x}</span>`;
const numRow=(name,v)=>row(`<span class="dd ok">${I('id','m')}</span>`,name,`<span class="idv" style="font-size:calc(15px*var(--fs));color:#14181B;font-weight:600">${v}</span>`,soft(S.edit));
const k5=({replacing,redo}={})=>(redo?hdr(1,1,`1 ${S.fix}`):hdr(5,5,S.checkA))+pb(tt(S.checkA,S.checkB,'',4)+s(S.checkBody)+`<div class="list" style="margin-top:20px">${numRow(S.st1,'63-482913K07')}${row(thumb,S.st2,redo?`<span class="tag">${S.newTag}</span>`:'',soft(S.retake))}${numRow(S.st3,'482913AB')}${replacing?row(thumb,S.st4,`<span class="bar4" style="display:block;margin-top:6px"><i style="width:40%"></i></span>`,`<span class="v">${S.sending}</span>`):row(thumb,S.st4,'',soft(S.retake))}${row(thumb,S.st5,'',soft(S.retake))}</div>`)+ft(replacing?`<button class="cta dis">${S.sendCta}</button>`:cta(redo?S.sendAgain:S.sendCta));
// board 5-step list
const mk={d:`<span class="stp d">${I('check','s')}</span>`,o:n=>`<span class="stp o">${n}</span>`,n:n=>`<span class="stp o" style="border-color:#00B14F;color:#006630">${n}</span>`,bad:`<span class="stp" style="background:#fff;color:#8F2418">${I('alert','s')}</span>`};
const list4=st=>`<div class="list l5" style="margin-top:16px">${[S.st1,S.st2,S.st3,S.st4,S.st5].map((nm,i)=>{const [k,v]=st[i];const m=k==='d'?mk.d:k==='bad'?mk.bad:mk[k](i+1);const vc=k==='d'?'v ok':'v';const nc=k==='n'?' style="color:#006630"':'';return `<div class="li${k==='bad'?' bad':''}">${m}<span class="n"${nc}>${nm}</span>${v?`<span class="${vc}">${v}</span>`:''}</div>`}).join('')}</div>`;
const allOk=[['d',S.ok],['d',S.ok],['d',S.ok],['d',S.ok],['d',S.ok]];
const decl=(ic,a,bb,body,badIx,c)=>ex+b(hero('r hs',disc(ic))+t(a,bb,'rd')+s(body)+list4(allOk.map((x,i)=>[].concat(badIx).includes(i)?['bad',S.redo]:x)))+ft(cta(c,'cam'),lk(S.help,'chat'));
// screens
const R1=()=>`<div style="background:#E9F8EF;padding:36px 16px 16px;display:flex;align-items:center;gap:12px;flex:none"><div style="flex:1;min-width:0"><div style="font-size:20px;font-weight:700;letter-spacing:-.02em;white-space:nowrap">Good morning, Tendai</div><div style="display:flex;gap:4px;align-items:center;font-size:13px;margin-top:4px;color:#006630;font-weight:600">${I('pin','s')}12 Samora Machel Ave</div></div><span style="width:28px;height:28px;border-radius:50%;background:#FFD23F;box-shadow:0 0 0 5px rgba(255,210,63,.35);flex:none"></span><span style="width:44px;height:44px;border-radius:50%;background:#fff;display:grid;place-items:center;color:#006630;flex:none">${I('bell','m')}</span></div>`+b(`<div style="display:flex;gap:12px;align-items:center;margin:-16px 4px 16px"><span class="dd ok" style="width:52px;height:52px;font-weight:700;font-size:18px">TM</span><div><div style="font-weight:700;font-size:17px">Tendai Moyo</div><div style="font-size:14px;color:#5B6670">+263 77 245 1180</div></div></div><div style="position:relative;overflow:hidden;border-radius:24px;background:#ECE8FF;padding:20px"><span style="position:absolute;right:-40px;top:-40px;width:120px;height:120px;border-radius:50%;background:#FFD23F"></span><span style="position:absolute;right:70px;top:24px;width:14px;height:14px;border-radius:50%;background:#FF6B4A"></span><div style="position:relative;font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1.15">${S.becomeA}<br><span style="color:#4B2FBF">${S.becomeB}</span></div><div style="position:relative;font-size:14px;color:#5B6670;margin-top:6px">${S.becomeBody}</div><button class="cta" style="margin-top:16px">${S.becomeCta}${I('arrow','m')}</button></div>`);
const k0=()=>ex+b(hero('hs',disc('id'))+t(S.introA,S.introB)+s(S.introBody)+list4([['n',''],['o',''],['o',''],['o',''],['o','']])+`<div class="fhelp" style="display:flex;gap:6px;align-items:center;margin:12px 4px 0">${I('lock','s')}${S.privacy}</div>`)+ft(cta(S.start,'arrow'));
const bHalf=()=>ex+b(hero('hs',disc('id'))+t(S.halfA,'Tendai')+s(S.halfBody)+list4([['d',S.doneTag],['d',S.doneTag],['n',S.nextTag],['o',''],['o','']]))+ft(cta(S.cont,'arrow'));
const blocked=()=>hdr(2)+pb(hero('r hs',disc('cam'))+t(S.blockA,S.blockB,'rd')+s(S.blockBody)+K.steps(S.bStep1,S.bStep2,S.bStep3))+ft(cta(S.openSettings),lk(S.gallery,'img'));
const k6=()=>ex+b(hero('',done)+t(S.sentA,S.sentB)+s(S.sentBody)+kyc('a','In review'))+ft(cta(S.done));
const bWait=()=>ex+b(hero('',disc('clock'))+t(KY.reviewA,KY.reviewB)+s(KY.reviewBody)+kyc('a','In review'));
const r3=()=>ex+b(hero('',done)+t(S.okA,S.okB)+s(S.okBody))+ft(cta(S.okCta,'arrow'));
const x1=()=>ex+b(hero('',disc('user'))+t(S.x1A,S.x1B)+s(S.x1Body))+ft(cta(S.takePhoto,'cam'),lk(S.gallery,'img'),lk(S.skip));
const plate=(cls,val,caret,help)=>`<div style="margin-top:20px"><div class="flab">${S.x2Label}</div><div class="fld ${cls}" style="font-weight:600;letter-spacing:.06em${val?'':';color:#AEB6BD'}">${val||S.x2Ph}${caret?`<span class="caret"${cls==='err'?' style="background:#C0392B"':''}></span>`:''}</div>${help}</div>`;
const x2=({kb:k,cls='',val='',caret,help=`<div class="fhelp">${S.x2Help}</div>`}={})=>ex+b((k?'':hero('hs',disc('bike')))+tt(S.x2A,S.x2B,'',k?64:undefined)+plate(cls,val,caret,help))+ft(cta(S.savePlate),lk(S.skip))+(k?kbF(['ABZ','ABZ 4','ABZ 44']):'');
const plErr=`<div class="fhelp err">${I('alert','s')}${S.x2Err}</div>`;

const F={
'R1':['Account · earn with your bike',R1],
'K0':['What you’ll need · also the board before anything is sent',k0],
'K1':['ID number · empty',()=>k1()],
'K1-kb':['ID number · keyboard up',()=>k1({kb:1,cls:'on',val:'63-4829',caret:1})],
'K1-done':['ID number · typed, stays visible',()=>k1({val:'63-482913K07',help:okH})],
'K1-err-kb':['ID number · format error',()=>k1({kb:1,cls:'err',val:'63-48291',caret:1,help:errH})],
'K1-dup':['ID number · on another account',()=>k1({cls:'err',val:'63-482913K07',help:dupH,c:cta(S.dupCta,'chat'),l:lk(S.dupAlt)})],
'K2-guide':['ID card · guide',()=>guide(2)],
'K2-cam':['ID card · camera, ready',()=>camDoc(2,'ok'),{c:'dark'}],
'K2-cam-hint':['ID card · camera, live hint',()=>camDoc(2,'dark'),{c:'dark'}],
'K2-prev':['ID card · preview',()=>prev(2)],
'K2-up':['ID card · sending',()=>prev(2,'up')],
'K2-fail':['ID card · send failed, kept on phone',()=>prev(2,'fail')],
'K-blocked':['Camera turned off for good',blocked],
'K3-num':['Licence number · empty',()=>k1({f:'ln'})],
'K3-num-kb':['Licence number · keyboard up',()=>k1({f:'ln',kb:1,cls:'on',val:'4829',caret:1})],
'K3-num-done':['Licence number · typed, stays visible',()=>k1({f:'ln',val:'482913AB',help:okH})],
'K3-num-err-kb':['Licence number · not valid',()=>k1({f:'ln',kb:1,cls:'err',val:'48',caret:1,help:errF(S.lnErr)})],
'K3-num-dup':['Licence number · on another account',()=>k1({f:'ln',cls:'err',val:'482913AB',help:dupF(S.lnDupA,S.lnDupBody),c:cta(S.dupCta,'chat'),l:lk(S.dupAlt)})],
'K3-guide':['Licence photo · guide',()=>guide(3)],
'K3-cam':['Licence photo · camera',()=>camDoc(3,'closer'),{c:'dark'}],
'K3-prev':['Licence photo · preview',()=>prev(3)],
'K3-up':['Licence photo · sending',()=>prev(3,'up')],
'K3-fail':['Licence photo · send failed',()=>prev(3,'fail')],
'K4-guide':['Selfie · guide',()=>guide(4)],
'K4-cam':['Selfie · front camera',()=>camSelfie('ok'),{c:'dark'}],
'K4-prev':['Selfie · preview',()=>prev(4)],
'K4-up':['Selfie · sending',()=>prev(4,'up')],
'K4-fail':['Selfie · send failed',()=>prev(4,'fail')],
'K5':['Check & send',()=>k5()],
'K5-replace':['Check & send · one photo being replaced',()=>k5({replacing:1})],
'K6':['Sent',k6],
'B-wait':['Board · waiting (F1, unchanged)',bWait],
'B-todo-half':['Board · half done (resume)',bHalf],
'B-decl-photo':['Declined · photos unreadable',()=>decl('cam',S.dPhotoA,S.dPhotoB,S.dPhotoBody,1,S.dPhotoCta)],
'B-decl-licence':['Declined · licence expired',()=>decl('id',S.dLicA,S.dLicB,S.dLicBody,[2,3],S.dLicCta)],
'B-decl-selfie':['Declined · selfie unclear',()=>decl('user',S.dSelA,S.dSelB,S.dSelBody,4,S.dSelCta)],
'K-redo':['Re-entry · only the step to fix',()=>guide(2,{redo:1})],
'K-redo-licence':['Re-entry · licence, 1 of 2 to fix',()=>k1({f:'ln',h:hdr(1,2,`1 ${S.of} 2 ${S.fix}`)})],
'K5-redo':['Re-entry · send again',()=>k5({redo:1})],
'R3':['Approved (R3)',r3],
'X1':['Optional · rider photo',x1],
'X2':['Optional · bike plate',()=>x2()],
'X2-kb':['Optional · plate, keyboard up',()=>x2({kb:1,cls:'on',val:'ABZ 44',caret:1})],
'X2-err-kb':['Optional · plate error',()=>x2({kb:1,cls:'err',val:'AB 44',caret:1,help:plErr})]
};
const sm={w:320,h:640,c:'sm'},fs={c:'fs13'};
const H=[];const add=(id,o)=>{const [l,fn,oo]=F[id];H.push(cell(id,l,fn(),oo||{}))};
const addV=(id,v,o)=>{const [l,fn,oo]=F[id];H.push(cell(`${id}·${v}`,l,fn(),{...(oo||{}),...o,c:((oo&&oo.c)||'')+' '+o.c}))};
H.push(`<div class="intro"><h1>Biker sign-up · manual review</h1><p>R1 → K0 → K1 ID number → K2 ID card → K3 licence number → K3 licence photo → K4 selfie → K5 check &amp; send → K6 sent → B-wait. One thing per screen; the bars count only the 5 required steps. Gallery always allowed. Leaving keeps progress.</p></div>`);
const grp=(h,sub,ids)=>{H.push(sec(h,sub));ids.forEach(add)};
grp('A · Entry','From Account, a short promise and the 5 steps',['R1','K0','B-todo-half']);
grp('B · ID number · step 1','One field. Formats as you type, stays visible. Hero hides when the keyboard is up',['K1','K1-kb','K1-done','K1-err-kb','K1-dup']);
grp('C · ID card (front) · step 2','Guide → camera (live hint, manual shutter always on) → preview → sending → failed',['K2-guide','K2-cam','K2-cam-hint','K2-prev','K2-up','K2-fail','K-blocked']);
grp('D · Driver’s licence · steps 3–4','Number typed on the same page as the ID number, then the photo. Expiry is read off the photo',['K3-num','K3-num-kb','K3-num-done','K3-num-err-kb','K3-num-dup','K3-guide','K3-cam','K3-prev','K3-up','K3-fail']);
grp('E · Selfie holding your ID · step 5','Same pattern, front camera, face oval + ID frame',['K4-guide','K4-cam','K4-prev','K4-up','K4-fail']);
grp('F · Send and wait','“In review” appears only after Send',['K5','K5-replace','K6','B-wait']);
grp('G · Declined','Fix only what’s wrong; the flow re-enters at that step',['B-decl-photo','B-decl-licence','B-decl-selfie','K-redo','K-redo-licence','K5-redo']);
grp('H · Approved','R3, then the extras once. Skippable, never block going online. Then P1 permissions',['R3','X1','X2','X2-kb','X2-err-kb']);
H.push(sec('320×640','Hero 124, titles 24, body scrolls under a pinned footer'));
['K0','K1-kb','K1-dup','K3-num-kb','K2-guide','K2-cam','K4-cam','K2-fail','K5','K6','B-todo-half','B-decl-photo','X2-kb'].forEach(id=>addV(id,'320',sm));
H.push(sec('Font scale 1.3','Hero 136, disc 84, copy wraps, CTA stays pinned'));
['K0','K1-kb','K3-num-kb','K2-guide','K2-prev','K4-prev','K5','B-todo-half','B-decl-licence','K-blocked'].forEach(id=>addV(id,'fs13',fs));
const root=document.getElementById('board');root.innerHTML=H.join('');
const q=new URLSearchParams(location.search).get('screen');
if(q){const c=[...root.querySelectorAll('.cell')].find(c=>c.querySelector('.lbl i').textContent===q.replace(/@/,'·'));if(c){document.body.innerHTML='';document.body.appendChild(c.querySelector('.f'));document.body.style.cssText='margin:0;background:#F6F7F8'}}
})();
