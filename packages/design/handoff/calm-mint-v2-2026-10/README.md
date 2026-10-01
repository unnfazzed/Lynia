# LyniaGo · Calm Mint v2 handoff (Oct 2026)
Customer Home, customer onboarding and rider onboarding.

**Pixel reference:** `Calm Mint v2 - all screens.html` (open it in Chrome; it's a canvas).
**Single screen at 360px:** `Calm Mint v2 - all screens.html?screen=H1` (also H2–H6, C1–C5, R1–R3).
Measure against the single-screen view. That is the acceptance target.

---
## 1. Tokens (new or changed in **bold**)
| Token | Value | Use |
|---|---|---|
| ink | #14181B | all body text |
| muted | #5B6670 | secondary text, inactive tabs |
| line | #E2E6EA | 1px hairlines, field borders |
| surface | #F6F7F8 | notes, verified row, sheet search |
| brand | #00B14F | fills only: progress, icon discs, active OTP box border. Never text |
| green-text | #006630 | links, address chevron, the first name, active tab |
| cta | #00812F (pressed #006B27) | the primary button fill, white text |
| mint | #E9F8EF | Home header, onboarding hero panel, chips |
| **forest** | #063B22 | live-order bar |
| **highlight** | #FFD23F (replaces gold #F2B705) | ETA chip, unread dot, header circle, star fill |
| **highlight-ink** | #3D3100 | text on highlight (11:1) |
| **star-stroke** | #C99500 | star outline |
| **free** | #4B2FBF + white text | "Free delivery" tag (7.9:1) |
| **coral** | #FF6B4A | decorative circle only |
| **sky** | #3EC1F3 | decorative circle only |
| **tile-send / -food / -shops / -pharmacy** | #CDEEDA / #FFD9CC / #DDD5FF / #C5E9DF | service tile fills |
| **rider-wash** | #ECE8FF | rider intro hero panel |
| danger / wash / ink | #C0392B / #FAEDEB / #8F2418 | errors, "Set your location" |

**Type:** Inter 400/600/700 only, with tabular numerals on every number. Fredoka 600 is for the wordmark only.
**Space:** gutter 16, grid 8. **Radius:** fields 12, cards and images 14–16, tiles 16, hero panel 28, header bottom 28, sheet 24, pills 999.
**Depth:** zero shadows. Separation comes from tint plus hairlines. The only exceptions are the floating live bar (solid forest, no shadow) and the dim behind sheets.

---
## 2. Home (H1–H6)
Top → bottom at 360×720:
1. **Status bar** 28px.
2. **Header** (mint, bottom radius 28, padding-bottom 18, overflow hidden). Three decorative circles sit behind the content:
   - yellow 150px at right −62 / top −58
   - coral 26px at right 78 / top 64. At 320px: right 14 / top 100.
   - sky 14px at right 30 / top 112. At 320px: right 50 / top 128.
   - **Address control** (min-height 44, the whole block is tappable and opens the location sheet). Eyebrow "DELIVERING TO" 11/600 muted, letter-spacing .2. Then a row: map-pin 16 brand · address 15/700 ink, ellipsis · chevron-down 16.
   - **Bell** 44px white disc, icon 20 green-text. The unread dot is 8px highlight with a 2px white ring, at top 10 / right 11.
   - **Greeting** 24/700, line-height 1.15, letter-spacing −.4, padding 10 16 12. The first name is green-text. It's time-aware (Good morning / afternoon / evening). At 320px or for a long name, the name wraps to line 2.
   - **Search** 48px, white, radius 12, no border. Icon 18 muted plus the placeholder "Search food, shops or parcels" (at 320px: "Search food or shops").
3. **Service tiles**: a 4-column grid, gap 8, padding 16 16 0. Tile 76px tall (64 at 320), radius 16, fill per token, sticker 54px (44 at 320). Label 12/600 under the tile, gap 6. At 320px "Restaurants" shows as "Food" (11px). No SOON chips: everything is live.
4. **Rail: Popular restaurants.** The header row has margin 24 0 10:
   - a 28px sticker plus the title 18/700, nowrap
   - subtitle 12.5 muted ("Most ordered near you")
   - "See all" 13/600 green-text on the right, min-height 32
   - Cards: 148px wide, gap 12, horizontal scroll, so 2.2 cards show at 360.
     - Image 96px, radius 14, cover.
     - ETA pill: white, 11/700, bottom-right inset 6.
     - "Free delivery" tag: free token, 10.5/700, top-left inset 6. Shown only when the venue funds delivery.
     - Name 14/700, ellipsis, margin-top 8.
     - Meta 12.5 muted: star 12 (fill highlight, stroke star-stroke) · rating 600 ink · "$1.50 delivery". The fee is hidden when the Free tag shows.
5. **Rail: Popular shops.** Same as restaurants, with "Pharmacy, grocery, butchery and more" as the subtitle.
   - With no photo, the image is the kind tint plus the initial (36/700) and a kind chip (white, 10.5/700, bottom-left).
   - Kinds and tints: Pharmacy #DFF4EE, Grocery #E9F8EF, Butchery #FFE7E0, Fashion #FFE4F2, Auto parts #E3F6FE, Hardware / Electronics / Other #F6F7F8.
6. **Live-order bar** (one only, whatever the number of orders). Fixed 12px from the sides, 72px from the bottom (above the tab bar). Forest, radius 18, padding 10 10 10 12.
   - 40px brand disc with bike icon.
   - Title 14/700 white ("Tendai is on the way").
   - Sub 12 #BFE6CD ("Parcel to Avondale") plus a "+1 order" pill when 2 or more orders are running. Tapping it opens the Orders tab.
   - A 7-segment progress bar, 150px wide, 3px tall.
   - ETA chip: highlight, 13/700. The bar is hidden when there are no running orders.
7. **Tab bar** 60px: Home · Orders · Account. Icons 22, labels 11/600, active green-text.

**States:**
- **H4 first load:** the header and tiles are real, the rails are skeletons (#EEF1F3, radius 12).
- **H5 location sheet:** dim rgba(20,24,27,.45). Sheet radius 24 with a 36×4 grab handle and the title "Deliver to". Then the search, "Use my current location", saved Home and Work, and "Add a place". Rows are at least 56 tall.
- **H6 no location:** the eyebrow reads "NO ADDRESS YET" and the address reads "Set your location" in danger-ink. The rails are replaced by a mint card: illustration, "Where should we deliver?", "Use my location" (primary), "Type an address".
- **Rules:**
  - A rail with fewer than 2 items is hidden.
  - If both rails are empty, show the H6 card with "Nothing delivers here yet".
  - Offline: a muted banner under the header. Keep cached rails.

---
## 3. Customer onboarding (C1–C5), 4 screens to Home
- **C1 Welcome:**
  - Hero panel inset 12px from the screen edges, radius 28, mint, 300 tall. `hero-rider.svg` is 230 tall with **20px clear space below it**.
  - Then the mark plus the wordmark, and an H1 28/700: "Parcels and food" / "across town." (second line green-text).
  - Three facts at 14/600 with 18px icons: "Cash or mobile money" · "A code at the door, every delivery" · "Live tracking to your gate".
  - Primary "Continue with your number", and a link "Want to earn? **Ride with LyniaGo →**" (this starts the rider flow after OTP).
  - Returning users skip C1 and C5.
- **C2 Phone:**
  - Back 44. H2 24/700 "What's your number?". Sub "We'll send a 6-digit code on WhatsApp."
  - Field 52: a "+263" prefix segment, then the number formatted "77 245 1180". Help "Starts with 71, 73, 77 or 78."
  - Primary "Send code". Footer: Terms / Privacy.
  - **C3 invalid:** a danger border and "That number looks short. Zimbabwe mobiles have 9 digits after +263."
- **C4 Code:**
  - "Enter the code" · "Sent on WhatsApp to +263 77 245 1180. Change".
  - 6 boxes, 56 tall, radius 12, with the active box bordered 2px brand. It auto-fills from the message and auto-verifies, so there's **no Verify button**.
  - "Resend in 0:42" (clock icon). After the countdown, "Resend on WhatsApp" turns green-text and becomes tappable. Before that it's greyed.
  - Wrong code: danger text "That code isn't right. Check the message and try again." Expired or locked: "That code has expired" plus a primary "Send a new code".
- **C5 Name:**
  - "What should riders call you?" Two fields side by side, gap 12: **First name** · **Surname**.
  - A verified phone row (surface, check icon brand, "Verified" green-text).
  - Note: "No ID needed. If an order ever needs one, we'll ask then. You can add it in Account."
  - Primary "Start using LyniaGo" → Home.
- **Permissions in context:** location when Home first needs an address (this replaces the old priming screen). Notifications are requested after the first order is placed.

---
## 4. Rider onboarding (R1–R3)
- **R1 Why ride:**
  - Hero inset 12, radius 28, rider-wash, 210 tall, `biz-scooter-rider.svg` with 20px clear space below.
  - H1 24/700 "Ride with LyniaGo." / "Earn on your terms." (violet #4B2FBF, headline only).
  - Chips: You set your fare · Cash on delivery · Ride when you want.
  - Checklist card: Your account (Done) · ID check with Didit ~2 min · Rider photo for your profile ~30 sec.
  - Note: "No top-up to start…". Primary "Start ID check".
- **R2 Pending:**
  - Title "Rider setup" plus a "Checking" pill (highlight wash #FFF6D6).
  - Mint card: trust-verified art plus "Didit is checking your ID · Usually under a minute…".
  - Checklist with the current step in green-text. A ghost "Send a parcel while you wait".
  - Resumable: reopening the app lands here.
- **R3 Verified:**
  - Mint hero card with "You're verified, Tendai".
  - "Commission-free jobs 5 of 5 left" with a 5-segment meter.
  - Primary "Go online". Link: "Add licence and bike papers later in Account".
- The failed, expired, locked and can't-start states keep the existing KYC spec copy (`handoff/kyc-2026-08`) inside this new shell (C-style title plus a mint illustration card). They're not redrawn here.

---
## 5. NEEDS BACKEND
- **Popular ranking:** today "popular" means nearest open. A real ranking needs order counts per venue over 30 days.
- **Free delivery flag:** a merchant-funded `free_delivery:boolean` per venue. Checkout reads "Delivery: Free, paid by <venue>".
- **Customer shop list:** shops browsable by customers, with `kind`.
- **Free-jobs rule for new riders:** N jobs or $X of commission, plus the counter shown in R3.
- **Didit ID prefill:** to prefill or confirm the ID number afterwards.

## 6. Retires
These old screens are retired: the 3-slide intro carousel (02–05), role select (11, 12), national ID on register (13), location and notification priming as standalone screens (14, 15), the old rider intro (07), and the $2 gate at first go-online (20 now shows only after the free jobs run out). Home 8c is replaced.
