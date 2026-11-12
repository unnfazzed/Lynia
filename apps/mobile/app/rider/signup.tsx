import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BackHandler, Image, Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import {
  declinedItems,
  idNumberValid,
  isPhotoItem,
  licenceNumberValid,
  openSupport,
  SIGNUP_ITEMS,
  signupDone,
  typeIdNumber,
  typeLicenceNumber,
  type NumberItem,
  type PhotoItem,
  type SignupItem,
} from "../../src/logic/biker-signup";
import { saveSignupIdNumber, saveSignupLicenceNumber, sendSignupPhoto } from "../../src/logic/biker-signup-actions";
import type { UploadImageSource } from "../../src/logic/image-downscale";
import { pickKycDoc } from "../../src/logic/manual-kyc";
import { recoverPendingPhoto } from "../../src/logic/pending-photo";
import { formatNationalId } from "../../src/logic/national-id";
import { replaceClearingStack } from "../../src/logic/nav";
import { riderPhotoAllowed, type PhotoSource } from "../../src/logic/rider-documents";
import { openPhoneSettings, useOnAppActive } from "../../src/permissions/location";
import { Icon, type IconName, useActionError } from "../../src/ui";
import { ExitButton, FrSoftPill, PinnedFooter } from "../../src/ui/firstrun/actions";
import { InfoBox, TipChips } from "../../src/ui/firstrun/bits";
import { FrField } from "../../src/ui/firstrun/form";
import { Body, HeroDisc, HeroPanel, SplitTitle } from "../../src/ui/firstrun/hero";
import { IconDot, ListCard, ListRow } from "../../src/ui/firstrun/lists";
import { FirstRunScreen } from "../../src/ui/firstrun/screen";
import { KycChecklist, SystemSettingsSteps } from "../../src/ui/firstrun/steps";
import { RO } from "../../src/ui/onboarding/copy";
import { RIDER_COPY as R } from "../../src/ui/rider/copy";
import { KS } from "../../src/ui/rider/signup-copy";
import { SignupIntroPage, STEP_LABEL, StepHeader, useStepHeroHeight } from "../../src/ui/rider/signup/parts";
import { useKeyboardVisible } from "../../src/ui/shell/TabShell";

/**
 * Biker sign-up v1 — packages/design/handoff/biker-signup-v1 (ledger D-135; it replaces D-134's stop-gap).
 *
 *   K0 intro → 1 ID number → 2 ID card (front) → 3 licence number → 4 licence photo → 5 selfie with ID
 *   → K5 Check & send → K6 Sent → board (F1 "In review")
 *
 * Each photo: guide → the phone's camera or the gallery → preview "Can you read it?" → sending (bar, %)
 * → the next step on its own; a failed send keeps the photo on the phone ("Try again"). Camera blocked
 * for good → K-blocked, re-read when the biker comes back from settings.
 *
 * - Every step is saved to the server as it's done, so leaving (✕) keeps progress and the board resumes at
 *   the first open step (B-todo-half). The flow derives where it is from `/auth/me`, not from the phone.
 * - `?redo=1` (after a decline): only the declined steps, the header counts "N to fix", and K5 marks the new
 *   items and says "Send again".
 * - `?start=intro`: open on K0 (from "Earn with your bike").
 * - Deviation (D-135, owner 2026-11-12): the handoff's live in-app camera (K2/K3/K4-cam: frame, live hints)
 *   needs a native module and a store build; until it ships, "Take photo" opens the phone's own camera.
 */

type Stage =
  | { k: "intro" }
  | { k: "num"; item: NumberItem }
  | { k: "guide"; item: PhotoItem }
  | { k: "preview"; item: PhotoItem; shot: UploadImageSource; from: PhotoSource }
  | { k: "sending"; item: PhotoItem; shot: UploadImageSource; pct: number }
  | { k: "fail"; item: PhotoItem; shot: UploadImageSource }
  | { k: "blocked"; item: PhotoItem }
  | { k: "check" }
  | { k: "sent" };

/**
 * K5-replace: a photo retaken from Check & send uploads in the background while K5 stays up (Send waits for
 * it). Module scope, so the photos taken this session also show as thumbnails on K5.
 */
