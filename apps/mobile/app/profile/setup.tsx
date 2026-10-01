import { formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { updateProfile } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/auth-context";
import { loadRolePreference, saveRolePreference } from "../../src/auth/session";
import { clearProfileDraft, loadProfileDraft, profileDraftHasContent, saveProfileDraft } from "../../src/logic/profile-draft";
import { parseSignInIntent, signedInDestination, startRoleFor } from "../../src/logic/sign-in-route";
import { DismissKeyboardArea, Icon, useActionError } from "../../src/ui";
import { OB } from "../../src/ui/onboarding/copy";
import { Cta, FieldLabel, H2, Note, OnbScreen, Pad, Sub } from "../../src/ui/onboarding/kit";

/**
 * C5 · Name (Calm Mint v2, `packages/design/handoff/calm-mint-v2-2026-10` README §3; ledger D-55): the
 * last of the four screens to Home. "What should riders call you?", First name + Surname side by side,
 * the verified phone row, the "No ID needed" note, and "Start using LyniaGo".
 *
 * No national ID at sign-up any more (owner decision, D-55): the profile is saved with the name only —
 * the API has accepted that since the customer-only iPhone build (D-41) — and an ID can be added later
 * in Account. No role choice either: the account starts as a customer, or as a rider when it came in
 * through C1's "Ride with LyniaGo" (`intent`).
 *
 * The half-filled form survives an app kill (logic/profile-draft.ts), as before.
 */
function NameField({ label, value, onChangeText, autoComplete }: { label: string; value: string; onChangeText: (v: string) => void; autoComplete: "given-name" | "family-name" }): React.ReactElement {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={label}
        autoComplete={autoComplete}
        textContentType={autoComplete === "given-name" ? "givenName" : "familyName"}
        autoCapitalize="words"
        maxLength={60}
        style={{
          height: tokens.touchTargetPrimary,
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          paddingHorizontal: 14,
          fontSize: 17,
          color: tokens.color.ink,
        }}
      />
    </View>
  );
}

export default function ProfileSetupScreen(): React.ReactElement {
  const router = useRouter();
  const { updateSession } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; deliveryChannel?: string; intent?: string }>();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const intent = parseSignInIntent(params.intent);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const setError = useActionError();
  const [draftRestored, setDraftRestored] = useState(false);
  const hydrated = useRef(false);

  // Restore a half-filled form from before an app kill.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await loadProfileDraft();
      if (!cancelled && d && profileDraftHasContent(d)) {
        setFirstName(d.firstName);
        setLastName(d.lastName);
        setDraftRestored(!!(d.firstName || d.lastName));
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    void saveProfileDraft({ firstName: firstName.trim(), lastName: lastName.trim(), idNumber: "" });
  }, [firstName, lastName]);

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;

  const submit = async (): Promise<void> => {
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
      void clearProfileDraft();
      await updateSession({ needsProfile: false });
      const chosen = await loadRolePreference();
      if (!chosen) void saveRolePreference(startRoleFor(null, intent));
      router.replace(signedInDestination(chosen, intent));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DismissKeyboardArea>
      <OnbScreen footer={<Cta label={OB.startUsing} onPress={() => void submit()} busy={busy} disabled={!canSubmit} />}>
        <Pad>
          <H2>{OB.nameTitle}</H2>
          <Sub>{OB.nameSub}</Sub>
          {draftRestored ? (
            <Text style={{ marginTop: -12, marginBottom: 12, fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{OB.draftRestored}</Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <NameField label={OB.firstName} value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
            <NameField label={OB.surname} value={lastName} onChangeText={setLastName} autoComplete="family-name" />
          </View>
          {phone ? (
            <View
              accessible
              accessibilityLabel={`${formatPhoneDisplay(phone)}, ${OB.verified}`}
              style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: tokens.color.surface }}
            >
              <Icon name="circle-check" size={18} color={tokens.color.accent} />
              <Text style={{ fontSize: 14, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatPhoneDisplay(phone)}</Text>
              <Text style={{ marginLeft: "auto", fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{OB.verified}</Text>
            </View>
          ) : null}
          <Note icon="id-card">{OB.noIdNote}</Note>
        </Pad>
      </OnbScreen>
    </DismissKeyboardArea>
  );
}
