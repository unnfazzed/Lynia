import { formatPhoneLocal, TOPUP_WINDOW_MS, tokens, type TopupRail } from "@lynia/shared";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { validateTopupAmount } from "../../logic/topup";
import { Button, Card, Field, Icon, Sub } from "../index";
import { SupportCallRow } from "../safety";
import { CountdownRing, formatCountdown } from "../food/CountdownRing";

/**
 * The kit's self-serve top-up flow (`explorations/journey/rider-screens-wallet.jsx` — `TopupAmount`,
 * `TopupWait`, `TopupSuccess`, `TopupDeclined`), shipped to riders behind a server kill switch even
 * though the rail it draws does not exist.
 *
 * ─── READ THIS BEFORE YOU CHANGE ANYTHING HERE ────────────────────────────────────────────────────
 * There is no payment-rail integration. `POST /wallet/topups` exists and really does open a `TopUp`
 * row, but `WalletService.creditFromTopup` — the ONLY code path that can ever confirm one and move a
 * balance — has no callers anywhere in the repo, on any rail. A real intent therefore has exactly one
 * possible ending: `expired`, 90 seconds later. That is the permanently-broken money flow
 * `app/wallet/top-up.tsx` was rewritten to remove, and nothing here may bring it back.
 *
 * Until 2026-08-12 every step carried a red PREVIEW strip and the success step was phrased in the
 * conditional beside the rider's real, unchanged balance, so none of it could be mistaken for a money
 * event. **The owner removed all of that, on the record and having been shown this trade-off, to ship
 * ahead of launch.** What that leaves:
 *
 *   - rendered only when `usePaymentSimulation()` is open (see app/wallet/top-up.tsx) — the QA APK or
 *     the `paymentSimulationEnabled` server flag. **That flag is now the ONLY control over this flow**,
 *     because nothing on screen tells a rider it isn't real. Shut it and riders get the honest "call
 *     support to top up" screen, with no app update;
 *   - it still makes NO network call. No `TopUp` row (which would only ever expire, and would leave a
 *     durable `PendingTopup` marker for the Money tab to report on), no wallet read or invalidation,
 *     nothing written to the device. The rider's real balance is genuinely untouched — the success
 *     step is a drawing, not a transaction;
 *   - the success step now states "added to your balance" unqualified. It is the one screen in this
 *     app that asserts something false about money. Treat it accordingly;
 *   - nothing auto-resolves — both terminals need an explicit tap;
 *   - the REAL top-up route (call support) stays on the amount step. It is the only way a balance
 *     actually moves today, so it survives regardless of what the rest of the screen claims.
 *
 * Delete this component the day a rail integration lands and calls `creditFromTopup`; the layout is the
 * kit's, so the real screen is this plus `createTopup`/`getTopup` — at which point the success step
 * stops being a lie because it finally corresponds to a credit.
 */

type Step = "amount" | "wait" | "approved" | "declined";

const RAILS: { id: Exclude<TopupRail, "manual">; name: string; note: string }[] = [
  { id: "ecocash", name: "EcoCash", note: "Approve on your phone" },
  { id: "innbucks", name: "InnBucks", note: "Approve on your phone" },
  { id: "omari", name: "O'mari", note: "Approve on your phone" },
];
const QUICK_AMOUNTS = [5, 10, 20];

export function TopUpSimulator({
  minTopUp,
  maxTopUp,
  onExit,
}: {
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
        <View style={{ alignItems: "center", paddingTop: tokens.space.lg }}>
          <CountdownRing elapsedMs={elapsed} totalMs={TOPUP_WINDOW_MS} label={formatCountdown(remaining)} sub="left" size={132} />
          <Text style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginTop: tokens.space.lg }}>
            Check your phone
          </Text>
          <Text style={{ fontSize: 14, color: tokens.color.muted, textAlign: "center", lineHeight: 21, marginTop: 6, maxWidth: 280 }}>
            Approve the {railName} prompt on{" "}
            <Text style={{ fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatPhoneLocal(phone)}</Text>. Your
            balance is credited the moment it clears.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText, marginTop: tokens.space.md, fontVariant: ["tabular-nums"] }}>
            {formatMoney(amount)} · {railName}
          </Text>
          {remaining === 0 ? (
            <Text style={{ fontSize: 12.5, color: tokens.color.muted, textAlign: "center", lineHeight: 18, marginTop: tokens.space.md, maxWidth: 280 }}>
              The 90-second window has closed. A request that gets no answer expires — no money moves either way.
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: tokens.space.xl }}>
          {/* Both terminals are reached by an explicit tap, never by a timer — nothing resolves itself.
              These two buttons are the visible seam: no real rail lets the payer choose the outcome, and
              since the PREVIEW labels came off (2026-08-12, owner's call) they are the only remaining
              hint to a rider that this flow is not wired to anything. */}
          <Button label="Payment approved" variant="ghost" onPress={() => setStep("approved")} />
          <Button label="Payment declined" variant="ghost" onPress={() => setStep("declined")} />
          <Button label="Cancel request" variant="ghost" onPress={() => setStep("amount")} />
        </View>
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    );
  }

  if (step === "approved") {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
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
          {/* ⚠️ THIS LINE ASSERTS A CREDIT THAT DID NOT HAPPEN. It read "would have been added —
              simulated", beside the rider's real unchanged balance, precisely so it could not be
              believed. The owner removed every such qualifier on 2026-08-12 having been shown this
              exact trade-off, and chose the unqualified success screen. Nothing behind it moved a cent:
              no request was sent, no `TopUp` row exists, the ledger is untouched, and the rider's real
              balance is whatever it was before. If you are reading this while deciding whether to keep
              it, the honest version is one `git revert` away. */}
          <Text style={{ fontSize: 14, color: tokens.color.muted, marginTop: 2 }}>added to your balance</Text>
        </View>

        <Card style={{ marginTop: tokens.space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
              <Icon name="banknote" size={18} color={tokens.color.muted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{railName} top-up</Text>
              <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>Just now</Text>
            </View>
            {/* Still muted rather than the ledger's credit-green — this row corresponds to no ledger
                entry, so it must not colour-match the real credits on the Money tab. */}
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
              +{formatMoney(amount)}
            </Text>
          </View>
        </Card>

        <Button label="Back to Money" onPress={onExit} />
        <Button label="Top up again" variant="ghost" onPress={() => setStep("amount")} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    );
  }

  if (step === "declined") {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
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
              No money leaves your {railName} wallet. Usually the {railName} balance was too low, or the request was
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

      {/* THE ONE REAL ACTION ON THIS SCREEN. Everything above is drawn against a rail that does not
          exist; support crediting a balance by hand is how a top-up actually happens today. It stays
          here whatever the labels say, because removing it would leave riders with no working route to
          their money at all. Do not "tidy" it away. */}
      <View style={{ marginTop: tokens.space.xl }}>
        <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, letterSpacing: 0.3, marginBottom: 6 }}>
          TOP UP BY PHONE
        </Text>
        <Card style={{ backgroundColor: tokens.color.surface }}>
          <SupportCallRow label="Top up" name="LyniaGo support" />
        </Card>
        <Text style={{ fontSize: 11.5, color: tokens.color.muted, lineHeight: 17, marginTop: 6 }}>
          Tell support how much you&apos;d like to add. They confirm your payment and credit your balance
          directly — no money moves until they do.
        </Text>
      </View>
      <View style={{ height: tokens.space.xxl }} />
    </ScrollView>
  );
}
