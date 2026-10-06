import { formatPhoneDisplay, normalizeNationalId } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { getMe, type Me, updateProfile } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { openSupportWhatsApp } from "../../src/config";
import { formatNationalId, maskNationalIdDashed, nationalIdValid } from "../../src/logic/national-id";
import { SkeletonList, useActionError } from "../../src/ui";
import { BackHeader, FirstRunScreen, FrField, InfoBox, LargeTitle, PinnedFooter, VerifiedRow } from "../../src/ui/firstrun";
import { BD, PD } from "../../src/ui/firstrun/copy";
import { RIDER_COPY as R } from "../../src/ui/rider/copy";
import { Notice } from "../../src/ui/send/kit";

/** D3: how long the button reads "Saved" before it turns back into Save. */
export const SAVED_MS = 1500;

/**
 * Personal details — First Run v2 D2–D7 (`packages/design/handoff/first-run-v2`, ledger D-81; the screen
 * itself is D-79's). Reached from Settings → Personal details on both sides.
 *
 * - D2: the back header + large title, First name / Surname side by side, the verified phone row, the
 *   optional national ID (placeholder `63-123456A78`, "Some pharmacy or high-value orders need it."), Save.
 * - D3: a save that lands turns the button mint with a check and "Saved" for 1.5s, then back. No toast.
 * - D4: the server's one-ID-one-account 409 → the field in red, a danger box, and the button becomes
 *   "Message us on WhatsApp" until the ID is edited.
 * - D5: the ID is normalised (spaces, case, the dash) and checked against `^\d{2}-\d{6,7}[A-Z]\d{2}$`
 *   on blur and on Save; "Use the format 63-123456A78" under it when it doesn't fit.
 * - D6: a verified rider's ID (from the check) is read-only, masked but the last three, "✓ Verified".
 * - D7: the pinned button rides above the keyboard and the field scrolls into view (FirstRunScreen).
 *
 * The ID is sent in the server's canonical form (no punctuation) and never written to disk: `me` is
 * persisted with `idNumber` / `kycIdNumber` stripped (`redactBeforePersist`).
 */
export default function PersonalDetailsScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const setError = useActionError();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idDraft, setIdDraft] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [idTaken, setIdTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const seeded = useRef(false);

  // Seed the form once, from the first `me` (a refetch mid-edit never resets it).
  useEffect(() => {
    if (seeded.current || !me) return;
    seeded.current = true;
    setFirstName(me.firstName ?? "");
    setLastName(me.lastName ?? "");
    setIdDraft(me.idNumber ? formatNationalId(me.idNumber) : "");
  }, [me]);

  useEffect(() => {
    if (!saved) return;
    const h = setTimeout(() => setSaved(false), SAVED_MS);
    return () => clearTimeout(h);
  }, [saved]);

  const storedId = me?.idNumber ?? null;
  // The ID the check verified: the account's ID once the rider is verified (D-75 adopts the checked number).
  const verifiedId = me?.rider?.kycStatus === "verified" ? (storedId ?? me?.kycIdNumber ?? null) : null;

  const first = firstName.trim();
  const last = lastName.trim();
  const idCanonical = normalizeNationalId(idDraft);
  const idChanged = !verifiedId && idCanonical !== normalizeNationalId(storedId ?? "");
  const idCleared = idChanged && idCanonical === "" && !!storedId;
  const nameChanged = !!me && (first !== (me.firstName ?? "").trim() || last !== (me.lastName ?? "").trim());
  const namesFilled = first.length > 0 && last.length > 0;

  const onIdChange = (v: string): void => {
    setIdDraft(v);
    setIdError(null);
    setIdTaken(false);
  };

  /** D5, on blur and on Save. A valid ID is shown in its dashed form. Returns whether it passes. */
  const checkId = (): boolean => {
    if (verifiedId) return true;
    if (idCleared) {
      setIdError(R.pdIdRemove);
      return false;
    }
    if (!nationalIdValid(idDraft)) {
      setIdError(PD.invalid);
      return false;
    }
    setIdDraft(formatNationalId(idDraft));
    return true;
  };

  const save = async (): Promise<void> => {
    if (!me || busy || !namesFilled) return;
    if (!checkId()) return;
    if (!nameChanged && !idChanged) {
      // Nothing to send: it is already saved.
      setSaved(true);
      return;
    }
    setBusy(true);
    try {
      const next = await updateProfile({ firstName: first, lastName: last, ...(idChanged && idCanonical ? { idNumber: idCanonical } : {}) });
      qc.setQueryData<Me>(["me"], next);
      setSaved(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "id_in_use") setIdTaken(true);
      else if (e instanceof ApiError && e.status === 403) setIdError(e.message);
      else setError(e instanceof ApiError && e.status === 400 ? e.message : R.pdSaveErr);
    } finally {
      setBusy(false);
    }
  };

  const footer = !me ? undefined : idTaken ? (
    <PinnedFooter primary={{ label: PD.takenCta, icon: "message-circle", onPress: openSupportWhatsApp, testID: "personal-cta" }} />
  ) : (
    <PinnedFooter primary={{ label: saved ? PD.saved : PD.save, onPress: () => void save(), loading: busy, done: saved, disabled: !namesFilled, testID: "personal-cta" }} />
  );

  return (
    <FirstRunScreen
      testID="personal-details"
      header={
        <>
          <BackHeader onBack={() => router.back()} />
          <LargeTitle>{PD.title}</LargeTitle>
        </>
      }
      footer={footer}
    >
      {meQ.isLoading ? (
        <SkeletonList count={3} />
      ) : !me ? (
        <Notice icon="wifi-off" text={R.pdLoadErr} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <FrField label={PD.first} value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" textContentType="givenName" style={{ flex: 1 }} />
            <FrField label={PD.last} value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" textContentType="familyName" style={{ flex: 1 }} />
          </View>
          {me.phone ? <VerifiedRow text={formatPhoneDisplay(me.phone)} value={PD.phoneVerified} style={{ marginTop: 12 }} /> : null}
          {verifiedId ? (
            // D6: from the ID check — read-only, masked, "✓ Verified".
            <View style={{ marginTop: 24 }}>
              <Text style={{ marginHorizontal: 2, marginBottom: 6, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>
                {PD.idLabel}
                <Text style={{ fontWeight: tokens.font.weight.regular }}> · {PD.idOpt}</Text>
              </Text>
              <VerifiedRow text={maskNationalIdDashed(verifiedId)} value={BD.verified} icon={null} valueIcon="check" textStyle={{ letterSpacing: 1.28 }} />
              <Text style={{ marginTop: 8, marginHorizontal: 2, fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{PD.idVerified}</Text>
            </View>
          ) : (
            <>
              <FrField
                testID="national-id"
                label={PD.idLabel}
                labelNote={PD.idOpt}
                value={idDraft}
                onChangeText={onIdChange}
                onBlur={() => {
                  if (idDraft.trim()) checkId();
                }}
                placeholder={PD.idPh}
                helper={idTaken ? undefined : PD.idWhy}
                error={idError}
                invalid={idTaken}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={24}
                returnKeyType="done"
                onSubmitEditing={() => void save()}
                style={{ marginTop: 24 }}
              />
              {idTaken ? <InfoBox tone="bad" icon="circle-alert" title={`${PD.takenA} ${PD.takenB}`} text={PD.takenBody} testID="id-taken" /> : null}
            </>
          )}
        </>
      )}
    </FirstRunScreen>
  );
}
