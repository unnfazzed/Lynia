// Shop front v1 (2026-10-18) · every user-visible string, verbatim.
// `food` = restaurant. `shop` = shop AND pharmacy (vocabulary.ts: businessType === "shop").
// Strings marked NEW did not exist before this redesign; everything else is carried over from CURRENT-COPY.md.
export const SF = {
  appBar: "Shop front",
  accountMeta: "Banner, logo and tags",
  intro: "This is your shop front. Changes go live straight away.",
  introNotLive: "This is your shop front. Customers will see it when LyniaGo Shops opens.",
  loading: "Loading your shop profile…",
  loadFailT: "Couldn't load your shop profile.",
  loadFailB: "Check your data connection and try again.",
  retry: "Try again", // T14b "↻ Try again": the ↻ is drawn as the rotate-cw icon
  staff: "Only the owner changes the shop front.",

  previewLabel: "WHAT CUSTOMERS SEE",
  nameFallback: "Your shop",
  descFallback: "One line customers read",
  change: "Change", // NEW · chip on the banner
  changeBannerA11y: "Change banner photo", // NEW · aria-label of the whole banner
  changeLogoA11y: "Change logo", // NEW · aria-label of the logo
  addBanner: "Add a banner photo", // NEW · empty banner slot
  addBannerSub: { food: "A wide photo of your food", shop: "A wide photo of your shop" }, // NEW
  logoSlot: "Logo", // NEW · empty logo slot
  tip: {
    food: "A real photo of your food beats a logo on the banner. Shoot in daylight, no flash — and keep the left edge clear, your logo sits there.",
    shop: "A real photo of your shop beats a logo on the banner. Shoot in daylight, no flash — and keep the left edge clear, your logo sits there.",
  },

  nameLabel: "Shop name",
  nameMax: 120,
  nameErr: "Your shop needs a name.", // NEW
  descLabel: "One line customers read",
  descMax: 500,
  descHelp: "Shows under your name.", // NEW
  counter: (n: number, max: number) => `${n} / ${max}`, // NEW · shown from 100 (name) / 450 (line)

  tagsLabel: { food: "What you cook", shop: "What you sell" },
  tagsCount: (n: number) => `${n} of 3`, // NEW · replaces "· up to 3"
  tagPh: "Type a tag", // replaces "Type a tag, press Enter"
  tagAdd: "Add", // NEW
  tagRemoveA11y: (t: string) => `Remove ${t}`, // NEW
  tagSuggest: "Or tap one", // NEW
  tagFull: "That's 3. Remove one to add another.", // NEW
  tagDup: (t: string) => `${t} is already added.`, // NEW
  tagMax: 24,
  // One-tap suggestions. Shops and pharmacies reuse vocabulary.ts SHOP_STARTERS for their kind.
  // `food` is PROPOSED (open item in README): no restaurant tag list exists in code yet.
  suggest: {
    food: ["Sadza", "Grill", "Traditional", "Chicken", "Fast food"],
    pharmacy: ["Pain relief", "Cold & flu", "Vitamins", "Personal care"],
    auto_parts: ["Engine", "Brakes", "Electrical", "Tyres"],
  },

  priceLabel: "Price level",
  optional: "optional", // NEW
  priceHelp: "Tap it again to clear.", // NEW
  price: ["$", "$$", "$$$"],

  save: "Save changes",
  saving: "Saving…",
  saved: "Saved. Customers see it now.", // toast · live shop front
  savedNotLive: "Saved", // toast · shop not live yet
  saveFail: "Couldn't save — try again.", // or the API's own message

  leaveT: "Leave without saving?", // NEW
  leaveB: "Your changes to the shop front will be lost.", // NEW
  leaveKeep: "Keep editing", // NEW
  leaveGo: "Leave", // NEW

  photoTitle: { banner: "Banner photo", logo: "Logo" }, // NEW · photo sheet titles
  logoSub: "Shown in a circle on the left of your banner.", // NEW
  takePhoto: "Take a photo", // NEW
  choosePhoto: "Choose from your phone", // NEW · replaces "Choose a file"
  remove: { banner: "Remove banner", logo: "Remove logo" }, // NEW
  cancel: "Cancel",
  removed: { banner: "Banner removed. It goes when you save.", logo: "Logo removed. It goes when you save." }, // NEW
  undo: "Undo",

  shrinking: "Shrinking…",
  uploading: "Uploading…",
  waitSave: "Save waits until the photo is done.", // NEW
  prepFail: "Couldn't prepare that photo.",
  prepSub: "Try again, or pick another photo.", // NEW
  uploadFail: "Upload failed.",
  failSub: "The photo is still on this phone.", // NEW
  retryShort: "Retry",

  crop: {
    banner: { title: "Position your banner", sub: "Drag the picture and slide to zoom. Anything outside the dashed frame is cut off.", save: "Save banner" },
    logo: { title: "Position your logo", sub: "Square crop. Drag the picture and slide to zoom — anything outside the dashed frame is cut off.", save: "Save logo" },
    drag: "Drag to move",
    zoomOut: "Zoom out",
    zoom: "Zoom",
    zoomIn: "Zoom in",
    livePreview: "LIVE PREVIEW",
    bannerDescFallback: "The line customers read under your name.",
    logoPreviewSub: "Your logo, as customers see it",
    unreadable: "That file couldn't be opened as a photo. Pick a JPEG or PNG from this phone.",
    alreadyFits: "This photo is already exactly the right shape — nothing is being cut off, so there is nothing to move. Zoom in if you want a closer crop.",
  },
} as const;
