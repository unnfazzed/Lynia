import type { ScheduleSlot, ScheduleSlotsResponse } from "@lynia/shared";
import { FirstRunToast } from "../firstrun/toast";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Image, Modal, ScrollView, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { formatMoney } from "../../logic/money";
import { firstSlot, type ChosenSlot, type SlotDay } from "../../logic/review";
import { GRAB, HAIRLINE, RADIO_OFF, TABULAR } from "../browse/kit";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { O, O_ADDED, ofFmt } from "./copy";

/** `ofAlpha.scrim` — the modal dim the handoff draws. */
const SCRIM = "rgba(20,24,27,0.45)";

/**
 * Review & place parts (Order flow v2.1 R1–R9, ledger D-59) — `of-kit.js` + the v2.1 `of-polish.js`
 * overrides ("a grey page under white checkout cards"). Values are the handoff's; colours are theme
 * tokens (`code/tokens.ts` mapped onto `@lynia/shared/tokens`, no new values).
 */

const W800 = tokens.font.weight.extrabold;
const LABEL: TextStyle = { fontSize: 12, fontWeight: tokens.font.weight.bold, letterSpacing: 0.84, color: tokens.color.muted, textTransform: "uppercase" };

/** `.hb`: 52 bar, "‹ Back" 15/600 green, centred title 16/800, hairline under. */
export function ReviewHeader({ onBack }: { onBack: () => void }): React.ReactElement {
  return (
    <View style={{ height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, backgroundColor: tokens.color.bg, borderBottomWidth: 1, borderBottomColor: tokens.color.line }}>
      <Tappable
        tone="icon"
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={O.c.back}
        style={{ height: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 8, zIndex: 1 }}
      >
        <Icon name="chevron-left" size={22} color={tokens.color.accentText} />
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{O.c.back}</Text>
      </Tappable>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{ position: "absolute", left: 88, right: 88, textAlign: "center", fontSize: 16, fontWeight: W800, color: tokens.color.ink }}
      >
        {O.r.title}
      </Text>
    </View>
  );
}

/**
 * `.seg` (+ polish): a surface pill, padding 3, gap 3; each half 40 min, 14/600 ink with an optional 16
 * icon; the chosen half is cta-filled, white 14/800. Used by WHEN, the out-of-stock choice and the
 * schedule sheet's Today / Tomorrow.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string; icon?: IconName; disabled?: boolean }[];
  value: T | null;
  onChange: (v: T) => void;
}): React.ReactElement {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 3, padding: 3, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tappable
            key={o.value}
            tone="row"
            onPress={() => onChange(o.value)}
            disabled={o.disabled}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on, disabled: !!o.disabled }}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: tokens.radius.pill,
              backgroundColor: on ? tokens.color.cta : "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 8,
              opacity: o.disabled ? 0.4 : 1,
            }}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={on ? tokens.color.onAccent : tokens.color.ink} /> : null}
            <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: on ? W800 : tokens.font.weight.semibold, color: on ? tokens.color.onAccent : tokens.color.ink, textAlign: "center" }}>{o.label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

/**
 * The WHEN block in its ASAP state (R1): the "As soon as possible · 📅 Schedule" segmented control —
 * Schedule opens the schedule sheet (R5a). "Arrives {a}–{b}" shows only when an honest estimate exists.
 */
export function WhenAsap({ window, onSchedule }: { window: { a: string; b: string } | null; onSchedule: () => void }): React.ReactElement {
  return (
    <>
      <Segmented
        options={[
          { value: "asap", label: O.r.asap },
          { value: "schedule", label: O.r.schedule, icon: "calendar" },
        ]}
        value="asap"
        onChange={(v) => {
          if (v === "schedule") onSchedule();
        }}
      />
      {window ? <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted, ...TABULAR }}>{ofFmt(O.r.asapSub, window)}</Text> : null}
    </>
  );
}

/** R5b — the WHEN block once a slot is chosen: calendar 18 green · "Scheduled · Tomorrow 12:30–13:00"
 *  15/700 · "{v} starts {making} at {t}. Free to cancel until then." 13 muted. */
