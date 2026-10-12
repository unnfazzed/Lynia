import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, Text } from "react-native";
import { ApiError } from "../../src/api/client";
import { getMe, type Me, updateProfile } from "../../src/api/auth";
import { becomeRider, noteKycLaunched } from "../../src/api/riders";
import { saveRolePreference } from "../../src/auth/session";
import { KycCheckHost } from "../../src/kyc/KycCheckHost";
import { recordKycLaunch } from "../../src/kyc/launch-hint";
import { primeKycCamera, runKycVerification } from "../../src/kyc/verify";
import { withRiderStub } from "../../src/logic/become-state";
import { KYC_RETRY_TRY_LATER } from "../../src/logic/gates";
import { clearKycDraft, kycDraftHasContent, loadKycDraft, saveKycDraft } from "../../src/logic/kyc-draft";
import { DismissKeyboardArea, useActionError } from "../../src/ui";
import { PD } from "../../src/ui/firstrun/copy";
import { OB, RO } from "../../src/ui/onboarding/copy";
import { Cta, H2, NameFields, OnbScreen, Pad, Sub, VerifiedPhoneRow } from "../../src/ui/onboarding/kit";
import { RiderIntro } from "../../src/ui/onboarding/rider";
import { useWalletConfig } from "../../src/query/use-wallet";

/** The name draft is written this long after the last keystroke (an encrypted keystore write per keystroke
 *  is slow on low-end Android) — the same debounce as profile setup's. */
const DRAFT_SAVE_DEBOUNCE_MS = 500;

/**
 * Become a rider: Calm Mint v2 R1 "Why ride", then straight to the ID check, then the rider board.
 *
 * - No national ID is typed before the check (owner 2026-10-03, ledger D-75): the number is confirmed
 *   from the check afterwards — the server adopts the number the check verified (Calm Mint v2 §5).
 * - No rider photo either (D-62): it is optional and added later from Settings → Bike & documents.
 * - The only thing ever asked first is the NAME, and only on a legacy account without one, in C5's own
 *   grammar (the two name fields, the verified phone row) — then on to the check.
 * - However the check ends, the rider lands on the board, which draws every outcome: First Run v2's F pages
 *   (F8 while it is sent, F3 after a cancel, F1 in manual mode, F4 on a decline … — ledger D-82), Calm Mint
 *   v2 R2 while the automated check runs, R3 once verified.
 * - G1 (D-82): this is the first rider screen. C1 "Ride with LyniaGo" → OTP → here, and a non-rider reaching
 *   the board is sent here; no permission priming before it (the rider permission flow follows R3).
 */
