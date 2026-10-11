/**
 * Reviewed list 2026-10-07 U15 (web): tabs of app.lyniago.com share one stored session. The AuthProvider
 * follows what OTHER tabs write (the browser's `storage` event), so a background tab neither keeps a
 * refresh token another tab rotated away nor stays signed in after another tab signed out.
 */
import { act, create } from "react-test-renderer";
import type { Session } from "../session";

type StorageFn = (e: { key: string | null }) => void;
let mockOS = "web";
jest.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: jest.fn() }) },
  Platform: {
    get OS() {
      return mockOS;
    },
  },
}));
jest.mock("../../api/client", () => ({ configureApi: jest.fn(), clearConditionalCache: jest.fn() }));
jest.mock("../../api/auth", () => ({ logout: jest.fn(async () => ({ revoked: true })) }));
const mockQueryClear = jest.fn();
jest.mock("../../query/client", () => ({ queryClient: { clear: () => mockQueryClear() } }));
jest.mock("../../query/persist", () => ({ clearPersistedQueries: jest.fn(async () => undefined) }));
jest.mock("../../telemetry/sentry", () => ({ captureException: jest.fn() }));
let mockStoredAtBoot: Session | null = null;
jest.mock("../../boot/prewarm", () => ({ prewarmBootReads: () => ({ session: Promise.resolve(mockStoredAtBoot) }) }));
let mockStored: Session | null = null;
const mockSaveSession = jest.fn(async () => undefined);
const mockClearSession = jest.fn(async () => undefined);
const mockClearDeviceState = jest.fn(async () => undefined);
jest.mock("../session", () => ({
  SESSION_KEY: "lynia.session",
  loadSession: async () => mockStored,
  saveSession: () => mockSaveSession(),
  clearSession: () => mockClearSession(),
  clearDeviceState: () => mockClearDeviceState(),
}));

import { __resetAuthSession, AuthProvider, useAuth } from "../auth-context";

let auth: ReturnType<typeof useAuth>;
function Probe(): null {
  auth = useAuth();
  return null;
}
let listeners: StorageFn[] = [];
const win = {
  addEventListener: (_t: string, fn: StorageFn) => listeners.push(fn),
  removeEventListener: (_t: string, fn: StorageFn) => (listeners = listeners.filter((l) => l !== fn)),
};
const A: Session = { accessToken: "a0", refreshToken: "r0", expiresIn: 900, profileId: "p1", role: "customer" };

let tree: ReturnType<typeof create> | null = null;
async function mount(): Promise<void> {
  mockStoredAtBoot = A;
  mockStored = A;
  await act(async () => {
    tree = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}
async function otherTabWrote(key: string | null = "lynia_lynia.session"): Promise<void> {
  await act(async () => {
    listeners.forEach((l) => l({ key }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  mockOS = "web";
  listeners = [];
  (globalThis as { window?: unknown }).window = win;
  __resetAuthSession();
  jest.clearAllMocks();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  delete (globalThis as { window?: unknown }).window;
});

describe("U15 — the AuthProvider follows the session other tabs write", () => {
  it("another tab rotated the tokens: this tab adopts them, writes nothing back", async () => {
    await mount();
    expect(auth.session?.refreshToken).toBe("r0");
    mockStored = { ...A, accessToken: "a1", refreshToken: "r1" };
    await otherTabWrote();
    expect(auth.session?.refreshToken).toBe("r1");
    expect(auth.session?.accessToken).toBe("a1");
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockQueryClear).not.toHaveBeenCalled();
  });

  it("another tab signed out: this tab is signed out too, without wiping shared storage again", async () => {
    await mount();
    mockStored = null;
    await otherTabWrote();
    expect(auth.session).toBeNull();
    expect(mockQueryClear).toHaveBeenCalled();
    expect(mockClearSession).not.toHaveBeenCalled();
    expect(mockClearDeviceState).not.toHaveBeenCalled();
  });

  it("another account signed in elsewhere: this tab follows it with a clean cache", async () => {
    await mount();
    mockStored = { ...A, profileId: "p2", refreshToken: "r9" };
    await otherTabWrote();
    expect(auth.session?.profileId).toBe("p2");
    expect(mockQueryClear).toHaveBeenCalled();
  });

  it("ignores other keys", async () => {
    await mount();
    mockStored = { ...A, refreshToken: "r1" };
    await otherTabWrote("lynia_lynia.orderDraft");
    expect(auth.session?.refreshToken).toBe("r0");
  });

  it("native apps register no storage listener", async () => {
    mockOS = "android";
    await mount();
    expect(listeners).toHaveLength(0);
  });
});
