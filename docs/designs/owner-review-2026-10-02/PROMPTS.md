# Claude Design prompts: owner UI review, 2026-10-02

The owner's 2026-10-02 review raised three things the app should not improvise: no handoff draws them.
Each section below is a self-contained prompt. Paste it into Claude Design, attach the files it lists, and
bring the export back as a new `packages/design/handoff/<name>/` folder. Until an export lands, the app
keeps the current screen (ledger D-60 §5).

| # | Prompt | Replaces in the app | Priority |
|---|---|---|---|
| 1 | Rider photo: add it later | The add/change photo flow from Bike & documents (the sign-up photo step was removed, D-62) | Medium |
| 2 | Orders tab, empty states | `app/(tabs)/orders.tsx` empty card (old `RC orders_empty`) | Medium |
| 3 | Send a parcel: when the map won't load | `src/ui/ComposeMap.tsx` "The map didn't load" card inside Send step 1 | Medium |

---

## Prompt 1 · Rider photo: add it later, from Bike & documents

**Owner decision, 2026-10-02 (ledger D-62):** the rider photo is **optional** and **not part of
sign-up**. R1's checklist lost its photo row; R1/R3 now say *"Your photo, licence and bike papers can
wait"* / *"Add your photo, licence and bike papers later in Account"*. A rider with no photo works
normally, with no reminder; customers see initials. The only place to add or change it is **Settings →
Bike & documents** (Rider v2 S5), whose "Rider photo" row currently reads **"Not added yet"**.

**Paste this:**

> You're extending **Rider v2** for **LyniaGo**, a cash delivery app in Harare, Zimbabwe (one Android
> app, Expo / React Native). The rider photo is **optional**: riders can skip it at sign-up. Customers
> see it when the rider picks up their parcel or food. **Draw the screens a rider uses to add or change
> it later**, starting from **S5 Bike & documents** (attached), in the Rider v2 / Calm Mint v2 visual
> language. Draw every state at **360×720**, and check each one at **320×640**.
>
> **P0 · S5 entry points.**
> - No photo yet: the "Rider photo" row reads "Not added yet", plus an **"Add photo"** affordance.
> - With a photo: a 40px avatar on the row, plus **"Change photo"**.
>
> No other screen nags the rider about it.
>
> **P1 · Camera.** A full-bleed dark camera, our own screen, not the phone's:
> - a **44×44 Close ✕** top-left;
> - header "Rider photo";
> - a **portrait oval** guide (~72% of the width, 0.78:1, 2.5px dashed white at 75%);
> - "Put your face inside the oval" inside it;
> - "Face the light · no hat or sunglasses · look straight ahead" below it;
> - a **68–72px white shutter**.
>
> The **front camera is the default**, with a labelled flip control. Every icon needs a visible text
> label. Match the A3 pickup camera (`rv-job.jsx`) so both cameras feel like one app.
>
> **P2 · Preview.** "Is your face clear and well lit?" Primary **"Use this photo"**, ghost **"Retake"**.
>
> **P3 · Saving.** The CTA reads "Saving photo…" with a spinner. Patchy 2G/3G is normal.
>
> **P4 · Save failed.** A calm notice: "Couldn't save your photo. Check your data and try again."
> Primary **"Try again"** reuses the same photo.
>
> **P5 · Camera permission denied.** Explain why, with **"Open settings"**. Should "Choose from
> gallery" be offered here as the fallback? Say yes or no and why.
>
> **P6 · Saved.** Back on S5 with the avatar and a brief confirmation toast.
>
> **Rules:**
> - Write every string into one `RP` copy object. It ships verbatim.
> - Tap targets ≥ 44px, primary 52px.
> - Use only Calm Mint v2 tokens.
> - No confetti, no badges.

**Attach:**
1. `packages/design/handoff/rider-v2/`: `README.md` (§ S5 Bike & documents, A3–A6), `design/rv-account.jsx`
   (`BikeDocs`), `design/rv-job.jsx` (the A3 camera), `design/rv-kit.jsx`.
2. `packages/design/handoff/kyc-2026-08/README.md` (§4 `photo_capture`, the oval spec).
3. `packages/design/handoff/calm-mint-v2-2026-10/README.md` (§4 rider onboarding, for the "can wait" wording).
4. `packages/design/tokens/*.css`.

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
