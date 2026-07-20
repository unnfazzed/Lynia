import { SOS_POLICY, tokens } from "@lynia/shared";
import type { IssueType, ReportReason } from "@lynia/shared";
import { useMutation } from "@tanstack/react-query";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../api/client";
import { raiseIssue, raiseSos, reportUser } from "../api/safety";
import {
  ISSUE_DESCRIPTION_MAX,
  ISSUE_TYPE_OPTIONS,
  type Option,
  REPORT_NOTE_MAX,
  REPORT_REASON_OPTIONS,
  canSubmitIssue,
  canSubmitReport,
  telUri,
} from "../logic/safety";
import { randomUuidV4, uuidV4FromSeed } from "../util";
import { Button, ErrorText, Field, haptic, Icon } from "./index";

/**
 * Trust & safety surfaces shared across the customer order screen and the rider job screen (both roles):
 *
 *  - `GetHelpControl`  — "get help with this trip" → an issue form (POST /orders/:id/issues).
 *  - `ReportControl`   — "report a problem with the sender/rider" after a trip (POST /orders/:id/report).
 *  - `SosControl`      — a deliberate SOS entry that opens a confirm sheet with call actions
 *                        (POST /orders/:id/sos), highest-value at the cash hand-off.
 *
 * All copy is calm, second person, sentence case, no emoji. The accent split holds: cta green for the
 * one primary confirm, `accentText` for green text, and danger/dangerWash reserved for SOS + report
 * emphasis. Every tap target clears 44px and the sheets scroll so they hold at 320px with a keyboard up.
 */

// ── Bottom sheet shell ────────────────────────────────────────────────────────
function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
        {/* Tap the dimmed backdrop to dismiss; the sheet itself sits below it. */}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <SafeAreaView
          edges={["bottom"]}
          style={{ maxHeight: "88%", backgroundColor: tokens.color.bg, borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: tokens.space.lg }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
              <Text style={{ flex: 1, fontSize: tokens.font.size.title, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{title}</Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, alignItems: "flex-end", justifyContent: "center" }}
              >
                <Icon name="x" size={20} color={tokens.color.muted} />
              </Pressable>
            </View>
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Chip picker ───────────────────────────────────────────────────────────────
// Single-select chips (DS chip state: mint wash + green text when on) — the CTA fill stays reserved for
// the sheet's one primary confirm.
function OptionChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
}): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm, marginBottom: tokens.space.md }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            hitSlop={6}
            style={{
              minHeight: tokens.touchTargetMin,
              justifyContent: "center",
              paddingHorizontal: tokens.space.lg,
              borderRadius: tokens.radius.pill,
              borderWidth: 1,
              borderColor: on ? tokens.color.accentText : tokens.color.line,
              backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: on ? tokens.color.accentText : tokens.color.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Calm confirmation (shared by help + report) ───────────────────────────────
function DoneState({ message, onClose }: { message: string; onClose: () => void }): React.ReactElement {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={18} color={tokens.color.accentText} />
        </View>
        <Text style={{ flex: 1, fontSize: tokens.font.size.body, color: tokens.color.ink, lineHeight: 20 }}>{message}</Text>
      </View>
      <Button label="Done" variant="ghost" onPress={onClose} />
    </View>
  );
}

/** Friendly error text for a mutation failure, tolerant of the endpoint still being built. */
function errText(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong — try again.";
}

// ── 1. Get help with this trip ────────────────────────────────────────────────
export function GetHelpControl({ orderId }: { orderId: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IssueType | null>(null);
  const [desc, setDesc] = useState("");
  const [done, setDone] = useState(false);
  // BH-22: a client-side timeout can leave a POST that actually landed with no visible confirmation —
  // the sheet stays on the form, and re-tapping "Send to our team" must dedupe against the same
  // complaint instead of opening a second dispute. Derived from (orderId, type, description) + a nonce
  // that rotates on close/success, mirroring home.tsx's order idempotencyKey: identical content within
  // one open reuses the same key (retry-safe), while a genuinely new complaint (edited content, or a
  // deliberate re-raise after a fresh open) gets a fresh one.
  const [idemNonce, setIdemNonce] = useState<string>(() => randomUuidV4());
  const idempotencyKey = useMemo(() => uuidV4FromSeed(`${idemNonce}|${orderId}|${type}|${desc}`), [idemNonce, orderId, type, desc]);

  const m = useMutation({
    mutationFn: () => raiseIssue(orderId, { type: type!, description: desc.trim(), idempotencyKey }),
    onSuccess: () => setDone(true),
  });

  function close(): void {
    setOpen(false);
    // Reset after the dismiss animation so the form doesn't visibly clear under the user.
    setTimeout(() => {
      setDone(false);
      setType(null);
      setDesc("");
      setIdemNonce(randomUuidV4());
      m.reset();
    }, 250);
  }

  return (
    <>
      <Button label="Get help with this trip" variant="ghost" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={close} title="Get help with this trip">
        {done ? (
          <DoneState message="Thanks — our team will look into it and follow up if we need more." onClose={close} />
        ) : (
          <>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.md }}>
              Tell us what went wrong and we&apos;ll take a look. This opens a support case for this trip.
            </Text>
            <Text style={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, marginBottom: 6 }}>
              What&apos;s the problem?
            </Text>
            <OptionChips options={ISSUE_TYPE_OPTIONS} value={type} onChange={setType} />
            <Field
              label="Tell us more"
              value={desc}
              onChangeText={setDesc}
              placeholder="Add any detail that helps us understand what happened"
              maxLength={ISSUE_DESCRIPTION_MAX}
            />
            <ErrorText message={m.isError ? errText(m.error) : null} />
            <Button
              label="Send to our team"
              onPress={() => m.mutate()}
              loading={m.isPending}
              disabled={!canSubmitIssue(type, desc)}
            />
          </>
        )}
      </Sheet>
    </>
  );
}