export function WhenScheduled({ title, sub }: { title: string; sub: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <Icon name="calendar" size={18} color={tokens.color.accentText} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 19.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{title}</Text>
        <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted, ...TABULAR }}>{sub}</Text>
      </View>
    </View>
  );
}

/** R2a/R2b — "IF SOMETHING'S OUT OF STOCK": Ask me · Remove it, and the line under it for the choice. */
export function OutOfStockChoice({ value, place, onChange }: { value: "ask" | "remove"; place: string; onChange: (v: "ask" | "remove") => void }): React.ReactElement {
  return (
    <>
      <Segmented
        options={[
          { value: "ask", label: O.r.oosAsk },
          { value: "remove", label: O.r.oosRemove },
        ]}
        value={value}
        onChange={onChange}
      />
      <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{ofFmt(value === "remove" ? O.r.oosRemoveSub : O.r.oosAskSub, { place })}</Text>
    </>
  );
}

/** R8 — the "Prescription needed" pill: highlight wash, 20 high, file-text 12, 11/600 highlight ink. */
export function RxTag(): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 20, paddingHorizontal: 8, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.highlightChipWash }}>
      <Icon name="file-text" size={12} color={tokens.color.highlightChipInk} />
      <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.semibold, color: tokens.color.highlightChipInk }}>{O.r.rxNeed}</Text>
    </View>
  );
}

/** `.sm` (polish): a 44 pill, 14/800, icon 16; `filled` = cta fill + white, else surface fill + green. */
export function SmButton({ label, icon, filled, onPress, disabled }: { label: string; icon?: IconName; filled?: boolean; onPress: () => void; disabled?: boolean }): React.ReactElement {
  const fg = filled ? tokens.color.onAccent : tokens.color.accentText;
  return (
    <Tappable
      tone={filled ? "onDark" : "row"}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        minHeight: tokens.touchTargetMin,
        borderRadius: tokens.radius.pill,
        backgroundColor: filled ? tokens.color.cta : tokens.color.surface,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 14,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: W800, color: fg, textAlign: "center" }}>{label}</Text>
    </Tappable>
  );
}

/**
 * RxBlock (R8a / R8b, behind `rxEnabled`). Empty: a 1.5 green border, "Up to 3 pages. A pharmacist checks
 * it before packing." and Take photo (filled) / From gallery. Added: 64×80 page thumbs + a dashed add
 * tile (while under 3 pages), the patient name field and the consent tick.
 */
