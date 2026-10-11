import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./config";
import { loadMerchantSession } from "./session";

/**
 * C5 kitchen socket queue — the merchant tablet's half of the presence channel
 * `TrackingGateway.isMerchantOnline` (apps/api/src/tracking/tracking.gateway.ts) reads. E1/E2 shipped
 * the queue as poll-only (`use-queue-poll.ts`) with a comment noting the socket "hasn't merged yet";
 * that gap left `isMerchantOnline` structurally unable to ever see a connected tablet (nothing ever
 * joined the room it checks), which silently defeated `sweepExpiredAcceptWindows`'s N-03 auto-cancel
 * guarantee for EVERY merchant, not just genuinely offline ones — a past-deadline order was always
 * treated as "merchant is dark" and had its clock pushed forward instead of resolving.
 *
 * It also carries the server's `food:queue-changed` push (MJ-P1): a signal only — the shell re-reads the
 * queue on it and slows the poll in `use-queue-poll.ts` to a backstop while the server confirms (acks) the
 * queue-room join; the REST
 * read stays the only source of the orders themselves.
 * `auth` is a callback (not a captured token) so a reconnect after the original access token has
 * rotated still authenticates with whatever's current in the session cookie.
 */
export function createMerchantQueueSocket(): Socket {
  return io(API_BASE_URL, {
    auth: (cb) => cb({ token: loadMerchantSession()?.accessToken ?? "" }),
    transports: ["websocket", "polling"],
  });
}
