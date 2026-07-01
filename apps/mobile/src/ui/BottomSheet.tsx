import { tokens } from "@lynia/shared";
import React from "react";
import { View, type ViewStyle } from "react-native";

/**
 * A lightweight, PRESENTATIONAL bottom-anchored panel — the "name your price" hero container that
 * pins the required inputs + CTA into the thumb zone. Deliberately NOT gesture-driven: the full
 * single-full-bleed-map + draggable sheet with PanResponder physics is being spec'd separately for
 * the on-device build. This is the verifiable slice: rounded top corners, a subtle top border, and a
 * visual-only drag-handle affordance so it reads as a sheet without pretending to be draggable.
 *
 * Built from RN core primitives + design tokens only (same constraint as LiveMap) — no gesture-
 * handler, no reanimated, no @gorhom/bottom-sheet.
 */
export function BottomSheet({
  children,
  footer,
  style,
}: {
  children: React.ReactNode;
  /** Optional footer pinned below the body — e.g. the primary CTA + error text. */
  footer?: React.ReactNode;
  style?: ViewStyle;
}): React.ReactElement {
  return (
    <View
      style={[
        {
          backgroundColor: tokens.color.bg,
          borderTopLeftRadius: tokens.radius.card,
          borderTopRightRadius: tokens.radius.card,
          borderTopWidth: 1,
          borderColor: tokens.color.line,
          padding: tokens.space.lg,
        },
        style,
      ]}
    >
      {/* Drag-handle affordance — visual only (this sheet doesn't drag; see header note). */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 36,
          height: 4,
          borderRadius: tokens.radius.pill,
          backgroundColor: tokens.color.line,
          alignSelf: "center",
          marginBottom: tokens.space.md,
        }}
      />
      {children}
      {footer ? <View style={{ marginTop: tokens.space.sm }}>{footer}</View> : null}
    </View>
  );
}
