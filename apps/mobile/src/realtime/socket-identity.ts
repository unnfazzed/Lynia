/**
 * The key a rider/customer realtime hook holds its shared socket by (src/realtime/socket.ts): the
 * signed-in profile — NOT the raw access token, which rotates every ~15 min and used to tear the board,
 * job and location sockets down and re-handshake them on every rotation. Null when signed out (no
 * socket at all), so a sign-out still releases every hook and the last release disconnects. A session
 * without a profile id (never in production; some test doubles) falls back to a constant slot.
 */
export function socketIdentity(session: { accessToken?: string | null; profileId?: string | null } | null | undefined): string | null {
  if (!session?.accessToken) return null;
  return session.profileId || "session";
}
