import { formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Text, TextInput, View } from "react-native";
import { requestOtp, verifyOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/auth-context";
import { loadRolePreference, saveRolePreference } from "../src/auth/session";
import { RESEND_COOLDOWN_S, formatCountdown, isOtpExpiredOrLocked } from "../src/logic/otp";
import { parseSignInIntent, signedInDestination, startRoleFor } from "../src/logic/sign-in-route";
import { DismissKeyboardArea, Icon, Tappable, useActionError } from "../src/ui";
import { OB } from "../src/ui/onboarding/copy";
import { BackButton, Cta, H2, OnbScreen, Pad } from "../src/ui/onboarding/kit";

/**
 * Test seam: the parity lane stages the code screen's states by mounting it directly (expo-router passes
 * no props, so the defaults are what ships).
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
 */
export default function VerifyScreen({
  initialCooldownS = RESEND_COOLDOWN_S,
  initialResent = false,
  initialLocked = false,
}: VerifyScreenProps = {}): React.ReactElement {
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
  const [cooldown, setCooldown] = useState(initialCooldownS);
  const [resending, setResending] = useState(false);
  const [, setResent] = useState(initialResent);
  const [locked, setLocked] = useState(initialLocked);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  // The last code we submitted — the sixth digit auto-submits once per distinct code, never in a loop.
  const tried = useRef<string | null>(null);

  useEffect(() => {
    const tick = (): void => setCooldown(Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000)));
    tick(); // recompute immediately (mount, resend, and — via AppState below — on foreground)
    const iv = setInterval(tick, 1000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [cooldownEndsAt]);

  const requestFreshCode = async (): Promise<void> => {
    if (resending || phone.length === 0) return;
    setError(null);
    setResending(true);
    try {
      const res = await requestOtp(phone);
      setDeliveryChannel(asDeliveryChannel(res.deliveryChannel));
      setResent(true);
      setLocked(false);
      setWrong(false);
      setCode("");
      tried.current = null;
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_S * 1000);
      input.current?.focus();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send a new code.");
    } finally {
      setResending(false);
    }
  };

  const submit = async (value: string): Promise<void> => {
    if (busy) return;
    tried.current = value;
    setError(null);
    setWrong(false);
    setBusy(true);
    try {
      const res = await verifyOtp(phone, value);
      await signIn({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresIn: res.expiresIn,
        profileId: res.profileId,
        role: res.role,
        needsProfile: res.needsProfile,
      });
      // A brand-new account has no name yet: C5 first, carrying the verified number, the channel that
      // verified it, and the C1 rider intent. That screen routes onward itself once the name is saved.
      if (res.needsProfile) {
        router.replace({ pathname: "/profile/setup", params: { phone, deliveryChannel, ...(intent ? { intent } : {}) } });
        return;
      }
      // No role choice screen (D-55): a saved role wins; otherwise the account starts as a customer, or
      // as a rider if it came in through C1's "Ride with LyniaGo".
      const chosen = await loadRolePreference();
      if (!chosen) void saveRolePreference(startRoleFor(null, intent));
      router.replace(signedInDestination(chosen, intent));
    } catch (e) {
      // An expired or locked code isn't a "try again" error — it needs a fresh code.
      if (e instanceof ApiError && isOtpExpiredOrLocked(e)) {
        setLocked(true);
      } else if (e instanceof ApiError && (e.status === 400 || e.status === 401 || e.status === 422)) {
        setWrong(true);
      } else {
        setError(e instanceof ApiError ? e.message : "Couldn't verify the code.");
      }
    } finally {
      setBusy(false);
    }
  };

  // The sixth digit submits (README §3 "auto-verifies, so there's no Verify button").
  useEffect(() => {
    if (code.length === CODE_LENGTH && !locked && tried.current !== code) void submit(code);
  }, [code, locked]);

  const back = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/phone");
  };

  const shown = phone ? formatPhoneDisplay(phone) : "";
  const active = Math.min(code.length, CODE_LENGTH - 1);
  // "Resend on WhatsApp" beside "Sent by SMS" contradicts itself, so an SMS send offers the screen's own
  // "Send a new code" instead (E2E 2026-10-05 P-8; ledger D-55).
  const resendLabel = deliveryChannel === "whatsapp" ? OB.resendOnWhatsApp : OB.sendNewCode;

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

          <Tappable onPress={() => input.current?.focus()} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
          {/* One real input under the six boxes: it owns the keyboard, autofill and paste. */}
          <TextInput
            ref={input}
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, "").slice(0, CODE_LENGTH));
              setWrong(false);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus={!prefilled}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            accessibilityLabel="6-digit code"
            caretHidden
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
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
            <>
              {cooldown > 0 ? (
                <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="clock" size={16} color={tokens.color.muted} />
                  <Text style={{ fontSize: 13, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{OB.resendIn(formatCountdown(cooldown))}</Text>
                </View>
              ) : null}
              <Tappable
                onPress={() => void requestFreshCode()}
                disabled={cooldown > 0 || resending}
                accessibilityRole="button"
                accessibilityLabel={resendLabel}
                accessibilityState={{ disabled: cooldown > 0 }}
                style={{ marginTop: cooldown > 0 ? 6 : 14, minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Icon name="refresh-cw" size={16} color={cooldown > 0 ? RESEND_IDLE : tokens.color.accentText} />
                <Text style={{ fontSize: 14, fontWeight: cooldown > 0 ? tokens.font.weight.regular : tokens.font.weight.semibold, color: cooldown > 0 ? RESEND_IDLE : tokens.color.accentText }}>
                  {resendLabel}
                </Text>
              </Tappable>
            </>
          )}
        </Pad>
      </OnbScreen>
    </DismissKeyboardArea>
  );
}
