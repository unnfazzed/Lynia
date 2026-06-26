import { useRouter } from "expo-router";
import React, { useState } from "react";
import { requestOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { Button, ErrorText, Field, Heading, Screen, Sub } from "../src/ui";

export default function PhoneScreen(): React.ReactElement {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(phone.trim());
      // devCode is present only on the console channel outside production — prefill it for local dev.
      router.push({ pathname: "/verify", params: { phone: phone.trim(), devCode: res.devCode ?? "" } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the code. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Welcome to Lynia</Heading>
      <Sub>Enter your phone number to get a one-time code.</Sub>
      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+263 77 000 0000"
        keyboardType="phone-pad"
        maxLength={20}
      />
      <Button label="Send code" onPress={submit} loading={busy} disabled={phone.trim().length < 6} />
      <ErrorText message={error} />
    </Screen>
  );
}
