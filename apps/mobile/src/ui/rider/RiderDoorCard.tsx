import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "../Icon";

/**
 * RD4a · the rider's door card (packages/design/handoff/order-flow-v2, of-screens-mrg.js `rdDoor`, ledger
 * D-59): the mirror of the customer's DoorCard. One card (1px line, radius 20), three numbered rows —
 * ① Hand over the order · ② Collect $X cash · ③ Enter the delivery code. A done row has a filled
 * accent-text disc with a check, the current one a ringed disc on a mint wash, an upcoming one a surface
 * disc with a muted title. The current row can carry a body (the cash split under ②).
 */
export type DoorRowState = "done" | "now" | "todo";

export interface DoorRow {
  title: string;
  sub?: string | null;
  state: DoorRowState;
  body?: React.ReactNode;
}

export function RiderDoorCard({ rows }: { rows: readonly DoorRow[] }): React.ReactElement {
  return (
    <View style={{ borderWidth: 1, borderColor: tokens.color.line, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14, gap: 2 }}>
      {rows.map((r, i) => {
        const now = r.state === "now";
        const done = r.state === "done";
        const prevNow = i > 0 && rows[i - 1]!.state === "now";
        return (
          <View
            key={r.title}
            accessible
            accessibilityLabel={`${i + 1}. ${r.title}${r.sub ? `. ${r.sub}` : ""}${done ? ", done" : now ? ", now" : ""}`}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              ...(now
                ? { backgroundColor: tokens.color.accentWash, marginVertical: 4, marginHorizontal: -8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 }
                : { paddingVertical: 8, borderTopWidth: i > 0 && !prevNow ? 1 : 0, borderTopColor: tokens.color.line }),
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: done ? tokens.color.accentText : now ? tokens.color.bg : tokens.color.surface,
                borderWidth: done ? 0 : now ? 2 : 1,
                borderColor: now ? tokens.color.accentText : tokens.color.line,
              }}
            >
              {done ? (
                <Icon name="check" size={14} color={tokens.color.onAccent} strokeWidth={3} />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: now ? tokens.color.accentText : tokens.color.muted }}>{i + 1}</Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: r.state === "todo" ? tokens.font.weight.semibold : tokens.font.weight.bold, color: r.state === "todo" ? tokens.color.muted : tokens.color.ink }}>
                {r.title}
              </Text>
              {r.sub ? <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{r.sub}</Text> : null}
              {r.body ? <View style={{ marginTop: 8 }}>{r.body}</View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
