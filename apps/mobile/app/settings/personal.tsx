import { normalizeNationalId } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMe, type Me, updateProfile } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { maskNationalId } from "../../src/logic/rider-documents";
import { Icon, SkeletonList, useActionError } from "../../src/ui";
import { Cta, FieldLabel, NameFields, Note, Pad, VerifiedPhoneRow } from "../../src/ui/onboarding/kit";
import { OB } from "../../src/ui/onboarding/copy";
import { RIDER_COPY as R } from "../../src/ui/rider/copy";
import { PushHeader } from "../../src/ui/rider/kit";
import { Notice } from "../../src/ui/send/kit";

/** The national ID length `PATCH /auth/me` accepts (UpdateProfileRequest: 4–40 once trimmed). */
const ID_MIN = 4;
const ID_MAX = 40;

/**
 * Personal details (ledger D-78, owner 2026-10-06): makes C5's "You can add it in Account" true. Reached
 * from Settings → YOUR ACCOUNT on both sides; the row's words are the handoff's (`mint2.js` Account,
 * "Personal details · Name, phone, optional ID"). The screen isn't drawn, so it is built from what is:
 * Rider v2's pushed-screen header, and C5's form (the side-by-side name fields, the verified phone row,
 * the surface note, the 52px primary button).
 *
 * The national ID is optional and saved through `PATCH /auth/me`, which enforces one ID per live account
 * (a 409 `id_in_use`, shown under the field in the API's own words) and freezes a verified rider's ID (a
 * 403, same). A rider whose ID came from the check sees it read-only, masked to its last three characters,
 * marked "Verified". The ID is never written to disk: `me` is persisted with `idNumber` / `kycIdNumber`
 * stripped (`redactBeforePersist`), and nothing here keeps a draft.
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
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);

  // Seed the form once, from the first `me` that carries a name (a refetch mid-edit never resets it).
  useEffect(() => {
    if (seeded.current || !me) return;
    seeded.current = true;
    setFirstName(me.firstName ?? "");
    setLastName(me.lastName ?? "");
    setIdDraft(me.idNumber ?? "");
  }, [me]);

  const storedId = me?.idNumber ?? null;
  // The ID the check verified: the account's ID once the rider is verified (D-75 adopts the checked number).
  const verifiedId = me?.rider?.kycStatus === "verified" ? (storedId ?? me?.kycIdNumber ?? null) : null;

  const first = firstName.trim();
  const last = lastName.trim();
  const id = normalizeNationalId(idDraft);
  const idChanged = !verifiedId && id !== normalizeNationalId(storedId ?? "");
  const idCleared = idChanged && id === "" && !!storedId;
  const idValid = id === "" || (id.length >= ID_MIN && id.length <= ID_MAX);
  const nameChanged = !!me && (first !== (me.firstName ?? "").trim() || last !== (me.lastName ?? "").trim());
  const canSave = !!me && first.length > 0 && last.length > 0 && idValid && !idCleared && (nameChanged || idChanged);

  const save = async (): Promise<void> => {
    if (!canSave || busy) return;
    setIdError(null);
    setBusy(true);
    try {
      const next = await updateProfile({ firstName: first, lastName: last, ...(idChanged && id ? { idNumber: id } : {}) });
      qc.setQueryData<Me>(["me"], next);
      router.back();
    } catch (e) {
      if (e instanceof ApiError && (e.code === "id_in_use" || e.status === 403)) setIdError(e.message);
      else setError(e instanceof ApiError && e.status === 400 ? e.message : R.pdSaveErr);
    } finally {
      setBusy(false);
    }
  };

  return (
    // PushHeader owns the top inset; the bottom edge keeps the button clear of the Android navigation bar.
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <PushHeader title={R.tPersonal} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
          <Pad style={{ flex: 1 }}>
            {meQ.isLoading ? (
              <SkeletonList count={3} />
            ) : !me ? (
              <Notice icon="wifi-off" text={R.pdLoadErr} />
            ) : (
              <>
                <NameFields firstName={firstName} lastName={lastName} onFirstName={setFirstName} onLastName={setLastName} />
                {me.phone ? <VerifiedPhoneRow phone={me.phone} /> : null}
                <View style={{ marginTop: 16 }}>
                  <FieldLabel>{R.pdIdLabel}</FieldLabel>
                  {verifiedId ? (
                    <View
                      accessible
                      accessibilityLabel={`${R.docId}, ${OB.verified}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: tokens.color.surface }}
                    >
                      <Icon name="id-card" size={18} color={tokens.color.accent} />
                      <Text style={{ fontSize: 14, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{maskNationalId(verifiedId)}</Text>
                      <Text style={{ marginLeft: "auto", fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{OB.verified}</Text>
                    </View>
                  ) : (
                    <TextInput
                      value={idDraft}
                      onChangeText={(v) => {
                        setIdDraft(v);
                        setIdError(null);
                      }}
                      accessibilityLabel={R.pdIdLabel}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoComplete="off"
                      maxLength={ID_MAX + 8}
                      style={{
                        height: tokens.touchTargetPrimary,
                        borderWidth: 1,
                        borderColor: idError ? tokens.color.danger : tokens.color.line,
                        borderRadius: tokens.radius.input,
                        paddingHorizontal: 14,
                        fontSize: 17,
                        color: tokens.color.ink,
                      }}
                    />
                  )}
                  {idError ? (
                    <Text accessibilityRole="alert" style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: tokens.color.dangerInk }}>
                      {idError}
                    </Text>
                  ) : idCleared ? (
                    <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{R.pdIdRemove}</Text>
                  ) : null}
                </View>
                <Note icon={verifiedId ? "shield-check" : "id-card"}>{verifiedId ? R.pdIdVerifiedNote : R.pdIdNote}</Note>
              </>
            )}
          </Pad>
          {me ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}>
              <Cta label={R.save} onPress={() => void save()} busy={busy} disabled={!canSave} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