// ── 2. Report / block after a trip ────────────────────────────────────────────
export function ReportControl({
  orderId,
  counterpartyNoun,
}: {
  orderId: string;
  /** How to name the person being reported, e.g. "rider" (customer view) or "sender" (rider view). */
  counterpartyNoun: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [block, setBlock] = useState(false);
  const [done, setDone] = useState(false);

  const m = useMutation({
    mutationFn: () => reportUser(orderId, { reason: reason!, note: note.trim() || undefined, block }),
    onSuccess: () => setDone(true),
  });

  function close(): void {
    setOpen(false);
    setTimeout(() => {
      setDone(false);
      setReason(null);
      setNote("");
      setBlock(false);
      m.reset();
    }, 250);
  }

  const doneMsg = block
    ? `Thanks for telling us. We've logged your report and you won't be matched with this ${counterpartyNoun} again.`
    : "Thanks for telling us. Our team will review your report.";

  return (
    <>
      {/* Danger-tinted ghost so it reads as a safety action without shouting like the SOS control. */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Report a problem with your ${counterpartyNoun}`}
        style={({ pressed }) => ({
          minHeight: tokens.touchTargetMin,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: tokens.space.sm,
          borderRadius: tokens.radius.button,
          borderWidth: 1,
          borderColor: tokens.color.line,
          backgroundColor: pressed ? tokens.color.dangerWash : "transparent",
          paddingVertical: 12,
          marginTop: tokens.space.sm,
        })}
      >
        <Icon name="flag" size={16} color={tokens.color.danger} />
        <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.semibold, color: tokens.color.danger }}>
          Report a problem with your {counterpartyNoun}
        </Text>
      </Pressable>

      <Sheet visible={open} onClose={close} title={`Report your ${counterpartyNoun}`}>
        {done ? (
          <DoneState message={doneMsg} onClose={close} />
        ) : (
          <>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.md }}>
              This is for conduct or safety concerns. What happened?
            </Text>
            <OptionChips options={REPORT_REASON_OPTIONS} value={reason} onChange={setReason} />
            <Field
              label="Add a note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="Anything you'd like our team to know"
              maxLength={REPORT_NOTE_MAX}
            />
            {/* Block toggle — a checkbox row (mirrors the pickup-verification tick), not a bright fill. */}
            <Pressable
              onPress={() => setBlock((b) => !b)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: block }}
              accessibilityLabel={`Block future matches with this ${counterpartyNoun}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.md,
                minHeight: tokens.touchTargetMin,
                paddingHorizontal: tokens.space.md,
                paddingVertical: tokens.space.sm,
                borderRadius: tokens.radius.input,
                borderWidth: 1,
                borderColor: block ? "transparent" : tokens.color.line,
                backgroundColor: block ? tokens.color.dangerWash : tokens.color.surface,
                marginBottom: tokens.space.sm,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  backgroundColor: block ? tokens.color.danger : tokens.color.bg,
                  borderWidth: block ? 0 : 1.5,
                  borderColor: tokens.color.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {block ? <Icon name="check" size={15} color={tokens.color.onAccent} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>Block future matches</Text>
                <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 16 }}>
                  You won&apos;t be matched with this {counterpartyNoun} on future trips.
                </Text>
              </View>
            </Pressable>
            <ErrorText message={m.isError ? errText(m.error) : null} />
            <Button label="Send report" onPress={() => m.mutate()} loading={m.isPending} disabled={!canSubmitReport(reason, note)} />
          </>
        )}
      </Sheet>
    </>
  );
}

