import { acquireSocket, releaseSocket } from "../socket";

type FakeIoSocket = {
  on: jest.Mock;
  disconnect: jest.Mock;
};

let mockCreatedSockets: FakeIoSocket[] = [];
let mockIoOptions: Array<{ auth: unknown; transports: string[] }> = [];

jest.mock("socket.io-client", () => ({
  io: jest.fn((_url: string, options: { auth: unknown; transports: string[] }) => {
    mockIoOptions.push(options);
    const socket: FakeIoSocket = { on: jest.fn(), disconnect: jest.fn() };
    mockCreatedSockets.push(socket);
    return socket;
  }),
}));

jest.mock("../../net/reachability", () => ({ reportReachable: jest.fn() }));

let mockCurrentAccessToken: string | null = null;
jest.mock("../../api/client", () => ({
  getCurrentAccessToken: () => mockCurrentAccessToken,
}));

beforeEach(() => {
  mockCreatedSockets = [];
  mockIoOptions = [];
  mockCurrentAccessToken = null;
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

// LC-C14/C-O10: a captured `auth: { token }` object gets replayed verbatim by Socket.IO's own
// internal auto-reconnect on every retry, so a dead zone that outlasts the access-token TTL keeps
// retrying with a now-expired token. `auth` must be a CALLBACK that re-reads whatever token is
// CURRENT at the moment of each (re)connection attempt, matching the merchant app's
// `createMerchantQueueSocket` pattern — pre-fix, this test fails because `auth` is a plain object.
describe("acquireSocket auth handshake", () => {
  it("passes auth as a callback, not a captured token object", () => {
    const socket = acquireSocket("tok-shape-check");
    const options = mockIoOptions[0]!;

    expect(typeof options.auth).toBe("function");

    releaseSocket("tok-shape-check", socket);
  });

  it("the auth callback re-reads the CURRENT token, not the one it was opened with", () => {
    mockCurrentAccessToken = "tok-initial";
    const socket = acquireSocket("tok-rotation-check");
    const authFn = mockIoOptions[0]!.auth as (cb: (data: { token: string }) => void) => void;

    const firstCall = jest.fn();
    authFn(firstCall);
    expect(firstCall).toHaveBeenCalledWith({ token: "tok-initial" });

    // Simulate a token rotation happening while this same socket entry is still alive (a bare
    // network drop mid-lifetime, no React re-render/reacquire involved) — Socket.IO's internal
    // reconnect logic invokes the SAME auth function again on the next attempt.
    mockCurrentAccessToken = "tok-rotated";
    const secondCall = jest.fn();
    authFn(secondCall);
    expect(secondCall).toHaveBeenCalledWith({ token: "tok-rotated" });

    releaseSocket("tok-rotation-check", socket);
  });

  it("falls back to the keyed token if the auth hook has no current session yet", () => {
    mockCurrentAccessToken = null;
    const socket = acquireSocket("tok-fallback");
    const authFn = mockIoOptions[0]!.auth as (cb: (data: { token: string }) => void) => void;

    const cb = jest.fn();
    authFn(cb);
    expect(cb).toHaveBeenCalledWith({ token: "tok-fallback" });

    releaseSocket("tok-fallback", socket);
  });
});
