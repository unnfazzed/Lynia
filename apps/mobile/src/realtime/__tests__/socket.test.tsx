import { io } from "socket.io-client";
import { acquireSocket, releaseSocket } from "../socket";

type FakeIoSocket = {
  on: jest.Mock;
  disconnect: jest.Mock;
  connect: jest.Mock;
};

let mockCreatedSockets: FakeIoSocket[] = [];

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => {
    const socket: FakeIoSocket = { on: jest.fn(), disconnect: jest.fn(), connect: jest.fn() };
    mockCreatedSockets.push(socket);
    return socket;
  }),
}));

jest.mock("../../net/reachability", () => ({ reportReachable: jest.fn() }));

let mockLiveToken: string | null = null;
const mockRenew = jest.fn<Promise<"ok" | "dead" | "transient">, []>();
jest.mock("../../api/client", () => ({ currentAccessToken: () => mockLiveToken, renewSessionForSocket: () => mockRenew() }));

beforeEach(() => {
  mockCreatedSockets = [];
  mockLiveToken = null;
  mockRenew.mockReset();
  (io as jest.Mock).mockClear();
});

type AuthCallback = (cb: (data: { token: string }) => void) => void;

/** Run the `auth` option the last io() call got, the way Socket.IO does on each (re)connect handshake. */
function handshakeToken(): string {
  const opts = (io as jest.Mock).mock.calls.at(-1)![1] as { auth: AuthCallback };
  expect(typeof opts.auth).toBe("function"); // a captured object would replay the original token forever
  let sent = "";
  opts.auth((data) => {
    sent = data.token;
  });
  return sent;
}

// LC-C14: Socket.IO's own auto-reconnect re-runs `auth` on every retry — it must send the session's
// CURRENT access token, not the one the socket was opened with, or a >15 min dead zone replays an
// expired token until an unrelated REST call happens to rotate the session.
describe("acquireSocket auth handshake", () => {
  it("a reconnect after the access token rotated sends the NEW token", () => {
    mockLiveToken = "tok-old";
    const socket = acquireSocket("tok-old", "tok-old");
    expect(handshakeToken()).toBe("tok-old"); // the first connect

    mockLiveToken = "tok-new"; // the refresh path rotated the session while the link was down
    expect(handshakeToken()).toBe("tok-new"); // the auto-reconnect handshake

    releaseSocket("tok-old", socket);
  });

  it("falls back to the acquirer's token when no live session is registered", () => {
    const socket = acquireSocket("tok", "tok");
    expect(handshakeToken()).toBe("tok");
    releaseSocket("tok", socket);
  });
});

