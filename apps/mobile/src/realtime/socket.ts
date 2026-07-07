import { io, type Socket } from "socket.io-client";
import { WS_URL } from "../config";
import { reportReachable } from "../net/reachability";

/**
 * The single place the app opens a Socket.IO connection. Centralises the URL, the JWT `auth`
 * handshake, and the transport list — websocket first, then a **polling fallback** so a blocked
 * or proxied WS upgrade on a constrained mobile network still connects (degrades, doesn't die,
 * which was the silent-dead-socket risk of a websocket-only transport). All realtime hooks build
 * their socket through here so a transport/auth change is one edit, not three.
 */
export function createSocket(token: string): Socket {
  const socket = io(WS_URL, { auth: { token }, transports: ["websocket", "polling"] });
  // A successful (re)connect is a second, independent proof the network is back — on a tracking
  // screen the socket often reconnects before any REST call runs, so feeding `connect` into
  // reachability clears the offline state seconds sooner than waiting on the /health probe. Only the
  // POSITIVE signal is wired here: a disconnect can be a normal teardown and a connect_error can be
  // auth, so those stay off the reachability path (the REST choke point + probe own "offline").
  socket.on("connect", reportReachable);
  return socket;
}
