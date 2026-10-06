import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tappable } from "../Tappable";

/** The sheet dim (`.dim`), the same scrim the app's other sheets draw. */
export const SHEET_DIM = "rgba(20,24,27,0.45)";

/**
 * The First Run v2 sheet (README §1 "Sheet", `fr-kit.js` `.sheet` `.grab` `.dim`, ledger D-81): radius
 * 24 at the top, a 4×36 `line` grab handle 16 above the content, padding 8 16 16 (+ the bottom inset),
 * over a .45 ink dim. PC1–PC6 (over Home), E2a (photo source), E4 (plate). Tapping the dim or Back
 * closes it unless `locked`.
 */
export function FrSheet({
  visible,
  onClose,
  locked,
  children,
  closeLabel = "Close",
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  locked?: boolean;
  children: React.ReactNode;
  closeLabel?: string;
  testID?: string;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => (locked ? undefined : onClose())}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          disabled={locked}
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SHEET_DIM }}
        />
        <View testID={testID} style={{ maxHeight: "92%", backgroundColor: tokens.color.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: tokens.space.screen, paddingBottom: 16 + insets.bottom }}>
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line, marginBottom: 16 }} />
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
