// LyniaGo · Download QR popup (website) + iPhone Add-to-Home-Screen tip (customer web app)
// Every user-visible string, verbatim. All strings are NEW. Do not add dates or numbers.

export const downloadCopy = {
  // lyniago.com — desktop popup opened by any "Download the app" button
  qrPopup: {
    sticker: 'Point. Scan. Go.',
    title: 'Scan to get LyniaGo',
    line: 'Point your phone’s camera at the code.',
    qrAlt: 'QR code to download LyniaGo',
    closeLabel: 'Close',                 // aria-label on the ✕
    dialogLabel: 'Get the LyniaGo app',  // aria-label fallback if title id missing
  },
} as const;

export const installTipCopy = {
  // app.lyniago.com/?install=1 on iPhone Safari (not installed) — 360×720 and up
  sheet: {
    chip: 'LyniaGo for iPhone · ETA: soon',
    title: 'Our iPhone app is still on its bike.',
    body: 'It’s riding to the App Store. Don’t wait for this delivery: pin LyniaGo to your Home Screen and it opens full-screen, just like an app.',
    tracker: ['Packed', 'On the way', 'App Store'],
    steps: [
      { title: 'Tap Share', sub: 'On iOS 26 it’s under ···' },
      { title: 'Choose Add to Home Screen', sub: 'Scroll a little if you don’t see it' },
      { title: 'Tap Add. Done.', sub: 'LyniaGo lands next to your apps' },
    ],
    primary: 'Got it, let’s send',
    closeLabel: 'Close',
  },
  // viewport width < 360 (designed at 320×640)
  sheetSmall: {
    chip: 'iPhone app · ETA: soon',
    title: 'Our iPhone app is still on its bike.',
    body: 'Pin this one to your Home Screen. It opens full-screen, just like an app.',
    steps: [
      { title: 'Tap Share', sub: 'iOS 26: under ···' },
      { title: 'Add to Home Screen' },
      { title: 'Tap Add. Done.' },
    ],
    primary: 'Got it, let’s send',
  },
  // Home after the sheet is dismissed (iPhone Safari, not installed)
  pinRow: {
    label: 'Pin LyniaGo to your Home Screen',
    action: 'How',
    dismissLabel: 'Dismiss',
  },
  // Only when APP_STORE_URL is configured
  launched: {
    chip: 'Delivered',
    title: 'Special delivery: LyniaGo for iPhone.',
    body: 'The app has arrived on the App Store. Same account, same orders, a bit faster.',
    tracker: ['Packed', 'On the way', 'App Store'],
    primary: 'Get it on the App Store',
    secondary: 'Keep using the web app',
  },
} as const;
