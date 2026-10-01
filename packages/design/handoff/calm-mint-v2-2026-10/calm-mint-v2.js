addEventListener('DOMContentLoaded',()=>{
const {H,OB}=M2,{O}=LX;const T={cta:'#00812F',ctaInk:'#fff',heroBg:'#E9F8EF',h1Accent:'#006630',riderBg:'#ECE8FF',riderAccent:'#4B2FBF'};
const ph=(c,x)=>`<div class="ph ${x||''}">${c}</div>`;
const rows=[
['Home','Address first, bold service tiles, one floating live-order bar, and two rails with Free delivery as a tag.',[
['H1 Home','at 360, with the live bar',ph(H.fold(360))],
['H2 Home','full scroll',ph(H.home(360)+'<div class="fold"><span>720 fold</span></div>','tall'),1],
['H3 Home @320×640','evening, long name, “Food” label',ph(H.fold(320),'w320'),0,370],
['H4 First load','skeleton rails, chrome is real',ph(H.skel())],
['H5 Location sheet','search, current location, saved places',ph(H.locsheet())],
['H6 Location denied','no address yet',ph(H.noloc())]]],
['Customer onboarding','Four screens to Home. The code is caught and checked automatically. Permissions are asked in context, not up front.',[
['C1 Welcome','',ph(O.welcome(T))],['C2 Phone','+263, WhatsApp-first',ph(O.phone(T))],['C3 Phone · invalid','',ph(O.phone(T,'err'))],
['C4 Code','auto-verify, resend on WhatsApp',ph(OB.otp(T))],['C5 Name','no ID, no role choice',ph(O.name(T))]]],
['Rider onboarding','A visible 3-step checklist, a resumable pending screen, and you can go online straight away with commission-free first jobs.',[
['R1 Why ride + what you need','',ph(O.rider(T))],['R2 ID pending','safe to leave the screen',ph(O.pending(T))],['R3 Verified','go online, free jobs meter',ph(OB.verified())]]]];
let html='<div class="rowh" style="left:80px;top:0"><span class="dir" style="background:#E9F8EF;color:#006630">A</span>Calm Mint v2<small>Everything live: four services, Popular restaurants and Popular shops, Free delivery as a card tag, and more colour.</small></div>',Y=180;
rows.forEach(r=>{html+=`<div class="rowh" style="left:80px;top:${Y}px;font-size:28px">${r[0]}<small>${r[1]}</small></div>`;Y+=110;let x=80,mh=760;
r[2].forEach(s=>{html+=`<div class="f" style="left:${x}px;top:${Y}px"><p class="lbl"><b>${s[0]}</b>${s[1]?' · '+s[1]:''}</p>${s[2]}</div>`;x+=s[4]||410;if(s[3])mh=1500;});Y+=mh+80;});
const q=new URLSearchParams(location.search).get('screen');if(q){const all=rows.flatMap(r=>r[2]);const s=all.find(x=>x[0].split(' ')[0]===q);document.body.style.background='#fff';html=s?s[2].replace('class="ph','style="border-radius:0;box-shadow:none" class="ph'):'Unknown screen';document.querySelector('meta[name=design_doc_mode]')?.remove();}document.body.insertAdjacentHTML('beforeend',html);lucide.createIcons();});
