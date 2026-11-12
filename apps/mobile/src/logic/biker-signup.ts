import { Linking } from "react-native";
import { SOS_POLICY } from "@lynia/shared";
import { supportWhatsAppUrl } from "../config";
import { NATIONAL_ID_RE, formatNationalId } from "./national-id";
import { telUri } from "./safety";

/**
 * Biker sign-up v1 (packages/design/handoff/biker-signup-v1, ledger D-135): the five required steps of the
 * manual-review sign-up, and what the board shows for each state. Everything is derived from the server's
 * `/auth/me` (the ID number, the licence number and which of the three photos are on file), so a biker who
 * leaves, loses data or reinstalls resumes at the first open step on any phone.
 *
 *   1 idNumber · 2 idFront · 3 licenceNumber · 4 licence (photo) · 5 selfieId
 */
export const SIGNUP_ITEMS = ["idNumber", "idFront", "licenceNumber", "licence", "selfieId"] as const;
export type SignupItem = (typeof SIGNUP_ITEMS)[number];
export type PhotoItem = "idFront" | "licence" | "selfieId";
export type NumberItem = "idNumber" | "licenceNumber";

export function isPhotoItem(i: SignupItem): i is PhotoItem {
  return i === "idFront" || i === "licence" || i === "selfieId";
}

/** What the sign-up reads from `/auth/me`. */
export interface SignupFacts {
  idNumber?: string | null;
  rider?: {
    kycStatus?: string | null;
    kycMode?: "auto" | "manual";
    kycDeclineReason?: string | null;
    kycAttempts?: number;
    kycDocs?: { idFront: boolean; licence: boolean; selfieId: boolean } | null;
    licenceNumber?: string | null;
  } | null;
}

export function signupDone(f: SignupFacts): Record<SignupItem, boolean> {
  const d = f.rider?.kycDocs;
  return {
    idNumber: !!f.idNumber?.trim(),
    idFront: !!d?.idFront,
    licenceNumber: !!f.rider?.licenceNumber?.trim(),
    licence: !!d?.licence,
    selfieId: !!d?.selfieId,
  };
}

export function signupDoneCount(f: SignupFacts): number {
  const d = signupDone(f);
  return SIGNUP_ITEMS.filter((i) => d[i]).length;
}

/** The first step still to do, or null when all five are on file. */
export function firstOpenItem(f: SignupFacts, among: readonly SignupItem[] = SIGNUP_ITEMS): SignupItem | null {
  const d = signupDone(f);
  return among.find((i) => !d[i]) ?? null;
}

/**
 * The items a manual decline asks to redo (B-decl-*): the photo slots the decline reopened (the server clears
 * exactly those, `KYC_PHOTO_RETAKE_REASONS`), plus the licence NUMBER when the licence has expired (README §2
 * "Licence expired marks number and photo"). Drawn order, never empty for a fixable decline.
 */
export function declinedItems(f: SignupFacts): SignupItem[] {
  const d = signupDone(f);
  const reason = f.rider?.kycDeclineReason;
  const out = SIGNUP_ITEMS.filter((i) => isPhotoItem(i) && !d[i]) as SignupItem[];
  if (reason === "licence_expired") return SIGNUP_ITEMS.filter((i) => i === "licenceNumber" || out.includes(i));
  return out;
}

export type DeclineKind = "photo" | "licence" | "selfie";

/** The reason → which B-decl page (its title and CTA). `photos_unreadable` is the ID-photo page. */
export function declineKind(reason: string | null | undefined): DeclineKind | null {
  switch (reason) {
    case "photos_unreadable":
      return "photo";
    case "licence_expired":
      return "licence";
    case "selfie_unclear":
      return "selfie";
    default:
      return null;
  }
}

/**
 * The board while a manual-review biker is unverified:
 *   intro   K0 — nothing sent yet ("Become a biker in 5 steps")
 *   half    B-todo-half — some steps done; "Continue" resumes at the first open one
 *   wait    B-wait — all five on file (F1 "Our team is taking a look", as shipped)
 *   declined B-decl-* — a photo-retake decline; only the named steps are redone
 * Null: not this flow (automated check, verified, or a decline the sign-up can't fix: those keep F pages).
 */
export type SignupBoard = { kind: "intro" } | { kind: "half"; done: number } | { kind: "wait" } | { kind: "declined"; decline: DeclineKind; items: SignupItem[] };

export function signupBoardFor(f: SignupFacts): SignupBoard | null {
  const r = f.rider;
  if (!r || r.kycMode !== "manual") return null;
  if (r.kycStatus === "pending") {
    const done = signupDoneCount(f);
    if (done === 0) return { kind: "intro" };
    if (done < SIGNUP_ITEMS.length) return { kind: "half", done };
    return { kind: "wait" };
  }
  if (r.kycStatus === "failed" && (r.kycAttempts ?? 0) < 2) {
    const decline = declineKind(r.kycDeclineReason);
    const items = declinedItems(f);
    if (decline && items.length > 0) return { kind: "declined", decline, items };
  }
  return null;
}

/** K1: the ID number as typed — digits, the check letter, the dash put in after the two district digits. */
export function typeIdNumber(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return compact.length > 2 ? `${compact.slice(0, 2)}-${compact.slice(2, 12)}` : compact;
}

export function idNumberValid(raw: string): boolean {
  return NATIONAL_ID_RE.test(formatNationalId(raw));
}

/** K3-num: upper-case letters and digits, spaces stripped; 5–12 characters (README §6: until ops confirm a format). */
export function typeLicenceNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 12);
}

export const LICENCE_NUMBER_RE = /^[A-Z0-9]{5,12}$/;

export function licenceNumberValid(raw: string): boolean {
  return LICENCE_NUMBER_RE.test(typeLicenceNumber(raw));
}

/** "Message us on WhatsApp" / "Help on WhatsApp": WhatsApp support, or the safety line when it isn't set. */
export function openSupport(): void {
  const url = supportWhatsAppUrl();
  if (url) {
    void Linking.openURL(url);
    return;
  }
  const tel = telUri(SOS_POLICY.safetyLine);
  if (tel) void Linking.openURL(tel);
}
