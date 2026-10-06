import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMe, type Me } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { updateRiderProfile } from "../../src/api/riders";
import { supportWhatsAppUrl } from "../../src/config";
import { bikeVerified, normalizePlate, pickRiderPhoto, PLATE_MAX, plateIsValid, saveRiderPhoto, type PhotoSource } from "../../src/logic/rider-documents";
import { SkeletonList, useActionError } from "../../src/ui";
import { CtaBar, CtaButton } from "../../src/ui/order/kit";
import { Notice } from "../../src/ui/send/kit";
import { FieldLabel } from "../../src/ui/onboarding/kit";
import { RIDER_COPY as R } from "../../src/ui/rider/copy";
import { MSheet, PushHeader, RCard, RRow } from "../../src/ui/rider/kit";

/**
 * Bike & documents (Rider v2 S5, ledger D-54; D-78 owner 2026-10-06), reached from Settings → RIDER.
 * National ID · Rider photo · Bike (the plate), "Changed bikes? Re-verify with the new plate." and a ghost
 * "Re-verify my bike" (support on WhatsApp, with the request written out).
 *
 * D-78 makes R1/R3's "can wait … add later" true: the photo row adds or changes the rider's photo (camera or
 * gallery, downscaled, `PATCH /riders/me`), and the Bike row adds or edits the plate in a small sheet.
 * "Verified" on the Bike row only when the rider is verified AND has a plate (review R-8). The photo is the
 * rider's own upload, never "Verified". No licence row: licences aren't collected.
 */
export default function DocumentsScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const rider = meQ.data?.rider ?? null;
  const verified = rider?.kycStatus === "verified";
  const hasPhoto = rider?.hasPhoto === true;
  const plate = rider?.bikeReg?.trim() || null;
  const wa = supportWhatsAppUrl();
  const setError = useActionError();
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [plateSheet, setPlateSheet] = useState(false);
  const [plateDraft, setPlateDraft] = useState("");
  const [plateBusy, setPlateBusy] = useState(false);

  const reverify = (): void => {
    if (!wa) return;
    const line = plate ? ` My current plate is ${plate}.` : "";
    void Linking.openURL(`${wa}?text=${encodeURIComponent(`Hi, I've changed bikes and need to re-verify.${line}`)}`).catch(() => undefined);
  };

  /** Write what the server answered into the cached `me`, then let `/auth/me` confirm it. */
  const applyRider = (next: { hasPhoto: boolean; bikeReg: string | null }): void => {
    qc.setQueryData<Me>(["me"], (cur) => (cur?.rider ? { ...cur, rider: { ...cur.rider, ...next } } : cur));
    void qc.invalidateQueries({ queryKey: ["me"] });
  };

  const addPhoto = (from: PhotoSource): void => {
    setPhotoSheet(false);
    void (async () => {
      const shot = await pickRiderPhoto(from).catch(() => null);
      if (shot === null) return;
      if (shot === "denied") {
        setError(R.docPhotoDenied);
        return;
      }
      setPhotoBusy(true);
      try {
        applyRider(await saveRiderPhoto(shot));
      } catch (e) {
        // A refused photo (wrong type, too large) comes back with user-facing words; anything else is the link.
        setError(e instanceof ApiError && e.status === 422 ? e.message : R.docPhotoErr);
      } finally {
        setPhotoBusy(false);
      }
    })();
  };

  const openPlate = (): void => {
    setPlateDraft(plate ?? "");
    setPlateSheet(true);
  };

  const savePlate = async (): Promise<void> => {
    if (!plateIsValid(plateDraft) || plateBusy) return;
    setPlateBusy(true);
    try {
      applyRider(await updateRiderProfile({ bikeReg: normalizePlate(plateDraft) }));
      setPlateSheet(false);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 400 ? R.docBikeHint : R.docBikeErr);
    } finally {
      setPlateBusy(false);
    }
  };

  return (
    // PushHeader owns the top inset; the bottom edge keeps the CTA bar clear of the Android navigation bar.
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <PushHeader title={R.tBike} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 24, gap: 12 }} showsVerticalScrollIndicator={false}>
        {meQ.isLoading ? (
          <SkeletonList count={2} />
        ) : meQ.isError ? (
          <Notice icon="wifi-off" text="Couldn't load your documents. Check your connection and try again." />
        ) : (
          <>
            <RCard>
              <RRow first icon="id-card" label={R.docId} value={verified ? R.verified : null} tone={verified ? "ok" : null} />
              <RRow
                icon="user"
                label={R.docPhoto}
                sub={hasPhoto ? null : R.docPhotoNone}
                value={photoBusy ? R.photoUploading : hasPhoto ? R.docPhotoChange : R.docPhotoAdd}
                onPress={rider && !photoBusy ? () => setPhotoSheet(true) : undefined}
              />
              <RRow
                icon="bike"
                label={R.docBike}
                sub={plate}
                value={bikeVerified(rider) ? R.verified : plate ? null : R.docBikeAdd}
                tone={bikeVerified(rider) ? "ok" : null}
                onPress={rider ? openPlate : undefined}
              />
            </RCard>
            <Text style={{ fontSize: 13, lineHeight: 19, color: tokens.color.muted }}>{R.bikeChange}</Text>
          </>
        )}
      </ScrollView>
      <CtaBar>
        <CtaButton ghost icon="camera" label={R.reverifyBike} disabled={!wa || !rider} onPress={reverify} />
      </CtaBar>

      <MSheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title={R.docPhoto}
        body={R.docPhotoBody}
        buttons={
          <>
            <CtaButton icon="camera" label={R.takePhoto} onPress={() => addPhoto("camera")} />
            <CtaButton ghost icon="image" label={R.docPhotoGallery} onPress={() => addPhoto("gallery")} />
          </>
        }
      />

      <MSheet
        visible={plateSheet}
        onClose={() => (plateBusy ? undefined : setPlateSheet(false))}
        title={R.docBikeSheet}
        buttons={<CtaButton label={R.save} disabled={!plateIsValid(plateDraft)} loading={plateBusy} onPress={() => void savePlate()} />}
      >
        <FieldLabel>{R.docBikeLabel}</FieldLabel>
        <TextInput
          value={plateDraft}
          onChangeText={setPlateDraft}
          accessibilityLabel={R.docBikeLabel}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={PLATE_MAX + 4}
          style={{
            marginTop: -6,
            height: tokens.touchTargetPrimary,
            borderWidth: 1,
            borderColor: tokens.color.line,
            borderRadius: tokens.radius.input,
            paddingHorizontal: 14,
            fontSize: 17,
            color: tokens.color.ink,
          }}
        />
        <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{R.docBikeHint}</Text>
      </MSheet>
    </SafeAreaView>
  );
}
