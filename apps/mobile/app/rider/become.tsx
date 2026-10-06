import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { ApiError } from "../../src/api/client";
import { getMe, updateProfile } from "../../src/api/auth";
import { becomeRider, noteKycLaunched } from "../../src/api/riders";
import { saveRolePreference } from "../../src/auth/session";
import { KycCheckHost } from "../../src/kyc/KycCheckHost";
import { recordKycLaunch } from "../../src/kyc/launch-hint";
import { runKycVerification } from "../../src/kyc/verify";
import { clearKycDraft, kycDraftHasContent, loadKycDraft, saveKycDraft } from "../../src/logic/kyc-draft";
import { DismissKeyboardArea, useActionError } from "../../src/ui";
import { OB, RO } from "../../src/ui/onboarding/copy";
import { Cta, H2, NameFields, OnbScreen, Pad, Sub, VerifiedPhoneRow } from "../../src/ui/onboarding/kit";
import { RiderIntro } from "../../src/ui/onboarding/rider";
import { useWalletConfig } from "../../src/query/use-wallet";

/**
 * Become a rider: Calm Mint v2 R1 "Why ride", then straight to the ID check, then the rider board.
 *
 * - No national ID is typed before the check (owner 2026-10-03, ledger D-75): the number is confirmed
 *   from the check afterwards — the server adopts the number the check verified (Calm Mint v2 §5).
 * - No rider photo either (D-62): it is optional and added later from Settings → Bike & documents.
 * - The only thing ever asked first is the NAME, and only on a legacy account without one, in C5's own
 *   grammar (the two name fields, the verified phone row) — then on to the check.
 * - However the check ends, the rider lands on the board, which draws every outcome: First Run v2's F pages
 *   (F8 while it is sent, F3 after a cancel, F1 in manual mode, F4 on a decline … — ledger D-81), Calm Mint
 *   v2 R2 while the automated check runs, R3 once verified.
 * - G1 (D-81): this is the first rider screen. C1 "Ride with LyniaGo" → OTP → here, and a non-rider reaching
 *   the board is sent here; no permission priming before it (the rider permission flow follows R3).
 */
