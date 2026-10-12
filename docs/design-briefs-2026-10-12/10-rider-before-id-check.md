# 10 · Before the ID check: tips and accepted documents

**App:** Rider. **Extends:** first-run-v2 **R1** (the Become / ID check intro) and the F4 tips chips.

## The problem

ID checks are now **fully automatic** (KYC-R26-12): Didit approves or declines, and nobody reviews a borderline photo. The tips that prevent a decline ("Good light", "All 4 corners", "Take off glasses") only appear **after** a decline, on F4a/F4b. A rider learns how to take the photo by failing once.

The screen also names the wrong documents. `KY.docBody` says "Use your Zimbabwe national ID card", but the live check accepts a **national ID card, passport or driving licence** from any country (camera only, no uploads). A rider with a valid passport may give up before trying.

## Must

- Show **what to have ready**: the accepted documents, and that the document must not be expired.
- Show **3 photo tips at most**, reusing the F4 chips (`#F6F7F8` pill, 16dp green icon).
- One primary CTA that opens the check (`KY.becomeCta` / `KY.unfCta`). No extra step: the tips sit on the screen the rider already passes through, they are not a new screen before it.
- Fits 320×640 with the CTA visible without scrolling.

## Your call

- Whether the tips live on R1 itself, or on a sheet the CTA opens just before the camera.
- Whether "Use your camera, not a photo of a photo" is worth one of the three tips.
- **Owner question to raise:** keep accepting passports and driving licences, or limit the check to the Zimbabwe national ID? Draw for "all three"; we change Didit if the owner says ID only.

## Copy to start from

- `KY.becomeBody` "Just an ID check. About 2 min." · `KY.unfBody` "Finish your ID check. About 2 minutes."
- Tips: `KY.blurryTip1` "Good light" · `KY.blurryTip2` "All 4 corners" · `KY.blurryTip3` "Hold still" · `KY.faceTip2` "Take off glasses" · `KY.faceTip3` "No hat"
- `KY.docBody` "Use your Zimbabwe national ID card. It must not be expired." (needs to change)

Suggested: "Have your ID, passport or driving licence ready. Not expired."

## Draw

1. R1 with the tips and the accepted documents.
2. The same at 320×640 and at font scale 1.3.
3. Optional: the pre-camera sheet variant, if you prefer it.

Suggested id: `R1b`.
