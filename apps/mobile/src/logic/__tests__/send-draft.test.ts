/**
 * U17 — the Send a parcel draft (src/logic/send-draft.ts): what is kept across an app kill / page reload,
 * what never is (phones), and when a stored draft is not worth restoring.
 */
let mockStore: Record<string, string> = {};
const mockSet = jest.fn(async (k: string, v: string) => {
  mockStore[k] = v;
});
const mockDelete = jest.fn(async (k: string) => {
  delete mockStore[k];
});
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: (k: string, v: string) => mockSet(k, v),
  deleteItemAsync: (k: string) => mockDelete(k),
}));

import { clearSendDraft, loadSendDraft, parseSendDraft, SEND_DRAFT_KEY, SEND_DRAFT_SENT_KEY_TTL_MS, SEND_DRAFT_TTL_MS, type SendDraft, saveSendDraft } from "../send-draft";

const ME = "p1";

const NOW = 1_800_000_000_000;
const draft = (over: Partial<SendDraft> = {}): SendDraft => ({
  savedAt: NOW,
  profileId: ME,
  step: 3,
  pickup: { lat: -17.8292, lng: 31.0522, name: "Eastgate Mall, CBD", source: "gps" },
  drop: { lat: -17.82, lng: 31.06, name: "14 Glenara Ave", placeId: "p1", source: "search" },
  items: [{ description: "Documents envelope", quantity: 2 }],
  note: "Blue gate",
  priceText: "3.36",
  sentKey: null,
  sentAt: null,
  ...over,
});

afterEach(() => {
  mockStore = {};
  jest.clearAllMocks();
});

describe("send-draft (U17)", () => {
  it("round-trips every compose field — and has no field for either phone", async () => {
    await saveSendDraft(draft({ sentKey: "k-1", sentAt: NOW }));
    const raw = mockStore[SEND_DRAFT_KEY]!;
    expect(raw).not.toMatch(/phone/i);
    expect(await loadSendDraft(ME, NOW + 1000)).toEqual(draft({ sentKey: "k-1", sentAt: NOW }));
  });

  it("drops a draft older than a day, a corrupt one, and a blank one", () => {
    expect(parseSendDraft(JSON.stringify(draft()), NOW + SEND_DRAFT_TTL_MS + 1, ME)).toBeNull();
    expect(parseSendDraft("{not json", NOW, ME)).toBeNull();
    expect(parseSendDraft(JSON.stringify({ ...draft(), savedAt: "yesterday" }), NOW, ME)).toBeNull();
    // A GPS pickup alone is not a compose.
    expect(parseSendDraft(JSON.stringify(draft({ drop: null, items: [{ description: "", quantity: 1 }], note: "" })), NOW, ME)).toBeNull();
  });

  it("keeps an otherwise blank draft whose send never got an answer (U16's frozen key)", () => {
    const d = draft({ drop: null, items: [{ description: "", quantity: 1 }], note: "", sentKey: "k-2", sentAt: NOW });
    expect(parseSendDraft(JSON.stringify(d), NOW, ME)?.sentKey).toBe("k-2");
  });

  it("repairs fields rather than trusting device JSON", () => {
    const raw = JSON.stringify({
      savedAt: NOW,
      profileId: ME,
      step: 9,
      pickup: { lat: "x", lng: 1, name: "bad" },
      drop: { lat: -17.82, lng: 31.06, name: "x".repeat(400), source: "teleport" },
      items: [{ description: 7, quantity: 500 }],
      note: 3,
      priceText: null,
    });
    const d = parseSendDraft(raw, NOW, ME)!;
    expect(d.step).toBe(1);
    expect(d.pickup).toBeNull();
    expect(d.drop?.name).toHaveLength(160);
    expect(d.drop?.source).toBe("prefill");
    expect(d.items).toEqual([{ description: "", quantity: 99 }]);
    expect(d.note).toBe("");
    expect(d.priceText).toBe("");
  });

  it("saving a blank draft clears the slot instead of writing it; clear deletes it", async () => {
    mockStore[SEND_DRAFT_KEY] = JSON.stringify(draft());
    await saveSendDraft(draft({ drop: null, items: [{ description: "", quantity: 1 }], note: "" }));
    expect(mockStore[SEND_DRAFT_KEY]).toBeUndefined();
    expect(mockSet).not.toHaveBeenCalled();
    mockStore[SEND_DRAFT_KEY] = JSON.stringify(draft());
    await clearSendDraft();
    expect(mockStore[SEND_DRAFT_KEY]).toBeUndefined();
  });

  // Review of the U16/U17 fix: S1 (a shared device) and the frozen key's own life.
  it("is restored only into the account that wrote it — never with no session, never into another account", () => {
    const raw = JSON.stringify(draft());
    expect(parseSendDraft(raw, NOW, ME)).not.toBeNull();
    expect(parseSendDraft(raw, NOW, "p2")).toBeNull();
    expect(parseSendDraft(raw, NOW, null)).toBeNull();
    // A draft from a build that didn't tag it is nobody's.
    const { profileId: _drop, ...untagged } = draft();
    expect(parseSendDraft(JSON.stringify(untagged), NOW, ME)).toBeNull();
  });

  it("drops an unanswered-send key older than 10 minutes but keeps the compose", () => {
    const d = draft({ sentKey: "k-old", sentAt: NOW });
    expect(parseSendDraft(JSON.stringify(d), NOW + SEND_DRAFT_SENT_KEY_TTL_MS - 1000, ME)?.sentKey).toBe("k-old");
    const late = parseSendDraft(JSON.stringify(d), NOW + SEND_DRAFT_SENT_KEY_TTL_MS + 1000, ME)!;
    expect(late.sentKey).toBeNull();
    expect(late.sentAt).toBeNull();
    expect(late.drop?.name).toBe("14 Glenara Ave");
    // A key with no time is not trusted either.
    expect(parseSendDraft(JSON.stringify(draft({ sentKey: "k-x", sentAt: null })), NOW, ME)?.sentKey).toBeNull();
  });

  it("serialises writes: a save started before a clear can't land after it", async () => {
    let release!: () => void;
    mockSet.mockImplementationOnce(
      (k: string, v: string) =>
        new Promise<void>((r) => {
          release = () => {
            mockStore[k] = v;
            r();
          };
        }),
    );
    const saving = saveSendDraft(draft());
    const clearing = clearSendDraft();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockDelete).not.toHaveBeenCalled(); // queued behind the slow write
    release();
    await saving;
    await clearing;
    expect(mockStore[SEND_DRAFT_KEY]).toBeUndefined();
  });
});
