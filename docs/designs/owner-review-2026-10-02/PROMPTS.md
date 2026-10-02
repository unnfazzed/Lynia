# Claude Design prompts: owner UI review, 2026-10-02

The owner's 2026-10-02 review raised three things the app should not improvise: no handoff draws them.
Each section below is a self-contained prompt. Paste it into Claude Design, attach the files it lists, and
bring the export back as a new `packages/design/handoff/<name>/` folder. Until an export lands, the app
keeps the current screen (ledger D-60 §5).

| # | Prompt | Replaces in the app | Priority |
|---|---|---|---|
| 1 | Become a rider: rider photo | `app/rider/become.tsx` photo step (old UI, see the owner's screenshot) | High: every new rider sees it |
| 2 | Orders tab, empty states | `app/(tabs)/orders.tsx` empty card (old `RC orders_empty`) | Medium |
| 3 | Send a parcel: when the map won't load | `src/ui/ComposeMap.tsx` "The map didn't load" card inside Send step 1 | Medium |

---

## Prompt 1 · Become a rider: the rider photo step (R4)

**Paste this:**

> You're extending the **Calm Mint v2** rider onboarding for **LyniaGo**, a cash delivery app in Harare,
> Zimbabwe (one Android app, Expo / React Native). Calm Mint v2 already draws rider onboarding **R1 Why
> ride → R2 Pending → R3 Verified**. R1's checklist has three steps: *Your account (Done) · ID check with
> Didit ~2 min · Rider photo for your profile ~30 sec*. **The third step was never drawn.** The app still
> shows a screen from an older design generation (screenshot attached): a plain white page titled "Rider
> photo for your profile" with grey cards, two outlined buttons ("Take photo", "Choose from gallery"), a
> privacy card and a pale-green "Submit for verification" button. It also contradicts itself: the title
> asks for a **face** photo ("Face the light, no hat or sunglasses") while the hint box describes an **ID
> page** ("Photo page of your ID, all four corners in frame…"). The ID document is handled by the Didit
> check; **this step is the rider's face only.** Customers see it when the rider picks up their parcel or
> food, and our team uses it to match the rider to their ID.
>
> **Design the rider photo step as R4, in the Calm Mint v2 + Rider v2 visual language** (mint washes,
> white cards r16–r20, Inter, the green CTA pill, the illustrated stickers). Draw every state at
> **360×720**, and check each one at **320×640**.
>
> **R4a · Intro.** C-style header (44px Back + title). Title "Add your rider photo". One mint illustration
> card showing a face-in-oval motif. Three short rules with icons: face the light · no hat or sunglasses
> · just you in the photo. One privacy line: we keep it to keep deliveries safe, and customers see it
> only on their active order. Primary **"Take photo"**. Ghost **"Choose from gallery"**, only if you
> think a gallery photo is acceptable for a face check. If not, leave it out and tell me why.
>
> **R4b · Camera.** Full-bleed dark camera, our own screen, not the phone's. The current spec
> (`kyc-2026-08` §4):
> - a **44×44 Close ✕** top-left, the only way out;
> - header "Rider photo";
> - a **portrait oval** guide, ~72% of the width, 0.78:1, 2.5px dashed white at 75%;
> - "Put your face inside the oval" inside the oval;
> - "Face the light · no hat or sunglasses · look straight ahead" below it;
> - a **68–72px white shutter** with a 5px translucent ring.
>
> Use the **front camera by default**, with a labelled flip control. Every icon needs a visible text
> label: users are often low-literacy.
>
> **R4c · Preview.** The shot in the oval (or full frame) on ink. "Is your face clear and well lit?"
> Primary **"Use this photo"**, ghost **"Retake"**.
>
> **R4d · Uploading.** The same preview, the CTA reading "Saving photo…" with a spinner, and Retake
> disabled. Patchy 2G/3G is normal, so expect this state to last 5–20 s.
>
> **R4e · Upload failed.** A calm inline notice: "Couldn't save your photo. Check your data and try
> again." Primary **"Try again"** keeps the same photo, ghost "Retake".
>
> **R4f · Camera permission denied.** Explain why we need the camera. Primary **"Open settings"**, plus
> the gallery fallback if R4a has one.
>
> **R4g · Done.** Back on R2 Pending (or R3 Verified if Didit already passed), with the checklist's third
> row ticked and the rider's photo as a 40px avatar on that row.
>
> **R4h · Change photo later.** Rider v2 **S5 Bike & documents** has a "Rider photo · Update photo" row.
> Show that the same R4b–R4e screens open from there, with the header Back returning to S5.
>
> **Rules:**
> - Copy is final once you draw it (the app ships it verbatim), so write every string, including
>   accessibility labels, into one `R4` copy object.
> - Tap targets ≥ 44px, primary 52px.
> - Use only Calm Mint v2 tokens.
> - No confetti, no extra badges.
> - Explain in the README which file each frame belongs to and what it replaces.

**Attach:**
1. The owner's screenshot of the current screen (the 2026-10-02 photo, the one titled "Rider photo for
   your profile").
2. `packages/design/handoff/calm-mint-v2-2026-10/`: `README.md` (§4 Rider onboarding), `shared.js`,
   `mint2.js`, the `assets/` art.
3. `packages/design/handoff/kyc-2026-08/README.md` (§4 `photo_capture`).
4. `packages/design/handoff/rider-v2/README.md` (§ S5, A3–A6 pickup-photo camera for consistency) and
   `design/rv-job.jsx` (the drawn A3 camera, so both cameras match).
5. `packages/design/tokens/*.css`.

---

## Prompt 2 · Orders tab: empty states

**There's already a full brief for this:** `docs/designs/orders-v2/PROMPT.md` (owner-answered
2026-10-01). It covers the whole Orders tab. Its frames **O15–O17** are the empty states:

- O15: first open, loading;
- O16: empty, every service on;
- O17: empty, parcels only.

The recommendation is to send that whole brief, so the empty states come with the tab they sit in.

**If you only want the empty states now, paste this instead:**

> In the attached Orders-tab brief (`PROMPT.md`), draw **only frames O15, O16, O17 and O20**:
> - O15: first open, loading;
> - O16: empty, every service on;
> - O17: empty, parcels only;
> - O20: offline with nothing saved.
>
> Draw them in the Calm Mint v2 / Rider v2 language, and give the tab's header for each. Rules:
> - The current empty state promises *"you'll be able to reorder from here in one tap"*. That feature
>   doesn't exist, so don't promise it. Say what Orders actually does: running orders show here with
>   their live stage, and past ones with what was paid.
> - O16 offers "Send a parcel" plus "Order food" (when Restaurants is on). O17 offers only "Send a
>   parcel" and must not mention food or shops.
> - One illustration per state, from the Calm Mint v2 sticker family.
> - Write every string into an `OR` copy object. It ships verbatim.
> - Frames at 360×720 and 320×640.
> - Use only Calm Mint v2 tokens.
> - Also show the floating tab bar (`tab-bar-v1`) so the bottom padding is right.

**Attach:** `docs/designs/orders-v2/PROMPT.md` and the files its Part 3 lists (at least
`calm-mint-v2-2026-10/`, `tab-bar-v1/` and `rider-v2/` README + design files), plus
`packages/design/tokens/*.css`.

---

## Prompt 3 · Send a parcel: when the map won't load

**Paste this:**

> In **Send a parcel v2** (attached handoff, step 1 "Where"), the full-bleed map is the backdrop and the
> address card floats on it. On real phones in Harare the map sometimes never loads: a blocked Maps key,
> no data, or a very slow link. Today the app shows its own old-style card, "The map didn't load" +
> "Retry the map", and the customer can feel stuck even though **address search alone can finish the
> step**. Design **step 1 without a map**:
>
> - **1a · Map still loading** (after ~9 s): a calm line or pill that doesn't block the address card,
>   telling the customer to search the address meanwhile.
> - **1b · Map failed** (~22 s, or right away when offline): replace the map area with a calm, light
>   surface (no fake map), a short line ("The map isn't available right now — search for the address
>   instead"), and a small labelled **"↻ Try the map again"** link. The address card, its search dropdown
>   (including the device-geocoder fallback row, state 3c) and **Next** must all work exactly as with
>   the map.
> - **1c · Both addresses set, no map:** what replaces the route line and the "~3.2 km" pill? A simple
>   text route summary inside the card is fine.
> - **1d · Map recovers mid-step:** the map fades in behind the card; nothing the customer typed moves.
> - Pins: pickup is a green dot and drop-off a red square, even in the text-only route summary.
>
> Use only the handoff's tokens and type scale. Write every new string into the handoff's `S` object;
> it ships verbatim. Frames at 360×720 and 320×640, plus the 1b + keyboard-open combination.

**Attach:** `packages/design/handoff/send-compose-v2/` (`README.md`, `PROMPT.md`,
`design/sc2-kit.jsx`, `design/sc2-step1.jsx`, the standalone HTML) and `packages/design/tokens/*.css`.

---

### After the exports land

Hand each export to Claude Code with: *"vendor `<folder>` verbatim into `packages/design/handoff/`,
add the ledger entry and implement it"*. The reverse-drift guardrail requires the ledger entry in the
same PR.
