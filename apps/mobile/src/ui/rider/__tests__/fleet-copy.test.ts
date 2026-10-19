/**
 * Own bikers v1 (ledger D-117): the biker's strings are the handoff's `OB.biker`, verbatim. The app's templates,
 * fed the handoff's own sample values, must give back exactly the handoff's strings — "biker", never "rider".
 * Every fleet screen names the biker's home branch (owner decision P7-1), so the handoff's short "Chicken Inn"
 * and long "Chicken Inn Avondale" are one parameter: each template is checked with the name the handoff used.
 */
import { bikerWording } from "@lynia/shared";
import { OBB } from "../fleet-copy";

// Required at run time, not imported: the handoff file isn't written for this app's strict compiler (and
// packages/design is never edited to suit the app).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const B = (require("../../../../../../packages/design/handoff/own-bikers-v1/copy") as { OB: { biker: Record<string, string> } }).OB.biker;
const LONG = "Chicken Inn Avondale";
const SHORT = "Chicken Inn";
const v = (s: string | undefined) => bikerWording(s ?? "");

describe("Own bikers v1 · biker copy", () => {
  it("joining (OB-R1–R3)", () => {
    expect(OBB.invitedWait(LONG)).toBe(v(B.invitedWait));
    expect(OBB.joinT(LONG)).toBe(v(B.joinT));
    expect(OBB.joinB(SHORT)).toBe(v(B.joinB));
    expect(OBB.join).toBe(B.join);
    expect(OBB.notNow).toBe(B.notNow);
    expect(OBB.joining).toBe(B.joining);
    expect(OBB.push(LONG)).toBe(v(B.push));
    expect(OBB.refNet).toBe(v(B.refNet));
    expect(OBB.gPendingT).toBe(B.gPendingT);
    expect(OBB.gPendingB).toBe(B.gPendingB);
  });

  it("the fleet board (OB-R4–R6)", () => {
    expect(OBB.fleetJobs(SHORT)).toBe(B.fleetJobs);
    expect(OBB.fleetTag(SHORT)).toBe(B.fleetTag);
    expect(OBB.toPickup).toBe(B.toPickup);
    expect(OBB.trip).toBe(B.trip);
    expect(OBB.ringsHint(SHORT)).toBe(B.ringsHint);
    expect(OBB.emptyT(SHORT)).toBe(B.emptyT);
    expect(OBB.staleB).toBe(B.staleB);
    expect(OBB.loadFail(SHORT)).toBe(B.loadFail);
    expect(OBB.pausedT(SHORT)).toBe(B.pausedT);
    expect(OBB.pausedB(SHORT)).toBe(B.pausedB);
  });

  it("the offer (OB-R7)", () => {
    expect(OBB.offerT(SHORT)).toBe(B.offerT);
    expect(OBB.meta("0.4 km", "3.2 km")).toBe(B.meta);
    expect(OBB.collectDoor).toBe(B.collectDoor);
    expect(OBB.collectDoorB(LONG)).toBe(B.collectDoorB);
    expect(OBB.accept).toBe(B.accept);
    expect(OBB.pass).toBe(B.pass);
    expect(OBB.passHint).toBe(B.passHint);
    expect(OBB.expT).toBe(v(B.expT));
    expect(OBB.expB(SHORT, 60)).toBe(v(B.expB));
    expect(OBB.backJobs).toBe(B.backJobs);
  });
});
