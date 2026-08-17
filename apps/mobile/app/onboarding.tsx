import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView } from "react-native";
import { saveOnboardingSeen } from "../src/auth/session";
import { useFeatureFlags } from "../src/net/use-feature-flags";
import { type IconName } from "../src/ui";
import { OnboardingView } from "./onboarding.view";

// First-install intro carousel (customer/rider 0·2) — skippable slides shown once, before auth.
// Two slide sets, chosen by `restaurantsEnabled` (fails open — restaurants is launched, same
// contract as the home Food tile): the joint-launch set is the journey mockup verbatim (screens.jsx
// `ONBOARD` — Food, Send, then the promise both share) and is also the boot default, so no parcels-
// only frame flashes before the flags fetch resolves; the parcels-only set is the §1 kill-switch
// copy for a server-flagged-off launch and is drawn by its OWN mock (screens-shipped.jsx
// `OnboardFlagOff`, LJ.onboard_flag_off): a TWO-dot carousel opening on the banknote "Name your
// price to send" slide — so the flag-off set is two slides, not three, and the index is clamped
// below in case the flags fetch resolves mid-carousel.
type Slide = { icon: IconName; title: string; subtitle: string };
const SEND_FOOD_SLIDES: Slide[] = [
  {
    icon: "utensils",
    title: "Food from kitchens near you",
    subtitle: "Order from restaurants in your corridor — you see the arrival window before you pay.",
  },
  {
    icon: "banknote",
    title: "Name your price to send",
    subtitle: "Say what you'll pay to send a parcel. Riders bid for it — no fixed tariff, no haggling in the street.",
  },
  {
    icon: "check",
    title: "One app, one code",
    subtitle: "Same riders, same delivery code at the door, cash if that's how you pay. More services soon.",
  },
];
// The food-off set. Slide 1 is the `OnboardFlagOff` mock verbatim (banknote glyph, the same
// name-your-price copy the joint-launch set carries); the mock draws TWO dots, so the set is two
// slides long and the rider slide closes it.
const PARCEL_SLIDES: Slide[] = [
  {
    icon: "banknote",
    title: "Name your price to send",
    subtitle: "Say what you'll pay to send a parcel. Riders bid for it — no fixed tariff, no haggling in the street.",
  },
  {
    icon: "bike",
    title: "Earn as a rider",
    subtitle: "See parcels near you, name your fare, and get paid in cash on delivery. Ride when you want.",
  },
];

/**
 * `initialSlide` is the carousel's starting index — 0 in the app (a first install always opens on
 * slide 1). It exists so a single frozen slide can be mounted directly: each slide is its own gallery
 * screen (LJ.onboard / LJ.onboard_send / LJ.onboard_shared) and the parity lane stages them through
 * this seam (tools/parity/mobile/fixtures/onboard_*.mjs). Expo-router passes no props, so the default
 * is what ships.
 */
export type OnboardingScreenProps = { initialSlide?: number };

export default function OnboardingScreen({ initialSlide = 0 }: OnboardingScreenProps = {}): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const [index, setIndex] = useState(initialSlide);
  // Once the user ADVANCES, the set they started reading is locked so the flags fetch (deferred
  // ~250ms, so it can resolve mid-carousel) can never swap the deck under their thumb — a 3-slide
  // joint-launch deck silently becoming the 2-slide flag-off deck mid-read looked like a glitch.
  // While still on slide 1 the set stays live (the flag-off launch must show flag-off copy), and
  // the length clamp below still guards the residual race of flags resolving in the same frame as
  // the first Next.
  const [lockedSlides, setLockedSlides] = useState<Slide[] | null>(null);
  const slides = lockedSlides ?? (restaurantsEnabled ? SEND_FOOD_SLIDES : PARCEL_SLIDES);
  // The two sets differ in length (3 joint-launch, 2 food-off), so a flags fetch resolving mid-
  // carousel could otherwise strand the index past the end: clamp it into the live set. The `?? [0]!`
  // fallback additionally keeps the lookup honest under noUncheckedIndexedAccess.
  const active = Math.max(0, Math.min(index, slides.length - 1));
  const slide = slides[active] ?? slides[0]!;
  const last = active === slides.length - 1;

  // "Skip" and the final "Get started" both land in the same place: mark onboarding seen (best-effort)
  // and hand off to the phone/auth screen. The carousel never shows again on this install.
  const finish = (): void => {
    void saveOnboardingSeen();
    router.replace("/phone");
  };
  const next = (): void => {
    if (lockedSlides === null) setLockedSlides(slides);
    if (last) finish();
    else setIndex(active + 1);
  };

  return (
    // The phone frame / safe area — the mock's AppScreen shell; the mock's own screen padding + column
    // layout live inside OnboardingView (from its `Pad` wrapper). The container owns the slide SET
    // (flag-gated), the active index and the Skip/Next handlers, feeding the view one slide at a time.
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <OnboardingView
        icon={slide.icon}
        title={slide.title}
        body={slide.subtitle}
        slide={active}
        dots={slides.map((_, n) => n)}
        primaryLabel={last ? "Get started" : "Next"}
        onSkip={finish}
        onNext={next}
      />
    </SafeAreaView>
  );
}
