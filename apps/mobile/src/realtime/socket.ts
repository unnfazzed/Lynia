import { io, type Socket } from "socket.io-client";
import { WS_URL } from "../config";

/**
 * The single place the app opens a Socket.IO connection. Centralises the URL, the JWT `auth`
 * handshake, and the transport list — websocket first, then a **polling fallback** so a blocked
 * or proxied WS upgrade on a constrained mobile network still connects (degrades, doesn't die,
 * which was the silent-dead-socket risk of a websocket-only transport). All realtime hooks build
 * their socket through here so a transport/auth change is one edit, not three.
 */
export function createSocket(token: string): Socket {
  return io(WS_URL, { auth: { token }, transports: ["websocket", "polling"] });
}
