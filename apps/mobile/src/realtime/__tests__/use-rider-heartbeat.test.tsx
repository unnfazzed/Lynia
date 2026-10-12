import { AppState, type AppStateStatus } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ApiError } from "../../api/client";
import { sendHeartbeat } from "../../api/riders";
import { HEARTBEAT_MS, WAKE_BEAT_GAP_MS, useRiderHeartbeat } from "../use-rider-heartbeat";

let mockSession: { accessToken: string } | null = { accessToken: "tok" };
jest.mock("../../auth/auth-context", () => ({
  useAuth: () => ({ session: mockSession }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../api/riders", () => ({ sendHeartbeat: jest.fn() }));

const beatMock = sendHeartbeat as jest.Mock;

let appStateListener: ((s: AppStateStatus) => void) | null = null;

const BOARD_LOC = { lat: -17.8, lng: 31.0 };

function Harness({ online, onRefused }: { online: boolean; onRefused: (e: ApiError) => void }): null {
  const { stale } = useRiderHeartbeat(online, () => BOARD_LOC, onRefused);
  lastStale = stale;
  return null;
}
let lastStale = false;

/** Flush the beat's promise chain (fake timers don't touch microtasks). */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function mount(online = true, onRefused: (e: ApiError) => void = jest.fn()): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Harness online={online} onRefused={onRefused} />);
  });
  return tree;
}

/** Move the clock WITHOUT firing timers: a locked phone, where the JS interval doesn't run. */
function lockedFor(ms: number): void {
  jest.setSystemTime(Date.now() + ms);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSession = { accessToken: "tok" };
  lastStale = false;
  beatMock.mockReset().mockResolvedValue({ online: true });
  appStateListener = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, cb) => {
    appStateListener = cb as (s: AppStateStatus) => void;
    return { remove: () => (appStateListener = null) } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useRiderHeartbeat — foreground", () => {
  it("beats every 20 s with the board's position while online", async () => {
    const tree = await mount();

    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    expect(beatMock).toHaveBeenCalledTimes(1);
    expect(beatMock).toHaveBeenLastCalledWith(BOARD_LOC);

    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    expect(beatMock).toHaveBeenCalledTimes(2);

    await act(async () => tree.unmount());
  });

  it("only a 403 takes the biker offline; two other failures in a row report stale", async () => {
    const onRefused = jest.fn();
    const tree = await mount(true, onRefused);

    beatMock.mockRejectedValue(new ApiError(0, "network"));
    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    await settle();
    expect(lastStale).toBe(false);
    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    await settle();
    expect(lastStale).toBe(true);
    expect(onRefused).not.toHaveBeenCalled();

    beatMock.mockRejectedValue(new ApiError(403, "You're offline"));
    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    await settle();
    expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));

    await act(async () => tree.unmount());
  });

  it("never beats while offline, not even on wake", async () => {
    const tree = await mount(false);

    act(() => jest.advanceTimersByTime(HEARTBEAT_MS * 3));
    appStateListener?.("active");

    expect(beatMock).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });
});

describe("useRiderHeartbeat — ping on wake (owner 2026-10-12)", () => {
  it("beats at once when the biker comes back to the app after the phone was locked", async () => {
    const tree = await mount();

    lockedFor(5 * 60_000);
    act(() => appStateListener?.("active"));

    expect(beatMock).toHaveBeenCalledTimes(1);
    expect(beatMock).toHaveBeenLastCalledWith(BOARD_LOC);

    await act(async () => tree.unmount());
  });

  it("a quick switch away and back doesn't add a beat, and the timer doesn't double up after a wake beat", async () => {
    const tree = await mount();

    lockedFor(WAKE_BEAT_GAP_MS - 1);
    act(() => appStateListener?.("active"));
    expect(beatMock).not.toHaveBeenCalled();

    lockedFor(60_000);
    act(() => appStateListener?.("active"));
    expect(beatMock).toHaveBeenCalledTimes(1);
    // Backgrounding is not a wake.
    act(() => appStateListener?.("background"));
    expect(beatMock).toHaveBeenCalledTimes(1);

    await act(async () => tree.unmount());
  });

  it("a 403 on a wake beat reaches onRefused like any other", async () => {
    const onRefused = jest.fn();
    beatMock.mockRejectedValue(new ApiError(403, "You're offline"));
    const tree = await mount(true, onRefused);

    lockedFor(60_000);
    act(() => appStateListener?.("active"));
    await settle();

    expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));

    await act(async () => tree.unmount());
  });

  it("signing out stops the beats, even if the board is still mounted", async () => {
    const onRefused = jest.fn();
    const tree = await mount(true, onRefused);

    mockSession = null;
    await act(async () => tree.update(<Harness online onRefused={onRefused} />));

    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    lockedFor(60_000);
    appStateListener?.("active");
    expect(beatMock).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });
});
