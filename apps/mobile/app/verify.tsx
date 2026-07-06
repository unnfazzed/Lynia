import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { requestOtp, verifyOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/auth-context";
import { loadRolePreference } from "../src/auth/session";
import { Button, ErrorText, Field, Heading, Screen, Sub } from "../src/ui";

// Seconds to wait before a resend is allowed again (C3) — starts ticking on arrival since a code was
// just sent from the phone screen, and resets after each resend.
const RESEND_COOLDOWN_S = 30;

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
  // never arrives / expires / locks. `resent` shows a calm confirmation after a successful resend.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async (): Promise<void> => {
    if (cooldown > 0 || resending || phone.length === 0) return;
    setError(null);
    setResending(true);
    try {
      await requestOtp(phone);
      setResent(true);
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't resend the code.");
    } finally {
      setResending(false);
    }
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
      setError(e instanceof ApiError ? e.message : "Couldn't verify the code.");
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
      <Field
        label="6-digit code"
        value={code}
        onChangeText={setCode}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      <Button label="Verify" onPress={submit} loading={busy} disabled={code.trim().length !== 6} />
      <Button
        label={cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        variant="ghost"
        onPress={resend}
        loading={resending}
        disabled={cooldown > 0}
      />
      {resent && cooldown > 0 ? <Sub>New code sent.</Sub> : null}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
      <ErrorText message={error} />
    </Screen>
  );
}
