import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { saveOnboardingSeen } from "../src/auth/session";
import { riderModeAvailable } from "../src/rider-mode";
import { DoveMark, Icon, Tappable, Wordmark, type IconName } from "../src/ui";
import { HeroRiderArt } from "../src/ui/art/HeroRiderArt";
import { OB } from "../src/ui/onboarding/copy";
import { Cta, H1, OnbScreen, Pad } from "../src/ui/onboarding/kit";

/**
 * C1 · Welcome — the first screen of a new install (Calm Mint v2,
 * `packages/design/handoff/calm-mint-v2-2026-10` README §3; ledger D-55). It replaces the three-slide
 * intro carousel: a mint hero panel inset 12px with the rider illustration (20px clear below it), the
 * LyniaGo lockup, "Parcels and food / across town.", three facts, "Continue with your number" and the
 * secondary "Want to earn? Ride with LyniaGo →", which carries a rider intent through sign-in.
 *
 * Shown once: both actions mark onboarding seen, and returning users never see it (app/index.tsx).
 * The customer-only iPhone app (src/rider-mode.ts, D-41) has no rider path, so it draws no rider link.
 */
const FACTS: ReadonlyArray<{ icon: IconName; text: string }> = [
  { icon: "banknote", text: OB.facts[0] },
  { icon: "circle-check", text: OB.facts[1] },
  { icon: "timer", text: OB.facts[2] },
];

/** The hero panel and the art inside it (README §3: panel 300 tall, art 230 tall, 20px clear below). */
const HERO_H = 300;
const ART_H = 230;
const ART_W = (ART_H * 480) / 500;

export default function OnboardingScreen(): React.ReactElement {
  const router = useRouter();
  const go = (rider: boolean): void => {
    void saveOnboardingSeen();
    router.replace(rider ? { pathname: "/phone", params: { intent: "rider" } } : "/phone");
  };

  return (
    <OnbScreen
      padTop={0}
      footer={
        <>
          <Cta label={OB.continueWithNumber} onPress={() => go(false)} />
          {riderModeAvailable() ? (
            <Tappable
              onPress={() => go(true)}
              accessibilityRole="button"
              accessibilityLabel={`${OB.wantToEarn} ${OB.rideWithLynia}`}
              style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <Text style={{ fontSize: 14, color: tokens.color.muted }}>{OB.wantToEarn} </Text>
              <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{OB.rideWithLynia}</Text>
              <Icon name="arrow-right" size={14} color={tokens.color.accentText} />
            </Tappable>
          ) : null}
        </>
      }
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{
          marginHorizontal: 12,
          marginTop: 12,
          height: HERO_H,
          borderRadius: 28,
          backgroundColor: tokens.color.accentWash,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <View style={{ marginBottom: 20 }}>
          <HeroRiderArt width={ART_W} />
        </View>
      </View>
      <Pad style={{ paddingTop: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <DoveMark size={24} />
          <Wordmark size={20} />
        </View>
        <H1 accent={OB.welcomeH1Accent}>{OB.welcomeH1}</H1>
        <View style={{ marginTop: 16, gap: 10 }}>
          {FACTS.map((f) => (
            <View key={f.text} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name={f.icon} size={18} color={tokens.color.accentText} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{f.text}</Text>
            </View>
          ))}
        </View>
      </Pad>
    </OnbScreen>
  );
}