export function RxBlock({
  pages,
  canAddMore,
  onAdd,
  patient,
  onPatient,
  consent,
  onConsent,
}: {
  pages: readonly { id: string; uri: string; uploading: boolean }[];
  canAddMore: boolean;
  onAdd: (from: "camera" | "gallery") => void;
  patient: string;
  onPatient: (t: string) => void;
  consent: boolean;
  onConsent: () => void;
}): React.ReactElement {
  if (pages.length === 0) {
    return (
      <ReviewBlock label={O.r.rxT} style={{ borderWidth: 1.5, borderColor: tokens.color.accentText }}>
        <Text style={{ fontSize: 14, lineHeight: 19.6, color: tokens.color.muted }}>{O.r.rxAddSub}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <SmButton label={O.r.rxCamera} icon="camera" filled onPress={() => onAdd("camera")} />
          <SmButton label={O.r.rxGallery} icon="image" onPress={() => onAdd("gallery")} />
        </View>
      </ReviewBlock>
    );
  }
  return (
    <ReviewBlock label={O.r.rxT}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {pages.map((p, i) => (
          <View
            key={p.id}
            accessible
            accessibilityLabel={ofFmt(O.r.rxPage, { n: i + 1 })}
            style={{ width: 64, height: 80, borderRadius: 12, overflow: "hidden", backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}
          >
            <Image source={{ uri: p.uri }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            {p.uploading ? <ActivityIndicator size="small" color={tokens.color.accentText} /> : null}
          </View>
        ))}
        {canAddMore ? (
          <Tappable
            tone="icon"
            onPress={() => onAdd("camera")}
            accessibilityRole="button"
            accessibilityLabel={O.r.rxAdd}
            style={{ width: 64, height: 80, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: RADIO_OFF, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="plus" size={20} color={tokens.color.accentText} />
          </Tappable>
        ) : null}
      </View>
      <Text style={{ marginTop: 4, fontSize: 12.5, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{O.r.rxPatient}</Text>
      <ReviewField value={patient} onChangeText={onPatient} maxLength={80} autoCapitalize="words" accessibilityLabel={O.r.rxPatient} />
      <Tappable
        tone="row"
        onPress={onConsent}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        accessibilityLabel={O.r.rxConsent}
        style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 6 }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: consent ? tokens.color.accentText : RADIO_OFF,
            backgroundColor: consent ? tokens.color.accentText : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {consent ? <Icon name="check" size={16} color={tokens.color.onAccent} strokeWidth={3} /> : null}
        </View>
        <Text style={{ flex: 1, fontSize: 14, lineHeight: 19.6, color: tokens.color.ink }}>{O.r.rxConsent}</Text>
      </Tappable>
    </ReviewBlock>
  );
}

/**
 * ScheduleSheet (R5a): a modal sheet — "When should it arrive?" 21/800 · Today / Tomorrow · 2-column 44
 * slot chips (chosen = mint + 1.5 green border + check; full = surface, "· Full", disabled) · one muted
 * line · "Arrive {slot}". A day with no slot the venue can meet shows one disabled "Closed" chip.
 */
export function ScheduleSheet({
  visible,
  venue,
  making,
  slots,
  initial,
  bottomInset,
  onPick,
  onClose,
}: {
  visible: boolean;
  venue: string;
  /** "cooking" / "packing". */
  making: string;
  slots: ScheduleSlotsResponse | null;
  initial: ChosenSlot | null;
  bottomInset: number;
  onPick: (c: ChosenSlot) => void;
  onClose: () => void;
}): React.ReactElement {
  const [day, setDay] = React.useState<SlotDay>("today");
  const [chosen, setChosen] = React.useState<ChosenSlot | null>(null);
  React.useEffect(() => {
    if (!visible) return;
    setChosen(initial);
    const first = slots ? firstSlot(slots) : null;
    setDay(initial?.day ?? (slots && slots.today.slots.some((s) => !s.full) ? "today" : (first?.day ?? "tomorrow")));
  }, [visible, initial, slots]);
  const list = slots ? (day === "today" ? slots.today.slots : slots.tomorrow.slots) : [];
  const dayWord = (d: SlotDay): string => (d === "today" ? O.r.today : O.r.tomorrow).toLowerCase();
  const rows: ScheduleSlot[][] = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable accessibilityRole="button" accessibilityLabel={O.c.close} onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SCRIM }} />
        <View accessibilityViewIsModal style={{ backgroundColor: tokens.color.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 16 + bottomInset, gap: 12, maxHeight: "92%" }}>
          <View style={{ height: 28, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: GRAB }} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 21, lineHeight: 25.2, fontWeight: W800, letterSpacing: -0.5, color: tokens.color.ink }}>
            {O.r.schT}
          </Text>
          <Segmented
            options={[
              { value: "today", label: O.r.today },
              { value: "tomorrow", label: O.r.tomorrow },
            ]}
            value={day}
            onChange={setDay}
          />
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
            {list.length === 0 ? (
              <View style={{ minHeight: 44, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{O.r.slotClosed}</Text>
              </View>
            ) : (
              rows.map((row) => (
                <View key={row[0]!.start} style={{ flexDirection: "row", gap: 8 }}>
                  {row.map((s) => {
                    const on = chosen?.slot.start === s.start;
                    return (
                      <Tappable
                        key={s.start}
                        tone="row"
                        disabled={s.full}
                        onPress={() => setChosen({ day, slot: s })}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled: s.full }}
                        accessibilityLabel={s.full ? `${s.label} · ${O.r.slotFull}` : s.label}
                        style={{
                          flex: 1,
                          minHeight: tokens.touchTargetMin,
                          borderRadius: tokens.radius.pill,
                          borderWidth: on ? 1.5 : 1,
                          borderColor: on ? tokens.color.accentText : s.full ? tokens.color.surface : tokens.color.line,
                          backgroundColor: on ? tokens.color.accentWash : s.full ? tokens.color.surface : tokens.color.bg,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingHorizontal: 10,
                        }}
                      >
                        {on ? <Icon name="check" size={14} color={tokens.color.accentText} /> : null}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: on ? tokens.font.weight.bold : tokens.font.weight.semibold,
                            color: on ? tokens.color.accentText : s.full ? tokens.color.muted : tokens.color.ink,
                            ...TABULAR,
                          }}
                        >
                          {s.full ? `${s.label} · ${O.r.slotFull}` : s.label}
                        </Text>
                      </Tappable>
                    );
                  })}
                  {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                </View>
              ))
            )}
          </ScrollView>
          <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{ofFmt(O.r.schNote, { v: venue, making })}</Text>
          <PrimaryButton
            label={chosen ? ofFmt(O.r.schSave, { s: `${dayWord(chosen.day)} ${chosen.slot.label}` }) : ofFmt(O.r.schSave, { s: "" }).trim()}
            disabled={!chosen}
            onPress={() => {
              if (chosen) onPick(chosen);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/** `.ed`: "✎ Edit" (or "Done") 13/800 green, a 44 hit. */
export function EditLink({ label, onPress, icon = true }: { label: string; onPress: () => void; icon?: boolean }): React.ReactElement {
  return (
    <Tappable
      tone="icon"
      onPress={onPress}
      accessibilityRole="button"
      style={{ minHeight: tokens.touchTargetMin, marginVertical: -10, marginRight: -8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      {icon ? <Icon name="pencil" size={14} color={tokens.color.accentText} /> : null}
      <Text style={{ fontSize: 13, fontWeight: W800, color: tokens.color.accentText }}>{label}</Text>
    </Tappable>
  );
}

/** ReviewBlock (`.rb` + polish): white r16 card, 14/16 padding, uppercase label + optional ✎ Edit. */
export function ReviewBlock({
  label,
  edit,
  focused,
  children,
  style,
}: {
  label: string;
  edit?: { label: string; onPress: () => void; icon?: boolean } | null;
  /** R3a: the block being edited wears a 1.5 green border. */
  focused?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}): React.ReactElement {
  return (
    <View
      style={{
        backgroundColor: tokens.color.bg,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 6,
        borderWidth: focused ? 1.5 : 0,
        borderColor: tokens.color.accentText,
        ...style,
      }}
    >
      <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={LABEL}>{label}</Text>
        {edit ? <EditLink label={edit.label} onPress={edit.onPress} icon={edit.icon} /> : null}
      </View>
      {children}
    </View>
  );
}

/** `.note`: r12, 10/12, icon 18 + 13 text. ok = mint · hi = highlight wash · dn = danger wash · plain = white. */
export function ReviewNote({ tone, icon, children }: { tone: "ok" | "hi" | "dn" | "plain"; icon: IconName; children: React.ReactNode }): React.ReactElement {
  const bg = tone === "ok" ? tokens.color.accentWash : tone === "hi" ? tokens.color.highlightChipWash : tone === "dn" ? tokens.color.dangerWash : tokens.color.bg;
  const ink = tone === "ok" ? tokens.color.accentText : tone === "hi" ? tokens.color.highlightChipInk : tone === "dn" ? tokens.color.dangerInk : tokens.color.muted;
  return (
    <View accessibilityRole={tone === "dn" ? "alert" : undefined} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: bg }}>
      <Icon name={icon} size={18} color={ink} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18.85, color: tone === "plain" || tone === "ok" ? tokens.color.ink : ink }}>{children}</Text>
    </View>
  );
}

/** "− n +" (`.stp` + polish): surface pill, 44 high, 40-wide halves; at 1 the − is a bin. */
export function LineStepper({ qty, name, onMinus, onPlus, plusDisabled }: { qty: number; name: string; onMinus: () => void; onPlus: () => void; plusDisabled?: boolean }): React.ReactElement {
  const bin = qty <= 1;
  const half: ViewStyle = { width: 40, height: 44, alignItems: "center", justifyContent: "center" };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: 44, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface }}>
      <Tappable tone="icon" onPress={onMinus} accessibilityRole="button" accessibilityLabel={bin ? `Remove ${name}` : `One less ${name}`} style={half}>
        <Icon name={bin ? "trash" : "minus"} size={bin ? 16 : 18} color={bin ? tokens.color.muted : tokens.color.ink} />
      </Tappable>
      <Text style={{ minWidth: 20, textAlign: "center", fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{qty}</Text>
      <Tappable
        tone="icon"
        onPress={onPlus}
        disabled={plusDisabled}
        accessibilityRole="button"
        accessibilityLabel={`One more ${name}`}
        style={{ ...half, opacity: plusDisabled ? 0.4 : 1 }}
      >
        <Icon name="plus" size={18} color={tokens.color.accentText} />
      </Tappable>
    </View>
  );
}

