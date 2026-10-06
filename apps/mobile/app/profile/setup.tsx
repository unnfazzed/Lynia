import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text } from "react-native";
import { getMe, updateProfile } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/auth-context";
import { loadRolePreference, saveRolePreference } from "../../src/auth/session";
import { replaceClearingStack } from "../../src/logic/nav";
import { clearProfileDraft, loadProfileDraft, profileDraftHasContent, saveProfileDraft } from "../../src/logic/profile-draft";
import { parseSignInIntent, signedInDestination, startRoleFor } from "../../src/logic/sign-in-route";
import { DismissKeyboardArea, useActionError } from "../../src/ui";
import { OB } from "../../src/ui/onboarding/copy";
import { Cta, H2, NameFields, Note, OnbScreen, Pad, Sub, VerifiedPhoneRow } from "../../src/ui/onboarding/kit";

/** How long typing must pause before the draft is written to the keystore (not on every keystroke). */
const DRAFT_SAVE_DEBOUNCE_MS = 500;

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
 * An app killed here relaunches straight onto this screen with no route params (boot-route.ts), so
 * neither the rider intent nor the verified number may live only in the params (start-up review
 * 2026-10-06, C-4): the intent falls back to the one kept with the session, the number to `/auth/me`.
 * The half-filled form survives the kill too (logic/profile-draft.ts).
 */
export default function ProfileSetupScreen(): React.ReactElement {
  const router = useRouter();
  const { session, updateSession } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; intent?: string }>();
  const paramPhone = typeof params.phone === "string" ? params.phone : "";
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe, enabled: paramPhone.length === 0 && !!session });
  const phone = paramPhone || meQ.data?.phone || "";
  const intent = parseSignInIntent(params.intent) ?? parseSignInIntent(session?.signupIntent);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const setError = useActionError();
  const [draftRestored, setDraftRestored] = useState(false);
  const hydrated = useRef(false);

  // The draft write is debounced: an encrypted keystore write per keystroke is slow on low-end Android.
  // A pending write is flushed when the app goes to the background (the moment before the OS may kill it)
  // and when the screen unmounts; once the name is saved, nothing is written again.
  const latest = useRef({ firstName: "", lastName: "" });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);
  const flushDraft = useCallback((): void => {
    if (!pending.current) return;
    clearTimeout(pending.current);
    pending.current = null;
    if (!finished.current) void saveProfileDraft(latest.current);
  }, []);

  // Restore a half-filled form from before an app kill.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await loadProfileDraft();
      if (!cancelled && d && profileDraftHasContent(d)) {
        setFirstName(d.firstName);
        setLastName(d.lastName);
        setDraftRestored(true);
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current || finished.current) return;
    latest.current = { firstName: firstName.trim(), lastName: lastName.trim() };
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      if (!finished.current) void saveProfileDraft(latest.current);
    }, DRAFT_SAVE_DEBOUNCE_MS);
  }, [firstName, lastName]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") flushDraft();
    });
    return () => {
      sub.remove();
      flushDraft();
    };
  }, [flushDraft]);

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;

  const submit = async (): Promise<void> => {
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
      // The draft has served its purpose: drop any write still waiting, then the stored one.
      finished.current = true;
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      void clearProfileDraft();
      await updateSession({ needsProfile: false, signupIntent: undefined });
      const chosen = await loadRolePreference();
      if (!chosen) void saveRolePreference(startRoleFor(null, intent, session?.role));
      // Clear the stack: Back from the app must not return to sign-up (C-1).
      replaceClearingStack(router, signedInDestination(chosen, intent, session?.role));
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
          <NameFields firstName={firstName} lastName={lastName} onFirstName={setFirstName} onLastName={setLastName} onSubmit={() => void submit()} />
          {phone ? <VerifiedPhoneRow phone={phone} /> : null}
          <Note icon="id-card">{OB.noIdNote}</Note>
        </Pad>
      </OnbScreen>
    </DismissKeyboardArea>
  );
}
