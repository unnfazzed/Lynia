import { normalizeNationalId } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { getMe } from "../../src/api/auth";
import { becomeRider, completeProfile } from "../../src/api/riders";
import { KycCheckHost } from "../../src/kyc/KycCheckHost";
import { runKycVerification } from "../../src/kyc/verify";
import { clearKycDraft, kycDraftHasContent, loadKycDraft, saveKycDraft } from "../../src/logic/kyc-draft";
import { AppBar, Button, Card, Field, Heading, Icon, isTestBuild, Screen, Sub, useActionError } from "../../src/ui";
import { RO } from "../../src/ui/onboarding/copy";
import { RiderIntro } from "../../src/ui/onboarding/rider";

/**
 * Become a rider: Calm Mint v2 R1 "Why ride", then straight to the ID check.
 *
 * The rider photo is NOT a sign-up step (owner 2026-10-02, ledger D-62): it is optional and added later
 * from Settings → Bike & documents, next to the licence and bike papers. So "Start ID check" on R1 opens
 * the check directly — unless the account is missing its name or national ID, which rider onboarding
 * needs on the profile; then one short details step asks for only what is missing.
 */
export default function BecomeRiderScreen(): React.ReactElement {
  const router = useRouter();
  // CF-02-SIB-3: same-tick double-submit guard for `submit` below — see the ref's use for why a plain
  // `busy` state boolean isn't enough.
  const submitInFlightRef = useRef(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bikeReg, setBikeReg] = useState("");
  const [busy, setBusy] = useState(false);
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12).
  const setError = useActionError();
  const [pending, setPending] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  // R1 "Why ride" first; the details step only exists when the name or national ID is missing. A
  // restored draft skips straight to it — the rider already said yes once.
  const [step, setStep] = useState<"intro" | "details">("intro");
  // The name and ID already on the account (C5 collects the name; the ID is only on file for accounts
  // that gave one). Only what is missing is asked for here.
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const needName = !!me && (!me.firstName?.trim() || !me.lastName?.trim());
  const needId = !!me && !me.idNumber;
  // Gate persistence until the initial load runs, so we don't clobber a stored draft with empty state.
  const hydrated = useRef(false);

  // Rehydrate the KYC draft once on mount: the ID check can OOM-kill the app on a low-end phone, and a
  // re-typed national ID would otherwise be lost on relaunch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await loadKycDraft();
      if (!cancelled && d && kycDraftHasContent(d)) {
        setFirstName(d.firstName);
        setLastName(d.lastName);
        setIdNumber(d.idNumber);
        setBikeReg(d.bikeReg);
        setDraftRestored(true);
        setStep("details");
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
    void saveKycDraft({ firstName, lastName, idNumber, bikeReg });
  }, [firstName, lastName, idNumber, bikeReg]);

  // The bike plate and the photo are optional (added later in Account → Bike & documents); only a missing
  // name or national ID is asked for, because rider onboarding needs both on the profile.
  const canSubmit =
    !!me &&
    (!needName || (firstName.trim().length > 0 && lastName.trim().length > 0)) &&
    (!needId || idNumber.trim().length >= 4);

  const submit = async (): Promise<void> => {
    // CF-02-SIB-3: `busy` (React state) only reflects the FIRST of two same-tick taps — the second
    // tap's re-render hasn't landed yet, so a fast double-tap fired becomeRider() twice (each opening its
    // own paid Didit session server-side). A synchronous ref checked-and-set before any await.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setError(null);
    setBusy(true);
    try {
      if (needName || needId) {
        await completeProfile({
          firstName: (needName ? firstName : me?.firstName ?? "").trim(),
          lastName: (needName ? lastName : me?.lastName ?? "").trim(),
          idNumber: normalizeNationalId(needId ? idNumber : me?.idNumber ?? ""),
        });
      }
      const res = await becomeRider(bikeReg.trim().length >= 3 ? { bikeReg: bikeReg.trim() } : {});
      // KYC is submitted — the draft has served its purpose. Wipe the stored national ID immediately
      // rather than leaving it in the keystore any longer than needed.
      void clearKycDraft();
      // The check opens over this screen — the in-app ID-check sheet (KycCheckHost, mounted below),
      // falling back to the in-app browser tab when the sheet can't present. `runKycVerification`
      // never throws and names the outcome instead.
      const launch =
        res.sessionToken || res.verificationUrl
          ? await runKycVerification({ sessionToken: res.sessionToken, verificationUrl: res.verificationUrl })
          : null;
      // Calm Mint v2 (D-55): a check that went through lands on the board, which now shows R2 "Rider
      // setup" while it is reviewed (or R3 once verified). The other outcomes keep their own line here.
      if (res.kycStatus === "verified" || (res.mode !== "manual" && launch?.outcome === "completed")) {
        router.replace("/rider");
        return;
      }
      setPending(
        res.mode === "manual"
          ? // BH-03: manual mode has no vendor step at all — describing one here would name a step
            // that never happened.
            "Verification submitted. Our team will review it and notify you — no action needed from you."
          : // The three auto-mode outcomes say three different things, mirroring the board's walls.
            launch?.outcome === "completed"
            ? "Verification submitted. We'll let you know as soon as it's checked."
            : launch?.outcome === "cancelled"
              ? "You didn't finish verifying. Pick it up again from your rider board."
              : "We couldn't open the ID check. Try again from your rider board.",
      );
    } catch (e) {
      // BH-04: a lost-response retry on `becomeRider` hits this exact 409 — the FIRST submit already
      // landed server-side, so `/rider` re-reads the real (already-registered) state.
      if (e instanceof ApiError && e.code === "already_rider") {
        void clearKycDraft();
        router.replace("/rider");
        return;
      }
      setError(e instanceof ApiError ? e.message : "Couldn't start rider setup.");
    } finally {
      submitInFlightRef.current = false;
      setBusy(false);
    }
  };

  if (step === "intro" && !pending) {
    // Nothing missing on the account → "Start ID check" opens the check right here. Anything missing
    // (or the account not loaded yet) → the details step, which asks only for that.
    return <RiderIntro busy={busy} onStart={() => (canSubmit && !needName && !needId ? void submit() : setStep("details"))} />;
  }

  return (
    <Screen>
      {/* Back returns to the actual referrer (customer Account or the board — KYC is always pushed), so
          the drawn chevron and Android hardware-back land in the SAME place. */}
      <AppBar onBack={() => (router.canGoBack() ? router.back() : router.replace("/rider"))} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Heading>{pending ? RO.setupTitle : RO.detailsTitle}</Heading>
        {pending ? null : <Sub>{RO.detailsSub}</Sub>}

        {draftRestored && !pending ? (
          <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.accentText, marginTop: tokens.space.xs }}>
            We saved what you&apos;d filled in — pick up where you left off.
          </Text>
        ) : null}

        {pending ? (
          <Card accent>
            <Text style={{ color: tokens.color.accentText, fontWeight: "700", fontSize: 16 }}>{pending}</Text>
          </Card>
        ) : (
          <>
            {needName || needId ? (
              <Card>
                {needName ? (
                  <>
                    <Field label="First name" value={firstName} onChangeText={setFirstName} maxLength={80} />
                    <Field label="Last name" value={lastName} onChangeText={setLastName} maxLength={80} />
                  </>
                ) : null}
                {/* Default (text) keyboard — Zimbabwean national IDs are alphanumeric (e.g. "63123456A12"),
                    so a number-pad would make the letter suffix untypeable. Only asked when the account
                    has none on file (C5 no longer collects it, D-55); rider onboarding needs it for the
                    one-ID-one-account check. */}
                {needId ? (
                  <Field label={RO.idNeeded} value={idNumber} onChangeText={setIdNumber} placeholder="63123456A42" maxLength={40} hint={RO.idNeededHint} />
                ) : null}
              </Card>
            ) : null}
            {/* The reassurance that carries the ID number, set as a surface card with an id-card mark. The
                check reads as Lynia's own everywhere (D-38): the vendor is never named. */}
            <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
              <View style={{ flexDirection: "row", gap: tokens.space.sm }}>
                <Icon name="id-card" size={18} color={tokens.color.accentText} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: tokens.color.muted, lineHeight: 20 }}>
                  {isTestBuild() ? RO.privacyTest : RO.privacy}
                </Text>
              </View>
            </Card>
            <Button label={RO.startIdCheck} onPress={submit} loading={busy} disabled={!canSubmit} />
          </>
        )}
      </ScrollView>
      {/* Presents the in-app ID-check sheet when submit's runKycVerification launches (src/kyc). */}
      <KycCheckHost />
    </Screen>
  );
}
