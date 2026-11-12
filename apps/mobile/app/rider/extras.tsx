import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { getMe, type Me } from "../../src/api/auth";
import { updateRiderProfile } from "../../src/api/riders";
import { startRiderPermFlow } from "../../src/logic/rider-perm-flow";
import { takeExtrasThen } from "../../src/logic/rider-extras";
import { normalizePlate, pickRiderPhoto, PLATE_MAX, plateMatchesFormat, saveRiderPhoto, type PhotoSource } from "../../src/logic/rider-documents";
import { useActionError } from "../../src/ui";
import { ExitButton, PinnedFooter, TextLinkButton } from "../../src/ui/firstrun/actions";
import { FrField } from "../../src/ui/firstrun/form";
import { Body, HeroDisc, HeroPanel, SplitTitle } from "../../src/ui/firstrun/hero";
import { FirstRunScreen } from "../../src/ui/firstrun/screen";
import { RIDER_COPY as R } from "../../src/ui/rider/copy";
import { KS } from "../../src/ui/rider/signup-copy";
import { useStepHeroHeight } from "../../src/ui/rider/signup/parts";
import { useKeyboardVisible } from "../../src/ui/shell/TabShell";

/**
 * Biker sign-up v1 X1 / X2 (packages/design/handoff/biker-signup-v1, ledger D-135): after R3 "You're verified",
 * the optional biker photo, then the bike plate — each with "Skip for now", shown once (they follow R3, which
 * shows once), never blocking Go online. Then the rider permission flow (P1…) runs as R3 used to start it.
 * A step whose item is already on file is skipped.
 */
export default function ExtrasScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const rider = meQ.data?.rider;
  const setError = useActionError();
  const [step, setStep] = useState<"photo" | "plate" | null>(null);
  const [busy, setBusy] = useState(false);
  const [plate, setPlate] = useState("");
  const [plateErr, setPlateErr] = useState<string | null>(null);
  const heroH = useStepHeroHeight();
  const keyboard = useKeyboardVisible();
  const finished = useRef(false);

  const finish = useCallback((): void => {
    if (finished.current) return;
    finished.current = true;
    const then = takeExtrasThen() ?? (() => undefined);
    if (router.canGoBack()) router.back();
    void startRiderPermFlow(router, then);
  }, [router]);

  useEffect(() => {
    if (step || !meQ.data) return;
    if (!rider?.hasPhoto) setStep("photo");
    else if (!rider?.bikeReg?.trim()) setStep("plate");
    else finish();
  }, [step, meQ.data, rider, finish]);

  const afterPhoto = (): void => (rider?.bikeReg?.trim() ? finish() : setStep("plate"));

  // Android back = Skip for now.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step === "photo") afterPhoto();
      else finish();
      return true;
    });
    return () => sub.remove();
  });

  const takePhoto = (from: PhotoSource): void => {
    if (busy) return;
    void (async () => {
      const shot = await pickRiderPhoto(from).catch(() => null);
      if (shot === null) return;
      if (shot === "denied" || shot === "blocked") return setError(R.docPhotoDenied);
      setBusy(true);
      try {
        const next = await saveRiderPhoto(shot);
        qc.setQueryData<Me>(["me"], (cur) => (cur?.rider ? { ...cur, rider: { ...cur.rider, ...next } } : cur));
        afterPhoto();
      } catch {
        setError(KS.failBox);
      } finally {
        setBusy(false);
      }
    })();
  };

  const savePlate = (): void => {
    if (busy) return;
    if (!plateMatchesFormat(plate)) return setPlateErr(KS.x2Err);
    setBusy(true);
    void updateRiderProfile({ bikeReg: normalizePlate(plate) })
      .then((next) => {
        qc.setQueryData<Me>(["me"], (cur) => (cur?.rider ? { ...cur, rider: { ...cur.rider, ...next } } : cur));
        finish();
      })
      .catch(() => setError())
      .finally(() => setBusy(false));
  };

  if (step === "photo") {
    return (
      <FirstRunScreen
        testID="extras-photo"
        footer={
          <PinnedFooter primary={{ label: KS.takePhoto, icon: "camera", onPress: () => takePhoto("camera"), loading: busy, testID: "extras-take" }} link={{ label: KS.skip, onPress: afterPhoto, testID: "extras-skip-photo" }}>
            <TextLinkButton label={KS.gallery} icon="image" onPress={() => takePhoto("gallery")} testID="extras-gallery" />
          </PinnedFooter>
        }
      >
        <HeroPanel topLeft={<ExitButton onPress={afterPhoto} />}>
          <HeroDisc icon="user" />
        </HeroPanel>
        <SplitTitle a={KS.x1A} b={KS.x1B} />
        <Body>{KS.x1Body}</Body>
      </FirstRunScreen>
    );
  }

  if (step === "plate") {
    return (
      <FirstRunScreen
        testID="extras-plate"
        footer={<PinnedFooter primary={{ label: KS.savePlate, onPress: savePlate, loading: busy, testID: "extras-save-plate" }} link={{ label: KS.skip, onPress: finish, testID: "extras-skip-plate" }} />}
      >
        {keyboard ? null : (
          <HeroPanel height={heroH} topLeft={<ExitButton onPress={finish} />}>
            <HeroDisc icon="bike" />
          </HeroPanel>
        )}
        <SplitTitle a={KS.x2A} b={KS.x2B} style={keyboard ? { marginTop: 64 } : undefined} />
        <FrField
          testID="extras-plate-field"
          label={KS.x2Label}
          value={plate}
          onChangeText={(v) => {
            setPlate(v.toUpperCase());
            setPlateErr(null);
          }}
          placeholder={KS.x2Ph}
          helper={KS.x2Help}
          error={plateErr}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={PLATE_MAX}
          returnKeyType="done"
          onSubmitEditing={savePlate}
          inputStyle={{ fontWeight: tokens.font.weight.semibold, letterSpacing: 0.96 }}
          style={{ marginTop: 20 }}
        />
      </FirstRunScreen>
    );
  }

  return <FirstRunScreen testID="extras-loading">{null}</FirstRunScreen>;
}
