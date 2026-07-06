import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { ApiError } from "../src/api/client";
import { getMe } from "../src/api/auth";
import { completeProfile } from "../src/api/riders";
import { Button, ErrorText, Field, Heading, Icon, Screen, Sub } from "../src/ui";

/**
 * Customer registration (customer-journey 0·6). After picking "Send a parcel" at the role fork, a
 * first-time account records a name + national ID for the account record — NOT verified, no KYC
 * (that's the rider path). Reuses `completeProfile` (the same endpoint the rider KYC form calls first),
 * so a customer who later becomes a rider isn't asked for their name/ID twice (the S12 no-double-entry
 * decision). The phone is already verified on WhatsApp at this point, so it's shown read-only.
 */
export default function RegisterScreen(): React.ReactElement {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  // Best-effort: show the verified number so the "verified ✓" affordance reads true. A failure just
  // hides the row — registration doesn't depend on it.
  React.useEffect(() => {
    let alive = true;
    void getMe()
      .then((me) => {
        if (alive) setPhone(me.phone);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && idNumber.trim().length >= 4;

  const submit = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await completeProfile({ firstName: firstName.trim(), lastName: lastName.trim(), idNumber: idNumber.trim() });
      // First-run continues into permission priming (0·7/0·8) before landing home.
      router.replace("/permissions");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Tell us who you are</Heading>
      <Sub>You&apos;re sending parcels. Just a name and ID for your account record — no documents, no verification.</Sub>

      <Field label="Full name" value={firstName} onChangeText={setFirstName} placeholder="Chipo" maxLength={80} />
      <Field label="Surname" value={lastName} onChangeText={setLastName} placeholder="Marufu" maxLength={80} />

      {phone ? (
        <View>
          <Field label="Phone number" value={phone} onChangeText={() => undefined} hint="Verified on WhatsApp ✓" />
          <View style={{ position: "absolute", top: 28, right: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="check" size={13} color={tokens.color.accentText} />
          </View>
        </View>
      ) : null}

      {/* Default (text) keyboard — Zimbabwean national IDs are alphanumeric (e.g. "63-123456 A 12"). */}
      <Field
        label="National ID number"
        value={idNumber}
        onChangeText={setIdNumber}
        placeholder="63-123456-A-42"
        maxLength={40}
        hint="Stored on your account only — we don't verify it. Riders go through a separate ID check."
      />

      <Button label="Continue" onPress={submit} loading={busy} disabled={!canSubmit} />
      <ErrorText message={error} />
    </Screen>
  );
}