// A-O17: board/job/location hooks all want a connection for the same rider token during an active
// job — this is the ref-counted multiplex that collapses their three `io()` handshakes into one.
describe("acquireSocket / releaseSocket", () => {
  it("returns the SAME socket instance to concurrent acquirers of the same token", () => {
    const a = acquireSocket("tok", "jwt");
    const b = acquireSocket("tok", "jwt");
    const c = acquireSocket("tok", "jwt");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(mockCreatedSockets).toHaveLength(1); // one io() call, not three

    releaseSocket("tok", a);
    releaseSocket("tok", b);
    releaseSocket("tok", c);
  });

  it("does not disconnect while any acquirer still holds a reference", () => {
    const socket = acquireSocket("tok", "jwt");
    acquireSocket("tok", "jwt");
    releaseSocket("tok", socket); // one of two releases

    expect(mockCreatedSockets[0]!.disconnect).not.toHaveBeenCalled();

    releaseSocket("tok", socket); // the last release
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it("opens a fresh connection once the last release tears the old one down", () => {
    const first = acquireSocket("tok", "jwt");
    releaseSocket("tok", first);
    const second = acquireSocket("tok", "jwt");

    expect(second).not.toBe(first);
    expect(mockCreatedSockets).toHaveLength(2);

    releaseSocket("tok", second);
  });

  it("keys the shared connection by identity — different accounts never share a socket", () => {
    const a = acquireSocket("tok-a", "jwt");
    const b = acquireSocket("tok-b", "jwt");

    expect(a).not.toBe(b);
    expect(mockCreatedSockets).toHaveLength(2);

    releaseSocket("tok-a", a);
    releaseSocket("tok-b", b);
  });

  it("releasing a socket that doesn't match the tracked entry is a safe no-op", () => {
    const real = acquireSocket("tok", "jwt");
    const stray: FakeIoSocket = { on: jest.fn(), disconnect: jest.fn(), connect: jest.fn() };

    expect(() => releaseSocket("tok", stray as unknown as Parameters<typeof releaseSocket>[1])).not.toThrow();
    expect(mockCreatedSockets[0]!.disconnect).not.toHaveBeenCalled(); // the real entry is untouched

    releaseSocket("tok", real);
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it("releasing more times than acquired never goes negative / never double-disconnects", () => {
    const socket = acquireSocket("tok", "jwt");
    releaseSocket("tok", socket);
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1);

    releaseSocket("tok", socket); // extra release after the entry is already gone
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1); // still just once
  });
});

// The ~15-min access-token rotation used to tear every rider socket down: the map was keyed by token and
// each hook's effect depended on it. Now the key is the signed-in identity (profile id).
describe("acquireSocket across a token rotation", () => {
  it("a rotated token reuses the identity's socket — no second handshake", () => {
    const a = acquireSocket("profile-1", "jwt-old");
    const b = acquireSocket("profile-1", "jwt-new");
    expect(a).toBe(b);
    expect(mockCreatedSockets).toHaveLength(1);
    // With no live session registered, the handshake falls back to the NEWEST acquirer's token.
    expect(handshakeToken()).toBe("jwt-new");
    releaseSocket("profile-1", a);
    expect(mockCreatedSockets[0]!.disconnect).not.toHaveBeenCalled();
    releaseSocket("profile-1", b);
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1);
  });
});

// The server disconnects (rather than closing the transport) only when it refuses the handshake token.
// Socket.IO never retries that by itself, so the shared socket renews the session and reconnects.
describe("server-refused handshake", () => {
  const fire = (socket: FakeIoSocket, reason: string) => {
    const handler = socket.on.mock.calls.find(([ev]) => ev === "disconnect")![1] as (r: string) => void;
    handler(reason);
  };
  const flush = async () => {
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("renews the session and reconnects", async () => {
    mockRenew.mockResolvedValue("ok");
    const s = acquireSocket("p1", "jwt");
    fire(mockCreatedSockets[0]!, "io server disconnect");
    await flush();
    expect(mockRenew).toHaveBeenCalledTimes(1);
    expect(mockCreatedSockets[0]!.connect).toHaveBeenCalledTimes(1);
    releaseSocket("p1", s);
  });

  it("does not reconnect once the session is dead", async () => {
    mockRenew.mockResolvedValue("dead");
    const s = acquireSocket("p1", "jwt");
    fire(mockCreatedSockets[0]!, "io server disconnect");
    await flush();
    expect(mockCreatedSockets[0]!.connect).not.toHaveBeenCalled();
    releaseSocket("p1", s);
  });

  it("leaves ordinary drops to Socket.IO's own reconnect", async () => {
    const s = acquireSocket("p1", "jwt");
    fire(mockCreatedSockets[0]!, "transport close");
    fire(mockCreatedSockets[0]!, "io client disconnect");
    await flush();
    expect(mockRenew).not.toHaveBeenCalled();
    releaseSocket("p1", s);
  });

  it("a release cancels a pending reconnect", async () => {
    mockRenew.mockResolvedValue("ok");
    const s = acquireSocket("p1", "jwt");
    fire(mockCreatedSockets[0]!, "io server disconnect");
    releaseSocket("p1", s);
    await flush();
    expect(mockRenew).not.toHaveBeenCalled();
    expect(mockCreatedSockets[0]!.connect).not.toHaveBeenCalled();
  });
});
