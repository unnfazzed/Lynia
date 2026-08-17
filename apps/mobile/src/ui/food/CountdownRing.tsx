import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

/**
 * D2 waiting states (N-03's 3:00 accept window, N-18's 60s item-approval window) — an SVG progress
 * ring counting down to a server-authoritative deadline (r-parts.jsx's `Ring`). Deliberately renders
 * off elapsed-vs-total fractions the caller derives from the server's own `acceptDeadlineAt`/
 * `itemApprovalDeadlineAt` timestamps (RESTAURANTS-DECISIONS.md N-03/N-18) — never a client-started
 * timer, so a backgrounded app can't drift from the reconciler's own 20s sweep.
 */
export function CountdownRing({
  elapsedMs,
  totalMs,
  label,
  sub,
  size = 96,
}: {
  elapsedMs: number;
  totalMs: number;
  label: string;
  sub: string;
  size?: number;
}): React.ReactElement {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalMs)) : 0;
  const dashOffset = circumference * (1 - fraction);
  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={tokens.color.line} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tokens.color.accent}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{label}</Text>
      <Text style={{ fontSize: 11, color: tokens.color.muted, marginTop: 1 }}>{sub}</Text>
    </View>
  );
}

/** "3:00" / "0:52" mm:ss remaining, floored to whole seconds, never negative. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
