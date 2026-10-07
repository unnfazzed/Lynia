import { io } from "socket.io-client";
import { acquireSocket, releaseSocket } from "../socket";

type FakeIoSocket = {
  on: jest.Mock;
  disconnect: jest.Mock;
};

let mockCreatedSockets: FakeIoSocket[] = [];

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => {
    const socket: FakeIoSocket = { on: jest.fn(), disconnect: jest.fn() };
    mockCreatedSockets.push(socket);
    return socket;
  }),
}));

jest.mock("../../net/reachability", () => ({ reportReachable: jest.fn() }));

let mockLiveToken: string | null = null;
jest.mock("../../api/client", () => ({ currentAccessToken: () => mockLiveToken }));

beforeEach(() => {
  mockCreatedSockets = [];
  mockLiveToken = null;
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
    const socket = acquireSocket("tok-old");
    expect(handshakeToken()).toBe("tok-old"); // the first connect

    mockLiveToken = "tok-new"; // the refresh path rotated the session while the link was down
    expect(handshakeToken()).toBe("tok-new"); // the auto-reconnect handshake

    releaseSocket("tok-old", socket);
  });

  it("falls back to the acquirer's token when no live session is registered", () => {
    const socket = acquireSocket("tok");
    expect(handshakeToken()).toBe("tok");
    releaseSocket("tok", socket);
  });
});

// A-O17: board/job/location hooks all want a connection for the same rider token during an active
// job — this is the ref-counted multiplex that collapses their three `io()` handshakes into one.
describe("acquireSocket / releaseSocket", () => {
  it("returns the SAME socket instance to concurrent acquirers of the same token", () => {
    const a = acquireSocket("tok");
    const b = acquireSocket("tok");
    const c = acquireSocket("tok");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(mockCreatedSockets).toHaveLength(1); // one io() call, not three

    releaseSocket("tok", a);
    releaseSocket("tok", b);
    releaseSocket("tok", c);
  });

  it("does not disconnect while any acquirer still holds a reference", () => {
    const socket = acquireSocket("tok");
    acquireSocket("tok");
    releaseSocket("tok", socket); // one of two releases

    expect(mockCreatedSockets[0]!.disconnect).not.toHaveBeenCalled();

    releaseSocket("tok", socket); // the last release
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it("opens a fresh connection once the last release tears the old one down", () => {
    const first = acquireSocket("tok");
    releaseSocket("tok", first);
    const second = acquireSocket("tok");

    expect(second).not.toBe(first);
    expect(mockCreatedSockets).toHaveLength(2);

    releaseSocket("tok", second);
  });

  it("keys the shared connection by token — different tokens never share a socket", () => {
    const a = acquireSocket("tok-a");
    const b = acquireSocket("tok-b");

    expect(a).not.toBe(b);
    expect(mockCreatedSockets).toHaveLength(2);

    releaseSocket("tok-a", a);
    releaseSocket("tok-b", b);
  });

  it("releasing a socket that doesn't match the tracked entry is a safe no-op", () => {
    const real = acquireSocket("tok");
    const stray: FakeIoSocket = { on: jest.fn(), disconnect: jest.fn() };

    expect(() => releaseSocket("tok", stray as unknown as Parameters<typeof releaseSocket>[1])).not.toThrow();
    expect(mockCreatedSockets[0]!.disconnect).not.toHaveBeenCalled(); // the real entry is untouched

    releaseSocket("tok", real);
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it("releasing more times than acquired never goes negative / never double-disconnects", () => {
    const socket = acquireSocket("tok");
    releaseSocket("tok", socket);
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1);

    releaseSocket("tok", socket); // extra release after the entry is already gone
    expect(mockCreatedSockets[0]!.disconnect).toHaveBeenCalledTimes(1); // still just once
  });
});
