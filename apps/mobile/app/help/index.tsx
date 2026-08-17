import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, SafeAreaView } from "react-native";
import { supportWhatsAppUrl } from "../../src/config";
import { type IconName } from "../../src/ui";
import { HelpView, type HelpTopicRow } from "./help.view";

/**
 * Help & support hub (customer A·5 / rider A·5) — the CONTAINER half of the codegen seam.
 *
 * The presentational tree lives in `./help.view.tsx`, GENERATED from the mock
 * (packages/design/explorations/journey/screens.jsx :: Help) by tools/parity/codegen and locked to
 * it by the structural-snapshot guardrail (apps/api/src/parity/structure-snapshot.spec.ts). This file
 * owns everything the mock can't: routing, the local search filter, the support-number gate, and the
 * WhatsApp handlers. It passes them to <HelpView/> as props — the ONE hand-wired seam.
 *
 * The mock draws the topic chevrons and the "Chat on WhatsApp" card unconditionally, so the aligned
 * screen does too (structure follows the mock — CLAUDE.md "Pixel parity"). Safety is kept in the
 * HANDLERS, not by hiding chrome: with no support number configured, a tap is a no-op rather than a
 * dead link, so the screen never promises an action it can't deliver.
 */
const TOPICS: { icon: IconName; title: string; sub: string; prompt: string }[] = [
  { icon: "package", title: "A delivery problem", sub: "Late, damaged or wrong drop-off", prompt: "Hi, I have a problem with a delivery." },
  { icon: "banknote", title: "Payments & fares", sub: "How pricing and cash work", prompt: "Hi, I have a question about payments and fares." },
  { icon: "id-card", title: "My account", sub: "Verification, phone number, safety", prompt: "Hi, I need help with my account." },
];

export default function HelpScreen(): React.ReactElement {
  const router = useRouter();
  const waUrl = supportWhatsAppUrl();

  // Local topic filter — honest, not decorative: no help-search backend to fake, so an empty query
  // shows the full list exactly as the mock draws it.
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? TOPICS.filter((t) => `${t.title} ${t.sub}`.toLowerCase().includes(q)) : TOPICS;
  // The view takes the mock's tuple shape [icon, title, sub]; drop the prompt (a container concern).
  const rows: HelpTopicRow[] = filtered.map((t) => [t.icon, t.title, t.sub]);

  const openTopic = (index: number): void => {
    const t = filtered[index];
    if (!waUrl || !t) return;
    void Linking.openURL(`${waUrl}?text=${encodeURIComponent(t.prompt)}`);
  };
  const openWhatsApp = (): void => {
    if (!waUrl) return;
    void Linking.openURL(waUrl);
  };

  return (
    // The phone frame / safe area — the mock's AppScreen shell equivalent, applied OUTSIDE the Help
    // component (the mock's own screen padding lives inside HelpView, from its `Pad` wrappers).
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <HelpView
        topics={rows}
        query={query}
        onChangeQuery={setQuery}
        onBack={() => router.back()}
        onTopicPress={openTopic}
        onWhatsApp={openWhatsApp}
      />
    </SafeAreaView>
  );
}
