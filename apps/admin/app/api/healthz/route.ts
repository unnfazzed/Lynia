/**
 * Liveness probe for the container host (plan C4). Public by design: `isPublicConsolePath` exempts
 * exactly `/api/healthz` from the operator gate, so it must never read admin data, the admin API
 * token, or request headers. It only proves the Next server is up and routing.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" }, { status: 200, headers: { "cache-control": "no-store" } });
}
