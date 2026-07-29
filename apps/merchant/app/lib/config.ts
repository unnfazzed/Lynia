/**
 * API base URL for the merchant tablet. Unlike apps/admin (a server-only proxy that never ships an
 * API token to the browser), this app talks to `@lynia/api` directly from the client: the alarm/
 * reconnect discipline and (soon) the live queue socket all need to run in the tab itself, so the
 * merchant's own bearer token has to be readable by client JS. Must be prefixed `NEXT_PUBLIC_` to be
 * inlined into the browser bundle by Next.
 */
const configured = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!configured && process.env.NODE_ENV === "production") {
  // NEXT_PUBLIC_ vars are inlined at build time — failing here fails the build itself rather than
  // shipping a tablet that can never reach the API.
  throw new Error("Set NEXT_PUBLIC_API_BASE_URL to the production API URL.");
}

export const API_BASE_URL: string = configured ?? "http://localhost:3000";
