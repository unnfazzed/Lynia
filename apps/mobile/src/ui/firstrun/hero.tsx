import { tokens } from "@lynia/shared/tokens";
import React, { createContext, useContext } from "react";
import { Text, type TextStyle, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../Icon";
import { FR, FR_TONES, HALO_GAP, type FrTone, em, useFirstRunMetrics } from "./metrics";
import { Spinner } from "./steps";

/**
 * The First Run v2 hero, disc, split title and body (handoff `first-run-v2` README §1, ledger D-80).
 * Every number is `design/fr-kit.js`'s: `.hero`, `.disc`, `.t`, `.s`.
 */

const ToneContext = createContext<FrTone>("mint");

/** The tone of the nearest HeroPanel (the disc reads it, so its icon colour follows the panel). */
export function useHeroTone(): FrTone {
  return useContext(ToneContext);
}

export interface HeroPanelProps {
  tone?: FrTone;
  /** An explicit height (PC1 150, PC3/PC6 130, PC8 250, P6/P11 180, U1 280 …). Default: 232 / 160 / 176. */
  height?: number;
  /**
   * The 18 coral dot bottom-left. On by default; off when the panel holds cards instead of a disc
   * (`.hero:not(:has(>.disc))::after{display:none}` — PC8, P3, P9). The 150 sun is always drawn.
   */
  decor?: boolean;
  /** Pinned 12 inside the top-left corner — the ID-check ✕ (`ExitButton`). */
  topLeft?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

/** `.hero` — full width (the screen's 16 gutter), radius 28, tone fill, the sun + dot decor, content centred. */
export function HeroPanel({ tone = "mint", height, decor = true, topLeft, children, style, testID }: HeroPanelProps): React.ReactElement {
  const m = useFirstRunMetrics();
  const t = FR_TONES[tone];
  return (
    <ToneContext.Provider value={tone}>
      <View
        testID={testID}
        style={[
          {
            height: height ?? m.heroH,
            borderRadius: FR.heroRadius,
            backgroundColor: t.hero,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          },
          style,
        ]}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          testID={testID ? `${testID}-sun` : undefined}
          style={{ position: "absolute", width: FR.sun, height: FR.sun, borderRadius: FR.sun / 2, backgroundColor: t.sun, right: -FR.sunOverhang, top: -FR.sunOverhang }}
        />
        {decor ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            testID={testID ? `${testID}-dot` : undefined}
            style={{ position: "absolute", width: FR.dot, height: FR.dot, borderRadius: FR.dot / 2, backgroundColor: t.dot, opacity: t.dotOpacity, left: FR.dotLeft, bottom: FR.dotBottom }}
          />
        ) : null}
        {children}
        {topLeft ? <View style={{ position: "absolute", left: FR.exitInset, top: FR.exitInset }}>{topLeft}</View> : null}
      </View>
    </ToneContext.Provider>
  );
}

export interface HeroDiscProps {
  icon?: IconName;
  /** F8: the 48 spinning ring (5 wide) in place of the icon. */
  spinner?: boolean;
  /** Overrides the size from the metrics (104, or 84 at 320 / font scale 1.3). */
  size?: number;
  /** Overrides the panel tone's icon colour. */
  color?: string;
  /** Any custom content in place of the icon (e.g. a filled check disc). */
  children?: React.ReactNode;
}

/** `.disc` — a white circle with a 40 icon (stroke 1.75) and a 1.5 white halo 14 outside it. */
export function HeroDisc({ icon, spinner, size, color, children }: HeroDiscProps): React.ReactElement {
  const m = useFirstRunMetrics();
  const tone = useHeroTone();
  const d = size ?? m.disc;
  const halo = d + HALO_GAP * 2;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: d, height: d, alignItems: "center", justifyContent: "center" }}>
      <View
        pointerEvents="none"
        style={{ position: "absolute", width: halo, height: halo, borderRadius: halo / 2, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.8)", left: -HALO_GAP, top: -HALO_GAP }}
      />
      <View testID="hero-disc" style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}>
        {children ?? (spinner ? <Spinner size={48} width={5} /> : icon ? <Icon name={icon} size={40} strokeWidth={1.75} color={color ?? FR_TONES[tone].icon} /> : null)}
      </View>
    </View>
  );
}

export interface SplitTitleProps {
  a: string;
  b: string;
  /** The accent colour of `b` (README §1 tones: mint/neutral/green → green text, violet, danger ink). */
  tone?: FrTone;
  /** Top margin override (sheets with no hero draw the title flush: PC4/PC5 `margin-top:0`). */
  style?: TextStyle;
}

/** `.t` — Inter 700 28/31.4 (24 at 320), −0.025em; the second part in the tone's accent. */
export function SplitTitle({ a, b, tone = "mint", style }: SplitTitleProps): React.ReactElement {
  const m = useFirstRunMetrics();
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          marginTop: m.titleGap,
          fontSize: m.titleSize,
          lineHeight: Math.round(m.titleSize * 1.12 * 10) / 10,
          fontWeight: tokens.font.weight.bold,
          letterSpacing: em(-0.025, m.titleSize),
          color: tokens.color.ink,
        },
        style,
      ]}
    >
      {a} <Text style={{ color: FR_TONES[tone].accent }}>{b}</Text>
    </Text>
  );
}

/** `.s` — Inter 400 15/21.75 muted, 8 below the title. One sentence, at most two. */
export function Body({ children, style }: { children: React.ReactNode; style?: TextStyle }): React.ReactElement {
  return <Text style={[{ marginTop: 8, fontSize: 15, lineHeight: 21.75, color: tokens.color.muted }, style]}>{children}</Text>;
}
