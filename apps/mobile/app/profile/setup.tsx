import { useRouter } from "expo-router";
import React, { useState } from "react";
import { updateProfile } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { loadRolePreference } from "../../src/auth/session";
import { Button, ErrorText, Field, Heading, Screen, Sub } from "../../src/ui";

/**
 * Post-OTP profile setup — the "Tell us who you are" step (finding C12). A freshly-verified account is
 * created with an empty name (verifyOtp seeds firstName ""), so verify.tsx routes here FIRST when
 * `needsProfile` is true. We collect the name once, PATCH it to /auth/me, then continue to the role
 * fork (brand-new account) or straight home (a returning user who already picked a role). Mirrors the
 * design mockup's calm copy; the phone is already verified and the National ID is a deferred seam, so
 * the pilot collects just the two name fields the account record needs.
 */
export default function ProfileSetupScreen(): React.ReactElement {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the contract floor (UpdateProfileRequest: both names non-empty, ≤80) so Save can't enable
  // only to bounce off a raw server Zod error.
  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
      // Continue the sign-in fork the same way verify.tsx does for a returning user: a saved role goes
      // straight to its home, a brand-new account still sees the role picker.
      const chosen = await loadRolePreference();
      router.replace(chosen === "rider" ? "/rider" : chosen ? "/home" : "/role");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Tell us who you are</Heading>
      <Sub>Just a name for your account record — your phone is already verified.</Sub>
      <Field
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Chipo"
        maxLength={80}
        autoComplete="name-given"
        textContentType="givenName"
      />
      <Field
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Marufu"
        maxLength={80}
        autoComplete="name-family"
        textContentType="familyName"
      />
      <Button label="Save and continue" onPress={submit} loading={busy} disabled={!canSubmit} />
      <ErrorText message={error} />
    </Screen>
  );
}
