# Motion & interaction audit — 2026-10-03

**Scope:** the mobile app (`apps/mobile`), customer and rider. This is read-only: four parallel audits covered the shared primitives, the flows, the handoff specs and performance.

**Trigger:** the tab bar v1.4 rebuild (D-56 §5) gave one part of the app smooth, consistent motion. The owner asked how to bring that feel to the whole app.

## Verdict

The tab bar is the only part of the app built to a motion standard. Elsewhere:

- **Most screens have no motion at all.** Home, Send, Browse, Review & place, the rider board and Money change state with hard cuts.
- **Where motion exists, it is hand-rolled and inconsistent.** There are 13 different easing curves and 9 different durations. One spring overshoots. Some animations run on the JS thread.
- **The design is part of the cause.** The handoffs have **no shared motion tokens**, and they contradict each other (overshoot vs none, a 0.94 vs 0.97 press scale, 4s vs 2.2s toasts, a 250 vs 400ms map re-fit). Several key moments have no motion spec at all: screen transitions, sheet enter and exit, list inserts, skeleton→content.

The biggest problems for customers fall into three groups:

1. **Sheets** look wrong (the backdrop slides up with the sheet) and the main order and job sheet stutters on low-end phones.
2. **Moments of change** are abrupt: placing an order, a job arriving or being taken, a swiped notification, the cart bar.
3. **Re-render cost** makes everything else less smooth. Whole screens re-render every second, and long lists aren't windowed.

## What customers feel, ranked

