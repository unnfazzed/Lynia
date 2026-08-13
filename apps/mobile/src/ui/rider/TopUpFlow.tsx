import { formatPhoneLocal, TOPUP_WINDOW_MS, tokens, type TopupRail } from "@lynia/shared";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { validateTopupAmount } from "../../logic/topup";
import { useTopUp } from "../../query/use-topup";
import { uuidV4FromSeed } from "../../util";
import { Button, Card, Field, Icon, Sub, useActionError } from "../index";
import { SupportCallRow } from "../safety";
import { CountdownRing, formatCountdown } from "../food/CountdownRing";

/**
 * The kit's self-serve top-up flow (`explorations/journey/rider-screens-wallet.jsx` — `TopupAmount`,
 * `TopupWait`, `TopupSuccess`, `TopupDeclined`), wired to the real wallet API.
 *
 * ─── THE ONE THING TO UNDERSTAND ABOUT THIS SCREEN ────────────────────────────────────────────────
 * It is a view over `useTopUp` (`src/query/use-topup.ts`), which owns the whole data lifecycle — the
 * real `TopUp` intent, the poll, the wallet invalidation and the durable recovery marker. This file
 * deliberately does no fetching of its own: the `mobile-ui-no-api` boundary
 * (`.dependency-cruiser.cjs`) holds the design-system layer to props and hook state, and CI fails a
 * new `src/ui/ → src/api/` edge. Reach for the hook, never the api module.
 *
 * What that buys is the property that matters here: this screen renders whichever terminal state THE
 * SERVER reports. A success appears only when the server says `succeeded`, which happens only when
 * something has called `WalletService.creditFromTopup` and actually moved the balance.
 *
 * It replaced a mock (`TopUpSimulator`) that drew these four screens with no backend at all and let
 * the rider pick their own outcome — including a success that asserted a credit which never happened.
 * Nothing here can do that: the outcome is not the client's to choose.
 *
 * ─── WHAT IS STILL MISSING, AND WHAT THAT LOOKS LIKE TODAY ────────────────────────────────────────
 * The APP side is complete. The SERVER side is not: `creditFromTopup` — the only code path that can
 * confirm an intent — still has no caller, because no payment-rail client exists. So no prompt reaches
 * the rider's phone, nothing confirms, and every real attempt runs the 90-second window down and comes
 * back `expired`. That is the honest rendering of the actual system state, and it is why the amount
 * step keeps a support-call card: calling support is the only route to a credit that works today.
 *
 * **When a rail lands and calls `creditFromTopup`, this screen starts working with no change here.**
 * That is the point of wiring it now — `succeeded` / `declined` / `expired` are already handled, the
 * balance and ledger are already invalidated on success, and the durable `PendingTopup` marker already
 * survives an app kill mid-wait (the Money tab reconciles it on next open).
 */

const RAILS: { id: Exclude<TopupRail, "manual">; name: string; note: string }[] = [
  { id: "ecocash", name: "EcoCash", note: "Approve on your phone" },
  { id: "innbucks", name: "InnBucks", note: "Approve on your phone" },
  { id: "omari", name: "O'mari", note: "Approve on your phone" },
];
const QUICK_AMOUNTS = [5, 10, 20];

