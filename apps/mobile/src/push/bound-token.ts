/**
 * The push token currently bound to the signed-in account on this device, kept by
 * `usePushRegistration` so sign-out can name it in the logout request and the API unbinds it with the
 * session (E2E 2026-10-05 FS-8). The hook's own DELETE runs only after the session is gone locally, so
 * on its own it never reached the server. A dependency-free module so the auth layer can read it without
 * pulling expo-notifications into its import chain.
 */
let bound: string | null = null;

export function boundPushToken(): string | null {
  return bound;
}

export function setBoundPushToken(token: string | null): void {
  bound = token;
}
