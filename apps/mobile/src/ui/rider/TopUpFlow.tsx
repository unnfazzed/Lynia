import { TOPUP_WINDOW_MS } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type TopupProviderId, TOPUP_PROVIDERS, providerName } from "../../logic/rider-prefs";
import { validateTopupAmount } from "../../logic/topup";
import { useTopUp } from "../../query/use-topup";
import { uuidV4FromSeed } from "../../util";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { useActionError } from "../index";
import { Countdown, CtaBar, CtaButton } from "../order/kit";
import { OrderHeader } from "../order/panels";
import { SEND_COPY, SendField } from "../send/kit";
import { RIDER_COPY as R, RF, usd } from "./copy";
import { CentreState, Progress, RStepBar } from "./kit";

/**
 * Top up (Rider v2 T1–T6, ledger D-54): the Send v2 step bar — Provider → Amount → Phone → Approve —
 * then a terminal. A view over `useTopUp` (`src/query/use-topup.ts`), which owns the real intent, the
 * poll, the wallet invalidation and the durable recovery marker; this file does no fetching of its own
 * (the `mobile-ui-no-api` boundary). It renders whichever outcome THE SERVER reports: a success appears
 * only on `succeeded`, i.e. only after something credited the balance.
 */
const STEPS = [R.tsProvider, R.tsAmount, R.tsPhone, R.tsApprove] as const;
const QUICK = [2, 5, 10, 20];

function Header({ step, onBack }: { step: number | null; onBack: () => void }): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: tokens.color.bg, borderBottomWidth: step ? 1 : 0, borderBottomColor: tokens.color.line }}>
      <OrderHeader title={R.tTopUp} help={false} onBack={onBack} onHelp={() => undefined} />
      {step ? <RStepBar step={step} labels={STEPS} /> : null}
    </View>
  );
}

