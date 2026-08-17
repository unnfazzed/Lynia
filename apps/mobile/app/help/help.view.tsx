// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.help.
// Source mock: packages/design/explorations/journey/screens.jsx :: Help
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.help
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/help/index.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text, Pressable } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { AppBar, Field, Card, Icon, type IconName } from "../../src/ui";

/** A help topic, tuple-shaped to mirror the mock's `[icon, title, sub]` rows verbatim. */
export type HelpTopicRow = [IconName, string, string];
export type HelpViewProps = {
  topics: HelpTopicRow[];
  query: string;
  onChangeQuery: (v: string) => void;
  onBack: () => void;
  onTopicPress: (index: number) => void;
  onWhatsApp: () => void;
};

export function HelpView({
  topics,
  query,
  onChangeQuery,
  onBack,
  onTopicPress,
  onWhatsApp
}: HelpViewProps): React.ReactElement {
  return <View>
      <View style={{
      padding: tokens.space.screen,
      minHeight: 0,
      paddingBottom: 0
    }}><AppBar title="Help" onBack={onBack} /></View>
      <View style={{
      padding: tokens.space.screen,
      minHeight: "100%",
      paddingTop: 4
    }}>
        <Field placeholder="Search help…" value={query} onChangeText={onChangeQuery} />
        <Text style={{
        fontSize: 12,
        fontWeight: "600",
        color: tokens.color.muted,
        marginTop: 6,
        marginRight: 0,
        marginBottom: 8,
        marginLeft: 0
      }}>Browse topics</Text>
        {topics.map(([ic, t, m], i) => <Pressable key={t} onPress={() => onTopicPress(i)} accessibilityRole="button" accessibilityLabel={t}><Card style={{
          marginBottom: 8
        }}>
            <View style={{
            alignItems: "center",
            gap: 11,
            flexDirection: "row"
          }}>
              <Icon name={ic} size={20} color={tokens.color.accentText} />
              <View style={{
              flex: 1
            }}>
                <Text style={{
                fontSize: 14,
                fontWeight: "600",
                color: tokens.color.ink
              }}>{t}</Text>
                <Text style={{
                fontSize: 12,
                color: tokens.color.muted
              }}>{m}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={tokens.color.muted} />
            </View>
          </Card></Pressable>)}
        <Pressable onPress={onWhatsApp} accessibilityRole="button" accessibilityLabel="Chat with us on WhatsApp"><Card style={{
          backgroundColor: tokens.color.accentWash,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "transparent"
        }}>
          <View style={{
            alignItems: "center",
            gap: 11,
            flexDirection: "row"
          }}>
            <Icon name="phone" size={20} color={tokens.color.accentText} />
            <Text style={{
              flex: 1,
              fontSize: 13,
              fontWeight: "600",
              color: tokens.color.ink
            }}>Chat with us on WhatsApp</Text>
            <Icon name="chevron-right" size={18} color={tokens.color.accentText} />
          </View>
        </Card></Pressable>
      </View>
    </View>;
}
