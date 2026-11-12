import { tokens } from "@lynia/shared/tokens";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import React, { useState, useSyncExternalStore } from "react";
import { Image, Text, View } from "react-native";
import type { Me } from "../../api/auth";
import type { UploadImageSource } from "../../logic/image-downscale";
import { isRefusedUpload, KYC_DOC_SLOTS, type KycDocSlot, kycDocsComplete, pickKycDoc, saveKycDoc } from "../../logic/manual-kyc";
import type { PhotoSource } from "../../logic/rider-documents";
import { EVENTS, track } from "../../telemetry/events";
import { Body, FrSheet, ListRow } from "../firstrun";
import { BD } from "../firstrun/copy";
import { useActionError } from "../Toast";
import { MK } from "./manual-kyc-copy";

/**
 * Manual KYC document rows for Bike & documents (ledger D-122, design review 2026-11-04). Built exactly like
 * the E1 Photo row: a soft "+ Add" → the camera/gallery sheet (with the guide line) → an upload that runs on
 * its own per row (Uploading… → Change, or "didn't finish" + Try again). No Submit button.
 *
 * KB-02 (owner 2026-11-12, "Licence expiry not necessary"): the typed licence number + expiry row is gone.
 * Ops read both off the licence photo; with no expiry on file the server's expiry gate and reminders stay
 * inert (they only act on a stored date).
 */

type UploadState = { kind: "uploading"; shot: UploadImageSource } | { kind: "failed"; shot: UploadImageSource };

