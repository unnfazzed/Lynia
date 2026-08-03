import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { updateProfile } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/auth-context";
import { loadRolePreference } from "../../src/auth/session";
import { clearProfileDraft, loadProfileDraft, profileDraftHasContent, saveProfileDraft } from "../../src/logic/profile-draft";
import { Button, ErrorText, Field, Heading, Screen, Sub } from "../../src/ui";

/**
 * Post-OTP profile setup — the "Tell us who you are" step (finding C12). A freshly-verified account is
 * created with an empty name (verifyOtp seeds firstName ""), so verify.tsx routes here FIRST when
 * `needsProfile` is true. We collect the name once, PATCH it to /auth/me, then continue to the role
 * fork (brand-new account) or straight home (a returning user who already picked a role). Mirrors the
 * design mockup's calm copy (0·6): name + a national ID for the account record. The phone is already
 * verified on WhatsApp.
 *
 * LC-C10: this collects the exact same fields (name + national ID) as the become-a-rider KYC form, which
 * already survives an app kill via `kyc-draft.ts` — this screen previously held them in plain React state
 * with no durable draft, so an OS-level kill while typing (this is often the FIRST screen a brand-new
 * account ever sees, right after the OTP hand-off) silently lost the typed name/ID. Mirrors the same
 * hydrate-then-persist-then-clear pattern via `profile-draft.ts`.
 */
export default function ProfileSetupScreen(): React.ReactElement {
  const router = useRouter();
  const { session, signIn } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  // Gate persistence until the initial load runs, so we don't clobber a stored draft with empty state.
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await loadProfileDraft();
      if (cancelled) {
        hydrated.current = true;
        return;
      }
      if (d && profileDraftHasContent(d)) {
        setFirstName(d.firstName);
        setLastName(d.lastName);
        setIdNumber(d.idNumber);
        setDraftRestored(true);
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the draft (encrypted, on-device only) as fields change, after initial hydration.
  useEffect(() => {
    if (!hydrated.current) return;
    void saveProfileDraft({ firstName, lastName, idNumber });
  }, [firstName, lastName, idNumber]);

  // Mirror the contract floor (UpdateProfileRequest: both names non-empty ≤80, idNumber 4–40) so Save
  // can't enable only to bounce off a raw server Zod error.
  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && idNumber.trim().length >= 4;

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), idNumber: idNumber.trim() });
      // The draft has served its purpose — wipe the stored national ID immediately rather than leaving
      // it in the keystore any longer than needed (mirrors become.tsx clearing the KYC draft on submit).
      void clearProfileDraft();
      // BH-15: clear the durable needsProfile flag now that the PATCH actually landed, so index.tsx's
      // bootstrap redirect stops sending this account back here on future launches.
      if (session) await signIn({ ...session, needsProfile: false });
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
      {draftRestored ? (
        <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.accentText, marginBottom: tokens.space.xs }}>
          We saved what you&apos;d filled in — pick up where you left off.
        </Text>
      ) : null}
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
      {/* National ID stored on the account record (0·6). Default (text) keyboard:
          Zimbabwean IDs are alphanumeric (e.g. "63-123456-A-42"), so a number pad would block them. */}
      <Field
        label="National ID number"
        value={idNumber}
        onChangeText={setIdNumber}
        placeholder="63-123456-A-42"
        maxLength={40}
        hint="Stored on your account record."
      />
      <Button label="Save and continue" onPress={submit} loading={busy} disabled={!canSubmit} />
      <ErrorText message={error} />
    </Screen>
  );
}
