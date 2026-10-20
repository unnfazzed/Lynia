import { HttpException } from "@nestjs/common";
import { defaultErrorReason } from "@lynia/shared";

/**
 * R-2 (QA 2026-10-20): one shape for every API error body — `{ statusCode, reason, message }`, plus whatever extra
 * fields a thrower adds (validation's `formErrors` / `fieldErrors`, a 429's `retryAfter`). Two pieces:
 *
 *   throw apiError(409, "already_taken", "…")       a domain error, named by its thrower
 *   normalizeErrorBody(status, body)                  the filter's pass over EVERY HttpException body: adds a missing
 *                                                     `statusCode` and a missing `reason` (the status's default),
 *                                                     never overwrites a field the thrower set
 *
 * Additive only. No status code changes here, and `message` is never rewritten, so app builds already on phones read
 * exactly what they read before. Reasons are registered in `@lynia/shared` (`API_ERROR_REASONS`).
 */

export function apiError(status: number, reason: string, message: string, extra: Record<string, unknown> = {}): HttpException {
  return new HttpException({ ...extra, statusCode: status, reason, message }, status);
}

/** The body an HttpException's response becomes on the wire. */
export function normalizeErrorBody(status: number, body: unknown): Record<string, unknown> {
  // `new HttpException("text", …)` keeps the bare string as its body (E2E 2026-10-05 FS-3).
  if (typeof body === "string") return { statusCode: status, reason: defaultErrorReason(status), message: body };
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { statusCode: status, reason: defaultErrorReason(status), message: "Request failed" };
  }
  const b = body as Record<string, unknown>;
  return {
    ...b,
    statusCode: typeof b.statusCode === "number" ? b.statusCode : status,
    reason: typeof b.reason === "string" && b.reason.length > 0 ? b.reason : defaultErrorReason(status),
  };
}
