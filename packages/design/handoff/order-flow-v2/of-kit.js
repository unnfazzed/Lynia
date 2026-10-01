/* LyniaGo Order flow v2 kit: every user-facing string (O), sample data, tokens and shared parts.
   Copy in O ships verbatim. {x} = runtime value. Builds on After Send v2 (header, sheet, map, rider card,
   step track, code card), Send v2 (Review blocks, CTA bar), Rider v2 (StopCard, CashSplit, CodeBoxes)
   and merchant-mobile (ringing takeover, ConfirmSheet, PrepRing, CashBackCard). */
(function(){
const O={
 c:{back:'Back',help:'Help',edit:'Edit',view:'View',call:'Call',whatsapp:'WhatsApp',share:'Share',close:'Close',done:'Done',tryAgain:'↻ Try again',cancel:'Cancel',keep:'Keep',undo:'Undo',
  verified:'Verified',bike:'Bike',trips:'trips',min:'min',optional:'optional',you:'You',orderNo:'Order #{id}',
  offline:'You’re offline · last update {t}',noData:'No connection. Nothing was sent.'},
 svc:{
  food:{place:'kitchen',Place:'Kitchen',item:'dish',items:'dishes',Items:'Dishes',making:'Cooking',makingT:'Cooking your order',ready:'Food is ready',tag:'FOOD',
   st:['Confirmed','Cooking','On the way','Delivered'],note:'Note for the kitchen',back:'I got the food back'},
  shops:{place:'shop',Place:'Shop',item:'item',items:'items',Items:'Items',making:'Packing',makingT:'Packing your order',ready:'Order is packed',tag:'SHOP',
   st:['Confirmed','Packing','On the way','Delivered'],note:'Note for the shop',back:'I got the order back'},
  pharmacy:{place:'pharmacy',Place:'Pharmacy',item:'item',items:'items',Items:'Items',making:'Packing',makingT:'Packing your order',ready:'Order is packed',tag:'PHARMACY',
   st:['Confirmed','Packing','On the way','Delivered'],stRx:'Prescription checked',note:'Note for the pharmacy',back:'I got the order back'}},
 /* R · Review & place */
 r:{title:'Review order',items:'ITEMS',addMore:'+ Add more items',lineNote:'Add a note',to:'DELIVER TO',when:'WHEN',asap:'As soon as possible',schedule:'Schedule',
  asapSub:'Arrives {a}–{b}',phone:'YOUR PHONE',phoneSub:'The rider calls this number',riderNote:'NOTE FOR THE RIDER',riderNoteEmpty:'Add directions, like “Blue gate, 3rd house on the left”',
  pay:'PAY',cash:'Cash at the door',cashSub:'Have {p} ready — riders carry little change.',
  oos:'IF SOMETHING’S OUT OF STOCK',oosAsk:'Ask me',oosRemove:'Remove it',oosAskSub:'The {place} sends a swap or asks to remove it. You have 3 minutes to answer.',oosRemoveSub:'Missing items are taken off and the total goes down. Nothing to answer.',
  food:'Food',itemsK:'Items',fee:'Delivery fee',small:'Small-order fee',total:'Total',
  cancelRule:'Free to cancel until the rider collects your order.',
  place:'Place order · {p} cash',placing:'Placing your order…',placingSub:'Don’t close the app. If this fails, nothing is ordered and nothing is paid.',
  failed:'Couldn’t place your order. Nothing was ordered.',offline:'You’re offline. Connect to place your order — your cart is saved.',
  otc:'Over-the-counter medicine only. A pharmacist packs every order.',
  minHint:'Add {d} more to skip the {f} small-order fee.',
  /* address editing */
  addrT:'Where should we deliver?',addrSearch:'Street, area or landmark',addrUse:'Use my current location',addrPin:'Drag the map to put the pin on your gate',addrSave:'Use this address',
  outArea:'{v} doesn’t deliver to {a}. Try an address closer to them, or pick another place.',
  /* schedule */
  schT:'When should it arrive?',today:'Today',tomorrow:'Tomorrow',slotFull:'Full',slotClosed:'Closed',schNote:'Slots are 30 minutes. {v} starts {making} so it arrives inside your slot.',schSave:'Arrive {s}',
  schRow:'Scheduled · {d} {s}',schRowSub:'{v} starts {making} at {t}. Free to cancel until then.',
  openFirst:'Order for when they open · {s}',
  /* changed since cart */
  chgT:'Some things changed since you added them',soldOut:'Sold out now — taken off',priceUp:'Price went up {a} → {b}',
  closedT:'{v} just closed',closedS:'Nothing was ordered. Your cart is saved — schedule it for when they open, or pick another place.',closedCta:'Schedule for {s}',
  /* Rx */
  rxT:'PRESCRIPTION',rxNeed:'Prescription needed',rxAdd:'Add a photo of your prescription',rxAddSub:'Up to 3 pages. A pharmacist checks it before packing.',rxCamera:'Take photo',rxGallery:'From gallery',
  rxPatient:'Patient name',rxConsent:'I’ll show the original prescription to the rider',rxBlocked:'Add a photo of your prescription to place this order',rxPage:'Page {n}',
  empty:'Your cart is empty',emptySub:'Add dishes or items from a restaurant, shop or pharmacy.',emptyCta:'Browse places',
  noLoc:'Where should we deliver?',noLocSub:'Set your address to see the delivery fee and when it arrives.',noLocBlock:'Set a delivery address to place your order'},
 /* T · order screen */
 t:{sending:'Sending your order to {v}…',sendingSub:'Don’t close the app. If this fails, nothing is ordered and nothing is paid.',
  confirming:'{v} is confirming',confirmingSub:'LyniaGo accepted it for you. The kitchen is saying yes now.',
  waiting:'Waiting for {v} to accept',waitingSub:'They have 3 minutes. Nothing is ordered until they accept.',left:'left',
  rxCheck:'Pharmacist is checking your prescription',rxCheckSub:'Usually under 10 minutes. Packing starts once it’s approved.',
  making:'{making} your order',prepLeft:'{making} · about {m} min left',prepNote:'We find a rider about 8 minutes before it’s ready.',
  riderToVenue:'Rider on the way to {v}',collecting:'Rider is collecting your order',collected:'Collected · sealed bag photo',collectedAt:'{n} took this at {t} at {v}',
  onWay:'On the way to you',atDoor:'Rider is at your door',
  etaRange:'Arrives {a}–{b}',etaOne:'Arrives in ~{m} min · {t}',etaNone:'Arrival time shows once the rider’s phone sends a location',etaSched:'Arrives {s} {d}',
  callV:'Call {v}',cancelFree:'Cancel order · free',cancelFull:'Cancel order',
  order:'Your order',viewOrder:'See order',hideOrder:'Hide',
  codeHelp:'Say this code to your rider after you’ve paid. Push messages never show it.',
  slowRider:'Finding a rider is taking longer',slowRiderSub:'We’re asking more riders now. Your food is kept warm — same food, same price, nothing extra to pay.',
  dropped:'Your rider had to cancel',droppedSub:'Finding another one now — same food, same price, nothing extra to pay.',
  noFix:'Tendai is heading to {v}',paused:'Tendai’s location hasn’t updated — call to check in.',lastSeen:'Last seen 2 min ago',
  sched:'Scheduled for {d} {s}',schedSub:'{v} starts {making} at {t}. Free to cancel until then.',schedStarted:'{v} started {making}',schedChange:'Change time',
  loading:'Opening your order…',loadFail:'Couldn’t open your order',loadFailSub:'Check your data connection and try again.',
  notFound:'We can’t find this order',notFoundSub:'It may be on another account, or the link is old.',home:'Back to home',
  /* cancel */
  cxT:'Cancel this order?',cxFree:'It’s free. {v} hasn’t handed your order to a rider yet.',cxFull:'Tendai already has your order. Cancelling now costs the full {p} — the {place} has made it and the rider has carried it.',
  cxReason:'Reason (optional)',cxR:['Ordered by mistake','It’s taking too long','Changed my mind','Other'],cxYes:'Cancel order',cxYesFull:'Cancel and pay {p}',cxKeep:'Keep order',cxBusy:'Cancelling…',cxFail:'Couldn’t cancel. Your order is still on.',
  /* help */
  helpT:'Get help',helpSub:'Your order keeps going while you’re here.',hWa:'Message LyniaGo on WhatsApp',hWaSub:'We answer 7am–9pm',hReport:'Report a problem',hReportSub:'Wrong item, missing item, seal broken',
  hCallV:'Call {v}',hCallVSub:'{ph}',hSos:'Emergency? Call 999',hSosSub:'Police, ambulance or fire',
  rpT:'What went wrong?',rp:['Wrong item','Missing item','Damaged','Seal broken','Rider','Other'],rpWhich:'Which items?',rpMore:'Tell us more',rpPh:'What happened?',rpPhoto:'Add a photo',rpSend:'Send to our team',
  rpDone:'Thanks — our team will look into it. We’ll message you on WhatsApp.'},
 /* U · substitution */
 u:{t:'{v} needs your answer',sub:'Answer in {t}. If you don’t, swaps are declined, those items are taken off and the order carries on.',
  outOf:'Out of {i}',swapFor:'Swap for {i}',acceptSwap:'Accept swap',removeIt:'Remove it',removed:'Will be removed',accepted:'Swap accepted',
  diff:'{d}',newTotal:'New total',confirm:'Confirm changes · New total {p}',cancelAll:'Cancel the whole order — free',
  timeout:'No answer in time. {i} taken off — your order carries on. New total {p}.',
  reduce:'{v} took off {i} — they ran out. New total {p}. Nothing to answer.',
  mid:'{v} wants to change your order',midSub:'It’s already {making}. Answer in {t} — no answer keeps your order as it was, minus anything they can’t supply.',
  allOut:'{v} couldn’t supply anything in your order',allOutSub:'They’re out of every item. Your order is cancelled and nothing was charged.',
  /* merchant proposer */
  mEdit:'Change items',mHint:'Tap an item you can’t supply.',mRemove:'Remove it',mSwap:'Swap for…',mPick:'Swap {i} for',mSearch:'Search your items',mSame:'Same price',
  mSend:'Send {n} change to customer',mSendN:'Send {n} changes to customer',mWait:'Waiting for Rudo to answer',mWaitSub:'Start {making} the rest — the order goes ahead either way. If Rudo doesn’t answer in 3 minutes, swaps are declined.',
  mAsked:'Swap asked',mRemoved:'Removing',mYes:'Rudo accepted',mNo:'Rudo declined · removed'},
 /* P · door */
 p:{t:'At your door',s1:'Take your order',s1Seal:'Check the seal is unbroken before you pay',s1Sub:'Tendai hands it over first',
  s2:'Pay {p} cash',s2Sub:'Have the exact amount if you can — riders carry little change.',s2Btn:'I’ve paid {p}',s2Wait:'Waiting for Tendai to confirm {p}',
  s3:'Say your code',s3Lock:'Shows here once you and Tendai both confirm the cash',
  lapsed:'We’ve asked our team to check the cash',lapsedSub:'You and Tendai didn’t both confirm within 2 minutes. Our team will call you both now. Your code stays hidden until then — don’t hand over more cash.',
  disagree:'Tendai says {p} wasn’t paid',disagreeSub:'Our team will call you both now. Keep your order and your cash where they are.',
  doorPhoto:'Delivery photo',doorPhotoSub:'Left with Chipo at the gate · 12:47',
  shareCode:'Share code',shareMsg:'My LyniaGo order from {v} is arriving with Tendai (bike ABH 4721). Pay {p} cash, then give him this code: 418290'},
 /* D · done & endings */
 d:{delivered:'Delivered {t}',deliveredSub:'{p} paid in cash · {v}',receipt:'Receipt',paidCash:'Paid in cash to Tendai',rider:'Rider',venue:'From',orderNo:'Order',delAt:'Delivered',
  shareReceipt:'Share receipt',rateV:'How was {v}?',rateR:'How was Tendai?',
  tagsV:['Tasty','Hot','Well packed','Right order'],tagsVbad:['Cold','Missing item','Spilled','Wrong item'],tagsR:['On time','Friendly','Careful with food','Easy to reach'],
  rl:['','Bad','Poor','OK','Good','Great'],skip:'Skip',submit:'Send rating',rated:'Thanks — you rated {v} {a} and Tendai {b}.',orderAgain:'Order again',orderAgainSub:'Same items, same address',
  rateLater:'Rate this order',rateLaterSub:'You can rate for 7 days.',youRated:'You rated',
  cxYou:'You cancelled this order',cxYouSub:'Nothing was charged.',cxVenue:'{v} couldn’t take your order',cxVenueSub:'They’re too busy right now. Nothing was charged.',
  cxKitchen:'{v} didn’t confirm your order in time',cxKitchenSub:'We waited an hour. Nothing was charged.',
  cxNoRider:'We couldn’t find a rider',cxNoRiderSub:'No rider took your order in time. Nothing was charged — sorry about that.',
  cxLynia:'LyniaGo cancelled this order',cxLyniaSub:'The {place} reported a problem with the order. Nothing was charged. Message us if this looks wrong.',
  cxPaid:'You cancelled after pickup',cxPaidSub:'Tendai is bringing {p} worth of food back to {v}. You owe {p} — pay it on your next order.',
  tryAgain:'Order again from {v}',others:'See other places nearby',
  notDel:'Your order wasn’t delivered',notDelSub:'Tendai waited 8 minutes at your address and called twice. The order is going back to {v}.',
  notDelCash:'You weren’t charged for it, and nothing is owed on your account. Get help if you were at home.',
  rxNo:'Your prescription wasn’t approved',rxNoReason:'Reason from the pharmacist',rxNoGo:'Amoxicillin 500mg is taken off. The rest of your order is being packed — new total {p}.',rxCancel:'Cancel the rest — free',
  rxNoCx:'Order cancelled',rxNoCxSub:'Your prescription wasn’t approved and you cancelled the rest. Nothing was charged.'},
 /* M · merchant */
 m:{newOrder:'NEW ORDER',scheduled:'SCHEDULED · START NOW',auto:'LyniaGo accepted this for you',autoSub:'Confirm you’re making it so we can send a rider.',confirm:'Got it, we’re making it',
  accept:'Accept · ready in {m} min',readyIn:'READY IN (MIN)',decline:'Can’t take it',total:'Order total',
  ticket:'#{id}',prepRing:'{m}:00',riderFound:'Rider found 8 min before ready',ready:'{ready}',cantFinish:'Can’t finish this order',
  hand:'Hand over to Tendai',code:'Read this pickup code to Tendai',codeOk:'Tendai entered the code',photo:'Sealed bag photo',photoWait:'Waiting for Tendai’s photo of the sealed bag',photoReq:'Shops and pharmacies: wait for the photo before you hand over.',
  photoAt:'Tendai took this at {t}',handBtn:'Hand over',
  trackT:'#{id} on the way',cashStep:'Cash back to you',doorPhoto:'Delivery photo · Left with Chipo at the gate',
  cashT:'CASH BACK TO YOU',cashS:'Tendai is bringing {p}',cashDue:'Due by {t} · {m} min left',cashBtn:'I got {p}',noCash:'No cash on this one · mark completed',
  backT:'Tendai is bringing the order back',backS:'Rudo wasn’t at the address. Check the bag is still sealed.',
  segNew:'New',segMaking:'Cooking',segMakingS:'Packing',segReady:'Ready',segSched:'Scheduled',
  schedStarts:'Starts {t} · arrive {s}',schedRing:'Rings at {t} like a new order',schedT:'Scheduled for {d}',schedBody:'This order rings at {t}. Have the items ready to pack by then.',
  rxT:'Prescription check',rxPatient:'Patient',rxItems:'Needs a prescription',rxConsent:'Customer will show the original to the rider',rxApprove:'Approve prescription',rxDecline:'Decline',
  rxWhy:'Why are you declining?',rxR:['Unreadable','Expired','Not valid for this medicine','Other'],rxSend:'Decline and tell the customer',rxRest:'The rest of the order carries on unless the customer cancels.'},
 /* RD · rider deltas */
 rd:{offer:'New job',passing:'Passing or missing an offer doesn’t affect your standing.',accept:'Accept this job',pass:'Not this one',fare:'Your fare',
  sealNote:'Sealed bag · photo at pickup',schedNote:'Scheduled · customer expects {s}',rxNote:'Prescription order · see the original at the door',
  atVenue:'At the {place}',code:'Ask the {place} for the pickup code',codeTries:'5 tries',sealed:'Bag is sealed',sealedSub:'Sticker or stapled receipt across the opening',
  photoT:'Photo of the sealed bag',photoReq:'Needed for shops and pharmacies',photoOpt:'Optional for restaurants',retake:'Retake',collected:'I’ve collected the order',
  queued:'Photo saved on your phone. It sends when you’re back online — you can ride.',
  rxStop:'Prescription order · see the original script',rxTick:'I saw the original prescription',
  door1:'Hand over the order',door2:'Collect {p} cash',door2Btn:'I received {p}',door3:'Enter the delivery code',door3Sub:'Rudo says it after you both confirm the cash',
  cantCode:'Can’t use the code?',whyT:'Why can’t you use the code?',why:['Customer not reachable (waited 8 min, called twice)','Handed to someone else','Left at the gate — the customer agreed'],
  whoT:'Who did you hand it to?',whoPh:'Name, like Chipo',doorPhotoT:'Photo of where you left it',doorPhotoSub:'Rudo, the {place} and LyniaGo see this photo.',finish:'Finish delivery'},
 /* G · live bar, orders card, push. [title, body] */
 g:{bar:{food:[['Sending to Gava’s Kitchen…','Don’t close the app'],['Gava’s Kitchen is confirming','Arrives 12:40–12:55'],['Cooking your order','Arrives 12:40–12:55'],['Rider on the way to Gava’s Kitchen','Arrives 12:40–12:55'],['On the way to you','Arrives in ~9 min · 12:47'],['Rider is at your door','Pay $16.50 · then say your code'],['Delivered 12:47','Rate Gava’s Kitchen and Tendai']],
   shops:[['Avondale Fresh needs your answer','1 swap · answer in 2:41'],['Packing your order','Arrives 12:45–13:00'],['On the way to you','Arrives in ~11 min · 12:52']],
   pharmacy:[['Pharmacist is checking your prescription','Arrives 12:50–13:10'],['Packing your order','Arrives 12:40–12:55'],['Rider is at your door','Check the seal · pay $6.80']],
   sched:[['Scheduled · tomorrow 12:30–13:00','Gava’s Kitchen starts cooking at 12:05']]},
  push:{c:[['Order sent to Gava’s Kitchen','They’re confirming now. Arrives 12:40–12:55.'],['Gava’s Kitchen is cooking','Arrives 12:40–12:55. We’ll tell you when a rider has it.'],
    ['Avondale Fresh needs your answer','Lobels bread is out. Swap for Bakers Inn 700g (+$0.10)? Answer in 3 min.'],['Tendai is heading to Gava’s Kitchen','He’ll collect your order soon.'],
    ['Tendai has your order','On the way. Arrives in ~9 min · 12:47.'],['Tendai is at your door','Have $16.50 cash ready.'],['Delivered','Enjoy! Tap to rate Gava’s Kitchen and Tendai.'],
    ['Your order wasn’t delivered','Tendai couldn’t reach you. Nothing was charged.'],['Gava’s Kitchen couldn’t take your order','Nothing was charged. Tap to order somewhere else.'],
    ['We couldn’t find a rider','Nothing was charged. Tap to try again.'],['Your prescription wasn’t approved','Tap to see why. The rest of your order carries on.'],['Your scheduled order has started','Gava’s Kitchen is cooking. Arrives 12:30–13:00.']],
   m:[['New order #A1B2 · $15.00','2 dishes. Confirm you’re making it.'],['Scheduled order #A1B2 starts now','Tomorrow’s 12:30 order. Tap to start cooking.'],['Rudo accepted the swap','Bakers Inn 700g instead of Lobels. New total $16.20.'],
    ['Rudo didn’t answer','Lobels bread taken off. Carry on packing.'],['Tendai is at your counter','Read him the pickup code.'],['Delivered · cash back due','Tendai is bringing $15.00 by 13:17.'],['New prescription to check','#P7C1 · Amoxicillin 500mg']],
   r:[['New food job · $3.20','Gava’s Kitchen → Belgravia. 60 s to accept.'],['New shop job · $2.80','Avondale Fresh → Belgravia. Photo of the sealed bag at pickup.'],
    ['Order is ready','Gava’s Kitchen has your pickup.'],['Rudo cancelled','Take the food back to Gava’s Kitchen.'],['Return $15.00 to Gava’s Kitchen','Due by 13:17.']]}}
};
const f=(s,o)=>String(s).replace(/\{(\w+)\}/g,(m,k)=>o&&o[k]!=null?o[k]:m);
const z=n=>`calc(${n}px*var(--fs))`;
const usd=n=>'$'+n.toFixed(2);
/* ---------- icons (Lynia lucide subset + After Send / Rider v2 additions) ---------- */
const EX={MessageCircle:[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],ShieldCheck:[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{d:"m9 12 2 2 4-4"}]],
 Share2:[["circle",{cx:18,cy:5,r:3}],["circle",{cx:6,cy:12,r:3}],["circle",{cx:18,cy:19,r:3}],["line",{x1:8.59,y1:13.51,x2:15.42,y2:17.49}],["line",{x1:15.41,y1:6.51,x2:8.59,y2:10.49}]],
 Camera:[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}],["circle",{cx:12,cy:13,r:3}]],
 LifeBuoy:[["circle",{cx:12,cy:12,r:10}],["path",{d:"m4.93 4.93 4.24 4.24"}],["path",{d:"m14.83 9.17 4.24-4.24"}],["path",{d:"m14.83 14.83 4.24 4.24"}],["path",{d:"m9.17 14.83-4.24 4.24"}],["circle",{cx:12,cy:12,r:4}]],
 Undo2:[["path",{d:"M9 14 4 9l5-5"}],["path",{d:"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"}]],X:[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]],
 Image:[["rect",{x:3,y:3,width:18,height:18,rx:2}],["circle",{cx:9,cy:9,r:2}],["path",{d:"m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"}]],
 ChevronLeft:[["path",{d:"m15 18-6-6 6-6"}]],ArrowLeftRight:[["path",{d:"M8 3 4 7l4 4"}],["path",{d:"M4 7h16"}],["path",{d:"m16 21 4-4-4-4"}],["path",{d:"M20 17H4"}]],
 FileText:[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{d:"M16 13H8"}],["path",{d:"M16 17H8"}]],
 Calendar:[["path",{d:"M8 2v4"}],["path",{d:"M16 2v4"}],["rect",{width:18,height:18,x:3,y:4,rx:2}],["path",{d:"M3 10h18"}]],
 Lock:[["rect",{width:18,height:11,x:3,y:11,rx:2}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4"}]],
 Hourglass:[["path",{d:"M5 22h14"}],["path",{d:"M5 2h14"}],["path",{d:"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"}],["path",{d:"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"}]],
 ZoomIn:[["circle",{cx:11,cy:11,r:8}],["line",{x1:21,x2:16.65,y1:21,y2:16.65}],["line",{x1:11,x2:11,y1:8,y2:14}],["line",{x1:8,x2:14,y1:11,y2:11}]],
 RotateCcw:[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}]],MessageSquare:[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}]],Copy:[["rect",{x:8,y:8,width:14,height:14,rx:2}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]],Delete:[["path",{d:"M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"}],["path",{d:"m12 9 6 6"}],["path",{d:"m18 9-6 6"}]]};