type Bg = { status: "sending" | "failed"; shot: UploadImageSource; pct: number };
let background: Partial<Record<PhotoItem, Bg>> = {};
const shots: Partial<Record<PhotoItem, string>> = {};
const bgListeners = new Set<() => void>();
function setBg(item: PhotoItem, next: Bg | null): void {
  const copy = { ...background };
  if (next) copy[item] = next;
  else delete copy[item];
  background = copy;
  bgListeners.forEach((l) => l());
}
const subscribeBg = (l: () => void): (() => void) => {
  bgListeners.add(l);
  return () => void bgListeners.delete(l);
};
const getBg = (): Partial<Record<PhotoItem, Bg>> => background;

/** Test seam. */
export function __resetSignupForTest(): void {
  background = {};
  for (const k of Object.keys(shots)) delete shots[k as PhotoItem];
  bgListeners.forEach((l) => l());
}

const PHOTO: Record<PhotoItem, { a: string; b: string; body: string; icon: IconName; tips: readonly { icon: IconName; label: string }[]; cta: string; selfie: boolean }> = {
  idFront: { a: KS.docA, b: KS.docB, body: KS.guideDoc, icon: "id-card", cta: KS.takePhoto, selfie: false, tips: [{ icon: "sun", label: KS.tipLight }, { icon: "id-card", label: KS.tipCorners }, { icon: "x", label: KS.tipGlare }] },
  licence: { a: KS.licA, b: KS.licB, body: KS.guideDoc, icon: "id-card", cta: KS.takePhoto, selfie: false, tips: [{ icon: "sun", label: KS.tipLight }, { icon: "id-card", label: KS.tipCorners }, { icon: "x", label: KS.tipGlare }] },
  selfieId: { a: KS.selA, b: KS.selB, body: KS.guideSelfie, icon: "user", cta: KS.takeSelfie, selfie: true, tips: [{ icon: "sun", label: KS.tipLight }, { icon: "user", label: KS.tipHelmet }, { icon: "id-card", label: KS.tipIdFace }] },
};

const NUM: Record<NumberItem, { a: string; b: string; body: string; label: string; ph: string; err: string; dupA: string; dupBody: string }> = {
  idNumber: { a: KS.idA, b: KS.idB, body: KS.idBody, label: KS.idLabel, ph: KS.idPh, err: KS.idErr, dupA: KS.dupA, dupBody: KS.dupBody },
  licenceNumber: { a: KS.lnA, b: KS.lnB, body: KS.lnBody, label: KS.lnLabel, ph: KS.lnPh, err: KS.lnErr, dupA: KS.lnDupA, dupBody: KS.lnDupBody },
};

function stageFor(item: SignupItem): Stage {
  return isPhotoItem(item) ? { k: "guide", item } : { k: "num", item };
}

