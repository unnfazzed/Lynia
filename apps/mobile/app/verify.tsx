import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { verifyOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/auth-context";
import { loadRolePreference } from "../src/auth/session";
import { Button, ErrorText, Field, Heading, Screen, Sub } from "../src/ui";

export default function VerifyScreen(): React.ReactElement {
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; devCode?: string }>();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const prefilled = typeof params.devCode === "string" && params.devCode.length > 0;
  const [code, setCode] = useState(prefilled ? (params.devCode as string) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Show the role fork once per account (RIDER-JOURNEY-AUDIT R0-4). A returning user who already
      // picked a role goes straight home rather than being re-prompted every sign-in. A brand-new
      // account (needsProfile) carries that flag into the fork so a customer lands on registration
      // (0·6) before home; a returning one skips it.
      const chosen = await loadRolePreference();
      if (chosen) {
        router.replace("/home");
      } else {
        router.replace({ pathname: "/role", params: { needsProfile: res.needsProfile ? "1" : "" } });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't verify the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Check your WhatsApp</Heading>
      {/* On a QA build the code arrives pre-filled (console OTP channel) — no message was sent, so
          don't claim one was. Real users still see the "we sent a code on WhatsApp" copy. */}
      <Sub>{prefilled ? "Test build: code pre-filled — tap Verify." : `We sent a 6-digit code to ${phone || "your phone"} on WhatsApp.`}</Sub>
      <Field
        label="6-digit code"
        value={code}
        onChangeText={setCode}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        hint="No WhatsApp on this number? Contact support to sign up."
      />
      <Button label="Verify" onPress={submit} loading={busy} disabled={code.trim().length !== 6} />
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
      <ErrorText message={error} />
    </Screen>
  );
}
