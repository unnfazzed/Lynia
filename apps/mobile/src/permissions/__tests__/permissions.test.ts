/**
 * First Run v2 permission state (ledger D-80, handoff `first-run-v2` README §3–§4): the pure classifiers,
 * the per-install flags, the PC8 gate and the rider-flow step logic.
 */
const mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
}));
let mockNotif: Record<string, unknown> = { status: "undetermined", granted: false, canAskAgain: true };
let mockLoc: Record<string, unknown> = { status: "granted", granted: true, canAskAgain: true };
const mockSetChannel = jest.fn(async (..._a: unknown[]) => null);
const mockChannels: Record<string, { importance: number } | null> = {};
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: async () => mockNotif,
  setNotificationChannelAsync: (...a: unknown[]) => mockSetChannel(...a),
  getNotificationChannelAsync: async (id: string) => mockChannels[id] ?? null,
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2 },
}));
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: async () => mockLoc,
  hasServicesEnabledAsync: async () => true,
}));

import { routeAfterOrderPlaced, shouldExplainOrderUpdates } from "../../push/ask-in-context";
import { afterLocationAnswer, entryScreen, finishRiderPermFlow, startRiderPermFlow, stepsFor } from "../../logic/rider-perm-flow";
import { Platform } from "react-native";
import { allGranted, channelIsMuted, classifyLocation, classifyNotif, ensureJobAlertChannel, JOB_ALERTS_CHANNEL, mutedJobChannel, type PermissionsSnapshot } from "../state";
import { CUST_NOTIF_ASK_CAP, CUST_NOTIF_ASKS_SLOT, custNotifAsks, markRiderPermFlowDone, noteCustNotifAsked, RIDER_PERM_FLOW_KEY, riderPermFlowDone } from "../store";

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockNotif = { status: "undetermined", granted: false, canAskAgain: true };
  mockLoc = { status: "granted", granted: true, canAskAgain: true };
});

describe("classifyLocation (README §4 loc)", () => {
  it.each([
    [{ status: "undetermined", granted: false, canAskAgain: true }, "undetermined"],
    [{ status: "granted", granted: true, android: { accuracy: "fine" } }, "granted"],
    [{ status: "granted", granted: true, android: { accuracy: "coarse" } }, "coarse"],
    [{ status: "denied", granted: false, canAskAgain: true }, "denied"],
    [{ status: "denied", granted: false, canAskAgain: false }, "blocked"],
    [null, "denied"],
  ])("%j → %s", (p, want) => expect(classifyLocation(p)).toBe(want));
});

describe("classifyNotif (README §4 notif)", () => {
  it.each([
    [{ status: "undetermined", granted: false, canAskAgain: true }, "undetermined"],
    [{ status: "granted", granted: true }, "granted"],
    [{ status: "denied", granted: false, canAskAgain: true }, "denied"],
    [{ status: "denied", granted: false, canAskAgain: false }, "blocked"],
  ])("%j → %s", (p, want) => expect(classifyNotif(p)).toBe(want));
});

it("a job-alert channel below HIGH importance is muted (P12)", () => {
  expect(channelIsMuted({ importance: 5 })).toBe(false);
  expect(channelIsMuted({ importance: 4 })).toBe(false);
  expect(channelIsMuted({ importance: 3 })).toBe(true);
  expect(channelIsMuted(null)).toBe(false);
});

const ALL: PermissionsSnapshot = { loc: "granted", gps: true, notif: "granted", channelMuted: false };

it("allGranted needs precise location, GPS on, notifications and a loud channel", () => {
  expect(allGranted(ALL)).toBe(true);
  expect(allGranted({ ...ALL, loc: "coarse" })).toBe(false);
  expect(allGranted({ ...ALL, gps: false })).toBe(false);
  expect(allGranted({ ...ALL, notif: "denied" })).toBe(false);
  expect(allGranted({ ...ALL, channelMuted: true })).toBe(false);
});

describe("per-install flags", () => {
  it("riderPermFlowDone round-trips", async () => {
    expect(await riderPermFlowDone()).toBe(false);
    await markRiderPermFlowDone();
    expect(mockStore[RIDER_PERM_FLOW_KEY]).toBe("1");
    expect(await riderPermFlowDone()).toBe(true);
  });

  it("custNotifAsks counts up", async () => {
    expect(await custNotifAsks()).toBe(0);
    await noteCustNotifAsked();
    await noteCustNotifAsked();
    expect(mockStore[CUST_NOTIF_ASKS_SLOT]).toBe("2");
  });
});

describe("PC8 gate (src/push/ask-in-context.ts)", () => {
  it("explains after an order while undetermined and under the cap of 3", async () => {
    expect(CUST_NOTIF_ASK_CAP).toBe(3);
    expect(await shouldExplainOrderUpdates()).toBe(true);
    expect(await routeAfterOrderPlaced("o-1")).toBe("/order-updates?next=%2Forder%2Fo-1");
  });

  it("stops after 3 asks", async () => {
    mockStore[CUST_NOTIF_ASKS_SLOT] = "3";
    expect(await shouldExplainOrderUpdates()).toBe(false);
    expect(await routeAfterOrderPlaced("o-1")).toBe("/order/o-1");
  });

  it("never explains once the OS has an answer (granted, or denied in the dialog)", async () => {
    mockNotif = { status: "granted", granted: true };
    expect(await routeAfterOrderPlaced("o-1")).toBe("/order/o-1");
    mockNotif = { status: "denied", granted: false, canAskAgain: true };
    expect(await routeAfterOrderPlaced("o-1")).toBe("/order/o-1");
  });
});

