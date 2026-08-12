import { formatPhoneLocal, TOPUP_WINDOW_MS, tokens, type TopupRail } from "@lynia/shared";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { validateTopupAmount } from "../../logic/topup";
import { Button, Card, Field, Icon, isTestBuild, Sub } from "../index";
import { CountdownRing, formatCountdown } from "../food/CountdownRing";

/**
 * The kit's self-serve top-up flow (`explorations/journey/rider-screens-wallet.jsx` — `TopupAmount`,
 * `TopupWait`, `TopupSuccess`, `TopupDeclined`), rebuilt as an explicitly-labelled WALKTHROUGH for the
 * QA test build only.
 *
 * ─── WHY THIS IS A SIMULATION AND NOT THE REAL SCREEN ─────────────────────────────────────────────
 * There is no payment-rail integration. `POST /wallet/topups` exists and really does open a `TopUp`
 * row, but `WalletService.creditFromTopup` — the ONLY code path that can ever confirm one and move a
 * balance — has no callers anywhere in the repo, on any rail. A real intent therefore has exactly one
 * possible ending: `expired`, 90 seconds later. That is the permanently-broken money flow
 * `app/wallet/top-up.tsx` was rewritten to remove, and nothing here is allowed to bring it back.
 *
 * So this component:
 *   - is rendered ONLY when `isTestBuild()` (see app/wallet/top-up.tsx) — a real release build never
 *     mounts it and keeps the honest "call support to top up" screen;
 *   - makes NO network call at all. It does not create a `TopUp` row (which would only ever expire and
 *     would also leave a durable `PendingTopup` marker for the Money tab to report on), does not read
 *     or invalidate the wallet, and writes nothing to the device;
 *   - carries a permanent SIMULATED strip on every single step, including the terminals;
 *   - never asserts money moved. The "approved" step is phrased as what the real screen WOULD show and
 *     restates the rider's unchanged real balance next to it. The rider drives the outcome explicitly —
 *     nothing auto-resolves into a success, because a success that arrives on its own is exactly the
 *     thing a tester would screenshot and believe.
 *
 * Delete this component the day a rail integration lands and calls `creditFromTopup`; the layout is the
 * kit's, so the real screen is this minus the strips, plus `createTopup`/`getTopup`.
 */

type Step = "amount" | "wait" | "approved" | "declined";

const RAILS: { id: Exclude<TopupRail, "manual">; name: string; note: string }[] = [
  { id: "ecocash", name: "EcoCash", note: "Approve on your phone" },
  { id: "innbucks", name: "InnBucks", note: "Approve on your phone" },
  { id: "omari", name: "O'mari", note: "Approve on your phone" },
];
const QUICK_AMOUNTS = [5, 10, 20];

/**
 * The unmissable, permanent "none of this is real" marker — on every step of the flow, above the hero.
 *
 * Deliberately identical in treatment and headline grammar to `src/ui/food/SimulatedPathNotice` (the
 * customer checkout's marker for the same class of designed-but-unbacked screen) so the two read as one
 * system: danger wash, danger border, "SIMULATED — <what> (test build)". It is NOT that component
 * because that one's body copy ends "the only real way to pay is still the manual rail below" — true on
 * a checkout screen, false here, where the real path is a phone call to support and there is no rail
 * below. Same warning, accurate second sentence. Worth folding into one component with a `detail` slot
 * once both lanes have landed — see the report.
 *
 * Self-gates on `isTestBuild()` as belt-and-braces: the only caller is already test-build-only
 * (app/wallet/top-up.tsx), so a future refactor that loses that branch loses the flow, not the warning.
 */
function SimulatedStrip({ detail }: { detail?: string }): React.ReactElement | null {
  if (!isTestBuild()) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: tokens.space.sm,
        padding: tokens.space.md,
        borderRadius: tokens.radius.input,
        backgroundColor: tokens.color.dangerWash,
        borderWidth: 1,
        borderColor: tokens.color.danger,
        marginBottom: tokens.space.md,
      }}
    >
      <Icon name="triangle-alert" size={17} color={tokens.color.dangerInk} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.dangerInk }}>
          SIMULATED — no payment request was sent (test build)
        </Text>
        <Text style={{ fontSize: 12, color: tokens.color.dangerInk, lineHeight: 17, marginTop: 3 }}>
          {detail ?? "This is a UI walkthrough of the top-up flow. No rail is connected, no money moves, and your balance is untouched."}
        </Text>
      </View>
    </View>
  );
}