// ── Support call row (rider dead-end / gate states) ───────────────────────────
/**
 * A calm `tel:` "contact support" row for the states where the only honest instruction is "call us"
 * (rider banned / KYC attempt-lock / suspended / on hold). The design decision (5 Jul) makes every
 * contact-support action a real phone call, not a `mailto:`/WhatsApp dead end — so this dials the
 * staffed Lynia safety line. Accent phone circle (a graphic fill, not text), name + number alongside.
 */
export function SupportCallRow({
  phone = SOS_POLICY.safetyLine,
  name = "LyniaGo support",
  label = "Support",
}: {
  phone?: string;
  name?: string;
  label?: string;
}): React.ReactElement | null {
  const uri = telUri(phone);
  if (!uri) return null;
  return (
    <Pressable
      onPress={() => void Linking.openURL(uri)}
      accessibilityRole="button"
      accessibilityLabel={`Call ${name} on ${phone}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.md,
        minHeight: tokens.touchTargetPrimary,
        paddingHorizontal: tokens.space.md,
        paddingVertical: tokens.space.sm,
        borderRadius: tokens.radius.input,
        backgroundColor: tokens.color.surface,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{label}</Text>
        <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ fontSize: tokens.font.size.label, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{phone}</Text>
      </View>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
        <Icon name="phone" size={18} color={tokens.color.onAccent} />
      </View>
    </Pressable>
  );
}

// ── 3. SOS on a live trip ─────────────────────────────────────────────────────
/** A full-width danger call button (white on danger fill — the one place white-on-fill is allowed). */
function CallButton({ label, uri, prominent }: { label: string; uri: string; prominent: boolean }): React.ReactElement {
  return (
    <Pressable
      onPress={() => void Linking.openURL(uri)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: tokens.touchTargetPrimary,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: tokens.space.sm,
        borderRadius: tokens.radius.button,
        borderWidth: prominent ? 0 : 1,
        borderColor: tokens.color.danger,
        backgroundColor: prominent ? (pressed ? "#A5342A" : tokens.color.danger) : pressed ? tokens.color.dangerWash : "transparent",
        paddingVertical: 14,
        marginTop: tokens.space.sm,
      })}
    >
      <Icon name="phone" size={18} color={prominent ? tokens.color.onAccent : tokens.color.danger} />
      <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: prominent ? tokens.color.onAccent : tokens.color.danger }}>{label}</Text>
    </Pressable>
  );
}

export function SosControl({ orderId, lat, lng }: { orderId: string; lat?: number | null; lng?: number | null }): React.ReactElement {
  const [open, setOpen] = useState(false);

  const m = useMutation({
    mutationFn: (point: { lat?: number; lng?: number } | undefined) =>
      raiseSos(orderId, { lat: point?.lat, lng: point?.lng }),
  });

  // Raise the SOS the moment the sheet opens so ops is alerted immediately — but never gate the call
  // actions on the network. The emergency number falls back to the shared SOS_POLICY constant so
  // "Call 999" is live before (and even if) the request comes back.
  useEffect(() => {
    if (open && m.isIdle) {
      // The one cue that must feel unmistakably different — a long, urgent triple as ops is alerted.
      haptic("alert");
      if (lat != null || lng != null) {
        // The rider job screen already passes its own tracked point — use it as-is.
        m.mutate({ lat: lat ?? undefined, lng: lng ?? undefined });
      } else {
        // The customer (and rider-viewer) order screens don't track a live position, so an SOS raised
        // from there previously always went out with no location at all. Grab the OS's last-known fix
        // (never prompts for permission, never waits on a fresh GPS lock) so ops has something to go
        // on — but never delay the alert on it: fire the raise regardless of how the lookup resolves.
        Location.getForegroundPermissionsAsync()
          .then((perm) => (perm.status === Location.PermissionStatus.GRANTED ? Location.getLastKnownPositionAsync() : null))
          .then((pos) => m.mutate(pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : undefined))
          .catch(() => m.mutate(undefined));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on open; m is stable enough here.
  }, [open]);

  // Reset the mutation on close so a SECOND SOS later in the same trip re-arms the isIdle guard and
  // re-alerts ops — the alert is not one-shot — and a first attempt that failed offline can retry.
  const close = (): void => {
    setOpen(false);
    m.reset();
  };

  // Both numbers fall back to the final SOS_POLICY constants so the call rows render even when the
  // best-effort POST fails or hasn't returned yet (offline). A safety control must never dead-end on
  // the network — the numbers are client-side constants for exactly this reason.
  const emergencyNumber = m.data?.emergencyNumber ?? SOS_POLICY.emergencyNumber;
  const emergencyUri = telUri(emergencyNumber);
  const safetyLine = m.data?.safetyLine ?? SOS_POLICY.safetyLine;
  const safetyUri = telUri(safetyLine);

  return (
    <>
      {/* Deliberate entry: a small danger pill, not a full-width button, so it isn't fat-fingered. The
          real call actions live one tap deeper in the sheet. */}
      <View style={{ alignItems: "center", marginTop: tokens.space.md }}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Emergency SOS"
          hitSlop={6}
          style={({ pressed }) => ({
            minHeight: tokens.touchTargetMin,
            flexDirection: "row",
            alignItems: "center",
            gap: tokens.space.sm,
            paddingHorizontal: tokens.space.lg,
            borderRadius: tokens.radius.pill,
            borderWidth: 1,
            borderColor: tokens.color.danger,
            backgroundColor: pressed ? tokens.color.dangerWash : "transparent",
          })}
        >
          <Icon name="shield-alert" size={18} color={tokens.color.danger} />
          <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.danger, letterSpacing: 0.5 }}>SOS</Text>
        </Pressable>
      </View>

      <Sheet visible={open} onClose={close} title="Emergency help">
        <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}>
            <Icon name="shield-alert" size={18} color={tokens.color.danger} />
          </View>
          <Text style={{ flex: 1, fontSize: tokens.font.size.body, color: tokens.color.ink, lineHeight: 20 }}>
            {/* Three genuine states: don't claim the alert landed while it's still in flight, and don't
                promise real-world help is coming — the push is a fire-and-forget internal ops alert. */}
            {m.isError
              ? "We couldn't reach our team automatically — please call for help below."
              : m.isPending
                ? "Alerting the LyniaGo team…"
                : "We've alerted the LyniaGo team. If you're in danger, call now."}
          </Text>
        </View>

        {emergencyUri ? <CallButton label={`Call ${emergencyNumber}`} uri={emergencyUri} prominent /> : null}
        {safetyUri && safetyLine !== emergencyNumber ? (
          <CallButton label={`Call the LyniaGo safety line (${safetyLine})`} uri={safetyUri} prominent={false} />
        ) : null}

        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 16, marginTop: tokens.space.md }}>
          {SOS_POLICY.emergencyNumber} reaches local emergency services. The safety line is staffed by LyniaGo.
        </Text>
        <Button label="I'm safe now" variant="ghost" onPress={close} />
      </Sheet>
    </>
  );
}
