import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { AppBar, Card, Icon, type IconName, Screen } from "../../src/ui";

/**
 * LJ.privacy — the in-app privacy screen (mock screens-shipped.jsx :: `Privacy`, SH7).
 *
 * Three explainer cards (what we collect · what others see · how long we keep it) over two action
 * rows: a data-copy request and the route into account deletion. The copy is the mock's verbatim —
 * it is the CDPA/Play-policy disclosure, so the wording is the product.
 *
 * Play policy needs the privacy notice reachable from inside the app as well as from the store
 * listing (docs/PLAY-STORE-SUBMISSION.md §4); settings routes here, and this screen is the drawn
 * entry point to /settings/delete-account (the mock's red "Delete my account" row).
 */
const ROWS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "user",
    title: "What we collect",
    body: "Your name, phone number and the pins on your deliveries. No ID documents for customers.",
  },
  {
    icon: "id-card",
    title: "What others see",
    body: "First name + last initial only. Your phone is shared with your rider just while a delivery runs — then it's masked.",
  },
  {
    icon: "history",
    title: "How long we keep it",
    body: "Order records 12 months · SOS logs 90 days · a deleted account is gone after 30 days.",
  },
];

/** The mock's two bottom rows: icon · label · chevron, the delete row in danger red. */
function ActionRow(props: { icon: IconName; label: string; danger?: boolean; last?: boolean; onPress: () => void }): React.ReactElement {
  const color = props.danger ? tokens.color.danger : tokens.color.ink;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: props.last ? 0 : 1,
        borderBottomColor: tokens.color.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={props.icon} size={19} color={props.danger ? tokens.color.danger : tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color }}>{props.label}</Text>
      <Icon name="chevron-right" size={17} color={tokens.color.muted} />
    </Pressable>
  );
}

export default function PrivacyScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <Screen>
      <AppBar title="Privacy" onBack={() => router.back()} />
      {ROWS.map((r) => (
        <Card key={r.title} style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", gap: 11 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: tokens.color.accentWash,
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={r.icon} size={17} color={tokens.color.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>{r.title}</Text>
              <Text style={{ fontSize: 12.5, color: tokens.color.muted, lineHeight: 19, marginTop: 2 }}>{r.body}</Text>
            </View>
          </View>
        </Card>
      ))}
      {/* The data-copy request is a support conversation today (no self-serve export endpoint), so it
          routes into help rather than pretending to produce a file. */}
      <ActionRow icon="inbox" label="Request a copy of my data" onPress={() => router.push("/help")} />
      <ActionRow icon="trash" label="Delete my account" danger last onPress={() => router.push("/settings/delete-account")} />
    </Screen>
  );
}