/** One Items line: name 15/600 · price 14/600 (+ the old price struck) · flag · note link · stepper. */
export function ItemLine({
  name,
  price,
  was,
  flag,
  gone,
  note,
  noteEditor,
  onNote,
  stepper,
  rx,
}: {
  name: string;
  price: number;
  /** R8: the line needs a prescription — the "Prescription needed" pill after the price. */
  rx?: boolean;
  was?: number | null;
  flag?: { text: string; tone: "muted" | "hi" } | null;
  /** R6a: a line taken off — struck through, no stepper. */
  gone?: boolean;
  note: string;
  /** The inline note field while this line's note is being edited. */
  noteEditor?: React.ReactNode;
  onNote?: () => void;
  stepper?: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: HAIRLINE }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 15,
            lineHeight: 19.5,
            fontWeight: tokens.font.weight.semibold,
            color: gone ? tokens.color.muted : tokens.color.ink,
            textDecorationLine: gone ? "line-through" : "none",
          }}
        >
          {name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: gone ? tokens.color.muted : tokens.color.ink, ...TABULAR }}>{formatMoney(price)}</Text>
          {was != null ? <Text style={{ fontSize: 13, color: tokens.color.muted, textDecorationLine: "line-through", ...TABULAR }}>{formatMoney(was)}</Text> : null}
          {rx ? <RxTag /> : null}
        </View>
        {flag ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
            <Icon name="circle-alert" size={14} color={flag.tone === "hi" ? tokens.color.highlightChipInk : tokens.color.muted} />
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: tokens.font.weight.semibold, color: flag.tone === "hi" ? tokens.color.highlightChipInk : tokens.color.muted }}>{flag.text}</Text>
          </View>
        ) : null}
        {noteEditor ??
          (onNote ? (
            <Tappable
              tone="icon"
              onPress={onNote}
              accessibilityRole="button"
              accessibilityLabel={note ? `Note for ${name}: ${note}. Edit` : `${O.r.lineNote} for ${name}`}
              style={{ minHeight: 32, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
            >
              <Icon name="pencil" size={13} color={tokens.color.accentText} />
              <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 13, fontWeight: note ? tokens.font.weight.regular : tokens.font.weight.semibold, color: tokens.color.accentText }}>
                {note || O.r.lineNote}
              </Text>
            </Tappable>
          ) : null)}
      </View>
      {stepper}
    </View>
  );
}