| # | Where | What's wrong | Evidence | Fix |
|---|---|---|---|---|
| 1 | Every bottom sheet (16 of them: browse item, location, safety, KYC, order and orderflow panels, rider, proof) | The dim backdrop slides up *with* the sheet instead of fading in. The handle is decorative, so you can't drag the sheet down. Tapping the backdrop flashes a full-screen ripple. Reduce motion is ignored. | `browse/sheets.tsx:26`, plus 10 more `Modal animationType="slide"` and 5 `"fade"` | One `Sheet` primitive: the scrim fades over 300ms, the panel slides 420ms on the standard curve (native driver), drag-to-dismiss uses velocity, and everything is instant under reduce motion. |
| 2 | Order screen, merchant order screen, **rider board** | The sheet animates `top` on the JS thread. Each frame of a drag re-lays out the whole job list, so it stalls and jumps when a socket update lands. A fast flick settles as slowly as a slow drag. | `order/OrderSheet.tsx:95,117,143` | A fixed-height sheet moved by `translateY` on the native driver, with duration scaled by velocity and distance. |
| 3 | Order screen, on a stage change | The sheet snaps twice: first to a fallback, then to the measured peek. The map camera re-fits twice. | `OrderSheet.tsx:76`, `OrderMap.tsx:152` | Keep the old mark until the new one is measured, then animate once. Re-fit on the settled height. |
| 4 | Order screen, on load | The map unmounts and remounts (`BlankMap` → `OrderMap`). Tiles reload and the camera jumps from Harare. | `app/order/[id].tsx:684,695` | Keep one MapView that is always mounted, and add the pins when they arrive. |
| 5 | Browse item sheet | On Add or close, the content blanks *before* the sheet slides away, so an empty white slab slides down. | `browse/sheets.tsx:218` | Keep the last item until the exit animation ends. |
| 6 | Browse cart bar | The bar unmounts when the item sheet opens and pops back on Add. The count and total don't react. | `app/food/[id].tsx:290`, `ShopStoreScreen.tsx:211` | Keep the bar mounted. Slide it in on the first add, and give the total a small pulse on change. |
| 7 | Placing an order | The empty-basket screen flashes during the transition, because the cart is cleared before navigating. The "placing" veil pops on and off. There is no success haptic. | `app/food/checkout.tsx:340,355,624`, `send.tsx:418` | Navigate first, then clear the cart. Fade the veil. Use `haptic("success")`. |
| 8 | Rider board | Job cards appear and vanish instantly, and a taken job just disappears. The camera re-fits on every new or expired job and every ~100m, which undoes the rider's own pan and zoom. | `rider/(tabs)/index.tsx:631,643`, `rider/board.tsx:205` | Animate insert (fade plus an 8px rise) and removal (fade, then collapse). Fit the camera once per focus or on a tap, never mid-gesture. |
| 9 | Toasts (4 implementations) | `RToast`, `OrderToast` and `BrowseToast` pop in and out. A toast replacing another cuts the old one off. | `rider/board.tsx:290`, `[id].tsx:672`, `browse/store.tsx:697`, `Toast.tsx:134` | One animated toast host (300ms fade plus a slide) with a cross-fade when one replaces another. |
| 10 | Notifications | A swiped row slides out, then the list snaps shut over the gap. Undo re-inserts the row instantly. Every pan move triggers a re-render. | `notifications/kit.tsx:258,263` | Collapse height and opacity after the slide, reverse that on Undo, and keep the pan off React state. |
| 11 | Send a parcel | Each step change is a hard cut, and the map is destroyed and rebuilt on 1→2 and on Back. The progress bar jumps. | `app/send.tsx:474,521` | Keep the map mounted. Slide steps horizontally (420ms, direction follows forward or back). Animate the progress fill. |
| 12 | Home | The live-order bar appears and disappears instantly. The skeleton→rails swap is hard. The skeletons don't pulse. | `home/kit.tsx:412,466`, `home.tsx:418` | Slide the bar up from behind the tab bar, fade the skeletons into content, and tween the step fill. |
| 13 | Tab switches | The bar's indicator glides, but the screen content cuts instantly. | `(tabs)/_layout.tsx:18`, `rider/(tabs)/_layout.tsx:17` | `animation: "fade"` on both `Tabs` navigators. |
| 14 | Tracking map | The dotted rider→pickup line jumps ahead while the bike glides. The rider marker remounts every minute (its key includes the "last seen" label). | `OrderMap.tsx:183,189` | Drive the line from the same animated value as the marker, and take the label out of the key. |
| 15 | Press feedback everywhere | Android buttons ripple. Only the tab bar scales. `Button` is a raw `Pressable` that re-renders on press, and 24 raw `Pressable`s give mixed or no feedback (SOS, address search, map controls). There's no double-tap guard, so a double tap can navigate twice. | `Tappable.tsx:62`, `index.tsx:266` | An opt-in native 0.97 press scale in `Tappable` for cards and CTAs, a `once` guard, and `Button` moved onto it. |
| 16 | Images | Photos pop in, which is harsh on 2G/3G. | `RemoteImage.tsx:45` | `transition={300}` plus a tinted placeholder (0 under reduce motion). |
| 17 | Offline banner and system states | They appear instantly and shift the layout. | `OfflineBanner.tsx`, `Banner.tsx` | A 300ms fade with a height reveal. |
| 18 | OTP | A wrong code gets no haptic and no shake. | `app/verify.tsx:141` | `haptic("warning")` plus a short horizontal shake (none under reduce motion). |

## Smoothness on low-end Android (2–3 GB, Android 8+)

