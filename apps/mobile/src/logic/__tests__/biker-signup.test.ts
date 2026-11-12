/** Biker sign-up v1 (ledger D-135): where the biker is, what the board shows, what a decline asks to redo. */
import { bikerWording } from "@lynia/shared";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  declinedItems,
  firstOpenItem,
  idNumberValid,
  licenceNumberValid,
  signupBoardFor,
  signupDoneCount,
  typeIdNumber,
  typeLicenceNumber,
  type SignupFacts,
} from "../biker-signup";
import { extrasNeeded } from "../rider-extras";
import { KS } from "../../ui/rider/signup-copy";

const none = { idFront: false, licence: false, selfieId: false };
const all = { idFront: true, licence: true, selfieId: true };
const facts = (p: Partial<NonNullable<SignupFacts["rider"]>> = {}, idNumber: string | null = null): SignupFacts => ({
  idNumber,
  rider: { kycStatus: "pending", kycMode: "manual", kycDocs: none, licenceNumber: null, kycAttempts: 0, ...p },
});

describe("progress and resume", () => {
  it("counts the five steps from /auth/me and resumes at the first open one", () => {
    expect(signupDoneCount(facts())).toBe(0);
    expect(firstOpenItem(facts())).toBe("idNumber");
    const half = facts({ kycDocs: { ...none, idFront: true } }, "63123456A78");
    expect(signupDoneCount(half)).toBe(2);
    expect(firstOpenItem(half)).toBe("licenceNumber");
    expect(firstOpenItem(facts({ kycDocs: all, licenceNumber: "AB12345" }, "63123456A78"))).toBeNull();
  });
});

describe("the board (README §1, §5)", () => {
  it("K0 before anything is sent, B-todo-half part way, F1 only once all five are in", () => {
    expect(signupBoardFor(facts())).toEqual({ kind: "intro" });
    expect(signupBoardFor(facts({ kycDocs: all }, "63123456A78"))).toEqual({ kind: "half", done: 4 });
    expect(signupBoardFor(facts({ kycDocs: all, licenceNumber: "AB12345" }, "63123456A78"))).toEqual({ kind: "wait" });
  });

  it("is not this flow for an automated check or a verified biker", () => {
    expect(signupBoardFor(facts({ kycMode: "auto" }))).toBeNull();
    expect(signupBoardFor(facts({ kycStatus: "verified" }))).toBeNull();
  });

  it("a photo decline asks only for the reopened photo; licence expired also asks for the number", () => {
    const base = { kycStatus: "failed", licenceNumber: "AB12345", kycAttempts: 0 };
    expect(signupBoardFor(facts({ ...base, kycDeclineReason: "photos_unreadable", kycDocs: { ...all, idFront: false } }, "63123456A78"))).toEqual({
      kind: "declined",
      decline: "photo",
      items: ["idFront"],
    });
    expect(declinedItems(facts({ ...base, kycDeclineReason: "licence_expired", kycDocs: { ...all, licence: false } }, "63123456A78"))).toEqual(["licenceNumber", "licence"]);
    expect(signupBoardFor(facts({ ...base, kycDeclineReason: "selfie_unclear", kycDocs: { ...all, selfieId: false } }, "63123456A78"))).toMatchObject({ decline: "selfie", items: ["selfieId"] });
  });

  it("a locked biker or a reason the sign-up can't fix keeps the F pages", () => {
    expect(signupBoardFor(facts({ kycStatus: "failed", kycAttempts: 2, kycDeclineReason: "photos_unreadable" }))).toBeNull();
    expect(signupBoardFor(facts({ kycStatus: "failed", kycDeclineReason: "duplicate" }))).toBeNull();
  });
});

describe("typed numbers (K1, K3-num)", () => {
  it("the ID number gets its dash after two digits, upper-case, and validates on the D5 format", () => {
    expect(typeIdNumber("63482913k07")).toBe("63-482913K07");
    expect(typeIdNumber("63")).toBe("63");
    expect(idNumberValid("63-482913K07")).toBe(true);
    expect(idNumberValid("63-48291")).toBe(false);
  });

  it("the licence number is letters and digits, spaces stripped, 5–12 characters", () => {
    expect(typeLicenceNumber("ab 4829 13")).toBe("AB482913");
    expect(licenceNumberValid("48")).toBe(false);
    expect(licenceNumberValid("482913AB")).toBe(true);
  });
});

describe("extras (X1/X2)", () => {
  it("are offered only when the photo or the plate is missing", () => {
    expect(extrasNeeded({ hasPhoto: false, bikeReg: "ABC 1234" })).toBe(true);
    expect(extrasNeeded({ hasPhoto: true, bikeReg: null })).toBe(true);
    expect(extrasNeeded({ hasPhoto: true, bikeReg: "ABC 1234" })).toBe(false);
  });
});

describe("copy", () => {
  it("ships the handoff's copy.ts verbatim, with rider read as biker (D-101)", async () => {
    const src = readFileSync(resolve(__dirname, "../../../../../packages/design/handoff/biker-signup-v1/copy.ts"), "utf8");
    const body = src.slice(src.indexOf("{", src.indexOf("export const KS")));
    const handoff = new Function(`return ${body.replace(/\s+as const;?\s*$/, "")}`)() as Record<string, string>;
    expect(Object.keys(KS)).toEqual(Object.keys(handoff));
    for (const [k, v] of Object.entries(handoff)) expect([k, (KS as Record<string, string>)[k]]).toEqual([k, bikerWording(v)]);
  });
});
