import { formatPhoneLocal } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import type { ItemRow } from "../../logic/order-draft";
import { Icon } from "../Icon";
import { Dot, LABEL_STYLE, SEND_COPY, Sq, TextAction } from "./kit";

/**
 * Step 4 · Review (ledger D-52; handoff state 13 — the replacement for the disclaimer). One compact block
 * per part of the order, each with "✎ Edit" back to its step. The price is NOT a block: it is pinned in
 * the CTA bar (`SendReviewPriceBar`) so it can never scroll out of view above "Send to riders".
 */

function Block({ title, meta, onEdit, editLabel, children }: { title: string; meta?: string; onEdit: () => void; editLabel: string; children: React.ReactNode }): React.ReactElement {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.input,
        paddingLeft: 12,
        paddingRight: 6,
        paddingBottom: 8,
        marginBottom: 6,
        backgroundColor: tokens.color.bg,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", minHeight: 34 }}>
        <Text style={{ ...LABEL_STYLE, flex: 1 }}>
          {title.toUpperCase()}
          {meta ? <Text style={{ fontWeight: tokens.font.weight.regular, letterSpacing: 0 }}>{` · ${meta}`}</Text> : null}
        </Text>
        <TextAction icon="pencil" label={SEND_COPY.edit} onPress={onEdit} accessibilityLabel={editLabel} />
      </View>
      <View style={{ paddingRight: 6 }}>{children}</View>
    </View>
  );
}

function Line({ children, marker, bold }: { children: React.ReactNode; marker?: React.ReactNode; bold?: boolean }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {marker}
      <Text numberOfLines={marker ? 1 : undefined} style={{ flex: 1, fontSize: 14, lineHeight: 20, color: tokens.color.ink, fontWeight: bold ? tokens.font.weight.bold : tokens.font.weight.regular }}>
        {children}
      </Text>
    </View>
  );
}

export function SendReviewStep(props: {
  pickup: string;
  drop: string;
  km: string | null;
  items: ItemRow[];
  note: string;
  senderPhone: string;
  recipientPhone: string;
  onEdit: (step: 1 | 2) => void;
}): React.ReactElement {
  const note = props.note.trim();
  return (
    <View>
      <Block title={SEND_COPY.sumRoute} meta={props.km ?? undefined} onEdit={() => props.onEdit(1)} editLabel="Edit the route">
        <Line marker={<Dot size={10} />} bold>
          {props.pickup}
        </Line>
        <Line marker={<Sq size={10} />} bold>
          {props.drop}
        </Line>
      </Block>
      <Block title={SEND_COPY.sumItems} onEdit={() => props.onEdit(2)} editLabel="Edit the items">
        {props.items.map((it, i) => (
          <Line key={i}>{`${it.description.trim()} × ${it.quantity}`}</Line>
        ))}
      </Block>
      {note.length > 0 ? (
        <Block title={SEND_COPY.sumNote} onEdit={() => props.onEdit(2)} editLabel="Edit the note">
          <Line>{note}</Line>
        </Block>
      ) : null}
      <Block title={SEND_COPY.sumPhones} onEdit={() => props.onEdit(2)} editLabel="Edit the phones">
        <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
          <Text style={{ color: tokens.color.muted }}>{`${SEND_COPY.you}: `}</Text>
          {formatPhoneLocal(props.senderPhone) || props.senderPhone}
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
          <Text style={{ color: tokens.color.muted }}>{`${SEND_COPY.recipient}: `}</Text>
          {formatPhoneLocal(props.recipientPhone) || props.recipientPhone}
        </Text>
      </Block>
    </View>
  );
}

/** The price pinned in the Review CTA bar: "PRICE", "$3.36", "💵 Cash to your rider", "✎ Edit". */
export function SendReviewPriceBar({ price, onEdit }: { price: string; onEdit: () => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, marginBottom: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={LABEL_STYLE}>{SEND_COPY.sumPrice.toUpperCase()}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: tokens.font.weight.bold, lineHeight: 26, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{price}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="banknote" size={15} color={tokens.color.accentText} />
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
              {SEND_COPY.cash}
            </Text>
          </View>
        </View>
      </View>
      <TextAction icon="pencil" label={SEND_COPY.edit} onPress={onEdit} accessibilityLabel="Edit the price" />
    </View>
  );
}
