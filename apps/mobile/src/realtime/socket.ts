import { io, type Socket } from "socket.io-client";
import { currentAccessToken, renewSessionForSocket } from "../api/client";
import { WS_URL } from "../config";
import { reportReachable } from "../net/reachability";

/**
 * The single place the app opens a Socket.IO connection. Centralises the URL, the JWT `auth`
 * handshake, and the transport list — websocket first, then a **polling fallback** so a blocked
 * or proxied WS upgrade on a constrained mobile network still connects (degrades, doesn't die,
 * which was the silent-dead-socket risk of a websocket-only transport).
 *
 * A-O17: during an active rider job up to three hooks (board, job, location) want a connection
 * for the SAME account concurrently — `io()` (socket.io-client v4) opens a brand-new transport
 * handshake + its own engine.io keepalive ping/pong per call, no manager caching, unlike v2's
 * default. `acquireSocket`/`releaseSocket` below multiplex those callers onto ONE underlying
 * connection per signed-in identity (ref-counted), so a rider mid-job pays one handshake and one keepalive
 * stream instead of three. All realtime hooks build their socket through here so a transport/auth
 * change is one edit, not several.
 */
interface SharedEntry {
  socket: Socket;
  refCount: number;
  /** The newest token an acquirer passed — the handshake's fallback when there is no live session. */
  token: string;
  /** A pending reconnect after the server refused the handshake; cleared on the last release. */
  retry: ReturnType<typeof setTimeout> | null;
}

/**
 * The server sends a disconnect packet only when it refuses the handshake's token (a missing, invalid or
 * expired access token: TrackingGateway.handleConnection). Socket.IO never retries that on its own, so
 * without this a socket that reconnected with an already-expired token stayed down until its hooks
 * remounted. Rotate the session, then reconnect; repeated refusals back off (same shape as the merchant
 * app's KitchenConnectionProvider).
 */
const KICK_RETRY_BASE_MS = 1_000;
const KICK_RETRY_MAX_MS = 60_000;
const KICK_RESET_MS = 60_000;

const shared = new Map<string, SharedEntry>();

/**
 * Acquire a shared Socket.IO connection for the signed-in `identity` (the profile id — see
 * socket-identity.ts), opening a fresh one if none is live for it yet. Every caller MUST pair this with
 * a matching `releaseSocket(identity, socket)` in its own cleanup — the connection only actually
 * disconnects once every acquirer has released it.
 *
 * Keyed by IDENTITY, not the raw access token: the token rotates every ~15 min, and keying on it (with
 * every hook's effect depending on it) tore the board/job/location sockets down and re-handshook them on
 * each rotation. The handshake already reads the live token (LC-C14 below), so a rotation needs no new
 * connection. A sign-out nulls the identity, every hook releases, and the last release disconnects.
 */
export function acquireSocket(identity: string, token: string): Socket {
  let entry = shared.get(identity);
  if (entry) entry.token = token;
  if (!entry) {
    const fresh: SharedEntry = { socket: undefined as unknown as Socket, refCount: 0, token, retry: null };
    // LC-C14: `auth` is a callback (not a captured `{ token }`) — Socket.IO calls it on EVERY
    // handshake, including its own internal auto-reconnect after a bare network drop. A captured
    // object replayed the original token on each retry, so a dead zone longer than the 15-minute
    // access TTL kept handshaking with an expired token until some unrelated REST call rotated the
    // session. Reading the live session token instead authenticates with whatever's current (same
    // fix as apps/merchant/app/lib/queue-socket.ts); the acquirer's `token` is only the fallback for
    // a moment with no live session.
    const socket = io(WS_URL, {
      auth: (cb) => cb({ token: currentAccessToken() ?? fresh.token }),
      transports: ["websocket", "polling"],
    });
    // A successful (re)connect is a second, independent proof the network is back — on a tracking
    // screen the socket often reconnects before any REST call runs, so feeding `connect` into
    // reachability clears the offline state seconds sooner than waiting on the /health probe. Only
    // the POSITIVE signal is wired here: a disconnect can be a normal teardown and a connect_error
    // can be auth, so those stay off the reachability path (the REST choke point + probe own
    // "offline"). Owned by this module, not any one caller, so it's never `.off()`'d per-release.
    socket.on("connect", reportReachable);
    let kicks = 0;
    let lastKickAt = 0;
    socket.on("disconnect", (reason: unknown) => {
      if (reason !== "io server disconnect" || fresh.retry || shared.get(identity) !== fresh) return;
      const at = Date.now();
      if (at - lastKickAt > KICK_RESET_MS) kicks = 0;
      lastKickAt = at;
      const delay = kicks === 0 ? 0 : Math.min(KICK_RETRY_MAX_MS, KICK_RETRY_BASE_MS * 2 ** (kicks - 1));
      kicks += 1;
      fresh.retry = setTimeout(() => {
        void renewSessionForSocket()
          .catch(() => "transient" as const)
          .then((outcome) => {
            fresh.retry = null;
            // Released meanwhile, or signed out: nothing to reconnect. A transient refresh failure still
            // tries — a refused handshake comes back here, one backoff step slower.
            if (shared.get(identity) !== fresh || outcome === "dead") return;
            socket.connect();
          });
      }, delay);
    });
    fresh.socket = socket;
    entry = fresh;
    shared.set(identity, entry);
  }
  entry.refCount++;
  return entry.socket;
}

/**
 * Release a socket acquired via `acquireSocket(identity, …)`. Decrements the ref count and only
 * disconnects the underlying connection once the last acquirer has released it. A mismatched
 * (identity, socket) pair — e.g. a caller releasing after its entry was already replaced — is a safe
 * no-op: the stale entry it actually belongs to (if still tracked) is unaffected.
 */
export function releaseSocket(identity: string, socket: Socket): void {
  const entry = shared.get(identity);
  if (!entry || entry.socket !== socket) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    if (entry.retry) clearTimeout(entry.retry);
    entry.retry = null;
    entry.socket.disconnect();
    shared.delete(identity);
  }
}