describe("rider flow steps (README §2B)", () => {
  it("location entry: P1 to ask, P4 approximate, P6 blocked, P7 GPS off, nothing when granted", () => {
    expect(entryScreen("location", { ...ALL, loc: "undetermined" })).toBe("P1");
    expect(entryScreen("location", { ...ALL, loc: "denied" })).toBe("P1");
    expect(entryScreen("location", { ...ALL, loc: "coarse" })).toBe("P4");
    expect(entryScreen("location", { ...ALL, loc: "blocked" })).toBe("P6");
    expect(entryScreen("location", { ...ALL, gps: false })).toBe("P7");
    expect(entryScreen("location", ALL)).toBeNull();
  });

  it("notification entry: P9 to ask, P11 blocked, P12 muted, nothing when granted", () => {
    expect(entryScreen("notifications", { ...ALL, notif: "undetermined" })).toBe("P9");
    expect(entryScreen("notifications", { ...ALL, notif: "denied" })).toBe("P9");
    expect(entryScreen("notifications", { ...ALL, notif: "blocked" })).toBe("P11");
    expect(entryScreen("notifications", { ...ALL, channelMuted: true })).toBe("P12");
    expect(entryScreen("notifications", ALL)).toBeNull();
    expect(entryScreen("battery", ALL)).toBe("P16");
    expect(entryScreen("done", ALL)).toBe("P13");
  });

  it("the Android dialog's answer (P2): precise → P3 + toast, approximate → P4, deny → P5, deny for good → P6", () => {
    expect(afterLocationAnswer("granted", true)).toBe("granted");
    expect(afterLocationAnswer("granted", false)).toBe("P7");
    expect(afterLocationAnswer("coarse", true)).toBe("P4");
    expect(afterLocationAnswer("denied", true)).toBe("P5");
    expect(afterLocationAnswer("blocked", true)).toBe("P6");
  });

  it("the whole flow from R3, or one step from the board / Settings", () => {
    expect(stepsFor("flow", null)).toEqual(["location", "notifications", "done"]);
    expect(stepsFor("single", "notifications")).toEqual(["notifications"]);
  });
});

describe("startRiderPermFlow (owner decision D-80 §2 #5)", () => {
  it("everything granted → online straight away, no flow", async () => {
    mockNotif = { status: "granted", granted: true };
    const push = jest.fn();
    const goOnline = jest.fn();
    await startRiderPermFlow({ push }, goOnline);
    expect(goOnline).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("something missing → the flow opens, and P13's Go online runs the callback once", async () => {
    const push = jest.fn();
    const goOnline = jest.fn();
    await startRiderPermFlow({ push }, goOnline);
    expect(push).toHaveBeenCalledWith("/permissions?from=flow");
    expect(goOnline).not.toHaveBeenCalled();
    expect(finishRiderPermFlow()).toBe(true);
    expect(goOnline).toHaveBeenCalledTimes(1);
    expect(finishRiderPermFlow()).toBe(false);
  });

  it("NEEDS NATIVE copy is the handoff's, verbatim: the manifest rationale (app.config.ts, next store build)", () => {
    const { RP } = jest.requireActual("../../ui/firstrun/copy") as typeof import("../../ui/firstrun/copy");
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const config = fs.readFileSync(path.join(__dirname, "..", "..", "..", "app.config.ts"), "utf8");
    expect(config).toContain(JSON.stringify(RP.manifestRationale));
  });

  it("the flow already ran on this phone → online, J8/G8 cover what was skipped", async () => {
    mockStore[RIDER_PERM_FLOW_KEY] = "1";
    const push = jest.fn();
    const goOnline = jest.fn();
    await startRiderPermFlow({ push }, goOnline);
    expect(goOnline).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("the job-alerts channel on Android (owner 2026-10-06: the API posts job pings + food-offer alarms there)", () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "android");
    for (const k of Object.keys(mockChannels)) delete mockChannels[k];
  });
  afterEach(() => jest.restoreAllMocks());

  it("is created loud: HIGH importance with sound", async () => {
    await ensureJobAlertChannel();
    expect(mockSetChannel).toHaveBeenCalledWith(JOB_ALERTS_CHANNEL, expect.objectContaining({ importance: 4, sound: "default" }));
  });

  it("P12 names the muted channel: job-alerts first, then the default one older builds post on", async () => {
    mockChannels["job-alerts"] = { importance: 4 };
    mockChannels.default = { importance: 4 };
    expect(await mutedJobChannel()).toBeNull();
    mockChannels["job-alerts"] = { importance: 2 };
    expect(await mutedJobChannel()).toBe("job-alerts");
    mockChannels["job-alerts"] = { importance: 4 };
    mockChannels.default = { importance: 3 };
    expect(await mutedJobChannel()).toBe("default");
  });
});
