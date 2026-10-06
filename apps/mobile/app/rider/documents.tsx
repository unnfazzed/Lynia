import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { BackHandler, Image, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMe, type Me } from "../../src/api/auth";
import { ApiError } from "../../src/api/client";
import { updateRiderProfile } from "../../src/api/riders";
import { initials } from "../../src/logic/avatar";
import {
  bikeDocsProgress,
  bikeVerified,
  clearRiderPhotoDraft,
  loadRiderPhotoDraft,
  normalizePlate,
  pickRiderPhoto,
  PLATE_MAX,
  plateMatchesFormat,
  saveRiderPhoto,
  saveRiderPhotoDraft,
  type PhotoSource,
} from "../../src/logic/rider-documents";
import type { UploadImageSource } from "../../src/logic/image-downscale";
import { Icon, type IconName, SkeletonList, useActionError } from "../../src/ui";
import {
  BackHeader,
  Body,
  FirstRunScreen,
  FrBadge,
  FrField,
  FrSheet,
  HeroDisc,
  HeroPanel,
  LargeTitle,
  ListCard,
  ListRow,
  PinnedFooter,
  SplitTitle,
} from "../../src/ui/firstrun";
import { BD } from "../../src/ui/firstrun/copy";
import { RIDER_COPY as R } from "../../src/ui/rider/copy";
import { Notice } from "../../src/ui/send/kit";

/**
 * E1's in-row "+ Add" pill height. The handoff drew it 36, under the tap-target floor; the owner had the
 * KIT fixed to 44 (D-81 §4, CLAUDE.md D2: the app never shrinks or inflates a drawn target on its own),
 * so it is the token, never a literal.
 */
export const ADD_PILL_HEIGHT = tokens.touchTargetMin;

/** E2c's preview title: drawn as "Looking **good**" in `fr-states.js` (not in copy.ts), used verbatim. */
const PREVIEW_TITLE = { a: "Looking", b: "good" } as const;

/** The E2b capture guide's translucent chip fill and the dashed oval (drawn values, on the dark ink). */
const GUIDE_CHIP_BG = "rgba(255,255,255,0.12)";
const GUIDE_OVAL = "rgba(255,255,255,0.7)";

type Stage =
  | { kind: "list" }
  | { kind: "guide" }
  | { kind: "preview"; shot: UploadImageSource; from: PhotoSource }
  | { kind: "failed"; shot: UploadImageSource };

/**
 * Bike & documents — First Run v2 E1–E6 (`packages/design/handoff/first-run-v2` README §2 E, ledger D-81;
 * it replaces Rider v2 S5). Reached from Settings → Bike & documents.
 *
 * - E1: back header + large title, three 6dp bars and "N of 3", the National ID / Rider photo / Bike plate
 *   rows with a soft "+ Add", and "Optional. You can take jobs now." No "Re-verify" button, no nagging.
 * - E2a: "Add a photo" sheet (camera / gallery). E2b: the dark capture guide (oval, three tips, a 76
 *   shutter) — the shutter opens the phone's front camera. E2c: the round preview, "Use photo" / "Retake".
 *   E2d: the row's sub-line becomes a 4dp progress bar while it uploads.
 * - E4: the plate sheet (`^[A-Z]{3}\s?\d{4}$`, "Plates look like ABC 1234"); Save is instant — the row
 *   shows the plate with a "Checking" pill until ops confirm (`plateStatus`, migration 0078).
 * - E5: everything on file → the mint hero with a filled check, "You're all set", rows with Change / Edit.
 *   "Verified" only for what was actually checked: the ID check and an ops-confirmed plate — never the
 *   photo, which nobody checks.
 * - E6: an upload that didn't finish keeps the photo on this phone; "Try again" re-sends the same shot.
 */