export default function SignupScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ redo?: string; start?: string }>();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const setError = useActionError();
  const done = signupDone({ idNumber: me?.idNumber, rider: me?.rider });

  // The steps this visit walks: all five, or (after a decline) only the declined ones — fixed at entry, since
  // each one stops being "declined" the moment it's sent again.
  const redoRef = useRef<SignupItem[] | null>(null);
  if (redoRef.current === null && params.redo === "1" && me) redoRef.current = declinedItems({ idNumber: me.idNumber, rider: me.rider });
  const redo = redoRef.current && redoRef.current.length > 0 ? redoRef.current : null;
  const seq: readonly SignupItem[] = redo ?? SIGNUP_ITEMS;

  const [stage, setStage] = useState<Stage | null>(null);
  const [returnToCheck, setReturnToCheck] = useState(false);
  // KB-04: a photo taken just before Android killed the app comes back first, on its own preview.
  // `undefined` = still asking; null = nothing to recover.
  const [recovered, setRecovered] = useState<{ item: PhotoItem; shot: UploadImageSource } | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void recoverPendingPhoto(["idFront", "licence", "selfieId"]).then((r) => {
      if (live) setRecovered(r ? { item: r.target as PhotoItem, shot: r.shot } : null);
    });
    return () => {
      live = false;
    };
  }, []);
  // The first stage, once `me` is here: K0, the first step to (re)do, or Check & send.
  useEffect(() => {
    if (stage || !me || recovered === undefined) return;
    if (recovered) return setStage({ k: "preview", item: recovered.item, shot: recovered.shot, from: "camera" });
    if (params.start === "intro" && !redo) return setStage({ k: "intro" });
    // A redo walks every declined step, even one still on file (the expired licence's number).
    if (redo) return setStage(stageFor(redo[0]!));
    const open = seq.find((i) => !done[i]);
    setStage(open ? stageFor(open) : { k: "check" });
  }, [stage, me, recovered, params.start, redo, seq, done]);

  const exit = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else replaceClearingStack(router, "/rider");
  }, [router]);

  const after = (item: SignupItem): void => {
    if (returnToCheck) {
      setReturnToCheck(false);
      return setStage({ k: "check" });
    }
    const i = seq.indexOf(item);
    const next = seq[i + 1];
    setStage(next ? stageFor(next) : { k: "check" });
  };

  const back = (): void => {
    if (!stage) return exit();
    switch (stage.k) {
      case "intro":
      case "sent":
        return exit();
      case "preview":
      case "fail":
      case "blocked":
        return setStage({ k: "guide", item: stage.item });
      case "sending":
        return; // the send finishes on its own
      case "check":
        return setStage(stageFor(seq[seq.length - 1]!));
      case "num":
      case "guide": {
        if (returnToCheck) {
          setReturnToCheck(false);
          return setStage({ k: "check" });
        }
        const i = seq.indexOf(stage.item);
        if (i > 0) return setStage(stageFor(seq[i - 1]!));
        if (!redo && params.start === "intro") return setStage({ k: "intro" });
        return exit();
      }
    }
  };

  // Android back walks the flow backwards, like the header's back.
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  // ── photos ────────────────────────────────────────────────────────────────────────────────────────
  const pick = (item: PhotoItem, from: PhotoSource): void => {
    void (async () => {
      const shot = await pickKycDoc(item, from).catch(() => null);
      if (shot === null) return;
      if (shot === "blocked") return setStage({ k: "blocked", item });
      if (shot === "denied") return setError(R.docPhotoDenied);
      setStage({ k: "preview", item, shot, from });
    })();
  };

  // K-blocked: no Retry; access is re-read when the biker comes back from phone settings (BRIEF 7).
  useOnAppActive(() => {
    if (stage?.k !== "blocked") return;
    const item = stage.item;
    void riderPhotoAllowed("camera").then((ok) => {
      if (ok) pick(item, "camera");
    });
  });

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const send = (item: PhotoItem, shot: UploadImageSource): void => {
    shots[item] = shot.uri;
    if (returnToCheck) {
      // K5-replace: K5 stays up; that row shows the bar and Send waits.
      setReturnToCheck(false);
      setStage({ k: "check" });
      setBg(item, { status: "sending", shot, pct: 0 });
      void sendSignupPhoto(qc, item, shot, (f) => setBg(item, { status: "sending", shot, pct: Math.round(f * 100) })).then((r) => {
        if (r === "ok") setBg(item, null);
        else setBg(item, { status: "failed", shot, pct: 0 });
        if (r === "refused") setError(KS.failBox);
      });
      return;
    }
    setStage({ k: "sending", item, shot, pct: 0 });
    void sendSignupPhoto(qc, item, shot, (f) => {
      if (alive.current) setStage((s) => (s?.k === "sending" && s.item === item ? { ...s, pct: Math.round(f * 100) } : s));
    }).then((r) => {
      if (!alive.current) return;
      if (r === "ok") return after(item);
      if (r === "refused") {
        setError(KS.failBox);
        return setStage({ k: "guide", item });
      }
      setStage({ k: "fail", item, shot });
    });
  };

  const bg = useSyncExternalStore(subscribeBg, getBg, getBg);

  // ── header ────────────────────────────────────────────────────────────────────────────────────────
  const total = seq.length;
  const fixLabel = (n: number): string => (total === 1 ? `1 ${KS.fix}` : `${n} ${KS.of} ${total} ${KS.fix}`);
  const header = (item: SignupItem | "check"): React.ReactElement => {
    const n = item === "check" ? total : seq.indexOf(item) + 1;
    const label = item === "check" ? (redo ? fixLabel(total) : KS.checkA) : redo ? fixLabel(n) : `${n} ${KS.of} ${total}`;
    return <StepHeader filled={n} total={total} label={label} onBack={back} onClose={exit} />;
  };

  const keyboard = useKeyboardVisible();
  const heroH = useStepHeroHeight();

  if (!stage) return <View testID="signup-loading" style={{ flex: 1, backgroundColor: tokens.color.bg }} />;

  switch (stage.k) {
    case "intro":
      return <SignupIntroPage testID="signup-k0" onExit={exit} onStart={() => setStage(stageFor(seq.find((i) => !done[i]) ?? seq[0]!))} />;

    case "num":
      return (
        <NumberStep
          key={stage.item}
          item={stage.item}
          header={header(stage.item)}
          // K-redo-licence draws the field empty: the number on file is the one being replaced.
          saved={redo?.includes(stage.item) ? null : stage.item === "idNumber" ? (me?.idNumber ?? null) : (me?.rider?.licenceNumber ?? null)}
          hideHero={keyboard}
          heroH={heroH}
          onSave={(v) => (stage.item === "idNumber" ? saveSignupIdNumber(qc, v) : saveSignupLicenceNumber(qc, v))}
          onDone={() => after(stage.item)}
          onFailed={() => setError()}
        />
      );

    case "guide": {
      const p = PHOTO[stage.item];
      return (
        <FirstRunScreen
          testID={`signup-guide-${stage.item}`}
          header={header(stage.item)}
          footer={
            <PinnedFooter
              primary={{ label: p.cta, icon: "camera", onPress: () => pick(stage.item, "camera"), testID: "signup-take" }}
              link={{ label: KS.gallery, icon: "image", onPress: () => pick(stage.item, "gallery"), testID: "signup-gallery" }}
            />
          }
        >
          <HeroPanel height={heroH}>
            <HeroDisc icon={p.icon} />
          </HeroPanel>
          <SplitTitle a={p.a} b={p.b} />
          <Body>{p.body}</Body>
          <TipChips items={p.tips} />
        </FirstRunScreen>
      );
    }

    case "preview": {
      const p = PHOTO[stage.item];
      return (
        <FirstRunScreen
          testID={`signup-preview-${stage.item}`}
          header={header(stage.item)}
          footer={
            <PinnedFooter
              primary={{ label: KS.use, onPress: () => send(stage.item, stage.shot), testID: "signup-use" }}
              link={{ label: KS.retake, icon: "refresh-cw", onPress: () => pick(stage.item, stage.from), testID: "signup-retake" }}
            />
          }
        >
          <Shot uri={stage.shot.uri} selfie={p.selfie} />
          <SplitTitle a={p.selfie ? KS.prevSelA : KS.prevA} b={p.selfie ? KS.prevSelB : KS.prevB} />
          <Body>{p.selfie ? KS.prevSelBody : KS.prevBody}</Body>
        </FirstRunScreen>
      );
    }

    case "sending": {
      const p = PHOTO[stage.item];
      return (
        <FirstRunScreen testID={`signup-sending-${stage.item}`} header={header(stage.item)} footer={<PinnedFooter primary={{ label: `${KS.sending} ${stage.pct}%`, onPress: () => undefined, disabled: true, testID: "signup-sending" }} />}>
          <Shot uri={stage.shot.uri} selfie={p.selfie} pct={stage.pct} />
          <SplitTitle a={KS.upA} b={KS.upB} />
          <Body>{KS.sendingBody}</Body>
        </FirstRunScreen>
      );
    }

    case "fail": {
      const p = PHOTO[stage.item];
      return (
        <FirstRunScreen
          testID={`signup-fail-${stage.item}`}
          header={header(stage.item)}
          footer={
            <PinnedFooter
              primary={{ label: KS.retry, icon: "refresh-cw", onPress: () => send(stage.item, stage.shot), testID: "signup-retry" }}
              link={{ label: KS.retake, icon: "camera", onPress: () => setStage({ k: "guide", item: stage.item }), testID: "signup-fail-retake" }}
            />
          }
        >
          <Shot uri={stage.shot.uri} selfie={p.selfie} />
          <InfoBox tone="bad" icon="circle-alert" text={KS.failBox} />
        </FirstRunScreen>
      );
    }

    case "blocked":
      return (
        <FirstRunScreen
          testID="signup-blocked"
          header={header(stage.item)}
          footer={
            <PinnedFooter
              primary={{ label: KS.openSettings, onPress: openPhoneSettings, testID: "signup-open-settings" }}
              link={{ label: KS.gallery, icon: "image", onPress: () => pick(stage.item, "gallery"), testID: "signup-blocked-gallery" }}
            />
          }
        >
          <HeroPanel tone="danger" height={heroH}>
            <HeroDisc icon="camera" />
          </HeroPanel>
          <SplitTitle a={KS.blockA} b={KS.blockB} tone="danger" />
          <Body>{KS.blockBody}</Body>
          <SystemSettingsSteps steps={[KS.bStep1, KS.bStep2, KS.bStep3]} />
        </FirstRunScreen>
      );

    case "check": {
      const busy = Object.values(bg).some((b) => b?.status === "sending");
      const ready = SIGNUP_ITEMS.every((i) => done[i]) && !busy && !Object.values(bg).some((b) => b?.status === "failed");
      const isNew = (i: SignupItem): boolean => !!redo && redo.includes(i);
      const numRow = (item: NumberItem, value: string | null): React.ReactElement => (
        <ListRow
          key={item}
          testID={`check-${item}`}
          leading={<IconDot icon="id-card" tone="ok" />}
          title={STEP_LABEL[item]}
          sub={value}
          right={<FrSoftPill label={KS.edit} testID={`check-edit-${item}`} onPress={() => (setReturnToCheck(true), setStage({ k: "num", item }))} />}
        />
      );
      const photoRow = (item: PhotoItem): React.ReactElement => {
        const b = bg[item];
        return (
          <ListRow
            key={item}
            testID={`check-${item}`}
            leading={<Thumb uri={b?.shot.uri ?? shots[item]} />}
            title={STEP_LABEL[item]}
            sub={b?.status === "failed" ? KS.failBox : isNew(item) ? KS.newTag : null}
            right={
              b?.status === "sending" ? (
                <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{KS.sending}</Text>
              ) : b?.status === "failed" ? (
                <FrSoftPill label={KS.retry} testID={`check-retry-${item}`} onPress={() => send(item, b.shot)} />
              ) : (
                <FrSoftPill label={KS.retake} testID={`check-retake-${item}`} onPress={() => (setReturnToCheck(true), setStage({ k: "guide", item }))} />
              )
            }
          />
        );
      };
      return (
        <FirstRunScreen
          testID="signup-check"
          header={header("check")}
          footer={
            <PinnedFooter
              primary={{
                label: redo ? KS.sendAgain : KS.sendCta,
                disabled: !ready,
                onPress: () => {
                  void qc.invalidateQueries({ queryKey: ["me"] });
                  setStage({ k: "sent" });
                },
                testID: "signup-send",
              }}
            />
          }
        >
          <SplitTitle a={KS.checkA} b={KS.checkB} />
          <Body>{KS.checkBody}</Body>
          <ListCard style={{ marginTop: 20 }}>
            {numRow("idNumber", me?.idNumber ? formatNationalId(me.idNumber) : null)}
            {photoRow("idFront")}
            {numRow("licenceNumber", me?.rider?.licenceNumber ?? null)}
            {photoRow("licence")}
            {photoRow("selfieId")}
          </ListCard>
        </FirstRunScreen>
      );
    }

    case "sent":
      return (
        <FirstRunScreen testID="signup-sent" footer={<PinnedFooter primary={{ label: KS.done, onPress: exit, testID: "signup-done" }} />}>
          <HeroPanel topLeft={<ExitButton onPress={exit} />}>
            <HeroDisc>
              <View style={{ alignSelf: "stretch", flex: 1, borderRadius: 999, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
                <Icon name="check" size={40} strokeWidth={1.75} color={tokens.color.onAccent} />
              </View>
            </HeroDisc>
          </HeroPanel>
          <SplitTitle a={KS.sentA} b={KS.sentB} />
          <Body>{KS.sentBody}</Body>
          <KycChecklist step2="active" label={RO.inReview} />
        </FirstRunScreen>
      );
  }
}

/** K1 / K3-num — one field, the number formatted as typed, validated on Next; it stays visible on return. */
function NumberStep({
  item,
  header,
  saved,
  hideHero,
  heroH,
  onSave,
  onDone,
  onFailed,
}: {
  item: NumberItem;
  header: React.ReactElement;
  saved: string | null;
  hideHero: boolean;
  heroH: number;
  onSave: (v: string) => Promise<"ok" | "dup" | "failed">;
  onDone: () => void;
  onFailed: () => void;
}): React.ReactElement {
  const n = NUM[item];
  const shape = item === "idNumber" ? typeIdNumber : typeLicenceNumber;
  const valid = item === "idNumber" ? idNumberValid : licenceNumberValid;
  const initial = saved ? (item === "idNumber" ? formatNationalId(saved) : typeLicenceNumber(saved)) : "";
  const [value, setValue] = useState(initial);
  const [error, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const unchanged = !!initial && value === initial;

  const next = async (): Promise<void> => {
    if (busy) return;
    if (!valid(value)) return setErr(n.err);
    if (unchanged) return onDone();
    setBusy(true);
    const r = await onSave(value);
    setBusy(false);
    if (r === "ok") return onDone();
    if (r === "dup") return setDup(true);
    onFailed();
  };

  return (
    <FirstRunScreen
      testID={`signup-num-${item}`}
      header={header}
      footer={
        dup ? (
          <PinnedFooter
            primary={{ label: KS.dupCta, icon: "message-circle", onPress: openSupport, testID: "signup-dup-help" }}
            link={{ label: KS.dupAlt, onPress: () => (setDup(false), setValue("")), testID: "signup-dup-change" }}
          />
        ) : (
          <PinnedFooter primary={{ label: KS.next, icon: "arrow-right", onPress: () => void next(), loading: busy, testID: "signup-next" }} />
        )
      }
    >
      {hideHero ? null : (
        <HeroPanel height={heroH}>
          <HeroDisc icon="id-card" />
        </HeroPanel>
      )}
      <SplitTitle a={n.a} b={n.b} style={hideHero ? { marginTop: 4 } : undefined} />
      <Body>{n.body}</Body>
      <FrField
        testID={`signup-field-${item}`}
        label={n.label}
        value={value}
        onChangeText={(v) => {
          setValue(shape(v));
          setErr(null);
          setDup(false);
        }}
        placeholder={n.ph}
        error={error}
        invalid={dup}
        helper={unchanged && !dup ? KS.looksRight : undefined}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={item === "idNumber" ? 13 : 12}
        returnKeyType="next"
        onSubmitEditing={() => void next()}
        inputStyle={{ fontSize: 20, fontWeight: tokens.font.weight.semibold, letterSpacing: 0.8, fontVariant: ["tabular-nums"] }}
        style={{ marginTop: 20 }}
      />
      {dup ? <InfoBox tone="bad" icon="circle-alert" title={n.dupA} text={n.dupBody} testID="signup-dup" /> : null}
    </FirstRunScreen>
  );
}

/** The photo as taken: an ID-1 card shape full width, or the 5:6 selfie at 200; the 4dp bar while it sends. */
function Shot({ uri, selfie, pct }: { uri: string; selfie: boolean; pct?: number }): React.ReactElement {
  const box = selfie ? { width: 200, aspectRatio: 5 / 6, alignSelf: "center" as const } : { width: "100%" as const, aspectRatio: 1.586 };
  return (
    <View style={{ marginTop: 8 }}>
      <Image source={{ uri }} accessibilityIgnoresInvertColors resizeMode="cover" style={{ ...box, borderRadius: 16, backgroundColor: tokens.color.accentWash }} />
      {pct != null ? (
        <View testID="signup-progress" style={{ ...(selfie ? { width: 200, alignSelf: "center" as const } : {}), height: 4, borderRadius: 2, backgroundColor: tokens.color.line, marginTop: 10, overflow: "hidden" }}>
          <View style={{ width: `${pct}%`, height: 4, backgroundColor: tokens.color.accent }} />
        </View>
      ) : null}
    </View>
  );
}

/** README §4 "Thumbnail": 52×40, radius 6. The photo taken this session, or the mint placeholder. */
function Thumb({ uri }: { uri?: string }): React.ReactElement {
  return uri ? (
    <Image source={{ uri }} accessibilityIgnoresInvertColors style={{ width: 52, height: 40, borderRadius: 6, backgroundColor: tokens.color.accentWash }} />
  ) : (
    <View style={{ width: 52, height: 40, borderRadius: 6, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
      <Icon name="image" size={16} color={tokens.color.accentText} />
    </View>
  );
}