| # | Issue | Evidence | Fix |
|---|---|---|---|
| P1 | The "finding a rider" rings marker is re-rasterised every frame for the whole auction, which costs battery and frame rate. | `OrderMap.tsx:173` (`tracksViewChanges={!reduceMotion}`) | Native `Circle` overlays, or an Animated overlay outside the map |
| P2 | `food-job.tsx` (1,300 lines plus a map) re-renders **every second** for the whole delivery. The Orders tab re-renders every history row every 15s, and Notifications on every tick. | `rider/food-job.tsx:583`, `(tabs)/orders.tsx:85`, `notifications/index.tsx:195` | Move the clocks into small countdown components that take a deadline, and `React.memo` the rows |
| P3 | Orders history is a growing `ScrollView` + `.map`. The FlatLists set no windowing props, and their rows aren't memoised. | `(tabs)/orders.tsx:279`, `food/index.tsx:232`, `browse/kit.tsx:403` | `SectionList`, memoised rows, `windowSize≈5`, `initialNumToRender≈6`, `removeClippedSubviews` |
| P4 | Tabs you've left keep re-rendering on every socket and query update. Map screens mount in the same frame as the push. | no `freezeOnBlur` / `lazy` anywhere; `order/[id].tsx:1058` | `freezeOnBlur: true`. Reuse ComposeMap's `runAfterInteractions` + `BlankMap` pattern |
| P5 | Menu scroll-spy re-renders the whole menu on each scroll event | `food/[id].tsx:270` | Memoise `DishRow`/`PopularCard`. Keep the scroll state out of the menu's render |
| P6 | ✅ **Fixed in #1049.** The splash exit animated `borderRadius` on the JS thread while Home mounts. The splash's delays, pops and loops were also chained on the JS thread, and re-renders rebuilt its native transforms mid-animation. | `BootSplash.tsx:362` (before) | Done: the corners are native-scaled cut-outs (`RevealCorners`), and every splash animation is one native timing (`splash/motion.ts`) |
| P7 | Map glides (800–900ms) hold the JS thread on every GPS fix | `OrderMap.tsx:146`, `MerchantMap.tsx:98`, `LiveMap.tsx:123` | Snap the marker on low-RAM devices, or use the native `animateMarkerToCoordinate` |

**Reanimated / gesture-handler:** not now. Neither is installed, and both would need a new binary. Reanimated 4 also needs the New Architecture, which is off. Native-driver `translateY` fixes most of the jank. Revisit together with the New Architecture spike if drag smoothness is still poor in the `tap_ack` RUM data.

## Reduce motion and haptics

- **Reduce motion:** there are four separate implementations. Two read the setting once and never update. These ignore it entirely: all 16 Modals, stack transitions, the orders spinner, the notification swipe and the LiveMap fit. **Fix:** one hook, used through the motion module below.
- **Haptics:** rider flows are well covered (44 call sites). Customer peaks get none: order placed, item added (outside one screen), payment and KYC result, wrong OTP.

## The design side (this needs Claude Design)

The app can't invent a motion language: "the design kit is the source of truth" (CLAUDE.md). So the fix comes in two layers:

1. **Bugs and performance (rows 2–8, 10–11, 14, P1–P7).** These fix broken or janky behaviour without changing what the mocks draw, so they can ship now.
2. **A shared motion standard.** One curve, a duration scale, the press scale, sheet physics, toast timing, the undo window, list insert and remove, skeleton→content, screen transitions, reduce-motion rules and a haptics map. This should come from Claude Design as a `motion-v1` handoff with tokens (e.g. `--ease-standard`, `--dur-fast/base/slow`) in `tokens/`. tab-bar v1.4 is the natural seed. The handoff must also settle the contradictions between handoffs:
   - a curve with overshoot (splash, rider-v2 spring) vs without (tab bar);
   - a press scale of 0.97 vs 0.94 vs colour-only;
   - toasts lasting 4s vs 2.2s;
   - undo windows of 10s vs 5s;
   - a map re-fit of 400 vs 250ms;
   - reduce motion that removes everything vs slows spinners vs cross-fades over 200ms.

## Proposed plan

| Phase | What | Ships as |
|---|---|---|
| 0 | `src/ui/motion.ts` holds the tab bar's curve and durations, one `useReduceMotion` and a `timing()` helper. A guard test blocks raw durations, `Animated.spring` and new `useNativeDriver: false` outside it. | OTA |
| 1 | Primitives: the `Sheet` (moves all 16 Modals onto it), the toast host, `Tappable` press scale + `once` guard, `RemoteImage` fade, banner reveal, tab cross-fade | OTA |
| 2 | Flow fixes: the order sheet on native `translateY` with a single snap, a persistent map, the item sheet exit, the cart bar, order-placed handoff + success haptic, rider board inserts and camera, notification collapse, Send step slides, Home live bar | OTA |
| 3 | Performance: the finding rings, local countdowns + memoised rows, list windowing, `freezeOnBlur`, deferred map mount | OTA |
| 4 | Ask Claude Design for `motion-v1`, then align phases 0–2 to its tokens and log it in the ledger | Design → OTA |

Every phase is JS-only, so each one can go out as an over-the-air update with no new store build.