const pas=n=>String(n).split(/[-_ ]+/).map(s=>s[0].toUpperCase()+s.slice(1)).join('');
const i=(n,s,c,x)=>{s=s||18;const k=pas(n);const node=EX[k]||(window.lucide&&window.lucide.icons[k])||[];return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c||'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;${x||''}">${node.map(([t,a])=>`<${t} ${Object.entries(a).map(([q,v])=>`${q}="${v}"`).join(' ')}></${t}>`).join('')}</svg>`};
/* ---------- data (Part 2 §7) ---------- */
const TK={ink:'#14181B',muted:'#5B6670',line:'#E2E6EA',surface:'#F6F7F8',brand:'#00B14F',green:'#006630',cta:'#00812F',mint:'#E9F8EF',forest:'#063B22',forestSub:'#BFE6CD',hi:'#FFD23F',hiInk:'#3D3100',star:'#C99500',danger:'#C0392B',dWash:'#FAEDEB',dInk:'#8F2418',tile:{food:'#FFD9CC',shops:'#DDD5FF',pharmacy:'#C5E9DF'}};
const ICO={food:'restaurants',shops:'shops',pharmacy:'pharmacy'};
const V={gava:{n:'Gava’s Kitchen',s:'food',ph:'0242 700 111'},avf:{n:'Avondale Fresh',s:'shops',ph:'0242 333 210'},avp:{n:'Avondale Pharmacy',s:'pharmacy',ph:'0242 335 090'},mbare:{n:'Mbare Auto Spares',s:'shops',ph:'0242 750 446'},pizza:{n:'Pizza Inn',s:'food'}};
const ORD={
 gava:{v:'gava',lines:[[2,'Sadza & beef stew',9,'Extra gravy'],[1,'Roast chicken (half)',6]],fee:1.5},
 avf:{v:'avf',lines:[[1,'Bread (Lobels 700g)',1.1],[1,'Eggs (tray of 30)',5.5],[1,'Mazoe orange 2L',3.2],[1,'Cooking oil 2L',4.8]],fee:1.5},
 avp:{v:'avp',lines:[[1,'Paracetamol 500mg (20 tabs)',1.5],[1,'ORS sachets (x5)',2],[1,'Plasters (20)',1.8]],fee:1.5},
 avpLow:{v:'avp',lines:[[1,'Paracetamol 500mg (20 tabs)',1.5],[1,'Plasters (20)',1.8]],fee:1.5},
 avpRx:{v:'avp',lines:[[1,'Amoxicillin 500mg (21 caps)',4.2,null,1],[1,'Paracetamol 500mg (20 tabs)',1.5],[1,'ORS sachets (x5)',2],[1,'Plasters (20)',1.8]],fee:1.5},
 mbare:{v:'mbare',lines:[[1,'Brake pads (front)',24],[1,'Oil filter',6.5]],fee:3.5}};
const sub=o=>o.lines.reduce((a,l)=>a+l[2],0);
const small=o=>sub(o)<4?1:0;
const tot=o=>sub(o)+o.fee+small(o);
const CODE='418290',PICK='731604',ID='A1B2';
/* ---------- CSS ---------- */
document.head.insertAdjacentHTML('beforeend',`<style>
.ph{--fs:1;width:360px;height:720px;overflow:hidden;position:relative;background:#fff;border-radius:24px;box-shadow:0 0 0 1px #e2e6ea,0 12px 40px rgba(20,24,27,.10);isolation:isolate;font:400 ${z(14)} Inter,system-ui,sans-serif;color:#14181b;font-variant-numeric:tabular-nums;flex:none}
.ph.w320{width:320px;height:640px}.ph.fs13{--fs:1.3}.ph *{box-sizing:border-box}.ph.tall{height:auto;min-height:720px}
.sb{height:24px;display:flex;justify-content:space-between;align-items:center;padding:0 16px;font:600 12px Inter;flex:none;background:#fff}
.hd{position:absolute;left:0;right:0;top:0;z-index:20;background:#fff}
.hb{height:52px;display:grid;grid-template-columns:minmax(max-content,1fr) minmax(0,auto) minmax(max-content,1fr);column-gap:6px;align-items:center;padding:0 8px;border-bottom:1px solid #e2e6ea}
.hb .bk{height:44px;display:flex;align-items:center;gap:2px;font:600 ${z(15)} Inter;color:#006630}
.hb .tt{font:700 ${z(16)} Inter;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;text-align:center}
.hb .rs{display:flex;justify-content:flex-end}
.helpp{height:44px;display:flex;align-items:center}.helpp span{height:34px;display:flex;align-items:center;gap:5px;padding:0 10px;border-radius:999px;border:1.5px solid #C0392B;font:700 ${z(13)} Inter;color:#C0392B}
.map{position:absolute;left:0;right:0;top:77px;bottom:300px;overflow:hidden;background:#EEF1F3}
.map .rd{position:absolute;background:#fff;box-shadow:0 0 0 1px #E2E6EA}.map .pk{position:absolute;background:#E9F8EF;border-radius:10px}
.map svg.rt{position:absolute;inset:0;width:100%;height:100%;z-index:2}
.pin{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;z-index:5}
.pin .pl{background:#fff;color:#14181b;border-radius:999px;padding:2px 8px;font:600 12px Inter;box-shadow:0 1px 4px rgba(20,24,27,.08),0 2px 12px rgba(20,24,27,.06);white-space:nowrap}
.vpin{width:44px;height:44px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 16px rgba(20,24,27,.14);display:flex;align-items:center;justify-content:center}.vpin img{width:28px;height:28px}
.dpin{width:20px;height:20px;border-radius:3px;background:#C0392B;border:3px solid #fff;box-shadow:0 4px 16px rgba(20,24,27,.14)}
.rpin{width:34px;height:34px;border-radius:50%;background:#14181b;border:3px solid #fff;box-shadow:0 4px 16px rgba(20,24,27,.14);display:flex;align-items:center;justify-content:center}
.rpin+.pl{background:#14181b;color:#fff}.rpin.pz{background:#5B6670}.rpin.pz+.pl{background:#fff;color:#5b6670;border:1px dashed #5b6670}
.sheet{position:absolute;left:0;right:0;bottom:0;top:300px;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -2px 16px rgba(20,24,27,.10);z-index:10}
.grab{height:28px;display:flex;justify-content:center;align-items:center}.grab:after{content:"";width:36px;height:4px;border-radius:2px;background:#E2E6EA}
.scw{position:absolute;left:0;right:0;top:28px;bottom:0;overflow:hidden}.sc{padding:0 16px 16px;display:flex;flex-direction:column;gap:12px}
.bar{position:absolute;left:0;right:0;bottom:0;background:#fff;padding:10px 16px 12px;box-shadow:0 -2px 16px rgba(20,24,27,.08);z-index:25;display:flex;flex-direction:column;gap:8px}
.bar .hint{font-size:${z(13)};color:#5b6670;text-align:center;line-height:1.35}.bar .row{display:flex;gap:8px}
.btn{flex:1 1 0;min-height:52px;border-radius:999px;background:#00812F;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font:700 ${z(16)}/1.2 Inter;text-align:center;padding:4px 16px}
.btn.g{background:#fff;color:#006630;border:1.5px solid #E2E6EA}.btn.gd{background:#fff;color:#C0392B;border:1.5px solid #E2E6EA}.btn.dis{background:#E2E6EA;color:#5B6670}.btn.dg{background:#C0392B}
.sm{min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 14px;border-radius:999px;background:#fff;color:#006630;border:1.5px solid #E2E6EA;font:700 ${z(14)} Inter;white-space:nowrap}
.sm.f{background:#00812F;color:#fff;border:0}.sm.w{border:0}.sm.dis{color:#5b6670;background:#fff}.sm.fl{flex:1 1 0}
.spin{width:18px;height:18px;border-radius:50%;border:2.5px solid currentColor;border-top-color:transparent;display:inline-block;flex:none;animation:ofspin 1s linear infinite}@keyframes ofspin{to{transform:rotate(360deg)}}
.h2{font:700 ${z(19)}/1.25 Inter;letter-spacing:-.2px;text-wrap:pretty;margin:0}.h3{font:700 ${z(16)}/1.3 Inter;margin:0}
.mut{color:#5b6670;font-size:${z(13)};line-height:1.4;text-wrap:pretty}.mut.s14{font-size:${z(14)}}
.eta{display:flex;align-items:center;gap:6px;font:600 ${z(15)} Inter;margin-top:4px;flex-wrap:wrap}.eta .chip{background:#FFD23F;color:#3D3100;border-radius:999px;padding:3px 10px;font:700 ${z(13)} Inter;white-space:nowrap}
.trk{display:flex}.trk>div{flex:1;position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.trk .ln{position:absolute;top:8px;height:3px;background:#E2E6EA}.trk .ln.on{background:#00B14F}
.trk .c{position:relative;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 11px Inter;background:#F6F7F8;color:#5b6670;border:1px solid #E2E6EA}
.trk .c.d,.trk .c.n{background:#006630;color:#fff;border:0}.trk .c.n{box-shadow:0 0 0 4px #E9F8EF}
.trk .l{font:600 ${z(12)}/1.3 Inter;color:#5b6670;text-align:center;padding:0 2px}.trk .l.d{color:#006630}.trk .l.n{color:#14181b;font-weight:700}
.card{border:1px solid #E2E6EA;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px}
.lbl{font:600 ${z(12)} Inter;letter-spacing:.04em;color:#5b6670;text-transform:uppercase}
.row{display:flex;align-items:center;gap:10px}.grow{flex:1;min-width:0}
.av{width:48px;height:48px;border-radius:50%;background:#E9F8EF;color:#006630;display:flex;align-items:center;justify-content:center;font:700 16px Inter;flex:none}
.ver{height:20px;display:inline-flex;align-items:center;gap:3px;padding:0 7px 0 5px;border-radius:999px;background:#E9F8EF;color:#006630;font:700 11px Inter}
.plate{white-space:nowrap;border:1.5px solid #14181b;border-radius:4px;padding:0 6px;font:700 12px Inter;letter-spacing:.08em;line-height:18px}
.code{background:#E9F8EF;border-radius:12px;padding:12px 12px 12px 14px;display:flex;flex-direction:column;gap:8px}
.digits{font:800 ${z(28)}/1.15 Inter;letter-spacing:.04em;display:inline-flex;gap:10px;white-space:nowrap}
.codebig{background:#E9F8EF;border-radius:16px;padding:14px 14px 16px;display:flex;flex-direction:column;align-items:center;gap:10px}
.codebig .pan{align-self:stretch;background:#fff;border:2px solid #006630;border-radius:12px;padding:8px 0;display:flex;justify-content:center}
.codebig .digits{font-size:56px;gap:20px}.w320 .codebig .digits{font-size:48px;gap:16px}
.toast{position:absolute;left:12px;right:12px;z-index:35;background:#14181b;color:#fff;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:${z(13)};line-height:1.4;box-shadow:0 4px 16px rgba(20,24,27,.1)}
.toast .ta{min-height:44px;display:flex;align-items:center;padding:0 12px;border-radius:10px;background:#E9F8EF;color:#006630;font-weight:700;white-space:nowrap;margin:-6px -6px -6px 0}
.dim{position:absolute;inset:0;background:rgba(20,24,27,.45);z-index:40}
.msh{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:20px 20px 0 0;z-index:41;padding:0 16px 16px;display:flex;flex-direction:column;gap:12px;max-height:calc(100% - 40px);overflow:hidden}
.note{display:flex;gap:10px;align-items:flex-start;font-size:${z(13)};line-height:1.45;padding:10px 12px;border-radius:12px;background:#F6F7F8}.note svg{margin-top:1px}
.note.ok{background:#E9F8EF}.note.hi{background:#FFF6D6;color:#3D3100}.note.dn{background:#FAEDEB;color:#8F2418}.note.ink{background:#14181b;color:#fff}
.vrow{display:flex;align-items:center;gap:10px}.vdisc{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none}.vdisc img{width:30px;height:30px}
.prog{height:4px;border-radius:2px;background:#E2E6EA;overflow:hidden}.prog i{display:block;height:100%;background:#00B14F}
.kv{display:flex;align-items:baseline;gap:12px;padding:7px 0;border-top:1px solid #E2E6EA;font-size:${z(13)}}.kv>span:first-child{color:#5b6670;flex:1;min-width:0}.kv>b{font-weight:600;text-align:right}.kv.t>b{font:700 ${z(17)} Inter}.kv.t>span:first-child{color:#14181b;font-weight:700}
.li{display:flex;gap:10px;align-items:flex-start;padding:8px 0;font-size:${z(14)};line-height:1.35}.li .q{font-weight:700;min-width:22px}.li .nm{flex:1;min-width:0}.li .pr{font-weight:600;white-space:nowrap}
.rb{border:1px solid #E2E6EA;border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.rbh{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:24px}.ed{min-height:44px;margin:-10px -8px -10px 0;padding:0 8px;display:flex;align-items:center;gap:4px;font:600 ${z(13)} Inter;color:#006630;white-space:nowrap}
.stp{display:inline-flex;align-items:center;border:1px solid #E2E6EA;border-radius:999px;height:44px;flex:none}.stp span{width:40px;height:44px;display:flex;align-items:center;justify-content:center}.stp b{min-width:20px;text-align:center;font:700 ${z(15)} Inter}
.seg{display:flex;background:#F6F7F8;border-radius:999px;padding:3px;gap:3px}.seg span{flex:1;min-height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:6px;font:600 ${z(14)} Inter;color:#14181b;text-align:center;padding:0 8px}.seg span.on{background:#00812F;color:#fff;font-weight:700}
.chipr{display:flex;flex-wrap:wrap;gap:8px}.chp{min-height:44px;display:inline-flex;align-items:center;gap:6px;padding:0 14px;border-radius:999px;border:1px solid #E2E6EA;font:600 ${z(13)} Inter;white-space:nowrap}.chp.on{border:1.5px solid #006630;background:#E9F8EF;color:#006630}.chp.off{color:#5b6670;background:#F6F7F8;border-color:#F6F7F8;text-decoration:line-through}
.field{min-height:48px;border:1px solid #E2E6EA;border-radius:12px;display:flex;align-items:center;gap:10px;padding:0 14px;font-size:${z(15)}}.field.on{border:1.5px solid #00B14F}.field .ph0{color:#5b6670}
.door{border:2px solid #006630;border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.ds{display:flex;gap:12px;padding:8px 0;align-items:flex-start}.ds+.ds{border-top:1px solid #E2E6EA}.ds .n{width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font:700 13px Inter;background:#F6F7F8;color:#5b6670;border:1px solid #E2E6EA}
.ds .n.d{background:#006630;color:#fff;border:0}.ds .n.c{background:#fff;color:#006630;border:2px solid #006630}.ds b{display:block;font:700 ${z(15)}/1.3 Inter}.ds.dn b{color:#5b6670;font-weight:600}
.photo{border-radius:12px;background-color:#EEF1F3;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.6) 0 6px,transparent 6px 12px);display:flex;align-items:center;justify-content:center;flex:none;position:relative;overflow:hidden}.photo code{font:600 10px ui-monospace,Menlo,monospace;color:#5b6670;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:4px;text-align:center}
.stars{display:flex;align-items:center}.stars span{width:44px;height:44px;display:flex;align-items:center;justify-content:center}
.nb{white-space:nowrap;display:inline-block;border:1px dashed #C0392B;color:#8F2418;background:#FAEDEB;font:700 9px Inter;letter-spacing:.3px;padding:2px 6px;border-radius:6px;align-self:flex-start}
.ctr{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.disc{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;background:#F6F7F8}.disc.ok{background:#E9F8EF}
.sk{background:#EEF1F3;border-radius:8px}
.numpad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.numpad span{min-height:48px;border-radius:10px;background:#F6F7F8;display:flex;align-items:center;justify-content:center;font:600 ${z(20)} Inter}
.boxes{display:flex;gap:8px;justify-content:center}.boxes span{width:48px;height:56px;border-radius:12px;border:1.5px solid #E2E6EA;display:flex;align-items:center;justify-content:center;font:700 ${z(24)} Inter}.boxes span.on{border:2px solid #00B14F}.boxes.s6 span{width:40px;height:52px;font-size:${z(22)}}
.tick{display:flex;align-items:flex-start;gap:12px;min-height:52px;padding:10px 12px;border:1px solid #E2E6EA;border-radius:12px}.tick .bx{width:24px;height:24px;border-radius:6px;border:2px solid #C9D0D6;flex:none;display:flex;align-items:center;justify-content:center}.tick.on{border:1.5px solid #006630;background:#E9F8EF}.tick.on .bx{background:#006630;border-color:#006630}
.mh{background:#E9F8EF;padding:6px 16px 14px;border-radius:0 0 20px 20px}
.ab{height:56px;display:flex;align-items:center;gap:4px;padding:0 8px 0 4px;border-bottom:1px solid #E2E6EA}.ab b{flex:1;min-width:0;font:700 ${z(16)} Inter;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t44{width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex:none;border-radius:50%}
.pill{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;border-radius:999px;font:700 ${z(12)} Inter;white-space:nowrap}
.fbar{background:#063B22;color:#fff;border-radius:18px;padding:10px 12px;display:flex;align-items:center;gap:10px;min-height:64px}.fbar .bd{width:40px;height:40px;border-radius:50%;background:#00B14F;display:flex;align-items:center;justify-content:center;flex:none}.fbar .bd img{width:26px;height:26px}.fbar b{display:block;font:700 ${z(14)}/1.3 Inter}.fbar small{display:block;font-weight:400;font-size:${z(12.5)};color:#BFE6CD;margin-top:1px}
.segs{display:flex;gap:3px;margin-top:6px}.segs i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.22)}.segs i.on{background:#00B14F}
.push{background:#fff;border-radius:16px;padding:12px 14px;display:flex;gap:10px;box-shadow:0 1px 4px rgba(20,24,27,.08)}.push .pi{width:28px;height:28px;border-radius:50%;background:#00B14F;flex:none;display:flex;align-items:center;justify-content:center}.push b{display:block;font:700 13.5px/1.3 Inter}.push p{margin:2px 0 0;font-size:13px;line-height:1.35;color:#3b444b}.push small{font-size:11px;color:#5b6670}
</style>`);
/* ---------- parts ---------- */
const sb=t=>`<div class="sb"><span>${t||'12:20'}</span><span>3G 84%</span></div>`;
const nb=t=>`<span class="nb">NEEDS BACKEND${t?' · '+t:''}</span>`;
const hdr=(title,o)=>{o=o||{};return `<div class="hd">${sb(o.t)}<div class="hb"><span class="bk">${o.noBack?'':i('chevron-left',22,'#006630')+O.c.back}</span><span class="tt">${title||''}</span><span class="rs">${o.help?`<span class="helpp"><span>${i('life-buoy',15,'#C0392B')}${O.c.help}</span></span>`:''}</span></div></div>`};
const sticker=(s,sz)=>`<img src="assets/service-icons/v2/${ICO[s]}.svg" style="width:${sz||28}px;height:${sz||28}px" alt="">`;
const vdisc=(s,sz)=>`<span class="vdisc" style="background:${TK.tile[s]};${sz?`width:${sz}px;height:${sz}px`:''}">${sticker(s,sz?sz*.72:30)}</span>`;
/* faux map; positions in % of the map box */
const VP=[24,30],DP=[74,66];
const bz=t=>{const P=[VP,[30,62],[58,34],DP],u=1-t;return [0,1].map(k=>u*u*u*P[0][k]+3*u*u*t*P[1][k]+3*u*t*t*P[2][k]+t*t*t*P[3][k])};
const map=(o)=>{o=o||{};const s=o.s||'food';
 let h=`<div class="map" data-map="1"><span class="rd" style="left:0;right:0;top:44%;height:10px"></span><span class="rd" style="left:58%;width:9px;top:0;bottom:0"></span><span class="rd" style="left:14%;width:7px;top:0;bottom:0"></span><span class="rd" style="left:0;right:0;top:78%;height:7px"></span><span class="pk" style="left:30%;top:8%;width:22%;height:26%"></span><span class="pk" style="left:70%;top:52%;width:20%;height:18%"></span>`;
 if(o.empty)return h+'</div>';
 const path=`M${VP[0]} ${VP[1]} C30 62, 58 34, ${DP[0]} ${DP[1]}`;
 h+=`<svg class="rt" viewBox="0 0 100 100" preserveAspectRatio="none">`;
 if(o.route==='solid'){const t=o.rt||.5;h+=`<path d="${path}" fill="none" stroke="#00B14F" stroke-width="5" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;}
 else h+=`<path d="${path}" fill="none" stroke="#5B6670" stroke-width="3" stroke-dasharray="6 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
 if(o.rider&&o.rider.to)h+=`<path d="M${o.rider.at[0]} ${o.rider.at[1]} Q ${o.rider.at[0]-6} ${VP[1]+4}, ${VP[0]} ${VP[1]}" fill="none" stroke="#14181B" stroke-width="3" stroke-dasharray="2 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
 h+=`</svg>`;
 if(!o.noVenue)h+=`<div class="pin" style="left:${VP[0]}%;top:${VP[1]}%"><span class="vpin" style="background:${TK.tile[s]}">${sticker(s)}</span><span class="pl">${o.vn||V.gava.n}</span></div>`;
 h+=`<div class="pin" style="left:${DP[0]}%;top:${DP[1]}%"><span class="dpin"></span><span class="pl">${O.c.you}</span></div>`;
 if(o.rider){const p=o.rider.at||bz(o.rider.t);h+=`<div class="pin" style="left:${p[0]}%;top:${p[1]}%"><span class="rpin ${o.rider.paused?'pz':''}">${i('bike',17,'#fff')}</span><span class="pl">${o.rider.paused?O.t.lastSeen:o.rider.label||'Tendai'}</span></div>`;}
 return h+(o.dim?'<div style="position:absolute;inset:0;background:rgba(255,255,255,.5);z-index:7"></div>':'')+'</div>'};
const sheet=(c,o)=>`<div class="sheet" ${o&&o.top?`data-top="${o.top}"`:''}><div class="grab"></div><div class="scw"><div class="sc">${c}</div></div></div>`;
const btn=(l,o)=>{o=o||{};return `<div class="btn ${o.k||''}">${o.load?'<span class="spin"></span>':o.ic?i(o.ic,18):''}${l}</div>`};
const sm=(l,ic,o)=>{o=o||{};return `<span class="sm ${o.k||''} ${o.fl?'fl':''}">${o.load?'<span class="spin" style="width:16px;height:16px"></span>':ic?i(ic,16):''}${l}</span>`};
const bar=(b,hint,row)=>`<div class="bar">${hint?`<div class="hint">${hint}</div>`:''}${row?`<div class="row">${b}</div>`:b}</div>`;
const track=(s,cur,o)=>{o=o||{};const st=O.svc[s].st.slice();if(o.rx)st[0]=O.svc.pharmacy.stRx;return `<div class="trk">${st.map((l,k)=>{const d=k<cur,n=k===cur;return `<div>${k>0?`<span class="ln ${k<=cur?'on':''}" style="left:0;right:50%"></span>`:''}${k<3?`<span class="ln ${k<cur?'on':''}" style="left:50%;right:0"></span>`:''}<span class="c ${d?'d':n?'n':''}">${d?i('check',12,'#fff','stroke-width:3'):k+1}</span><span class="l ${d?'d':n?'n':''}">${l}</span></div>`}).join('')}</div>`};
const top=(title,eta,o)=>{o=o||{};return `<div><div class="h2">${title}</div>${eta?`<div class="eta">${o.chip?`<span class="chip">${eta}</span>`:`${i('clock',16,'#5b6670')}<span>${eta}</span>`}</div>`:''}${o.sub?`<div class="mut" style="margin-top:4px">${o.sub}</div>`:''}</div>`};
const venueRow=(vk,o)=>{o=o||{};const v=V[vk];return `<div class="vrow">${vdisc(v.s)}<div class="grow"><div style="font:700 ${z(15)} Inter">${v.n}</div><div class="mut">${o.sub||f(O.c.orderNo,{id:ID})}</div></div>${o.call===false?'':sm(O.c.call,'phone')}</div>`};
const riderCard=o=>{o=o||{};return `<div class="card"><div class="row" style="gap:12px"><span class="av">TM</span><div class="grow"><div class="row" style="gap:6px;flex-wrap:wrap"><b style="font:700 ${z(16)} Inter">Tendai M.</b><span class="ver">${i('shield-check',13,'#006630')}${O.c.verified}</span></div><div class="row mut" style="gap:10px;flex-wrap:wrap;margin-top:2px"><span class="row" style="gap:4px">${i('star',13,'#14181b','fill:#14181b')}4.8 · 132 ${O.c.trips}</span><span class="row" style="gap:6px">${O.c.bike}<span class="plate" style="color:#14181b">ABH 4721</span></span></div></div></div>${o.nobtn?'':`<div class="row" style="gap:8px">${sm(O.c.call,'phone',{fl:1})}${sm(O.c.whatsapp,'message-circle',{fl:1})}</div>`}</div>`};
const digits=()=>`<span class="digits"><span>${CODE.slice(0,3)}</span><span>${CODE.slice(3)}</span></span>`;
const codeCard=o=>{o=o||{};return `<div class="code"><div class="row"><div class="grow"><div class="lbl" style="color:#006630">Delivery code</div>${digits()}</div>${sm(O.p.shareCode,'share-2',{k:'w'})}</div><div style="font-size:${z(13)};line-height:1.4">${O.t.codeHelp}</div></div>`};
const codeBig=()=>`<div class="codebig"><div class="lbl" style="color:#006630">Delivery code</div><div class="pan">${digits()}</div><div style="font-size:${z(14)};line-height:1.4;text-align:center">${f(O.p.s3)} — Tendai types it in to finish.</div></div>`;
const prep=(s,m,pct,nn)=>`<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="justify-content:space-between"><b style="font:600 ${z(14)} Inter">${f(O.t.prepLeft,{making:O.svc[s].making,m})}</b></div><div class="prog"><i style="width:${pct}%"></i></div>${nn?'':`<div class="mut">${O.t.prepNote}</div>`}</div>`;
const lines=(o,opt)=>{opt=opt||{};return o.lines.map(l=>`<div class="li"><span class="q">${l[0]}×</span><span class="nm">${l[1]}${l[4]?` <span class="pill" style="background:#FFF6D6;color:#3D3100;height:20px;font-size:11px">${O.r.rxNeed}</span>`:''}${l[3]&&!opt.nonote?`<div class="mut">“${l[3]}”</div>`:''}</span><span class="pr">${usd(l[2])}</span></div>`).join('')};
const summary=(ok,open)=>{const o=ORD[ok],s=V[o.v].s,n=o.lines.reduce((a,l)=>a+l[0],0);return `<div class="card" style="gap:0;padding:4px 12px"><div class="row" style="min-height:44px"><div class="grow"><b style="font:700 ${z(14)} Inter">${O.t.order}</b><div class="mut">${n} ${O.svc[s].items} · ${usd(tot(o))} cash</div></div><span style="font:600 ${z(13)} Inter;color:#006630;display:flex;align-items:center;gap:2px;min-height:44px">${open?O.t.hideOrder:O.t.viewOrder}${i(open?'chevron-up':'chevron-down',16,'#006630')}</span></div>${open?`<div style="border-top:1px solid #E2E6EA">${lines(o)}</div>`:''}</div>`};
const photoRow=(t,s)=>`<div class="card" style="flex-direction:row;align-items:center;gap:12px;padding:10px 12px"><span class="photo" style="width:48px;height:48px;border-radius:10px"></span><div class="grow"><b style="font:700 ${z(14)} Inter;display:block">${t}</b><div class="mut">${s}</div></div>${sm(O.c.view,'image')}</div>`;
const toast=(t,b,act,ic)=>`<div class="toast" style="bottom:${b||84}px">${i(ic||'circle-alert',18,'#fff')}<span style="flex:1">${t}</span>${act?`<span class="ta">${act}</span>`:''}</div>`;
const note=(k,ic,h,c)=>`<div class="note ${k||''}">${ic?i(ic,18,c||(k==='ok'?'#006630':k==='hi'?'#3D3100':k==='dn'?'#8F2418':k==='ink'?'#fff':'#5b6670')):''}<span style="flex:1">${h}</span></div>`;
const msheet=(c)=>`<div class="dim"></div><div class="msh"><div class="grab" style="margin:0 -16px"></div>${c}</div>`;
const kv=(k,v,t)=>`<div class="kv ${t?'t':''}"><span>${k}</span><b>${v}</b></div>`;
const stars=(n,s)=>`<div class="stars">${[1,2,3,4,5].map(k=>`<span>${i('star',s||32,k<=n?'#C99500':'#C9D0D6',k<=n?'fill:#FFD23F':'')}</span>`).join('')}${n?`<b style="margin-left:4px;color:#006630;font:700 ${z(14)} Inter">${O.d.rl[n]}</b>`:''}</div>`;
const ph=(c,cls)=>`<div class="ph ${cls||''}">${c}</div>`;
/* order screen shell */
const OS=(o)=>ph(hdr(o.title,{help:o.help!==false})+(o.map===false?'':map(o.map||{}))+(o.offline?`<div style="position:absolute;left:12px;right:12px;top:87px;z-index:15">${note('ink','wifi-off',f(O.c.offline,{t:'12:31'}))}</div>`:'')+sheet(o.body,{top:o.top})+(o.bar||'')+(o.extra||''),o.cls);
/* layout: sheet peek measured from content; map ends 18px under the sheet edge */
const layout=root=>{(root||document).querySelectorAll('.ph').forEach(p=>{const H=p.clientHeight,s=p.querySelector(':scope>.sheet');if(!s)return;const b=p.querySelector(':scope>.bar'),bh=b?b.offsetHeight:0;
 s.querySelector('.scw').style.bottom=bh+'px';const sc=s.querySelector('.sc'),tk=sc.querySelector(':scope>[data-peek]')||(sc.querySelector(':scope>.trk')&&sc.querySelector(':scope>.trk').nextElementSibling);const need=(tk?tk.offsetTop+tk.offsetHeight+16:sc.scrollHeight)+28+bh;let t=s.dataset.top?+s.dataset.top:Math.max(77+(p.dataset.minmap?+p.dataset.minmap:110),H-need);s.style.top=t+'px';const m=p.querySelector(':scope>.map');if(m)m.style.bottom=(H-t-18)+'px';});};
window.OK={O,f,z,usd,i,TK,V,ORD,sub,small,tot,CODE,PICK,ID,sb,nb,hdr,sticker,vdisc,map,sheet,btn,sm,bar,track,top,venueRow,riderCard,digits,codeCard,codeBig,prep,lines,summary,photoRow,toast,note,msheet,kv,stars,ph,OS,layout};
})();