export function TopUpSimulator({
  balance,
  minTopUp,
  maxTopUp,
  onExit,
}: {
  /** The rider's REAL balance, read from the wallet — shown only to prove it doesn't change. `null`
   *  when the wallet hasn't loaded (or failed to): an unknown balance is stated as unknown, never
   *  defaulted to $0.00, which would be its own small lie on the one screen that must not tell any. */
  balance: number | null;
  minTopUp: number;
  maxTopUp: number;
  onExit: () => void;
}): React.ReactElement {
  const [step, setStep] = React.useState<Step>("amount");
  const [amountRaw, setAmountRaw] = React.useState("10.00");
  const [phone, setPhone] = React.useState("");
  const [rail, setRail] = React.useState<Exclude<TopupRail, "manual">>("ecocash");
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  const amountError = validateTopupAmount(amountRaw, minTopUp, maxTopUp);
  const amount = Number(amountRaw);
  const amountOk = amountError == null && Number.isFinite(amount) && amount > 0;
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const railName = RAILS.find((r) => r.id === rail)?.name ?? "";

  // Only tick while the wait ring is on screen.
  React.useEffect(() => {
    if (step !== "wait") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  const elapsed = startedAt == null ? 0 : Math.max(0, nowMs - startedAt);
  const remaining = Math.max(0, TOPUP_WINDOW_MS - elapsed);

  if (step === "wait") {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <SimulatedStrip detail="Nothing was sent to your phone — there is no prompt to approve. Pick an outcome below to walk through the rest of the screens." />
        <View style={{ alignItems: "center", paddingTop: tokens.space.lg }}>
          <CountdownRing elapsedMs={elapsed} totalMs={TOPUP_WINDOW_MS} label={formatCountdown(remaining)} sub="left" size={132} />
          <Text style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginTop: tokens.space.lg }}>
            Check your phone
          </Text>
          <Text style={{ fontSize: 14, color: tokens.color.muted, textAlign: "center", lineHeight: 21, marginTop: 6, maxWidth: 280 }}>
            In the real flow you&apos;d approve the {railName} prompt on{" "}
            <Text style={{ fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatPhoneLocal(phone)}</Text>, and your
            balance would be credited the moment it cleared.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText, marginTop: tokens.space.md, fontVariant: ["tabular-nums"] }}>
            {formatMoney(amount)} · {railName}
          </Text>
          {remaining === 0 ? (
            <Text style={{ fontSize: 12.5, color: tokens.color.muted, textAlign: "center", lineHeight: 18, marginTop: tokens.space.md, maxWidth: 280 }}>
              The 90-second window has closed. A real request that got no answer ends here as &quot;expired&quot; — no money moves either way.
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: tokens.space.xl }}>
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, letterSpacing: 0.3, marginBottom: 6 }}>
            PREVIEW THE NEXT SCREEN
          </Text>
          {/* Both terminals are reached by an explicit tester tap, never by a timer. Nothing in this
              flow may resolve itself into a "success" a tester could mistake for a real one. */}
          <Button label="Preview: payment approved" variant="ghost" onPress={() => setStep("approved")} />
          <Button label="Preview: payment declined" variant="ghost" onPress={() => setStep("declined")} />
          <Button label="Cancel request" variant="ghost" onPress={() => setStep("amount")} />
        </View>
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    );
  }

  if (step === "approved") {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <SimulatedStrip detail="No payment was requested, nothing was credited, and nothing was written to your ledger. The figures below are a mock-up of the real screen." />
        <View style={{ alignItems: "center", paddingTop: tokens.space.md }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: tokens.color.accentWash,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="check" size={40} color={tokens.color.accentText} strokeWidth={tokens.icon.stroke} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginTop: tokens.space.md, fontVariant: ["tabular-nums"] }}>
            {formatMoney(amount)}
          </Text>
          {/* NOT "$10.00 added". The real screen's headline is a claim about money; in a simulation it
              would be a false one, so the number stays and the verb is put in the conditional. */}
          <Text style={{ fontSize: 14, color: tokens.color.muted, marginTop: 2 }}>would have been added — simulated</Text>
          <Text style={{ fontSize: 13, color: tokens.color.ink, fontWeight: tokens.font.weight.semibold, marginTop: tokens.space.md, fontVariant: ["tabular-nums"] }}>
            {balance != null ? `Your real balance is unchanged: ${formatMoney(balance)}` : "Your real balance is untouched — nothing was credited."}
          </Text>
        </View>

        <Card style={{ marginTop: tokens.space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
              <Icon name="banknote" size={18} color={tokens.color.muted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{railName} top-up (simulated)</Text>
              <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>Not recorded — no reference, no ledger entry</Text>
            </View>
            {/* Muted, not the ledger's credit-green: this row is a mock of a receipt, not a receipt. */}
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
              +{formatMoney(amount)}
            </Text>
          </View>
        </Card>

        <Button label="Back to Money" onPress={onExit} />
        <Button label="Run the walkthrough again" variant="ghost" onPress={() => setStep("amount")} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    );
  }

  if (step === "declined") {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <SimulatedStrip detail="No payment was requested, so nothing was actually declined. This is the screen a real decline would land on." />
        <Card>
          <View style={{ alignItems: "center", paddingVertical: tokens.space.md }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: tokens.color.dangerWash,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: tokens.space.md,
              }}
            >
              <Icon name="circle-alert" size={36} color={tokens.color.dangerInk} strokeWidth={tokens.icon.stroke} />
            </View>
            <Text style={{ fontSize: tokens.font.size.title, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>
              The payment was declined
            </Text>
            <Text style={{ fontSize: 12, color: tokens.color.muted, textAlign: "center", lineHeight: 18, marginTop: 6, maxWidth: 280 }}>
              No money leaves your {railName} wallet. In the real flow this means the {railName} balance was too low, or the request was
              turned down on the phone.
            </Text>
          </View>
          <Button label="Try again" onPress={() => setStep("amount")} />
        </Card>
        <Button label="Back to Money" variant="ghost" onPress={onExit} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <SimulatedStrip detail="This is a UI walkthrough of the top-up flow. No rail is connected, no money moves, and your balance is untouched. A real release build shows the “call support to top up” screen instead — that is still the shipped behaviour." />
      <Sub>Add to your commission balance. This money can only be spent on commission.</Sub>

      <Field
        label="Amount (USD)"
        value={amountRaw}
        onChangeText={setAmountRaw}
        keyboardType="decimal-pad"
        maxLength={8}
        error={amountError ?? undefined}
        hint={`Minimum top-up is ${formatMoney(minTopUp)}`}
      />
      <View style={{ flexDirection: "row", gap: tokens.space.sm, marginBottom: tokens.space.lg }}>
        {QUICK_AMOUNTS.map((v) => {
          const on = Number(amountRaw) === v;
          return (
            <Pressable
              key={v}
              onPress={() => setAmountRaw(v.toFixed(2))}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Top up ${formatMoney(v)}`}
              style={{
                flex: 1,
                minHeight: tokens.touchTargetMin,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: tokens.radius.pill,
                borderWidth: on ? 1.5 : 1,
                borderColor: on ? tokens.color.accent : tokens.color.line,
                backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: on ? tokens.font.weight.bold : tokens.font.weight.semibold,
                  color: on ? tokens.color.accentText : tokens.color.ink,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatMoney(v)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="0771234567"
        keyboardType="phone-pad"
        maxLength={20}
        autoComplete="tel"
        textContentType="telephoneNumber"
        hint="This is the number that would get the payment prompt — change it if you'd pay from another line."
      />

      <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, marginBottom: tokens.space.sm }}>Pay with</Text>
      {RAILS.map((r) => {
        const on = r.id === rail;
        return (
          <Pressable
            key={r.id}
            onPress={() => setRail(r.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${r.name} — ${r.note}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tokens.space.md,
              minHeight: tokens.touchTargetMin,
              paddingVertical: tokens.space.md,
              paddingHorizontal: tokens.space.md,
              borderRadius: tokens.radius.input,
              borderWidth: on ? 1.5 : 1,
              borderColor: on ? tokens.color.accent : tokens.color.line,
              backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
              marginBottom: tokens.space.sm,
            }}
          >
            {/* The kit sets each rail's own logo here; no rail brand assets ship in the app, so the
                neutral wallet mark stands in rather than inventing a lookalike. */}
            <View
              style={{
                width: 44,
                height: 32,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: tokens.color.line,
                backgroundColor: tokens.color.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="wallet" size={16} color={on ? tokens.color.accentText : tokens.color.muted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{r.name}</Text>
              <Text style={{ fontSize: 12, color: on ? tokens.color.accentText : tokens.color.muted, marginTop: 1 }}>{r.note}</Text>
            </View>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: on ? 6 : 1.5,
                borderColor: on ? tokens.color.accent : tokens.color.line,
                backgroundColor: tokens.color.bg,
              }}
            />
          </Pressable>
        );
      })}

      <Button
        label={amountOk ? `Request ${formatMoney(amount)} via ${railName}` : `Request via ${railName}`}
        disabled={!amountOk || !phoneOk}
        onPress={() => {
          setStartedAt(Date.now());
          setNowMs(Date.now());
          setStep("wait");
        }}
      />
      <Text style={{ fontSize: 11.5, color: tokens.color.muted, textAlign: "center", lineHeight: 17, marginTop: 6 }}>
        Tapping this sends nothing. It opens the next screen in the walkthrough.
      </Text>
      <View style={{ height: tokens.space.xxl }} />
    </ScrollView>
  );
}
