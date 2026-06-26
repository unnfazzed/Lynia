import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { verifyOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/auth-context";
import { Button, ErrorText, Field, Heading, Screen, Sub } from "../src/ui";

export default function VerifyScreen(): React.ReactElement {
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; devCode?: string }>();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const [code, setCode] = useState(typeof params.devCode === "string" ? params.devCode : "");
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
      router.replace("/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't verify the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Enter your code</Heading>
      <Sub>We sent a 6-digit code to {phone || "your phone"}.</Sub>
      <Field label="6-digit code" value={code} onChangeText={setCode} placeholder="000000" keyboardType="number-pad" maxLength={6} />
      <Button label="Verify" onPress={submit} loading={busy} disabled={code.trim().length !== 6} />
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
      <ErrorText message={error} />
    </Screen>
  );
}
