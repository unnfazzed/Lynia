import { formatPhoneLocal } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { type ItemRow, MAX_ITEMS, MAX_QTY } from "../../logic/order-draft";
import type { Recipient } from "../../logic/saved-recipients";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { LABEL_STYLE, Notice, SEND_COPY, SendField, TextAction } from "./kit";

/**
 * Step 2 · What and who (ledger D-52; handoff states 6–9). Item cards (description + Qty − / +), "Add
 * another item" (or the calm 10-item notice), the rider note, the sender phone as a full prefilled field,
 * and the recipient phone with recent-recipient chips while it is empty. Phone errors show on blur or on
 * Next, never per keystroke — the screen decides when via the `*Error` props.
 */

function RoundBtn({ glyph, label, onPress, disabled }: { glyph: string; label: string; onPress: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <Tappable
      tone="icon"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        width: tokens.touchTargetMin,
        height: tokens.touchTargetMin,
        borderRadius: tokens.touchTargetMin / 2,
        borderWidth: 1.5,
        borderColor: tokens.color.line,
        backgroundColor: tokens.color.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, lineHeight: 26 }}>{glyph}</Text>
    </Tappable>
  );
}

function ItemCard(props: {
  item: ItemRow;
  index: number;
  removable: boolean;
  onChange: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
}): React.ReactElement {
  const { item } = props;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.input,
        paddingTop: 10,
        paddingHorizontal: 10,
        paddingBottom: 6,
        marginBottom: 8,
        backgroundColor: tokens.color.bg,
      }}
    >
      <SendField
        value={item.description}
        onChangeText={(t) => props.onChange({ description: t })}
        placeholder={SEND_COPY.itemPh}
        maxLength={140}
        accessibilityLabel={`Item ${props.index + 1}`}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: -8, marginBottom: 2 }}>
        <Text style={{ ...LABEL_STYLE, letterSpacing: 0 }}>{SEND_COPY.qty}</Text>
        <RoundBtn
          glyph="−"
          label={`Fewer of item ${props.index + 1}`}
          disabled={item.quantity <= 1}
          onPress={() => props.onChange({ quantity: Math.max(1, item.quantity - 1) })}
        />
        <Text style={{ minWidth: 22, textAlign: "center", fontSize: 17, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
          {item.quantity}
        </Text>
        <RoundBtn
          glyph="+"
          label={`More of item ${props.index + 1}`}
          disabled={item.quantity >= MAX_QTY}
          onPress={() => props.onChange({ quantity: Math.min(MAX_QTY, item.quantity + 1) })}
        />
        <View style={{ flex: 1 }} />
        {props.removable ? (
          <TextAction
            icon="trash"
            label={SEND_COPY.remove}
            color={tokens.color.muted}
            onPress={props.onRemove}
            accessibilityLabel={`Remove item ${props.index + 1}`}
          />
        ) : null}
      </View>
    </View>
  );
}

function Chip({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{
        height: tokens.touchTargetMin,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.pill,
        backgroundColor: tokens.color.bg,
      }}
    >
      <Icon name="history" size={14} color={tokens.color.muted} />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{label}</Text>
    </Tappable>
  );
}

export function SendWhatStep(props: {
  items: ItemRow[];
  onChangeItem: (i: number, patch: Partial<ItemRow>) => void;
  onAddItem: () => void;
  onRemoveItem: (i: number) => void;
  note: string;
  onChangeNote: (t: string) => void;
  senderPhone: string;
  onChangeSenderPhone: (t: string) => void;
  onBlurSenderPhone: () => void;
  senderError: string | null;
  recipientPhone: string;
  onChangeRecipientPhone: (t: string) => void;
  onBlurRecipientPhone: () => void;
  recipientError: string | null;
  recipients: Recipient[];
}): React.ReactElement {
  const atMax = props.items.length >= MAX_ITEMS;
  return (
    <View>
      <Text accessibilityRole="header" style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, lineHeight: 18, marginBottom: 8 }}>
        {SEND_COPY.whatSend}
      </Text>
      {props.items.map((it, i) => (
        <ItemCard
          key={i}
          item={it}
          index={i}
          removable={props.items.length > 1}
          onChange={(patch) => props.onChangeItem(i, patch)}
          onRemove={() => props.onRemoveItem(i)}
        />
      ))}
      {atMax ? (
        <Notice icon="package" text={SEND_COPY.maxItems} style={{ marginBottom: 16 }} />
      ) : (
        <TextAction
          icon="plus"
          label={SEND_COPY.addItem}
          size={14}
          onPress={props.onAddItem}
          style={{ alignSelf: "flex-start", paddingHorizontal: 0, gap: 8, marginBottom: 10 }}
        />
      )}
      <SendField
        label={SEND_COPY.note}
        value={props.note}
        onChangeText={props.onChangeNote}
        placeholder={SEND_COPY.notePh}
        maxLength={280}
        multiline
      />
      <SendField
        label={SEND_COPY.sender}
        value={props.senderPhone}
        onChangeText={props.onChangeSenderPhone}
        onBlur={props.onBlurSenderPhone}
        placeholder={SEND_COPY.phonePh}
        keyboardType="phone-pad"
        maxLength={20}
        error={props.senderError}
        hint={SEND_COPY.senderHint}
      />
      <SendField
        label={SEND_COPY.rcpt}
        value={props.recipientPhone}
        onChangeText={props.onChangeRecipientPhone}
        onBlur={props.onBlurRecipientPhone}
        placeholder={SEND_COPY.phonePh}
        keyboardType="phone-pad"
        maxLength={20}
        error={props.recipientError}
        hint={SEND_COPY.rcptHint}
      >
        {props.recipients.length > 0 && props.recipientPhone.trim().length === 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {props.recipients.map((r) => {
              const local = formatPhoneLocal(r.phone);
              return (
                <Chip
                  key={r.phone}
                  label={r.name ? `${r.name} · ${local}` : local}
                  a11y={`Use recipient ${r.name || local}`}
                  onPress={() => props.onChangeRecipientPhone(local)}
                />
              );
            })}
          </View>
        ) : null}
      </SendField>
    </View>
  );
}
