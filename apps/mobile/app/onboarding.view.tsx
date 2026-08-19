// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.onboard.
// Source mock: packages/design/explorations/journey/screens.jsx :: Onboarding
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.onboard
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/onboarding.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Tappable, Icon, Button, DoveMark, Wordmark, type IconName } from "../src/ui";

export type OnboardingViewProps = {
  /** The active slide's mint-tile glyph. */
  icon: IconName;
  title: string;
  body: string;
  /** The active slide index (drives the elongated progress dot). */
  slide: number;
  /** The dot indices — length = slide count (2 flag-off, 3 joint-launch). */
  dots: number[];
  /** 'Next' on any slide but the last, 'Get started' on the last. */
  primaryLabel: string;
  onSkip: () => void;
  onNext: () => void;
};

export function OnboardingView({
  icon,
  title,
  body,
  slide,
  dots,
  primaryLabel,
  onSkip,
  onNext
}: OnboardingViewProps): React.ReactElement {
  return <View style={{
    padding: tokens.space.screen,
    minHeight: "100%",
    flexDirection: "column",
    backgroundColor: tokens.color.bg
  }}>
      <View style={{
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 12,
      flexDirection: "row"
    }}>
        <View style={{
        alignItems: "center",
        gap: 7,
        flexDirection: "row"
      }}><DoveMark size={24} on="white" /><Wordmark size={17} /></View>
        <Tappable onPress={onSkip} accessibilityRole="button" hitSlop={8}><Text style={{
          color: tokens.color.muted,
          fontSize: 13,
          fontWeight: "600"
        }}>Skip</Text></Tappable>
      </View>
      <View style={{
      flex: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 6
    }}>
        <View style={{
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: tokens.color.accentWash,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 18
      }}>
          <Icon name={icon} size={52} color={tokens.color.accentText} />
        </View>
        <Text style={{
        fontSize: 22,
        fontWeight: "700",
        color: tokens.color.ink
      }}>{title}</Text>
        <Text style={{
        fontSize: 14,
        lineHeight: 22,
        color: tokens.color.muted,
        maxWidth: 240
      }}>{body}</Text>
      </View>
      <View style={{
      justifyContent: "center",
      gap: 7,
      marginBottom: 16,
      flexDirection: "row"
    }}>
        {dots.map(n => <View key={n} style={{
        width: n === slide ? 22 : 7,
        height: 7,
        borderRadius: 999,
        backgroundColor: n === slide ? tokens.color.accent : tokens.color.line
      }} />)}
      </View>
      <Button label={primaryLabel} onPress={onNext} />
    </View>;
}
