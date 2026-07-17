import { tokens } from "@lynia/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { requestOtp, verifyOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/auth-context";
import { loadRolePreference } from "../src/auth/session";
import { RESEND_COOLDOWN_S, formatCountdown, isOtpExpiredOrLocked } from "../src/logic/otp";
import { Button, ErrorText, Field, Heading, Icon, Screen, Sub } from "../src/ui";

export default function VerifyScreen(): React.ReactElement {
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; devCode?: string }>();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const prefilled = typeof params.devCode === "string" && params.devCode.length > 0;
  const [code, setCode] = useState(prefilled ? (params.devCode as string) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Resend affordance (C3): a visible cooldown so the user isn't left tapping "Back" when the code
  // never arrives. `resent` shows a calm confirmation after a successful resend; the countdown starts
  // ticking on arrival (a code was just sent from the phone screen) and resets after each resend.
  // Anchored to an absolute deadline (not a decrementing counter): reading the code means backgrounding
  // to WhatsApp, which pauses JS timers — so a relative countdown would freeze and block "Resend" for
  // longer than the real 60s. We derive the remaining seconds from the wall clock instead.
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number>(() => Date.now() + RESEND_COOLDOWN_S * 1000);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  // Expiry / lockout recovery (A0-1 / R0-1): the entered code expired (TTL) or the record is locked
  // (too many wrong tries). We stop offering "Verify" on a code the server will never accept and
  // promote "Send a fresh code" instead — a resend mints a new code AND resets attempts server-side,
  // so recovery is a single tap and never a dead end.
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const tick = (): void => setCooldown(Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000)));
    tick(); // recompute immediately (mount, resend, and — via AppState below — on foreground)
    const iv = setInterval(tick, 1000);
    // Backgrounding pauses the interval; recompute from the wall clock the instant we return so the
    // countdown reflects the real elapsed time rather than resuming where it froze.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [cooldownEndsAt]);

  // Request a brand-new code. Used by both the throttled "Resend" affordance and the "Send a fresh
  // code" recovery action; the latter bypasses the UI cooldown gate because a locked/expired user needs
  // a new code now (the server's own rate limit is the real guard).
  const requestFreshCode = async (): Promise<void> => {
    if (resending || phone.length === 0) return;
    setError(null);
    setResending(true);
    try {
      await requestOtp(phone);
      setResent(true);
      setLocked(false);
      setCode("");
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_S * 1000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send a new code.");
    } finally {
      setResending(false);
    }
  };

  const resend = (): void => {
    if (cooldown > 0) return;
    void requestFreshCode();
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const res = await verifyOtp(phone, code.trim());
      await signIn({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresIn: res.expiresIn,
        profileId: res.profileId,
        role: res.role,
        needsProfile: res.needsProfile,
      });
      // A brand-new account has no name yet (verifyOtp seeds firstName ""); collect it on the
      // profile-setup step FIRST (finding C12) before the role fork / home. That screen routes onward
      // to /role or /home itself once the name is saved.
      if (res.needsProfile) {
        router.replace("/profile/setup");
        return;
      }
      // Show the role fork once per account (RIDER-JOURNEY-AUDIT R0-4). A returning user who already
      // picked a role goes straight home rather than being re-prompted every sign-in.
      const chosen = await loadRolePreference();
      // Route to the saved role's home (mirrors role.tsx's go()): a returning rider lands on the rider
      // dashboard, a customer on compose, and a brand-new account still sees the role fork (R3).
      router.replace(chosen === "rider" ? "/rider" : chosen ? "/home" : "/role");
    } catch (e) {
      // An expired or locked code isn't a "try again" error — it needs a fresh code. Drop into the
      // recovery state (info card + "Send a fresh code") instead of a raw error the user can't act on.
      if (e instanceof ApiError && isOtpExpiredOrLocked(e)) {
        setLocked(true);
        setError(null);
      } else {
        setLocked(false);
        setError(e instanceof ApiError ? e.message : "Couldn't verify the code.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Enter your code</Heading>
      {/* On a QA build the code arrives pre-filled (console OTP channel) — no message was sent, so
          don't claim one was. Real users still see the "we sent a code" copy. */}
      <Sub>{prefilled ? "Test build: code pre-filled — tap Verify." : `We sent a 6-digit code to ${phone || "your phone"}.`}</Sub>

      {/* Calm confirmation after a resend, announced to screen readers. */}
      {resent && !locked ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tokens.space.sm,
            paddingVertical: tokens.space.sm,
            paddingHorizontal: tokens.space.md,
            borderRadius: tokens.radius.input,
            backgroundColor: tokens.color.accentWash,
            marginBottom: tokens.space.sm,
          }}
        >
          <Icon name="check" size={16} color={tokens.color.accentText} />
          <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
            A fresh code is on its way — check your messages.
          </Text>
        </View>
      ) : null}

      <Field
        label="6-digit code"
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (locked) setLocked(false);
        }}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        error={locked ? "That code won't work anymore — send a fresh one below." : undefined}
      />

      {locked ? (
        // Recovery, not a dead end: one tap issues a new code and resets the attempt counter server-side.
        <>
          <View
            style={{
              padding: tokens.space.md,
              borderRadius: tokens.radius.input,
              backgroundColor: tokens.color.surface,
              marginBottom: tokens.space.sm,
            }}
          >
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
              Codes expire, and too many wrong tries locks one. Send a fresh code — it resets your tries, too.
            </Text>
          </View>
          <Button label="Send a fresh code" onPress={() => void requestFreshCode()} loading={resending} />
        </>
      ) : (
        <>
          <Button label="Verify" onPress={submit} loading={busy} disabled={code.trim().length !== 6} />
          <Button
            label={cooldown > 0 ? `Resend code in ${formatCountdown(cooldown)}` : "Resend code"}
            variant="ghost"
            onPress={resend}
            loading={resending}
            disabled={cooldown > 0}
          />
        </>
      )}

      <Button label="Back" variant="ghost" onPress={() => router.back()} />
      <ErrorText message={error} />
    </Screen>
  );
}
