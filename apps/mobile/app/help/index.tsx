import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { supportWhatsAppUrl } from "../../src/config";
import { Button, Card, Heading, Icon, type IconName, Screen } from "../../src/ui";

/**
 * Help & support hub (customer A·5 / rider A·5). A topic list plus a "Chat on WhatsApp" row — live
 * help routes to WhatsApp by product decision. The WhatsApp row is gated on a configured support
 * number (config.supportWhatsAppUrl): with none set it hides rather than opening a dead link. Topics
 * are static entry points (no article store yet), so they're honest placeholders, not fake links.
 */
const TOPICS: { icon: IconName; title: string; sub: string }[] = [
  { icon: "package", title: "A delivery problem", sub: "Late, damaged or wrong drop-off" },
  { icon: "banknote", title: "Payments & fares", sub: "How pricing and cash work" },
  { icon: "id-card", title: "My account", sub: "Verification, phone number, safety" },
];

export default function HelpScreen(): React.ReactElement {
  const router = useRouter();
  const waUrl = supportWhatsAppUrl();

  return (
    <Screen>
      <Heading>Help</Heading>

      <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: tokens.space.sm, marginTop: tokens.space.sm }}>Browse topics</Text>
      {TOPICS.map((t) => (
        <Card key={t.title} style={{ marginBottom: tokens.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md }}>
            <Icon name={t.icon} size={20} color={tokens.color.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>{t.title}</Text>
              <Text style={{ fontSize: 12, color: tokens.color.muted }}>{t.sub}</Text>
            </View>
          </View>
        </Card>
      ))}

      {waUrl ? (
        <Pressable
          onPress={() => void Linking.openURL(waUrl)}
          accessibilityRole="button"
          accessibilityLabel="Chat with us on WhatsApp"
        >
          <Card style={{ backgroundColor: tokens.color.accentWash, borderColor: "transparent" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md }}>
              <Icon name="phone" size={20} color={tokens.color.accentText} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: tokens.color.ink }}>Chat with us on WhatsApp</Text>
              <Icon name="chevron-right" size={18} color={tokens.color.accentText} />
            </View>
          </Card>
        </Pressable>
      ) : null}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