export function TopUpFlow({
  minTopUp,
  maxTopUp,
  onExit,
}: {
  minTopUp: number;
  maxTopUp: number;
  onExit: () => void;
}): React.ReactElement {
  const fail = useActionError();
  const [amountRaw, setAmountRaw] = React.useState("10.00");
  const [phone, setPhone] = React.useState("");
  const [rail, setRail] = React.useState<Exclude<TopupRail, "manual">>("ecocash");
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  // Rotates per attempt so a retry after a decline opens a NEW intent, while a timeout+retry WITHIN an
  // attempt replays the same key and the server returns the original pending intent (BH-09).
  const [attempt, setAttempt] = React.useState(0);

  const { topup, status, hasIntent, isStarting, start, reset } = useTopUp({
    // Action-error rule (docs/DESIGN-SYSTEM.md): speak once as a self-clearing toast, never persist a
    // card. Curated copy rather than the raw error message — "Network request failed" tells a rider
    // nothing about what to do next.
    onStartError: () => fail("We couldn't start that top-up. Check your connection and try again."),
  });

  const amountError = validateTopupAmount(amountRaw, minTopUp, maxTopUp);
  const amount = Number(amountRaw);
  const amountOk = amountError == null && Number.isFinite(amount) && amount > 0;
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const railName = RAILS.find((r) => r.id === rail)?.name ?? "";

  const idempotencyKey = React.useMemo(
    () => uuidV4FromSeed(`topup|${attempt}|${amountRaw}|${phone}|${rail}`),
    [attempt, amountRaw, phone, rail],
  );

  // Tick only while a prompt is outstanding — the countdown ring is the only thing that needs it.
  React.useEffect(() => {
    if (status !== "pending") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  const restart = (): void => {
    reset();
    setAttempt((n) => n + 1);
  };

  const expiresMs = topup ? Date.parse(topup.expiresAt) : null;
  const remaining = expiresMs == null ? TOPUP_WINDOW_MS : Math.max(0, expiresMs - nowMs);
  const elapsed = TOPUP_WINDOW_MS - remaining;

  // ── Waiting on the rail ──────────────────────────────────────────────────────────────────────────
  if (hasIntent && (status == null || status === "pending")) {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center", paddingTop: tokens.space.lg }}>
          <CountdownRing elapsedMs={elapsed} totalMs={TOPUP_WINDOW_MS} label={formatCountdown(remaining)} sub="left" size={132} />
          <Text style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginTop: tokens.space.lg }}>
            Check your phone
          </Text>
          <Text style={{ fontSize: 14, color: tokens.color.muted, textAlign: "center", lineHeight: 21, marginTop: 6, maxWidth: 280 }}>
            Approve the {railName} prompt on{" "}
            <Text style={{ fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
              {formatPhoneLocal(phone)}
            </Text>
            . Your balance is credited the moment it clears.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText, marginTop: tokens.space.md, fontVariant: ["tabular-nums"] }}>
            {formatMoney(amount)} · {railName}
          </Text>
        </View>
        <View style={{ marginTop: tokens.space.xl }}>
          {/* Leaving does NOT cancel the intent — it stays open server-side until it confirms or the
              window closes, and the durable marker means the Money tab picks up the outcome either way.
              Say that, rather than implying the rider must sit here. */}
          <Text style={{ fontSize: 12, color: tokens.color.muted, textAlign: "center", lineHeight: 18, marginBottom: tokens.space.sm }}>
            You can leave this screen — we&apos;ll update your balance as soon as the payment clears.
          </Text>
          <Button label="Back to Money" variant="ghost" onPress={onExit} />
        </View>
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    );
  }

  // ── Confirmed by the server: money actually moved ────────────────────────────────────────────────
  if (hasIntent && status === "succeeded") {
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
            {formatMoney(topup?.amount ?? amount)}
          </Text>
          {/* Safe to state plainly: this branch is reachable only on a server-reported `succeeded`,
              which means creditFromTopup ran and the ledger has the entry. */}
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
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>
              +{formatMoney(topup?.amount ?? amount)}
            </Text>
          </View>
        </Card>

        <Button label="Back to Money" onPress={onExit} />
        <Button label="Top up again" variant="ghost" onPress={restart} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    );
  }

  // ── Declined, or the window closed with no answer ────────────────────────────────────────────────
  if (hasIntent && (status === "declined" || status === "expired")) {
    const isExpired = status === "expired";
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
              {isExpired ? "The request timed out" : "The payment was declined"}
            </Text>
            <Text style={{ fontSize: 12, color: tokens.color.muted, textAlign: "center", lineHeight: 18, marginTop: 6, maxWidth: 280 }}>
              {isExpired
                ? `No money left your ${railName} wallet. The request wasn't approved in time — you can try again, or call support to top up.`
                : `No money leaves your ${railName} wallet. Usually the ${railName} balance was too low, or the request was turned down on the phone.`}
            </Text>
          </View>
          <Button label="Try again" onPress={restart} />
        </Card>
        <Card style={{ marginTop: tokens.space.md, backgroundColor: tokens.color.surface }}>
          <SupportCallRow label="Top up" name="LyniaGo support" />
        </Card>
        <Button label="Back to Money" variant="ghost" onPress={onExit} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    );
  }

  // ── Amount / rail / phone ────────────────────────────────────────────────────────────────────────
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
        hint="This is the number that gets the payment prompt — change it if you'd pay from another line."
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
        disabled={!amountOk || !phoneOk || isStarting}
        loading={isStarting}
        onPress={() => start({ amount, rail, phone, idempotencyKey })}
      />

      {/* The route that works today. `creditFromTopup` has no caller yet, so until a rail lands the
          request above runs its 90s window down and expires — support crediting a balance by hand is
          the only way a rider's money actually moves. Keep this here until that changes. */}
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
