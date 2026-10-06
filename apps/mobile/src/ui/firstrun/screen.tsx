import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFirstRunMetrics } from "./metrics";

/**
 * Under a back header the body keeps the frame's `.body` padding (36, or 30 at 320): the 24 the status
 * bar takes in the frame plus the usual 12 / 6.
 */
const HEADER_BODY_GAP = 24;

/**
 * The First Run v2 page shell (README §1 "The shell", ledger D-81): white; the content starts 12 below
 * the status bar (6 at 320) with the 16 gutter and scrolls; the footer (`PinnedFooter`) is pinned below
 * it, so nothing hides under the CTA at 320×640 or font scale 1.3. `header` sits above the scroll
 * (`BackHeader` + `LargeTitle` on Settings sub-pages — then the body starts 36 below it). `overlay` is drawn
 * over everything (an inline toast). The keyboard pushes the footer up (D7).
 */
export function FirstRunScreen({
  children,
  footer,
  header,
  overlay,
  testID,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  header?: React.ReactNode;
  overlay?: React.ReactNode;
  testID?: string;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const m = useFirstRunMetrics();
  return (
    <KeyboardAvoidingView testID={testID} behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      {header}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: header ? HEADER_BODY_GAP + m.topGap : insets.top + m.topGap, paddingHorizontal: tokens.space.screen, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer}
      {overlay ? (
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          {overlay}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
