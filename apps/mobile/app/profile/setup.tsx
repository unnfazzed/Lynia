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
 * design mockup's calm copy (0·6): name + a national ID for the account record. The phone is already
 * verified on WhatsApp.
 */
export default function ProfileSetupScreen(): React.ReactElement {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the contract floor (UpdateProfileRequest: both names non-empty ≤80, idNumber 4–40) so Save
  // can't enable only to bounce off a raw server Zod error.
  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && idNumber.trim().length >= 4;

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), idNumber: idNumber.trim() });
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
      <Sub>A name and ID for your account record. Your phone is already verified.</Sub>
      <Field
        testID="profile-first-name"
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Chipo"
        maxLength={80}
        autoComplete="name-given"
        textContentType="givenName"
      />
      <Field
        testID="profile-last-name"
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Marufu"
        maxLength={80}
        autoComplete="name-family"
        textContentType="familyName"
      />
      {/* National ID stored on the account record (0·6). Default (text) keyboard:
          Zimbabwean IDs are alphanumeric (e.g. "63-123456-A-42"), so a number pad would block them. */}
      <Field
        testID="profile-id-number"
        label="National ID number"
        value={idNumber}
        onChangeText={setIdNumber}
        placeholder="63-123456-A-42"
        maxLength={40}
        hint="Stored on your account record."
      />
      <Button testID="profile-submit" label="Save and continue" onPress={submit} loading={busy} disabled={!canSubmit} />
      <ErrorText message={error} />
    </Screen>
  );
}
