import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { requestOtp } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import { BrandLockup, Button, ErrorText, Field, Heading, Screen, Sub } from "../src/ui";

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
      <View style={{ marginBottom: 24 }}>
        <BrandLockup size={40} />
      </View>
      <Heading>Welcome to LyniaGo</Heading>
      <Sub>Enter your phone number to get a one-time code.</Sub>
      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+263 77 000 0000"
        keyboardType="phone-pad"
        maxLength={20}
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <Button label="Send code" onPress={submit} loading={busy} disabled={phone.trim().length < 6} />
      <ErrorText message={error} />
    </Screen>
  );
}