/** `.field`: 48 min, r12, 1px line (1.5 accent when focused), 15 text. */
export function ReviewField({ icon, style, ...input }: TextInputProps & { icon?: IconName }): React.ReactElement {
  const [focused, setFocused] = React.useState(false);
  return (
    <View
      style={{
        minHeight: 48,
        borderRadius: 12,
        borderWidth: focused ? 1.5 : 1,
        borderColor: focused ? tokens.color.accent : tokens.color.line,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
      }}
    >
      {icon ? <Icon name={icon} size={18} color={tokens.color.muted} /> : null}
      <TextInput
        placeholderTextColor={tokens.color.muted}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[{ flex: 1, fontSize: 15, color: tokens.color.ink, paddingVertical: 10 }, style]}
      />
    </View>
  );
}

/** `.kv`: 13 muted label, 600 value; the Total row is ink 700 + 17/700. */
function Kv({ k, v, text, total, first }: { k: string; v: number; text?: string; total?: boolean; first?: boolean }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 7, borderTopWidth: first ? 0 : 1, borderTopColor: tokens.color.line }}>
      <Text style={{ flex: 1, fontSize: 13, color: total ? tokens.color.ink : tokens.color.muted, fontWeight: total ? tokens.font.weight.bold : tokens.font.weight.regular }}>{k}</Text>
      {/* D-71: free delivery reads bold in the purple `free` token — browse-v2's rule for "Free delivery" text. */}
      <Text
        style={{
          fontSize: total ? 17 : 13,
          fontWeight: total || text ? tokens.font.weight.bold : tokens.font.weight.semibold,
          color: text ? tokens.color.free : tokens.color.ink,
          ...TABULAR,
        }}
      >
        {text ?? formatMoney(v)}
      </Text>
    </View>
  );
}

