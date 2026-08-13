import { formatPhoneLocal, normalizeNationalId, tokens } from "@lynia/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { updateProfile } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/auth-context";
import { loadRolePreference } from "../../src/auth/session";
import { clearProfileDraft, loadProfileDraft, profileDraftHasContent, saveProfileDraft } from "../../src/logic/profile-draft";
import { Button, Field, Heading, Icon, Screen, Sub, useActionError } from "../../src/ui";

/**
 * The mock (screens.jsx `Register`) draws a single "Full name" field; the account record and the
 * update-profile contract still carry firstName + lastName separately, so we hold one editable string
 * here and split it at the two boundaries that need the halves — the durable draft and the PATCH. The
 * first whitespace-run splits given name from the rest (family name), matching how the draft used to
 * store the two fields directly.
 */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

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
  // The just-verified number, threaded from verify.tsx; shown read-only in the "Verified" phone field.
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const [fullName, setFullName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12). Same `setError(msg)` shape as the useState setter it replaces.
  const setError = useActionError();
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
        setFullName([d.firstName, d.lastName].filter(Boolean).join(" "));
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
    void saveProfileDraft({ ...splitName(fullName), idNumber });
  }, [fullName, idNumber]);

  // Mirror the contract floor (UpdateProfileRequest: both names non-empty ≤80, idNumber 4–40) so Save
  // can't enable only to bounce off a raw server Zod error. The single name field must split into a
  // given AND a family name for that to hold.
  const { firstName, lastName } = splitName(fullName);
  const canSubmit = firstName.length > 0 && lastName.length > 0 && idNumber.trim().length >= 4;

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await updateProfile({ firstName, lastName, idNumber: normalizeNationalId(idNumber) });
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
      <Sub>You&apos;re sending parcels. Just a name and ID for your account record — no documents, no verification.</Sub>
      {draftRestored ? (
        <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.accentText, marginBottom: tokens.space.xs }}>
          We saved what you&apos;d filled in — pick up where you left off.
        </Text>
      ) : null}
      <Field
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Chipo Marufu"
        maxLength={80}
        autoComplete="name"
        textContentType="name"
      />
      {/* The phone is already verified (OTP) — a read-only display with the "Verified" badge the mock
          draws, not an editable field. */}
      <View>
        <Field
          label="Phone number"
          value={formatPhoneLocal(phone)}
          onChangeText={() => {}}
          editable={false}
          keyboardType="phone-pad"
          hint="Verified by SMS ✓"
        />
        <View style={{ position: "absolute", top: 30, right: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="check" size={13} color={tokens.color.accentText} />
          <Text style={{ fontSize: 11.5, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>Verified</Text>
        </View>
      </View>
      {/* National ID stored on the account record (0·6). Default (text) keyboard:
          Zimbabwean IDs are alphanumeric (e.g. "63123456A42"), so a number pad would block them.
          Placeholder is dash-free — customers enter the ID plain; spaces/dashes are normalised on save. */}
      <Field
        label="National ID number"
        value={idNumber}
        onChangeText={setIdNumber}
        placeholder="63123456A42"
        maxLength={40}
        hint="Stored on your account only — we don't verify it. Riders go through a separate ID check."
      />
      <Button label="Continue" onPress={submit} loading={busy} disabled={!canSubmit} />
    </Screen>
  );
}
