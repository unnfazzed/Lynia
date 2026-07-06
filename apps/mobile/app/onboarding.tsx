import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { saveOnboardingSeen } from "../src/auth/session";
import { Button, Icon, type IconName, Screen } from "../src/ui";
import { BrandLockup } from "../src/ui/Brand";

// First-install intro carousel (customer/rider 0·2) — three skippable slides shown once, before auth.
// Copy stays close to the journey mockup (screens.jsx `Onboarding` / rider-screens.jsx `Onboard`).
const SLIDES: { icon: IconName; title: string; subtitle: string }[] = [
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
  const [index, setIndex] = useState(0);
  // Clamp the lookup so the index can never resolve to `undefined` (noUncheckedIndexedAccess): the
  // carousel only ever advances within bounds, but the fallback keeps the type honest.
  const slide = SLIDES[index] ?? SLIDES[0]!;
  const last = index === SLIDES.length - 1;

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
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: tokens.space.md }}>
        <BrandLockup size={26} />
        <Pressable onPress={finish} accessibilityRole="button" hitSlop={8}>
          <Text style={{ color: tokens.color.muted, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold }}>Skip</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {/* Mint-wash circular tile + text-green glyph (mirrors the DS EmptyState / onboarding treatment). */}
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: tokens.color.accentWash,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: tokens.space.xl,
          }}
        >
          <Icon name={slide.icon} size={52} color={tokens.color.accentText} strokeWidth={1.75} />
        </View>
        <Text style={{ fontSize: tokens.font.size.h2, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>
          {slide.title}
        </Text>
        <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, textAlign: "center", lineHeight: 22, marginTop: 6, maxWidth: 240 }}>
          {slide.subtitle}
        </Text>
      </View>

      {/* 3-dot progress — the active dot elongates to a pill, others stay hairline-grey. */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 7, marginBottom: tokens.space.lg }}>
        {SLIDES.map((_, n) => (
          <View
            key={n}
            style={{
              width: n === index ? 22 : 7,
              height: 7,
              borderRadius: 999,
              backgroundColor: n === index ? tokens.color.accent : tokens.color.line,
            }}
          />
        ))}
      </View>

      <Button label={last ? "Get started" : "Next"} onPress={next} />
    </Screen>
  );
}
