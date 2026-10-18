# Biker referrals

A biker brings in a friend; when the friend becomes a verified biker, you pay the referrer in cash. The app
tracks who brought in whom and how far each friend got. You decide who gets paid, and record it. Owner decision
2026-10-18, ledger D-112 (no app screens).

## How to run it

1. **Create the biker's link.** Admin console → Bikers → open the biker → **Referrals** card → **Create referral
   link**. The link looks like `https://lyniago.com/r/K7P3QX` and never changes.
2. **Send it to the biker** (WhatsApp is fine). They share it with friends.
3. **The friend installs from the link** on an Android phone, signs up and taps "Want to earn? Ride with
   LyniaGo". Nothing on their screen mentions the referral.
4. **Watch the numbers** on **Referrals** in the console sidebar:
   - **Joined**: became a biker through a link.
   - **Verified**: passed the ID check at least once. A friend whose ID later expires still counts; one whose
     check was later declined doesn't.
   - **Riding**: verified and finished at least one job.
   - **Verified, not paid**: what you may owe.
   - **Paid**: what you've recorded.
   The "By biker" table rolls this up per referrer; **Friends →** shows one biker's list. **Download CSV**
   gives every referral as a spreadsheet.
5. **Check the warnings** before paying. "same phone as referrer", "same ID as referrer", "ID seen on another
   account", "referrer not verified" and "suspended or banned" never block anything; they're for you to look at.
6. **Pay in cash, then tap Mark paid…** on that friend's row, with the amount and an optional note. It can be
   recorded once per friend, only once the friend is verified, and it shows in the Audit log and on the
   referrer's biker page.

## Test it once before sharing links

The code rides through the Play Store, which no automated test can reach. Once the app update that reads it is
on phones, and before handing links out:

1. Create your own test biker's link in the console.
2. On an Android phone **without LyniaGo installed**, open the link from WhatsApp, install from Play, open the
   app, sign up with a new number and tap "Want to earn? Ride with LyniaGo" through to the ID check.
3. The new account should appear on **Referrals** within seconds, "Brought in by" your test biker.

If it doesn't, the phone's Play Store didn't pass the code on. Tell Claude which phone and browser you used.

## What counts, and what doesn't

- Only a **fresh Android install from the link** carries the code. A friend who already has the app, installs
  from the Play Store directly, or uses an iPhone isn't counted. The link always opens Google Play; on a computer,
  an install sent from Play's web page to a phone may not carry the code.
- A friend is counted **once, ever**: the first link wins. A biker can't refer themselves.
- The code is only taken when the friend **becomes a biker** (not a customer), within a day of signing up as one.
- The wallet is never touched. Payments are cash, recorded by you.

## Where it lives

| Part | Code |
|---|---|
| Code format, referrer parsing | `packages/shared/src/referral.ts` |
| Tables `referral_codes`, `referrals` | `apps/api/prisma/migrations/0106_biker_referrals` |
| Attach on sign-up, list, mark paid | `apps/api/src/referrals/referrals.service.ts`, `apps/api/src/admin/admin-referrals.controller.ts` |
| Reading Play's install referrer | `apps/mobile/src/auth/install-referral.ts` (sent by `becomeRider`, `src/api/riders.ts`) |
| The `/r/<code>` redirect | `apps/website/referral.js` (`docs/WEBSITE.md` § Biker referral links) |
| Console | `apps/admin/app/referrals/`, the Referrals card on `apps/admin/app/riders/[id]/page.tsx` |

The app side needs no new store build: it uses a native module the app already ships (`expo-application`),
so it reaches phones with the next OTA update.