export default function DocumentsScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const rider = me?.rider ?? null;
  const setError = useActionError();

  const [stage, setStage] = useState<Stage>({ kind: "list" });
  const [photoSheet, setPhotoSheet] = useState(false);
  const [plateSheet, setPlateSheet] = useState(false);
  const [plateDraft, setPlateDraft] = useState("");
  const [plateError, setPlateError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ shot: UploadImageSource; progress: number } | null>(null);

  // E6 survives a relaunch: a photo whose upload never finished is still on this phone.
  useEffect(() => {
    let alive = true;
    void loadRiderPhotoDraft().then((shot) => {
      if (alive && shot) setStage((s) => (s.kind === "list" ? { kind: "failed", shot } : s));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Android back on a full-screen step returns to the list instead of leaving the screen.
  useEffect(() => {
    if (stage.kind === "list") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setStage({ kind: "list" });
      return true;
    });
    return () => sub.remove();
  }, [stage.kind]);

  /**
   * Write into the cached `me`. With `confirm` (what the server answered), let `/auth/me` confirm it; an
   * optimistic write (E4's instant plate) must not refetch, or the still-old server copy would undo it.
   */
  const applyRider = useCallback(
    (next: Partial<NonNullable<Me["rider"]>>, confirm = true): void => {
      qc.setQueryData<Me>(["me"], (cur) => (cur?.rider ? { ...cur, rider: { ...cur.rider, ...next } } : cur));
      if (confirm) void qc.invalidateQueries({ queryKey: ["me"] });
    },
    [qc],
  );

  const pick = (from: PhotoSource): void => {
    void (async () => {
      const shot = await pickRiderPhoto(from).catch(() => null);
      if (shot === null) return;
      if (shot === "denied") {
        setError(R.docPhotoDenied);
        return;
      }
      setStage({ kind: "preview", shot, from });
    })();
  };

  const choose = (from: PhotoSource): void => {
    setPhotoSheet(false);
    if (from === "camera") setStage({ kind: "guide" });
    else pick("gallery");
  };

  const sendPhoto = (shot: UploadImageSource): void => {
    setStage({ kind: "list" });
    setUpload({ shot, progress: 0 });
    void (async () => {
      await saveRiderPhotoDraft(shot);
      try {
        const next = await saveRiderPhoto(shot, (progress) => setUpload((u) => (u ? { ...u, progress } : u)));
        await clearRiderPhotoDraft();
        applyRider(next);
        setUpload(null);
      } catch (e) {
        setUpload(null);
        // A refused photo (wrong type, too large) is not a connection problem: say so and drop the draft.
        if (e instanceof ApiError && e.status === 422) {
          await clearRiderPhotoDraft();
          setError(e.message);
        } else {
          setStage({ kind: "failed", shot });
        }
      }
    })();
  };

  const openPlate = (): void => {
    setPlateDraft(rider?.bikeReg ?? "");
    setPlateError(null);
    setPlateSheet(true);
  };

  /** E4: instant — the sheet closes and the row shows "Checking" before the server has answered. */
  const savePlate = (): void => {
    if (!plateMatchesFormat(plateDraft)) {
      setPlateError(BD.plateErr);
      return;
    }
    const plate = normalizePlate(plateDraft);
    setPlateSheet(false);
    if (plate === rider?.bikeReg) return;
    const before = rider ? { bikeReg: rider.bikeReg, plateStatus: rider.plateStatus } : null;
    void (async () => {
      // A `me` read already in flight would land the old plate over the optimistic one.
      await qc.cancelQueries({ queryKey: ["me"] });
      applyRider({ bikeReg: plate, plateStatus: "checking" }, false);
      try {
        applyRider(await updateRiderProfile({ bikeReg: plate }));
      } catch {
        if (before) applyRider(before, false);
        setError(R.docBikeErr);
      }
    })();
  };

  if (stage.kind === "preview") {
    const { shot, from } = stage;
    return (
      <FirstRunScreen
        testID="documents-preview"
        footer={
          <PinnedFooter
            primary={{ label: BD.use, onPress: () => sendPhoto(shot), testID: "photo-use" }}
            link={{ label: BD.retake, icon: "refresh-cw", onPress: () => (from === "camera" ? setStage({ kind: "guide" }) : pick("gallery")), testID: "photo-retake" }}
          />
        }
      >
        <Image source={{ uri: shot.uri }} accessibilityIgnoresInvertColors style={{ width: 240, height: 240, borderRadius: 120, alignSelf: "center", marginTop: 24, backgroundColor: tokens.color.accentWash }} />
        <SplitTitle a={PREVIEW_TITLE.a} b={PREVIEW_TITLE.b} style={{ textAlign: "center" }} />
      </FirstRunScreen>
    );
  }

  if (stage.kind === "failed") {
    const { shot } = stage;
    return (
      <FirstRunScreen testID="documents-failed" footer={<PinnedFooter primary={{ label: BD.retry, icon: "refresh-cw", onPress: () => sendPhoto(shot), testID: "photo-retry" }} />}>
        <HeroPanel tone="danger">
          <HeroDisc icon="upload" />
        </HeroPanel>
        <SplitTitle a={BD.failA} b={BD.failB} tone="danger" />
        <Body>{BD.failBody}</Body>
      </FirstRunScreen>
    );
  }

  const plate = rider?.bikeReg?.trim() || null;
  const plateChecking = !!plate && rider?.plateStatus === "checking";
  const plateOk = bikeVerified(rider);
  const idOk = rider?.kycStatus === "verified";
  const hasPhoto = rider?.hasPhoto === true;
  const progress = bikeDocsProgress(rider);
  const allSet = !upload && progress.done === progress.total;

  const photoRow = upload ? (
    // E2d: the sub-line becomes a 4dp bar; the value reads "Uploading…".
    <ListRow
      testID="row-photo"
      leading={<Image source={{ uri: upload.shot.uri }} accessibilityIgnoresInvertColors style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.accentWash }} />}
      title={BD.photo}
      sub={null}
      right={<Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{BD.uploading}</Text>}
      accessibilityLabel={`${BD.photo}, ${BD.uploading}`}
    />
  ) : hasPhoto ? (
    <ListRow
      testID="row-photo"
      leading={<InitialsDot text={initials(me?.firstName, me?.lastName)} />}
      title={BD.photo}
      value={BD.change}
      onPress={() => setPhotoSheet(true)}
    />
  ) : (
    <ListRow testID="row-photo" icon="user" title={BD.photo} sub={BD.photoSub} right={<AddPill onPress={() => setPhotoSheet(true)} testID="add-photo" />} accessibilityLabel={`${BD.photo}, ${BD.photoSub}`} />
  );

  const plateRow = !plate ? (
    <ListRow testID="row-plate" icon="bike" title={BD.plate} sub={BD.plateSub} right={<AddPill onPress={openPlate} testID="add-plate" />} accessibilityLabel={`${BD.plate}, ${BD.plateSub}`} />
  ) : (
    <ListRow
      testID="row-plate"
      icon="bike"
      title={plate}
      sub={plateChecking ? BD.plateReview : plateOk ? BD.verified : null}
      right={plateChecking ? <FrBadge tone="checking" icon="clock" label={BD.inReview} /> : undefined}
      value={plateChecking ? null : BD.edit}
      onPress={openPlate}
    />
  );

  const rows = (
    <ListCard testID="documents-rows">
      <ListRow testID="row-id" icon="id-card" iconTone="ok" title={BD.id} value={idOk ? BD.verified : null} valueOk />
      {photoRow}
      {plateRow}
    </ListCard>
  );

  return (
    <>
      <FirstRunScreen
        testID="documents"
        header={
          <>
            <BackHeader onBack={() => router.back()} />
            {allSet ? null : <LargeTitle>{BD.title}</LargeTitle>}
          </>
        }
      >
        {meQ.isLoading ? (
          <SkeletonList count={2} />
        ) : !rider ? (
          <Notice icon="wifi-off" text="Couldn't load your documents. Check your connection and try again." />
        ) : allSet ? (
          // E5: the hero rides up under the back header (`margin-top:-28`).
          <View testID="documents-all-set">
            <HeroPanel height={200} style={{ marginTop: -28 }}>
              <HeroDisc>
                <View style={{ alignSelf: "stretch", flex: 1, borderRadius: 999, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="check" size={40} strokeWidth={1.75} color={tokens.color.onAccent} />
                </View>
              </HeroDisc>
            </HeroPanel>
            <SplitTitle a={BD.doneA} b={BD.doneB} />
            <View style={{ marginTop: 20 }}>{rows}</View>
          </View>
        ) : (
          <>
            <ProgressBars done={progress.done} total={progress.total} />
            {rows}
            <Text style={{ marginTop: 12, marginHorizontal: 4, fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{BD.optional}</Text>
          </>
        )}
      </FirstRunScreen>

      {/* E2a — where the photo comes from. */}
      <FrSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} testID="photo-sheet">
        <SheetTitle>{BD.photoSheet}</SheetTitle>
        <ListCard>
          <ListRow icon="camera" iconTone="ok" title={BD.camera} onPress={() => choose("camera")} testID="photo-camera" />
          <ListRow icon="image" iconTone="ok" title={BD.gallery} onPress={() => choose("gallery")} testID="photo-gallery" />
        </ListCard>
      </FrSheet>

      {/* E4 — the plate. */}
      <FrSheet visible={plateSheet} onClose={() => setPlateSheet(false)} testID="plate-sheet">
        <SheetTitle>{BD.plateTitle}</SheetTitle>
        <FrField
          testID="plate-field"
          value={plateDraft}
          onChangeText={(v) => {
            setPlateDraft(v.toUpperCase());
            setPlateError(null);
          }}
          placeholder={BD.plateSub}
          helper={BD.plateSub}
          error={plateError}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={PLATE_MAX}
          returnKeyType="done"
          onSubmitEditing={savePlate}
          inputStyle={{ fontWeight: tokens.font.weight.semibold, letterSpacing: 0.96 }}
        />
        <PinnedFooter inline primary={{ label: BD.plateSave, onPress: savePlate, testID: "plate-save" }} />
      </FrSheet>

      {/* E2b — the capture guide. */}
      <CaptureGuide visible={stage.kind === "guide"} onClose={() => setStage({ kind: "list" })} onShoot={() => pick("camera")} />
    </>
  );
}

/** E1–E4 progress: three 6dp bars (4 gap, radius 3, brand / `line`) and "N of 3" in 600 14 muted. */
function ProgressBars({ done, total }: { done: number; total: number }): React.ReactElement {
  return (
    <View testID="documents-progress" accessible accessibilityLabel={`${done} ${BD.progress}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} testID={i < done ? "bar-done" : "bar-open"} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < done ? tokens.color.accent : tokens.color.line }} />
        ))}
      </View>
      <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
        {done} {BD.progress}
      </Text>
    </View>
  );
}

/** E1's in-row "+ Add": `.pill` (padding 0 12, 600 13, a 16 plus, 6 gap) in mint — {@link ADD_PILL_HEIGHT} tall. */
function AddPill({ onPress, testID }: { onPress: () => void; testID?: string }): React.ReactElement {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={BD.add}
      style={({ pressed }) => ({
        minHeight: ADD_PILL_HEIGHT,
        paddingHorizontal: 12,
        borderRadius: tokens.radius.pill,
        backgroundColor: pressed ? tokens.color.accentWashPressed : tokens.color.accentWash,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      })}
    >
      <Icon name="plus" size={16} color={tokens.color.accentText} />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{BD.add}</Text>
    </Pressable>
  );
}

/** E5's photo disc: the rider's initials on the `ok` disc (the app never receives the photo itself). */
function InitialsDot({ text }: { text: string }): React.ReactElement {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{text}</Text>
    </View>
  );
}

function SheetTitle({ children }: { children: string }): React.ReactElement {
  return (
    <Text accessibilityRole="header" style={{ marginBottom: 12, fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
      {children}
    </Text>
  );
}

const GUIDE_TIPS: readonly { icon: IconName; label: string }[] = [
  { icon: "sun", label: BD.guide3 },
  { icon: "user", label: BD.guide2 },
  { icon: "image", label: BD.guide1 },
];

/**
 * E2b: full-screen `ink`, a 44 ✕ top-left, "Face the **camera**" 26/700 (the accent half in brand green —
 * allowed as text on ink at this size, 6.7:1), the 220×290 dashed oval, three translucent tips, and a 76
 * shutter. The shutter opens the phone's own front camera (expo-image-picker; the app ships no in-app
 * camera), which returns to E2c.
 */
function CaptureGuide({ visible, onClose, onShoot }: { visible: boolean; onClose: () => void; onShoot: () => void }): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View testID="capture-guide" style={{ flex: 1, backgroundColor: tokens.color.ink, alignItems: "center", paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ alignSelf: "stretch", height: 56, marginTop: 24, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}>
          <Pressable testID="guide-close" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => ({ width: tokens.touchTargetMin, height: tokens.touchTargetMin, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
            <Icon name="x" size={24} color={tokens.color.onAccent} />
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={{ marginTop: 8, fontSize: 26, lineHeight: 32, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>
          {BD.guideA} <Text style={{ color: tokens.color.accent }}>{BD.guideB}</Text>
        </Text>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 220, height: 290, borderRadius: 145, borderWidth: 3, borderStyle: "dashed", borderColor: GUIDE_OVAL, marginTop: 28 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 24, paddingHorizontal: 16 }}>
          {GUIDE_TIPS.map((t) => (
            <View key={t.label} style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: tokens.radius.pill, backgroundColor: GUIDE_CHIP_BG, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name={t.icon} size={16} color={tokens.color.accentText} />
              <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent }}>{t.label}</Text>
            </View>
          ))}
        </View>
        <Pressable
          testID="guide-shutter"
          onPress={onShoot}
          accessibilityRole="button"
          accessibilityLabel={BD.shoot}
          style={({ pressed }) => ({ marginTop: "auto", marginBottom: 28, width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: tokens.color.onAccent, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
        >
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: tokens.color.onAccent }} />
        </Pressable>
      </View>
    </Modal>
  );
}
