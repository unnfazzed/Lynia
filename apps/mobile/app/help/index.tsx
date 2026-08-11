import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { supportWhatsAppUrl } from "../../src/config";
import { AppBar, Card, Field, Icon, type IconName, Screen } from "../../src/ui";

/**
 * Help & support hub (customer A·5 / rider A·5). A topic list plus a "Chat on WhatsApp" row — live
 * help routes to WhatsApp by product decision. The WhatsApp row is gated on a configured support
 * number (config.supportWhatsAppUrl): with none set it hides rather than opening a dead link. When a
 * support number IS configured, tapping a topic opens WhatsApp with that topic prefilled — so a card
 * that reads as tappable actually does something (before, they were inert cards styled like the live
 * WhatsApp row, so a tap silently did nothing). With no number configured they stay honest placeholders.
 */
const TOPICS: { icon: IconName; title: string; sub: string; prompt: string }[] = [
  { icon: "package", title: "A delivery problem", sub: "Late, damaged or wrong drop-off", prompt: "Hi, I have a problem with a delivery." },
  { icon: "banknote", title: "Payments & fares", sub: "How pricing and cash work", prompt: "Hi, I have a question about payments and fares." },
  { icon: "id-card", title: "My account", sub: "Verification, phone number, safety", prompt: "Hi, I need help with my account." },
];

export default function HelpScreen(): React.ReactElement {
  const router = useRouter();
  const waUrl = supportWhatsAppUrl();
  const openTopic = (prompt: string): void => {
    if (!waUrl) return;
    void Linking.openURL(`${waUrl}?text=${encodeURIComponent(prompt)}`);
  };

  // Mock `Help` (screens.jsx L794) opens with a "Search help…" field above "Browse topics". Honest,
  // not decorative: it filters the static topic list locally (no help-search backend to fake). Empty
  // query = the full list, exactly as the mock draws it.
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const topics = q ? TOPICS.filter((t) => `${t.title} ${t.sub}`.toLowerCase().includes(q)) : TOPICS;

  return (
    <Screen>
      {/* Kit AppBar (pushed-screen header) — title lives in the bar; no in-body Heading. */}
      <AppBar title="Help" onBack={() => router.back()} />

      <Field placeholder="Search help…" value={query} onChangeText={setQuery} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginTop: 6, marginBottom: tokens.space.sm }}>Browse topics</Text>
      {topics.map((t) => {
        const body = (
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md }}>
            <Icon name={t.icon} size={20} color={tokens.color.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>{t.title}</Text>
              <Text style={{ fontSize: 12, color: tokens.color.muted }}>{t.sub}</Text>
            </View>
            {waUrl ? <Icon name="chevron-right" size={18} color={tokens.color.muted} /> : null}
          </View>
        );
        // Only make a card tappable when it can actually do something (a support number is configured);
        // otherwise render an inert card so it doesn't promise an action it can't deliver.
        return waUrl ? (
          <Pressable
            key={t.title}
            onPress={() => openTopic(t.prompt)}
            accessibilityRole="button"
            accessibilityLabel={`${t.title} — chat with us on WhatsApp`}
          >
            <Card style={{ marginBottom: tokens.space.sm }}>{body}</Card>
          </Pressable>
        ) : (
          <Card key={t.title} style={{ marginBottom: tokens.space.sm }}>
            {body}
          </Card>
        );
      })}

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
    </Screen>
  );
}
