import { formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Platform, Text, TextInput, View } from "react-native";
import { requestOtp, verifyOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/auth-context";
import { loadRolePreference, saveRolePreference } from "../src/auth/session";
import { replaceClearingStack } from "../src/logic/nav";
import { RESEND_COOLDOWN_S, formatCountdown, otpErrorMessage, otpFailure } from "../src/logic/otp";
import { parseSignInIntent, signedInDestination, startRoleFor } from "../src/logic/sign-in-route";
import { DismissKeyboardArea, Icon, Tappable, useActionError } from "../src/ui";
import { OB } from "../src/ui/onboarding/copy";
import { BackButton, Cta, H2, OnbScreen, Pad } from "../src/ui/onboarding/kit";

/**
 * Test seam: the parity lane stages the code screen's states by mounting it directly (expo-router passes
 * no props, so the defaults are what ships). `initialResent` is still passed by the `auth_otp_resent`
 * fixture; C4 draws no "resent" banner (a resend restarts the countdown), so it changes nothing.
 */
export type VerifyScreenProps = {
  initialCooldownS?: number;
  initialResent?: boolean;
  initialLocked?: boolean;
};

type DeliveryChannel = "whatsapp" | "sms";

function asDeliveryChannel(v: unknown): DeliveryChannel {
  return v === "whatsapp" ? "whatsapp" : "sms";
}

const CODE_LENGTH = 6;
/** The idle resend line, greyed until the countdown ends (`shared.js` `O.otp`). */
const RESEND_IDLE = "#9AA3AB";

/** The code boxes' spoken label: what the six boxes show, which the eye reads at a glance. */
function codeBoxesLabel(entered: number): string {
  return `${CODE_LENGTH}-digit code, ${entered} ${entered === 1 ? "digit" : "digits"} entered`;
}

function secondsUntil(at: number): number {
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * "Resend in 0:42", then "Resend on WhatsApp". Its own component so the one-second tick re-renders this
 * row alone, not the whole code screen 60 times per code.
 */
function ResendRow({ endsAt, resending, onResend }: { endsAt: number; resending: boolean; onResend: () => void }): React.ReactElement {
  const [cooldown, setCooldown] = useState(() => secondsUntil(endsAt));

  useEffect(() => {
    const tick = (): void => setCooldown(secondsUntil(endsAt));
    tick(); // recompute immediately (mount, resend, and — via AppState below — on foreground)
    const iv = setInterval(tick, 1000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [endsAt]);

  return (
    <>
      {cooldown > 0 ? (
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="clock" size={16} color={tokens.color.muted} />
          <Text style={{ fontSize: 13, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{OB.resendIn(formatCountdown(cooldown))}</Text>
        </View>
      ) : null}
      <Tappable
        onPress={onResend}
        disabled={cooldown > 0 || resending}
        accessibilityRole="button"
        accessibilityLabel={OB.resendOnWhatsApp}
        accessibilityState={{ disabled: cooldown > 0 }}
        style={{ marginTop: cooldown > 0 ? 6 : 14, minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Icon name="refresh-cw" size={16} color={cooldown > 0 ? RESEND_IDLE : tokens.color.accentText} />
        <Text style={{ fontSize: 14, fontWeight: cooldown > 0 ? tokens.font.weight.regular : tokens.font.weight.semibold, color: cooldown > 0 ? RESEND_IDLE : tokens.color.accentText }}>
          {OB.resendOnWhatsApp}
        </Text>
      </Tappable>
    </>
  );
}

/**
 * C4 · Code (Calm Mint v2, `packages/design/handoff/calm-mint-v2-2026-10` README §3; ledger D-55):
 * "Enter the code", "Sent on WhatsApp to +263 … Change", six 56px boxes with the active one bordered
 * 2px brand, "Resend in 0:42" then "Resend on WhatsApp", and the footer note. There is NO Verify button:
 * the sixth digit submits. A wrong code shows the danger line; an expired or locked code shows "That
 * code has expired" and "Send a new code".
 *
 * The channel line follows the real send (D-40): Bird Verify is WhatsApp-first and can fall back to SMS
 * per number, so "Sent by SMS" when it did. The input keeps the platform autofill hints (`sms-otp`,
 * `oneTimeCode`), which is what "fills in by itself" rests on.
 *
 * Submitting (start-up review 2026-10-06, C-5): the latest complete code is sent as soon as nothing is in
 * flight, so a code corrected while a request runs is not dropped. A definitive "wrong code" is never
 * re-sent as is (it would only burn an attempt); after a non-answer (no network, a timeout, a 5xx, a rate
 * limit) the same code can be sent again by retyping it, which is what the server's same-code grace is for.
 */
export default function VerifyScreen({ initialCooldownS = RESEND_COOLDOWN_S, initialLocked = false }: VerifyScreenProps = {}): React.ReactElement {
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; devCode?: string; deliveryChannel?: string; intent?: string }>();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const intent = parseSignInIntent(params.intent);
  const prefilled = typeof params.devCode === "string" && params.devCode.length > 0;
  const [code, setCode] = useState(prefilled ? (params.devCode as string) : "");
  const [deliveryChannel, setDeliveryChannel] = useState<DeliveryChannel>(asDeliveryChannel(params.deliveryChannel));
  const [busy, setBusy] = useState(false);
  const setError = useActionError();
  const [wrong, setWrong] = useState(false);
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number>(() => Date.now() + initialCooldownS * 1000);
  const [resending, setResending] = useState(false);
  const [locked, setLocked] = useState(initialLocked);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  // The last code submitted. The sixth digit submits once per distinct code, never in a loop.
  const tried = useRef<string | null>(null);
  // True when the last submit got no answer about the code: an edit then clears `tried`, so retyping
  // the same six digits sends them again.
  const retryable = useRef(false);
  // Synchronous: two effects in one frame both see `busy` false.
  const inFlight = useRef(false);
  // The code the server last called wrong: retyping it shows the danger line again instead of nothing.
  const wrongCode = useRef<string | null>(null);

  // iOS has no live regions: say the error lines out loud there (Android's accessibilityLiveRegion does).
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (locked) AccessibilityInfo.announceForAccessibility(OB.expired);
    else if (wrong) AccessibilityInfo.announceForAccessibility(OB.wrongCode);
  }, [wrong, locked]);

  const requestFreshCode = async (): Promise<void> => {
    if (resending || phone.length === 0) return;
    setError(null);
    setResending(true);
    try {
      const res = await requestOtp(phone);
      setDeliveryChannel(asDeliveryChannel(res.deliveryChannel));
      setLocked(false);
      setWrong(false);
      setCode("");
      tried.current = null;
      retryable.current = false;
      wrongCode.current = null;
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_S * 1000);
      input.current?.focus();
    } catch (e) {
      setError(otpErrorMessage(e, "Couldn't send a new code."));
    } finally {
      setResending(false);
    }
  };

  const submit = async (value: string): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    tried.current = value;
    retryable.current = false;
    setError(null);
    setWrong(false);
    setBusy(true);
    try {
      const res = await verifyOtp(phone, value);
      // A brand-new account keeps its C1 rider intent with the session, so an app killed on C5 still
      // finishes as a rider (C-4).
      await signIn({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresIn: res.expiresIn,
        profileId: res.profileId,
        role: res.role,
        needsProfile: res.needsProfile,
        ...(res.needsProfile && intent ? { signupIntent: intent } : {}),
      });
      // Every way out of sign-in clears the stack: Back must never reach the phone screen again (C-1).
      // A brand-new account has no name yet: C5 first, carrying the verified number and the C1 rider
      // intent. That screen routes onward itself once the name is saved.
      if (res.needsProfile) {
        replaceClearingStack(router, { pathname: "/profile/setup", params: { phone, ...(intent ? { intent } : {}) } });
        return;
      }
      // No role choice screen (D-55): a saved role wins; then the server's (a returning rider whose saved
      // role a sign-out wiped, C-3); otherwise customer, or rider through C1's "Ride with LyniaGo".
      const chosen = await loadRolePreference();
      if (!chosen) void saveRolePreference(startRoleFor(null, intent, res.role));
      replaceClearingStack(router, signedInDestination(chosen, intent, res.role));
    } catch (e) {
      const failure = otpFailure(e instanceof ApiError ? e : null);
      if (failure === "expired" || failure === "locked") {
        // Not a "try again" error: it needs a fresh code.
        setLocked(true);
      } else if (failure === "invalid") {
        wrongCode.current = value;
        setWrong(true);
      } else {
        // The server never judged this code: the user may send it again.
        retryable.current = true;
        setError(otpErrorMessage(e, "Couldn't verify the code."));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // The sixth digit submits (README §3 "auto-verifies, so there's no Verify button") — the latest code,
  // once nothing is in flight: `busy` is a dependency so a code completed mid-request goes when it ends.
  useEffect(() => {
    if (busy || locked || code.length !== CODE_LENGTH || tried.current === code) return;
    void submit(code);
  }, [code, locked, busy]);

  const back = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/phone");
  };

  const shown = phone ? formatPhoneDisplay(phone) : "";
  const active = Math.min(code.length, CODE_LENGTH - 1);

  return (
    // The number pad has no return key on iOS: a tap outside the field is the way to put it away.
    <DismissKeyboardArea>
      <OnbScreen
        footer={
          locked ? (
            <Cta label={OB.sendNewCode} onPress={() => void requestFreshCode()} busy={resending} />
          ) : (
            <Text style={{ textAlign: "center", fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{OB.autoNote}</Text>
          )
        }
      >
        <Pad>
          <BackButton onPress={back} />
          <H2>{OB.codeTitle}</H2>
          <Text style={{ marginBottom: 20, fontSize: 15, lineHeight: 21.75, color: tokens.color.muted }}>
            {prefilled ? (
              OB.testBuild
            ) : (
              <>
                {OB.sentTo(deliveryChannel)}
                <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{OB.channelName(deliveryChannel)}</Text>
                {" to "}
                <Text style={{ fontVariant: ["tabular-nums"] }}>{shown}</Text>
                {". "}
                <Text accessibilityRole="link" onPress={back} style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>
                  {OB.change}
                </Text>
              </>
            )}
          </Text>

          {/* The six boxes are the code field a screen reader meets (C-7): one element that says how many
              digits are in and opens the keyboard. The real input below stays out of the reader's way. */}
          <Tappable onPress={() => input.current?.focus()} accessible accessibilityLabel={codeBoxesLabel(code.length)} accessibilityHint="Opens the keyboard">
            <View style={{ flexDirection: "row", gap: 8 }}>
              {Array.from({ length: CODE_LENGTH }, (_, i) => {
                const current = focused && !locked && i === active && code.length < CODE_LENGTH;
                return (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 56,
                      borderRadius: 12,
                      borderWidth: current ? 2 : 1,
                      borderColor: current ? tokens.color.accent : wrong || locked ? tokens.color.danger : tokens.color.line,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 24, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{code[i] ?? ""}</Text>
                  </View>
                );
              })}
            </View>
          </Tappable>
          {/* One real input under the six boxes: it owns the keyboard, autofill and paste. Near-invisible
              rather than opacity 0, which Android drops from autofill and accessibility focus. */}
          <TextInput
            ref={input}
            value={code}
            onChangeText={(v) => {
              const next = v.replace(/\D/g, "").slice(0, CODE_LENGTH);
              // An edit after a non-answer re-arms the same code (C-5); a wrong code stays spent.
              if (retryable.current && next !== code) {
                tried.current = null;
                retryable.current = false;
              }
              setCode(next);
              setWrong(next === wrongCode.current);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus={!prefilled}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            accessibilityLabel="6-digit code"
            accessibilityElementsHidden
            importantForAccessibility="no"
            caretHidden
            style={{ position: "absolute", width: 1, height: 1, opacity: 0.01 }}
          />

          {wrong ? (
            <Text accessibilityLiveRegion="polite" style={{ marginTop: 12, fontSize: 13, lineHeight: 18, color: tokens.color.dangerInk }}>
              {OB.wrongCode}
            </Text>
          ) : null}
          {locked ? (
            <Text accessibilityLiveRegion="polite" style={{ marginTop: 12, fontSize: 13, lineHeight: 18, color: tokens.color.dangerInk }}>
              {OB.expired}
            </Text>
          ) : (
            <ResendRow endsAt={cooldownEndsAt} resending={resending} onResend={() => void requestFreshCode()} />
          )}
        </Pad>
      </OnbScreen>
    </DismissKeyboardArea>
  );
}