export default function BecomeRiderScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  // CF-02-SIB-3: same-tick double-submit guard for `submit` below — see the ref's use for why a plain
  // `busy` state boolean isn't enough.
  const submitInFlightRef = useRef(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12).
  const setError = useActionError();
  const [draftRestored, setDraftRestored] = useState(false);
  // R1 first; the name step exists only for an account without a name. Once shown it stays until the
  // screen hands over to the check and the board, even after the name is saved.
  const [step, setStep] = useState<"intro" | "name">("intro");
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const needName = !!me && (!me.firstName?.trim() || !me.lastName?.trim());
  // D-70: the commission-free first jobs exist on this server, so R1's note can say so in full.
  const { config: walletConfig } = useWalletConfig();
  const freeJobs = (walletConfig?.freeFirstJobs ?? 0) > 0;
  // Gate persistence until the initial load runs, so we don't clobber a stored draft with empty state.
  const hydrated = useRef(false);

  // Rehydrate the name draft once on mount (an app kill must not wipe a half-typed name). A draft from
  // before D-75 may still hold a national ID: one with no name is cleared outright, and one with a name
  // is rewritten name-only by the save below, so no stored ID outlives the first visit.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await loadKycDraft();
      if (!cancelled && d && kycDraftHasContent(d)) {
        setFirstName(d.firstName);
        setLastName(d.lastName);
        setDraftRestored(true);
      } else if (!cancelled && d) {
        void clearKycDraft();
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A restored draft skips R1 — the rider already said yes once — when the name is still missing.
  useEffect(() => {
    if (draftRestored && needName) setStep("name");
  }, [draftRestored, needName]);

  // Persist the draft (on-device keystore only) as the name changes, after initial hydration.
  useEffect(() => {
    if (!hydrated.current) return;
    void saveKycDraft({ firstName, lastName });
  }, [firstName, lastName]);

  const namesReady = firstName.trim().length > 0 && lastName.trim().length > 0;

  /**
   * Hand over to the board, saved as the side the next cold start opens on (R-5).
   *
   * First Run v2 (ledger D-81): G1 — the board no longer pushes this screen over itself (its "Earn with your
   * bike" interstitial is gone; a non-rider reaching `/rider` is REPLACED by this screen), so there is never
   * a board below to go back to and a `replace` mounts exactly one. Owner #5 — no permission priming before
   * the board: the rider permission flow runs after R3 "You're verified", before going online. The board
   * shows the check's outcome from here (F8 while it is sent, R2, F1–F7, R3).
   *
   * `me` is re-read first, so the board reads the new rider record instead of bouncing a cached customer
   * `me` (no rider yet) back here.
   */
  const handOver = async (): Promise<void> => {
    void saveRolePreference("rider");
    await qc.refetchQueries({ queryKey: ["me"] }).catch(() => undefined);
    router.replace("/rider");
  };

  const submit = async (withName: boolean): Promise<void> => {
    // CF-02-SIB-3: `busy` (React state) only reflects the FIRST of two same-tick taps — the second
    // tap's re-render hasn't landed yet, so a fast double-tap fired becomeRider() twice (each opening its
    // own paid Didit session server-side). A synchronous ref checked-and-set before any await.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setError(null);
    setBusy(true);
    try {
      // C5's own save — the name only (PATCH /auth/me). There is no ID to send: D-75.
      if (withName) await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
      const res = await becomeRider({});
      // The rider is registered — the draft has served its purpose.
      void clearKycDraft();
      // The account is a rider now: refresh `me` while the check is open, so the board this hands over
      // to reads the rider record rather than the cached customer one.
      void qc.invalidateQueries({ queryKey: ["me"] });
      // The check opens over this screen — the in-app ID-check sheet (KycCheckHost, mounted below),
      // falling back to the in-app browser tab when the sheet can't present. `runKycVerification`
      // never throws. Manual review (and the QA stub's instant pass) returns no session to open.
      if (res.sessionToken || res.verificationUrl) {
        const launch = await runKycVerification({ sessionToken: res.sessionToken, verificationUrl: res.verificationUrl });
        // R-4 / R-10: the board picks the page, so it gets the outcome — "completed" is F8 "Sending your ID"
        // while the vendor catches up, "failed" lands on F7 "Couldn't open the ID check" (with WhatsApp help),
        // not F3 "Almost there".
        recordKycLaunch(launch.outcome);
        if (launch.outcome === "completed") void noteKycLaunched();
      }
      // However it went, the board shows the right page from here: F8 while it is sent, R2 while the
      // automated check runs, R3 once verified, F3 after a cancel, F1 in manual mode (D-81).
      await handOver();
    } catch (e) {
      // BH-04: a lost-response retry on `becomeRider` hits this exact 409 — the FIRST submit already
      // landed server-side (and since R-10 so does the loser of a double-tap race), so the board
      // re-reads the real (already-registered) state.
      if (e instanceof ApiError && e.code === "already_rider") {
        void clearKycDraft();
        await handOver();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Couldn't start rider setup.");
    } finally {
      submitInFlightRef.current = false;
      setBusy(false);
    }
  };

  // R1 "Start ID check": the check opens right away unless the account has no name (legacy accounts
  // only) — then C5's name step first. The name decides the path, so wait for `me` if it isn't here yet.
  const start = async (): Promise<void> => {
    if (submitInFlightRef.current) return;
    let current = me;
    if (!current) {
      // R-10: reading `me` can take a while on a slow link — show the button busy (and hold a second tap)
      // instead of a dead-looking "Start ID check".
      submitInFlightRef.current = true;
      setBusy(true);
      try {
        current = (await meQ.refetch()).data;
      } finally {
        submitInFlightRef.current = false;
        setBusy(false);
      }
    }
    if (!current) {
      setError("Couldn't start rider setup.");
      return;
    }
    if (!current.firstName?.trim() || !current.lastName?.trim()) {
      setStep("name");
      return;
    }
    await submit(false);
  };

  const page =
    step === "name" ? (
      <DismissKeyboardArea>
        {/* C5 · Name's grammar (Calm Mint v2 §3): the title, the two fields side by side, the verified
            phone. Its "No ID needed" note is not drawn here — the ID check is the next step. */}
        <OnbScreen footer={<Cta label={RO.startIdCheck} onPress={() => void submit(true)} busy={busy} disabled={!namesReady} />}>
          <Pad>
            <H2>{OB.nameTitle}</H2>
            <Sub>{OB.nameSub}</Sub>
            {draftRestored ? (
              <Text style={{ marginTop: -12, marginBottom: 12, fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{OB.draftRestored}</Text>
            ) : null}
            <NameFields firstName={firstName} lastName={lastName} onFirstName={setFirstName} onLastName={setLastName} />
            {me?.phone ? <VerifiedPhoneRow phone={me.phone} /> : null}
          </Pad>
        </OnbScreen>
      </DismissKeyboardArea>
    ) : (
      <RiderIntro busy={busy} freeJobs={freeJobs} onStart={() => void start()} />
    );

  return (
    <>
      {page}
      {/* Presents the in-app ID-check sheet when submit's runKycVerification launches (src/kyc). Mounted
          on every step, so the check opened straight from R1 gets the sheet, not the browser fallback. */}
      <KycCheckHost />
    </>
  );
}