/** The toast a failed "Start ID check" raises — always app copy, never the server's message. */
function becomeErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 429) return KYC_RETRY_TRY_LATER;
  if (e instanceof ApiError && e.code === "id_in_use") return `${PD.takenA} ${PD.takenB}. ${PD.takenBody}`;
  return "Couldn't start biker setup.";
}

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
        // Rewritten name-only at once (not on the debounce): a pre-D-75 draft's national ID must not outlive
        // the first visit even if the app is killed within the debounce window.
        void saveKycDraft({ firstName: d.firstName, lastName: d.lastName });
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

  // Persist the draft (on-device keystore only) as the name changes, after initial hydration — debounced,
  // with a pending write flushed when the app goes to the background (the moment before the OS may kill it)
  // and on unmount; once the rider is registered nothing is written again (app/profile/setup.tsx's pattern).
  const latestDraft = useRef({ firstName: "", lastName: "" });
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftDone = useRef(false);
  const flushDraft = useCallback((): void => {
    if (!draftTimer.current) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = null;
    if (!draftDone.current) void saveKycDraft(latestDraft.current);
  }, []);
  const dropDraft = (): void => {
    draftDone.current = true;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    void clearKycDraft();
  };
  useEffect(() => {
    if (!hydrated.current || draftDone.current) return;
    latestDraft.current = { firstName, lastName };
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      if (!draftDone.current) void saveKycDraft(latestDraft.current);
    }, DRAFT_SAVE_DEBOUNCE_MS);
  }, [firstName, lastName]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") flushDraft();
    });
    return () => {
      sub.remove();
      flushDraft();
    };
  }, [flushDraft]);

  const namesReady = firstName.trim().length > 0 && lastName.trim().length > 0;

  // FR-L5: Android back on the name step returns to R1 (with R1 as the root it used to close the app).
  useEffect(() => {
    if (step !== "name") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!submitInFlightRef.current) setStep("intro");
      return true;
    });
    return () => sub.remove();
  }, [step]);

  /**
   * Hand over to the board, saved as the side the next cold start opens on (R-5).
   *
   * First Run v2 (ledger D-82): G1 — the board no longer pushes this screen over itself (its "Earn with your
   * bike" interstitial is gone; a non-rider reaching `/rider` is REPLACED by this screen), so there is never
   * a board below to go back to and a `replace` mounts exactly one. Owner #5 — no permission priming before
   * the board: the rider permission flow runs after R3 "You're verified", before going online. The board
   * shows the check's outcome from here (F8 while it is sent, R2, F1–F7, R3).
   *
   * The board must read the new rider record, never bounce a cached customer `me` (no rider yet) back here.
   * After a successful register the `["me"]` cache already holds a rider stub (`withRiderStub`), so this
   * navigates at once and the real `/auth/me` lands in the background (it reads the ID-check vendor and
   * could hold R1's spinner for seconds). Without a stub (`refetchMe`) `me` is re-read first, as before.
   */
  const handOver = async (refetchMe = true): Promise<void> => {
    void saveRolePreference("rider");
    if (refetchMe) await qc.refetchQueries({ queryKey: ["me"] }).catch(() => undefined);
    else void qc.invalidateQueries({ queryKey: ["me"] });
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
      // The camera the in-app ID-check sheet needs is settled WHILE the session is minted, not after it —
      // the rider used to wait on the network and only then on the permission dialog.
      const camera = primeKycCamera();
      const res = await becomeRider({});
      // The rider is registered — the draft has served its purpose.
      dropDraft();
      // The account is a rider now: the `["me"]` cache gets the rider record from this answer, so the board
      // this hands over to reads a rider at once (the real `/auth/me` is read in the background, below).
      const stub = withRiderStub(qc.getQueryData<Me>(["me"]), res);
      if (stub) qc.setQueryData<Me>(["me"], stub);
      // …and the next cold start opens on the rider side, saved BEFORE the check opens: an app killed
      // mid-check (the sheet is minutes of camera work) used to come back to customer Home.
      void saveRolePreference("rider");
      // The check opens over this screen — the in-app ID-check sheet (KycCheckHost, mounted below),
      // falling back to the in-app browser tab when the sheet can't present. `runKycVerification`
      // never throws. Manual review (and the QA stub's instant pass) returns no session to open.
      if (res.sessionToken || res.verificationUrl) {
        const launch = await runKycVerification({ sessionToken: res.sessionToken, verificationUrl: res.verificationUrl }, { camera });
        // R-4 / R-10: the board picks the page, so it gets the outcome — "completed" is F8 "Sending your ID"
        // while the vendor catches up, "failed" lands on F7 "Couldn't open the ID check" (with WhatsApp help),
        // not F3 "Almost there". Stored on the device too, so a restart still holds F8 / R2.
        recordKycLaunch(launch.outcome, Date.now(), me?.profileId ?? undefined);
        if (launch.outcome === "completed") {
          void noteKycLaunched();
          const done = withRiderStub(qc.getQueryData<Me>(["me"]), res, "completed");
          if (stub && done) qc.setQueryData<Me>(["me"], done);
        }
      } else if (res.mode === "auto" && res.kycStatus === "pending") {
        // An automated check with no session to open is a check that couldn't open — F7, not a silent
        // hand-over to F3. (Manual review and the QA stub's instant pass have nothing to open by design.)
        recordKycLaunch("failed", Date.now(), me?.profileId ?? undefined);
      }
      // However it went, the board shows the right page from here: F8 while it is sent, R2 while the
      // automated check runs, R3 once verified, F3 after a cancel, F1 in manual mode (D-82).
      await handOver(!stub);
    } catch (e) {
      // BH-04: a lost-response retry on `becomeRider` hits this exact 409 — the FIRST submit already
      // landed server-side (and since R-10 so does the loser of a double-tap race), so the board
      // re-reads the real (already-registered) state.
      if (e instanceof ApiError && e.code === "already_rider") {
        dropDraft();
        await handOver();
        return;
      }
      // Our words, never the server's: a rate limit, an ID already on another account (PD's drawn
      // one-ID-one-account line, as F5dup words it), or the plain failure. No rider record exists after
      // any of these (the server registers only once the vendor answered), so there is no F page yet.
      setError(becomeErrorMessage(e));
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
      setError("Couldn't start biker setup.");
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