export function TopUpFlow({
  minTopUp,
  maxTopUp,
  ratePct,
  avgFare,
  defaultProvider,
  defaultPhone,
  balance,
  onExit,
  onCallSupport,
}: {
  minTopUp: number;
  maxTopUp: number;
  ratePct: number;
  avgFare: number | null;
  defaultProvider: TopupProviderId;
  defaultPhone: string;
  /** The balance after a success, when the wallet read has caught up. */
  balance: number | null;
  onExit: () => void;
  onCallSupport: () => void;
}): React.ReactElement {
  const fail = useActionError();
  const narrow = useWindowDimensions().width < 340;
  const startInFlightRef = React.useRef(false);
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [rail, setRail] = React.useState<TopupProviderId>(defaultProvider);
  const [amountRaw, setAmountRaw] = React.useState("5.00");
  const [phone, setPhone] = React.useState(defaultPhone);
  const [attempt, setAttempt] = React.useState(0);
  // Settings may load after mount; follow it until the rider changes the value themselves.
  const touched = React.useRef({ rail: false, phone: false });
  React.useEffect(() => {
    if (!touched.current.rail) setRail(defaultProvider);
  }, [defaultProvider]);
  React.useEffect(() => {
    if (!touched.current.phone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const { topup, status, hasIntent, isStarting, start, reset } = useTopUp({ onStartError: () => fail(R.failT) });

  const amountError = validateTopupAmount(amountRaw, minTopUp, maxTopUp);
  const amount = Number(amountRaw);
  const amountOk = amountError == null && Number.isFinite(amount) && amount > 0;
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const name = providerName(rail);
  const idempotencyKey = React.useMemo(() => uuidV4FromSeed(`topup|${attempt}|${amountRaw}|${phone}|${rail}`), [attempt, amountRaw, phone, rail]);

  const restart = (): void => {
    reset();
    setAttempt((n) => n + 1);
    setStep(1);
  };
  const back = (): void => {
    if (hasIntent) return onExit();
    if (step === 1) return onExit();
    setStep((s) => (s - 1) as 1 | 2 | 3);
  };

  // ── Approve (T4): the prompt is on the rider's phone ─────────────────────────────────────────────
  if (hasIntent && (status == null || status === "pending")) {
    const end = topup ? Date.parse(topup.expiresAt) : NaN;
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <Header step={4} onBack={back} />
        <CentreState spinner title={RF.waitT(topup?.amount ?? amount)} body={RF.waitB(name, phone)}>
          <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Countdown expiresAt={topup?.expiresAt ?? null} />
            <View style={{ flex: 1 }}>
              <ApproveProgress end={end} />
            </View>
          </View>
        </CentreState>
      </View>
    );
  }

  // ── Done (T5) / Failed (T6) ─────────────────────────────────────────────────────────────────────
  if (hasIntent && (status === "succeeded" || status === "declined" || status === "expired")) {
    const ok = status === "succeeded";
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <Header step={null} onBack={onExit} />
        <CentreState icon={ok ? "circle-check" : "circle-alert"} tone={ok ? "ok" : "danger"} title={ok ? R.okT : R.failT} body={ok ? RF.okB(topup?.amount ?? amount, balance) : RF.failB(name)} />
        <CtaBar>
          {ok ? (
            <>
              <CtaButton label={R.backMoney} onPress={onExit} />
              <CtaButton ghost label={R.again} onPress={restart} />
            </>
          ) : (
            <>
              <CtaButton label={R.tryAgain} icon="refresh-cw" onPress={restart} />
              <CtaButton ghost label={R.callSupport} icon="phone" onPress={onCallSupport} />
            </>
          )}
        </CtaBar>
      </View>
    );
  }

  const next = (): void => {
    if (step === 1) return setStep(2);
    if (step === 2) return amountOk ? setStep(3) : undefined;
    if (!phoneOk || !amountOk || startInFlightRef.current || isStarting) return;
    startInFlightRef.current = true;
    start({ amount, rail, phone, idempotencyKey }, { onSettled: () => (startInFlightRef.current = false) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <Header step={step} onBack={back} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
        {step === 1 ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{R.provider}</Text>
            {TOPUP_PROVIDERS.map((p) => {
              const on = p.id === rail;
              return (
                <Tappable
                  key={p.id}
                  onPress={() => {
                    touched.current.rail = true;
                    setRail(p.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={`${p.name}, ${R.approveOnPhone}`}
                  style={{
                    minHeight: 64,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: on ? 13 : 14,
                    borderRadius: 12,
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? tokens.color.accentText : tokens.color.line,
                    backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
                  }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 7 : 2, borderColor: on ? tokens.color.accentText : tokens.color.line, backgroundColor: tokens.color.bg }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: tokens.color.muted }}>{R.approveOnPhone}</Text>
                  </View>
                  <Icon name="smartphone" size={18} color={tokens.color.muted} />
                </Tappable>
              );
            })}
          </>
        ) : step === 2 ? (
          <>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, marginBottom: 6 }}>{R.amount}</Text>
              {/* Tap-to-type: the 56/700 amount is drawn as text; a transparent input over it takes
                  the keystrokes (the drawn figure stays exactly the design's, on every platform). */}
              <View style={{ borderBottomWidth: 2, borderStyle: "dashed", borderBottomColor: tokens.color.line }}>
                <Text style={{ fontSize: narrow ? 48 : 56, lineHeight: narrow ? 56 : 64, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                  ${amountRaw}
                </Text>
                <TextInput
                  value={amountRaw}
                  onChangeText={setAmountRaw}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  accessibilityLabel={R.amount}
                  caretHidden
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, fontSize: 16, color: tokens.color.ink }}
                />
              </View>
              {amountError ? (
                <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                  <Icon name="circle-alert" size={14} color={tokens.color.danger} />
                  <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.danger }}>{amountError}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {QUICK.map((v) => {
                const on = Number(amountRaw) === v;
                return (
                  <Tappable
                    key={v}
                    onPress={() => setAmountRaw(v.toFixed(2))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={usd(v)}
                    style={{
                      flex: 1,
                      minHeight: tokens.touchTargetMin,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: tokens.radius.pill,
                      borderWidth: on ? 1.5 : 1,
                      borderColor: on ? tokens.color.accentText : tokens.color.line,
                      backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: on ? tokens.color.accentText : tokens.color.ink, fontVariant: ["tabular-nums"] }}>${v}</Text>
                  </Tappable>
                );
              })}
            </View>
            <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{RF.amountHint(amountOk ? amount : 5, ratePct, avgFare)}</Text>
          </>
        ) : (
          <SendField
            label={R.phoneL}
            value={phone}
            onChangeText={(v) => {
              touched.current.phone = true;
              setPhone(v);
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={20}
            hint={R.phoneHint}
            autoFocus
          />
        )}
      </ScrollView>
      <CtaBar>
        <CtaButton
          label={step === 3 ? RF.requestCta(amount) : SEND_COPY.next}
          onPress={next}
          loading={step === 3 && isStarting}
          disabled={(step === 2 && !amountOk) || (step === 3 && (!phoneOk || !amountOk))}
        />
      </CtaBar>
    </View>
  );
}

/** The 90-second approve window, as the 4px bar beside the countdown pill. */
function ApproveProgress({ end }: { end: number }): React.ReactElement | null {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!Number.isFinite(end)) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);
  if (!Number.isFinite(end)) return null;
  return <Progress pct={((end - now) / TOPUP_WINDOW_MS) * 100} />;
}
