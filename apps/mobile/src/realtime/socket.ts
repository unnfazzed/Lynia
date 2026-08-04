import { io, type Socket } from "socket.io-client";
import { WS_URL } from "../config";
import { reportReachable } from "../net/reachability";

/**
 * The single place the app opens a Socket.IO connection. Centralises the URL, the JWT `auth`
 * handshake, and the transport list — websocket first, then a **polling fallback** so a blocked
 * or proxied WS upgrade on a constrained mobile network still connects (degrades, doesn't die,
 * which was the silent-dead-socket risk of a websocket-only transport).
 *
 * A-O17: during an active rider job up to three hooks (board, job, location) want a connection
 * for the SAME token concurrently — `io()` (socket.io-client v4) opens a brand-new transport
 * handshake + its own engine.io keepalive ping/pong per call, no manager caching, unlike v2's
 * default. `acquireSocket`/`releaseSocket` below multiplex those callers onto ONE underlying
 * connection per token (ref-counted), so a rider mid-job pays one handshake and one keepalive
 * stream instead of three. All realtime hooks build their socket through here so a transport/auth
 * change is one edit, not several.
 */
interface SharedEntry {
  socket: Socket;
  refCount: number;
}

const shared = new Map<string, SharedEntry>();

/**
 * Acquire a shared Socket.IO connection for `token`, opening a fresh one if none is live for that
 * exact token yet. Every caller MUST pair this with a matching `releaseSocket(token, socket)` in
 * its own cleanup — the connection only actually disconnects once every acquirer has released it.
 * Keyed by token (not a single global slot) so a token rotation never tears down a connection
 * still in use by a caller that hasn't re-run its effect yet — the stale entry simply drains to 0
 * refs on its own and closes then.
 */
export function acquireSocket(token: string): Socket {
  let entry = shared.get(token);
  if (!entry) {
    const socket = io(WS_URL, { auth: { token }, transports: ["websocket", "polling"] });
    // A successful (re)connect is a second, independent proof the network is back — on a tracking
    // screen the socket often reconnects before any REST call runs, so feeding `connect` into
    // reachability clears the offline state seconds sooner than waiting on the /health probe. Only
    // the POSITIVE signal is wired here: a disconnect can be a normal teardown and a connect_error
    // can be auth, so those stay off the reachability path (the REST choke point + probe own
    // "offline"). Owned by this module, not any one caller, so it's never `.off()`'d per-release.
    socket.on("connect", reportReachable);
    entry = { socket, refCount: 0 };
    shared.set(token, entry);
  }
  entry.refCount++;
  return entry.socket;
}

/**
 * Release a socket acquired via `acquireSocket(token)`. Decrements the ref count and only
 * disconnects the underlying connection once the last acquirer has released it. A mismatched
 * (token, socket) pair — e.g. a caller releasing after the token already rotated to a new entry —
 * is a safe no-op: the stale entry it actually belongs to (if still tracked) is unaffected.
 */
export function releaseSocket(token: string, socket: Socket): void {
  const entry = shared.get(token);
  if (!entry || entry.socket !== socket) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    entry.socket.disconnect();
    shared.delete(token);
  }
}
