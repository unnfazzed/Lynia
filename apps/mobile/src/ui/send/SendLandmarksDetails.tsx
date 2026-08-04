import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Field, Icon } from "../index";

/**
 * RF-21: the "Landmarks & details" collapsible of app/send.tsx, extracted verbatim (see
 * docs/RF-21-SEND-SCREEN.md). Landmarks (contract-required, normally auto-filled from the pin) +
 * optional declared value, behind a tap-to-expand toggle so the required compose path stays short.
 */
export function SendLandmarksDetails({
  detailsOpen,
  toggleDetails,
  landmarksOk,
  declaredValueOk,
  pickupLandmark,
  pickupLandmarkFromMap,
  onChangePickupLandmark,
  dropLandmark,
  dropLandmarkFromMap,
  onChangeDropLandmark,
  declaredValue,
  onChangeDeclaredValue,
}: {
  detailsOpen: boolean;
  toggleDetails: () => void;
  landmarksOk: boolean;
  declaredValueOk: boolean;
  pickupLandmark: string;
  pickupLandmarkFromMap: boolean;
  onChangePickupLandmark: (t: string) => void;
  dropLandmark: string;
  dropLandmarkFromMap: boolean;
  onChangeDropLandmark: (t: string) => void;
  declaredValue: string;
  onChangeDeclaredValue: (t: string) => void;
}): React.ReactElement {
  return (
    <>
      <Pressable
        onPress={toggleDetails}
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen }}
        accessibilityLabel={[
          "Landmarks and details",
          !landmarksOk ? "landmarks required" : null,
          !declaredValueOk ? "declared value must be between 0 and 150" : null,
        ]
          .filter(Boolean)
          .join(", ")}
        style={{ flexDirection: "row", alignItems: "center", minHeight: tokens.touchTargetMin }}
      >
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>
          Landmarks &amp; details
          {!landmarksOk || !declaredValueOk ? (
            <Text style={{ color: tokens.color.danger, fontWeight: "700" }}>
              {` — ${[!landmarksOk ? "landmarks required" : null, !declaredValueOk ? "declared value must be $0–150" : null].filter(Boolean).join(", ")}`}
            </Text>
          ) : null}
        </Text>
        <Icon name={detailsOpen ? "chevron-down" : "chevron-right"} size={16} color={tokens.color.muted} />
      </Pressable>
      {detailsOpen ? (
        <View style={{ marginTop: tokens.space.sm }}>
          <Field
            label={pickupLandmarkFromMap ? "Pickup landmark  • from map" : "Pickup landmark"}
            value={pickupLandmark}
            onChangeText={onChangePickupLandmark}
            placeholder="Eastgate Mall, CBD"
            maxLength={160}
          />
          <Field
            label={dropLandmarkFromMap ? "Drop-off landmark  • from map" : "Drop-off landmark"}
            value={dropLandmark}
            onChangeText={onChangeDropLandmark}
            placeholder="14 Glenara Ave, Avenues"
            maxLength={160}
          />
          <Field label="Declared value (USD, max 150)" value={declaredValue} onChangeText={onChangeDeclaredValue} placeholder="10" keyboardType="decimal-pad" />
          {!declaredValueOk ? (
            <Text accessibilityRole="alert" style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger, marginTop: -tokens.space.xs, marginBottom: tokens.space.sm }}>
              Declared value must be between $0 and $150.
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