/** The breakdown card: Food (Items for a shop) · Delivery fee · Small-order fee · owed · Total, then the
 *  cancel rule. The owed row (BRIEF D3f) shows only when the order carries a balance. */
export function Breakdown({
  food,
  deliveryFee,
  smallOrderFee,
  total,
  goodsLabel = O.r.food,
  owed = 0,
  freeDeliveryBy = null,
}: {
  food: number;
  deliveryFee: number | null;
  smallOrderFee: number;
  total: number;
  /** "Food" for a kitchen, "Items" for a shop or pharmacy (of-screens-rt.js `brk`). */
  goodsLabel?: string;
  owed?: number;
  /** D-71: the venue paying for delivery — the fee row reads "Free, paid by {venue}" (deliveryFee is 0). */
  freeDeliveryBy?: string | null;
}): React.ReactElement {
  return (
    <View style={{ backgroundColor: tokens.color.bg, borderRadius: 16, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 14 }}>
      <Kv k={goodsLabel} v={food} first />
      {deliveryFee != null ? (
        <Kv k={O.r.fee} v={deliveryFee} text={freeDeliveryBy != null && deliveryFee === 0 ? ofFmt(O_ADDED.r.freePaidBy, { v: freeDeliveryBy }) : undefined} />
      ) : null}
      {smallOrderFee > 0 ? <Kv k={O.r.small} v={smallOrderFee} /> : null}
      {owed > 0 ? <Kv k={O_ADDED.r.owed} v={owed} /> : null}
      <Kv k={O.r.total} v={total} total />
      <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{O.r.cancelRule}</Text>
    </View>
  );
}

/** `.btn` (polish): the 52 primary, cta fill, 16/800; `line` fill + muted label when disabled. */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  ghost,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** A leading 18 glyph (R6b's "📅 Schedule for …"). */
  icon?: IconName;
  /** `.btn.g` (polish): surface fill, green label, no border. */
  ghost?: boolean;
}): React.ReactElement {
  const off = !!disabled && !loading;
  const bg = ghost ? tokens.color.surface : off ? tokens.color.line : tokens.color.cta;
  const fg = ghost ? tokens.color.accentText : off ? tokens.color.muted : tokens.color.onAccent;
  return (
    <Tappable
      tone={ghost ? "row" : "onDark"}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={{
        minHeight: tokens.touchTargetPrimary,
        borderRadius: tokens.radius.pill,
        backgroundColor: bg,
        opacity: loading ? 0.55 : 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 4,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ flexShrink: 1, textAlign: "center", fontSize: 16, lineHeight: 19.2, fontWeight: W800, color: fg, ...TABULAR }}>{label}</Text>
    </Tappable>
  );
}

/** `.bar`: the pinned white CTA bar — padding 10/16/12 + the bottom inset, an optional hint above. */
export function ReviewBar({ hint, bottomInset, children }: { hint?: string | null; bottomInset: number; children: React.ReactNode }): React.ReactElement {
  return (
    <View style={{ backgroundColor: tokens.color.bg, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12 + bottomInset, gap: 8, zIndex: 25, ...tokens.shadow.sheet }}>
      {hint ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 17.55, color: tokens.color.muted, textAlign: "center" }}>
          {hint}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** `.toast` (polish): ink, r14, 14/16, alert icon + 13 white + the mint "↻ Try again". */
export function ReviewToast({ text, action, onAction, bottom }: { text: string; action?: string; onAction?: () => void; bottom: number }): React.ReactElement {
  // Owner 2026-10-06 (D-80): the app-wide bottom toast's look, kept above the place bar.
  return (
    <View style={{ position: "absolute", left: 12, right: 12, bottom, zIndex: 35 }}>
      <FirstRunToast text={text} tone="warning" action={action} onAction={onAction} assertive />
    </View>
  );
}
