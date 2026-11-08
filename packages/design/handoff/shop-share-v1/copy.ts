/* LyniaGo · Shop share v1 · every user-facing string (2026-11-08). Ships verbatim.
   {x} is a runtime value. All strings are NEW unless marked "existing". */
export const SH = {
  link:{
    host:'lyniago.com/s/',
    webApp:'app.lyniago.com/s/'
  },
  merchant:{
    rowT:'Share your shop',
    rowS:'Customers who open your link can order from you',
    sheetT:'Share your shop',
    sheetS:'Customers see this when you share your link.',
    branchLabel:'Which branch?',
    branchHelp:'Each branch has its own link.',
    shareWa:'Share on WhatsApp',
    copyLink:'Copy link',
    copied:'Copied',
    qrRow:'Show QR for your counter',
    linkLabel:'Your link',
    toastCopied:'Link copied',
    waText:'Order from {shop} on LyniaGo: {link}',
    qrTitle:'QR for your counter',
    qrScan:'Scan to order',
    qrSub:'Open your phone camera and point it here.',
    qrSave:'Save to phone',
    qrPrint:'Print',
    qrSaved:'Saved to your photos',
    qrA11y:'QR code for {link}'
  },
  customer:{
    shareA11y:'Share {shop}',
    shareText:'{shop} is on LyniaGo: {link}',
    shareSubject:'{shop} on LyniaGo'
  },
  chip:{
    lead:'Taking you to',
    noName:'the shop',
    a11y:'After you sign in, we’ll take you to {shop}.'
  },
  web:{
    pageTitle:'{shop} on LyniaGo',
    line:'Order on LyniaGo. Delivered by bike in Harare.',
    openApp:'Open in LyniaGo',
    opening:'Opening LyniaGo…',
    stalled:'Didn’t open? Tap Open in LyniaGo.',
    orderWeb:'Order on the web',
    havePlay:'Have Google Play? Open in LyniaGo',
    help:'Help on WhatsApp',
    scan:'Scan to order on your phone',
    scanSub:'Open your phone camera and point it at the code.',
    orLink:'Or open this link on your phone',
    copyLink:'Copy link',
    copied:'Copied',
    deadT:'This shop isn’t on LyniaGo right now',
    deadS:'Food, shops and pharmacy, delivered by bike.',
    deadApp:'Open LyniaGo',
    deadWeb:'Go to LyniaGo',
    footer:'© 2026 LyniaGo'
  },
  og:{
    title:'{shop} on LyniaGo',
    desc:'Order from {shop} on LyniaGo. Delivered by bike in Harare.',
    genericTitle:'LyniaGo',
    genericDesc:'Food, shops and pharmacy, delivered by bike',
    imgAlt:'{shop} on LyniaGo',
    genericAlt:'LyniaGo'
  },
  arrival:{
    setAddr:'Set where to deliver',
    setAddrSub:'to see time and fee',
    outT:'{shop} doesn’t deliver to {area} yet',
    outCta:'Change address',
    goneT:'This shop isn’t on LyniaGo right now',
    goneS:'Lots of places near you are.',
    goneCta:'Browse restaurants',
    netT:'Can’t reach LyniaGo',
    netS:'Check your data. We’ll keep the shop for you.',
    netCta:'Try again',
    schedule:'Schedule for {t}'
  },
  biker:{
    t:'This is a shop link. Open as a customer?',
    s:'{shop} opens on the customer side. Switch back in Account.',
    yes:'Open as customer',
    no:'Stay on jobs',
    busyT:'Finish your delivery first',
    busyS:'Open the link again after this job to see {shop}.',
    busyOk:'OK'
  }
} as const;

/** Fill {x} placeholders. */
export const fill = (s: string, o: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? String(o[k]) : m));