// Slot-keyed, module-scoped (like FR-M1's photo upload): backing out mid-upload and returning still shows it
// uploading, and two slots uploading at once never overwrite each other.
let uploads: Partial<Record<KycDocSlot, UploadState>> = {};
const listeners = new Set<() => void>();
function setUpload(slot: KycDocSlot, next: UploadState | null): void {
  const copy = { ...uploads };
  if (next) copy[slot] = next;
  else delete copy[slot];
  uploads = copy;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const getUploads = (): Partial<Record<KycDocSlot, UploadState>> => uploads;

/** Test seam: forget in-flight uploads between tests. */
export function __resetKycDocUploadsForTest(): void {
  uploads = {};
  listeners.forEach((l) => l());
}

const TITLE: Record<KycDocSlot, string> = { idFront: MK.idFront, licence: MK.licence, selfieId: MK.selfieId };
const GUIDE: Record<KycDocSlot, string> = { idFront: MK.guideDoc, licence: MK.guideDoc, selfieId: MK.guideSelfie };

function applyDocs(qc: QueryClient, kycDocs: Me["rider"] extends infer R ? (R extends { kycDocs?: infer D } ? D : never) : never): void {
  qc.setQueryData<Me>(["me"], (cur) => (cur?.rider ? { ...cur, rider: { ...cur.rider, kycDocs } } : cur));
  void qc.invalidateQueries({ queryKey: ["me"] });
}

/** Runs one slot's upload; the result lands in the cached `me`. Exported for tests. */
export async function runKycDocUpload(qc: QueryClient, slot: KycDocSlot, shot: UploadImageSource): Promise<"ok" | "failed" | "refused"> {
  setUpload(slot, { kind: "uploading", shot });
  try {
    const docs = await saveKycDoc(slot, shot);
    setUpload(slot, null);
    if (docs) {
      track(EVENTS.kycDocUploaded, { slot });
      if (kycDocsComplete(docs)) track(EVENTS.kycDocsComplete, {});
      applyDocs(qc, docs);
    } else {
      void qc.invalidateQueries({ queryKey: ["me"] });
    }
    return "ok";
  } catch (e) {
    // A refused photo (wrong type, too large) is not a connection problem: drop it and say so.
    if (isRefusedUpload(e)) {
      setUpload(slot, null);
      return "refused";
    }
    setUpload(slot, { kind: "failed", shot });
    return "failed";
  }
}

export interface KycDocRowsProps {
  rider: NonNullable<Me["rider"]>;
  /** The screen's own E1 "+ Add" pill (so the drawn pill stays one component). */
  AddPill: (p: { onPress: () => void; testID?: string }) => React.ReactElement;
  /** Opens the phone settings sheet when camera/gallery access is blocked. */
  onBlocked: (from: PhotoSource) => void;
}

/** The three document rows, plus their camera/gallery sheet. */
export function KycDocRows({ rider, AddPill, onBlocked }: KycDocRowsProps): React.ReactElement {
  const qc = useQueryClient();
  const setError = useActionError();
  const live = useSyncExternalStore(subscribe, getUploads, getUploads);
  const [sheet, setSheet] = useState<KycDocSlot | null>(null);
  const docs = rider.kycDocs ?? { idFront: false, licence: false, selfieId: false };

  const open = (slot: KycDocSlot): void => {
    if (!docs.idFront && !docs.licence && !docs.selfieId) track(EVENTS.kycDocsStarted, {});
    setSheet(slot);
  };

  const choose = async (from: PhotoSource): Promise<void> => {
    const slot = sheet;
    setSheet(null);
    if (!slot) return;
    const shot = await pickKycDoc(slot, from);
    if (shot === "blocked") return onBlocked(from);
    if (shot === "denied" || shot == null) return;
    const res = await runKycDocUpload(qc, slot, shot);
    if (res === "refused") setError(BD.failBody);
  };

  const row = (slot: KycDocSlot): React.ReactElement => {
    const u = live[slot];
    const title = TITLE[slot];
    if (u?.kind === "uploading") {
      return (
        <ListRow
          key={slot}
          testID={`row-doc-${slot}`}
          leading={<Image source={{ uri: u.shot.uri }} accessibilityIgnoresInvertColors style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: tokens.color.accentWash }} />}
          title={title}
          sub={null}
          right={<Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{BD.uploading}</Text>}
          accessibilityLabel={`${title}, ${BD.uploading}`}
        />
      );
    }
    if (u?.kind === "failed") {
      return (
        <ListRow
          key={slot}
          testID={`row-doc-${slot}`}
          icon="id-card"
          iconTone="bad"
          title={title}
          sub={`${BD.failA} ${BD.failB}`}
          value={BD.retry}
          onPress={() => void runKycDocUpload(qc, slot, u.shot)}
          accessibilityLabel={`${title}, ${BD.failA} ${BD.failB}, ${BD.retry}`}
        />
      );
    }
    if (docs[slot]) {
      return <ListRow key={slot} testID={`row-doc-${slot}`} icon="id-card" iconTone="ok" title={title} value={BD.change} onPress={() => open(slot)} />;
    }
    return (
      <ListRow
        key={slot}
        testID={`row-doc-${slot}`}
        icon="id-card"
        title={title}
        sub={MK.sub}
        right={<AddPill onPress={() => open(slot)} testID={`add-doc-${slot}`} />}
        accessibilityLabel={`${title}, ${MK.sub}`}
      />
    );
  };

  return (
    <>
      {KYC_DOC_SLOTS.map(row)}

      {/* E2a for a document: the guide line, then camera / gallery. */}
      <FrSheet visible={sheet != null} onClose={() => setSheet(null)} testID="doc-sheet">
        <Text accessibilityRole="header" style={{ marginBottom: 8, fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {sheet ? TITLE[sheet] : ""}
        </Text>
        <Body>{sheet ? GUIDE[sheet] : ""}</Body>
        <View style={{ marginTop: 12, borderRadius: tokens.radius.card, overflow: "hidden" }}>
          <ListRow icon="camera" iconTone="ok" title={BD.camera} onPress={() => void choose("camera")} testID="doc-camera" />
          <ListRow icon="image" iconTone="ok" title={BD.gallery} onPress={() => void choose("gallery")} testID="doc-gallery" />
        </View>
      </FrSheet>
    </>
  );
}
