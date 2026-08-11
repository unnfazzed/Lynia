import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView } from "react-native";
import { saveOnboardingSeen } from "../src/auth/session";
import { useFeatureFlags } from "../src/net/use-feature-flags";
import { type IconName } from "../src/ui";
import { OnboardingView } from "./onboarding.view";

// First-install intro carousel (customer/rider 0·2) — three skippable slides shown once, before auth.
// Two slide sets, chosen by `restaurantsEnabled` (fail-safe-off, same contract as the home Food
// tile): the joint-launch set is the journey mockup verbatim (screens.jsx `ONBOARD` — Food, Send,
// then the promise both share); the parcels-only set survives as the §1 escape-hatch copy, since an
// unflagged food mention on this pre-auth screen would leak the vertical while it is dark. The flags
// fetch resolves ~instantly against a live API; until then the parcels set renders, and both sets are
// the same length so a mid-carousel resolve can never strand the index.
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
const PARCEL_SLIDES: Slide[] = [
  {
    icon: "package",
    title: "Send a parcel",
    subtitle: "Book a rider to pick up your parcel and drop it anywhere across town.",
  },
  {
    icon: "banknote",
    title: "Name your price",
    subtitle: "Say what you'll pay to send your parcel — no fixed tariffs, no haggling in the street.",
  },
  {
    icon: "bike",
    title: "Earn as a rider",
    subtitle: "See parcels near you, name your fare, and get paid in cash on delivery. Ride when you want.",
  },
];

export default function OnboardingScreen(): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const [index, setIndex] = useState(0);
  const slides = restaurantsEnabled ? SEND_FOOD_SLIDES : PARCEL_SLIDES;
  // Clamp the lookup so the index can never resolve to `undefined` (noUncheckedIndexedAccess): the
  // carousel only ever advances within bounds, but the fallback keeps the type honest.
  const slide = slides[index] ?? slides[0]!;
  const last = index === slides.length - 1;

  // "Skip" and the final "Get started" both land in the same place: mark onboarding seen (best-effort)
  // and hand off to the phone/auth screen. The carousel never shows again on this install.
  const finish = (): void => {
    void saveOnboardingSeen();
    router.replace("/phone");
  };
  const next = (): void => {
    if (last) finish();
    else setIndex((i) => i + 1);
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
        slide={index}
        dots={slides.map((_, n) => n)}
        primaryLabel={last ? "Get started" : "Next"}
        onSkip={finish}
        onNext={next}
      />
    </SafeAreaView>
  );
}
