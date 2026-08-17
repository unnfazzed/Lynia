import { tokens } from "@lynia/shared/tokens";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Card, Icon, useToast } from "../index";

interface CopyableRow {
  label: string;
  value: string;
}

/**
 * D-24 manual rail: "No prompt? Pay manually" — copyable merchant number / exact amount / reference
 * rows, for when an in-app mobile-money prompt isn't available (prompts fail here — the manual rail
 * is the norm, not a fallback edge case). Each row copies independently; a brief "Copied" swap on the
 * button is the only feedback beyond the shared toast, matching the design mock's copy affordance.
 */
export function ManualPayRail({ rows }: { rows: CopyableRow[] }): React.ReactElement {
  const toast = useToast();
  const [justCopied, setJustCopied] = useState<string | null>(null);

  const copy = async (row: CopyableRow): Promise<void> => {
    await Clipboard.setStringAsync(row.value);
    setJustCopied(row.label);
    toast.show(`${row.label} copied`, "info");
    setTimeout(() => setJustCopied((cur) => (cur === row.label ? null : cur)), 1500);
  };

  return (
    <Card>
      <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink, marginBottom: 8 }}>No prompt? Pay manually</Text>
      {rows.map((row, i) => (
        <View
          key={row.label}
          style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: tokens.color.line }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.3 }}>{row.label.toUpperCase()}</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.ink, marginTop: 2 }} selectable>
              {row.value}
            </Text>
          </View>
          <Pressable
            onPress={() => void copy(row)}
            accessibilityRole="button"
            accessibilityLabel={`Copy ${row.label}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: tokens.radius.pill,
              backgroundColor: tokens.color.surface,
              minHeight: tokens.touchTargetMin,
            }}
          >
            <Icon name={justCopied === row.label ? "check" : "copy"} size={14} color={tokens.color.accentText} />
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.accentText }}>{justCopied === row.label ? "Copied" : "Copy"}</Text>
          </Pressable>
        </View>
      ))}
      <Text style={{ fontSize: 11.5, color: tokens.color.muted, marginTop: 8, lineHeight: 16 }}>
        Dial your rail&apos;s USSD, send the exact amount, then come back and enter your reference.
      </Text>
    </Card>
  );
}
