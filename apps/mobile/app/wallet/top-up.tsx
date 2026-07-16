import { COMMISSION, tokens, type Topup } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { createTopup, getTopup } from "../../src/api/wallet";
import { clearPendingTopup, savePendingTopup } from "../../src/auth/session";
import { formatMoney } from "../../src/logic/money";
import { validateTopupAmount } from "../../src/logic/topup";
import { useWalletConfig, walletKey, walletLedgerKey } from "../../src/query/use-wallet";
import { Button, Field, Heading, Icon, Screen, Sub } from "../../src/ui";
import { randomUuidV4 } from "../../src/util";

type SelfServeRail = "ecocash" | "innbucks" | "omari";
type Step = "amount" | "wait" | "success" | "timeout" | "declined";
const QUICK_AMOUNTS = [5, 10, 20];
const RAILS: SelfServeRail[] = ["ecocash", "innbucks", "omari"];
const RAIL_LABEL: Record<SelfServeRail, string> = {
  ecocash: "EcoCash",
  innbucks: "InnBucks",
  omari: "O'mari",
};
const POLL_MS = 3000;

export default function TopUpScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = React.useState<Step>("amount");
  const [amount, setAmount] = React.useState("10");
  const [rail, setRail] = React.useState<SelfServeRail>("ecocash");
  const [phone, setPhone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [topup, setTopup] = React.useState<Topup | null>(null);
  const [remaining, setRemaining] = React.useState(0);
  // BH-09: one key per top-up ATTEMPT (not per tap) — a lost-response retry of the same attempt
  // (user retaps "Send request" after a timeout/network error, still on the amount step) replays this
  // same key so the server returns the original pending intent instead of opening a second one.
  // Rotated in reset() below, since that's the one path that starts a genuinely NEW attempt.
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() => randomUuidV4());

  // WD-009: bounds come from the server-authoritative config (mirrors the commission rate itself never
  // being hardcoded — wallet.service.ts's design 2A). The bundled COMMISSION constant is only a fallback
  // for the brief window before /wallet/config has loaded, so validation never blocks on it.
  const { config } = useWalletConfig();
  const minTopUp = config?.minTopUp ?? COMMISSION.minTopUp;
  const maxTopUp = config?.maxTopUp ?? COMMISSION.maxTopUp;

  const amountNum = Number(amount);
  const amountError = validateTopupAmount(amount, minTopUp, maxTopUp);
  const canSubmit = amountError == null && amount.trim() !== "" && phone.trim().length >= 6;

  // Countdown + poll while waiting on the rail prompt. Both clear on unmount / step change.
  React.useEffect(() => {
    if (step !== "wait" || !topup) return;
    const expires = new Date(topup.expiresAt).getTime();
    const tick = (): void => setRemaining(Math.max(0, Math.round((expires - Date.now()) / 1000)));
    tick();
    const countdown = setInterval(tick, 1000);
    let cancelled = false;
    const poll = setInterval(async () => {
      try {
        const next = await getTopup(topup.id);
        if (cancelled) return;
        if (next.status === "succeeded") {
          onCredited();
        } else if (next.status === "declined") {
          void clearPendingTopup();
          setStep("declined");
        } else if (next.status === "expired") {
          void clearPendingTopup();
          setStep("timeout");
        }
      } catch {
        /* transient — keep polling until the window elapses */
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(countdown);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, topup]);

  // When the window elapses with no confirmation, fall to the timeout state (no money moved).
  React.useEffect(() => {
    if (step === "wait" && remaining === 0 && topup) {
      const t = setTimeout(() => setStep((s) => (s === "wait" ? "timeout" : s)), 500);
      return () => clearTimeout(t);
    }
  }, [step, remaining, topup]);

  function onCredited(): void {
    // Balance + ledger changed — invalidate so the wallet screen shows the new total and row.
    void qc.invalidateQueries({ queryKey: walletKey });
    void qc.invalidateQueries({ queryKey: walletLedgerKey });
    void clearPendingTopup(); // UX-2026-07-16: resolved — the durability marker's job is done
    setStep("success");
  }

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createTopup({ amount: amountNum, rail, phone: phone.trim(), idempotencyKey });
      setTopup(created);
      setStep("wait");
      // UX-2026-07-16: persist the instant the server confirms the intent — BEFORE the rider is sent out
      // to approve the rail prompt in another app, the exact moment an app kill is most likely on a
      // low-end device. Recovered by the wallet screen's mount-time reconciliation (reconcilePendingTopup).
      void savePendingTopup(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the top-up — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset(): void {
    // UX-2026-07-16: "Cancel request" (step === "wait") cancels a STILL-LIVE server-side top-up — the
    // rail prompt already pushed to the rider's phone isn't recalled by this local reset, so keep the
    // same idempotencyKey. An immediate resend of the same amount then dedupes against the abandoned
    // intent (BH-09's existing server-side replay) instead of minting a second, independent one that
    // could both later get approved. "Try again" from timeout/declined (topup already terminal) IS a
    // genuinely new attempt and still gets a fresh key, exactly as BH-09 intended.
    const cancellingLive = step === "wait";
    setTopup(null);
    setError(null);
    setStep("amount");
    void clearPendingTopup();
    if (!cancellingLive) {
      setIdempotencyKey(randomUuidV4());
    }
  }

  return (
    <Screen>
      <Heading>Top up</Heading>

      {step === "amount" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Sub>Add to your prepaid commission balance. {formatMoney(minTopUp)}–{formatMoney(maxTopUp)} per top-up.</Sub>

          <Field
            label="Amount (USD)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="10.00"
            error={amountError ?? undefined}
          />
          <View style={{ flexDirection: "row", marginBottom: tokens.space.md }}>
            {QUICK_AMOUNTS.map((a) => {
              const selected = Number(amount) === a;
              return (
                <Pressable
                  key={a}
                  onPress={() => setAmount(String(a))}
                  accessibilityRole="button"
                  accessibilityLabel={`Top up ${formatMoney(a)}`}
                  style={{
                    flex: 1,
                    marginRight: a === QUICK_AMOUNTS[QUICK_AMOUNTS.length - 1] ? 0 : tokens.space.sm,
                    borderWidth: 1,
                    borderColor: selected ? tokens.color.accentText : tokens.color.line,
                    backgroundColor: selected ? tokens.color.accentWash : tokens.color.bg,
                    borderRadius: tokens.radius.pill,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: selected ? tokens.color.accentText : tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                    ${a}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="07xx xxx xxx"
            autoComplete="tel"
            textContentType="telephoneNumber"
            hint="We'll push the payment prompt to this number."
          />

          <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: 4 }}>Pay with</Text>
          <View style={{ marginBottom: tokens.space.md }}>
            {RAILS.map((r) => {
              const selected = rail === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRail(r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={RAIL_LABEL[r]}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: selected ? tokens.color.accentText : tokens.color.line,
                    backgroundColor: selected ? tokens.color.accentWash : tokens.color.bg,
                    borderRadius: tokens.radius.input,
                    padding: tokens.space.md,
                    marginBottom: tokens.space.sm,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: selected ? tokens.color.accentText : tokens.color.ink }}>
                    {RAIL_LABEL[r]}
                  </Text>
                  {selected ? <Icon name="check" size={18} color={tokens.color.accentText} /> : null}
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <Text style={{ color: tokens.color.danger, fontSize: 14, marginBottom: tokens.space.sm }}>{error}</Text>
          ) : null}
          <Button label="Send request" onPress={submit} disabled={!canSubmit} loading={submitting} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      ) : step === "wait" ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: tokens.space.lg }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              borderWidth: 3,
              borderColor: remaining <= 20 ? tokens.color.danger : tokens.color.accent,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: tokens.space.lg,
            }}
          >
            <Text style={{ fontSize: 28, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{remaining}</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>
            Check your phone
          </Text>
          <Text style={{ fontSize: 14, color: tokens.color.muted, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
            Approve the {RAIL_LABEL[rail]} prompt on {phone} to add {formatMoney(topup?.amount ?? amountNum)}. This
            request expires in {remaining}s.
          </Text>
          <View style={{ alignSelf: "stretch", marginTop: tokens.space.xl }}>
            <Button label="Cancel request" variant="ghost" onPress={reset} />
          </View>
        </View>
      ) : step === "success" ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: tokens.space.lg }}>
          <View
            style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.md }}
          >
            <Icon name="check" size={40} color={tokens.color.accentText} strokeWidth={2} />
          </View>
          {/* WD-009: the server-confirmed amount (clamped/rounded server-side), not the raw typed value —
              they only coincide today because the client-side bounds mirror the server's, but the two are
              allowed to diverge (e.g. a stale app build with an outdated bundled COMMISSION constant). */}
          <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink }}>Added {formatMoney(topup?.amount ?? amountNum)}</Text>
          <Text style={{ fontSize: 14, color: tokens.color.muted, textAlign: "center", marginTop: 6 }}>
            Your commission balance is topped up. You&apos;re good to keep riding.
          </Text>
          <View style={{ alignSelf: "stretch", marginTop: tokens.space.xl }}>
            <Button label="Done" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        // timeout / declined — both offer a calm retry, honest that no money moved.
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: tokens.space.lg }}>
          <View
            style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.md }}
          >
            <Icon name="triangle-alert" size={38} color={tokens.color.ink} strokeWidth={1.75} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink }}>
            {step === "timeout" ? "The request expired" : "Payment was declined"}
          </Text>
          <Text style={{ fontSize: 14, color: tokens.color.muted, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
            {step === "timeout"
              ? "No money moved. Send the request again when you're ready to approve it."
              : `No money left your ${RAIL_LABEL[rail]}. You can try again.`}
          </Text>
          <View style={{ alignSelf: "stretch", marginTop: tokens.space.xl }}>
            <Button label="Try again" onPress={reset} />
            <Button label="Back to wallet" variant="ghost" onPress={() => router.back()} />
          </View>
        </View>
      )}
    </Screen>
  );
}
