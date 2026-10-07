/**
 * Global exception filter. An HttpException passes through UNCHANGED (its status + response body are
 * preserved; a bare-string body is wrapped as `{ statusCode, message }`), so intentional 4xx contracts (validation, auth, not-found) reach the client verbatim.
 * ANYTHING ELSE — an unexpected throw, a bug, a driver error — is coerced to a SAFE generic 500:
 *   { statusCode: 500, message: "Internal server error", correlationId }
 * The real error (message + stack) is logged server-side against the same correlationId so it stays
 * diagnosable, but is NEVER leaked to the client. Registered globally via APP_FILTER in AppModule.
 *
 * LC-D22: one exception to the generic 500 — a TRANSIENT database-unavailable error (pool-acquire
 * timeout, can't reach / lost the DB, too many connections) becomes a 503 with `Retry-After`, so a
 * client can tell "server overloaded, retry shortly" from "application bug". Same body shape, same
 * logging; nothing else about the 500 path changes.
 */
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { captureException } from "../observability/sentry";

/** Seconds a client should wait before retrying a 503 from a transient DB-unavailable error. Short:
 *  the pool-acquire timeout is itself ~10s, and the condition is self-recovering. */
export const DB_UNAVAILABLE_RETRY_AFTER_SEC = 5;

/**
 * Prisma error codes that mean "the database is transiently unavailable", confirmed against the
 * installed @prisma/client 7 runtime's driver-adapter mapping: P1001 DatabaseNotReachable, P1008
 * SocketTimeout, P1017 ConnectionClosed, P2037 TooManyConnections. P1002 (server timed out) and P2024
 * (engine pool timeout) are the query-engine-era equivalents, kept so the mapping survives an engine
 * switch.
 */
const TRANSIENT_DB_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2037"]);

/**
 * Under the pg driver adapter a pool-acquire timeout never becomes a Prisma error: pg-pool raises a
 * plain `Error` with no code, the adapter's `convertDriverError` rethrows it untouched, and the client
 * passes it through. These are pg-pool's two connection-timeout messages (existing-client checkout,
 * new-connection connect).
 */
const POOL_TIMEOUT_MESSAGES = ["timeout exceeded when trying to connect", "Connection terminated due to connection timeout"];

/** True for the transient DB-unavailable class (LC-D22); walks `cause` so a wrapped pool error counts. */
export function isTransientDbError(exception: unknown): boolean {
  let e: unknown = exception;
  for (let depth = 0; e instanceof Error && depth < 5; depth++) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_DB_CODES.has(e.code)) return true;
    if (e instanceof Prisma.PrismaClientInitializationError && e.errorCode && TRANSIENT_DB_CODES.has(e.errorCode)) {
      return true;
    }
    const message = e.message;
    if (POOL_TIMEOUT_MESSAGES.some((m) => message.includes(m))) return true;
    e = e.cause;
  }
  return false;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Only HTTP is handled here — WS/RPC contexts fall through untouched (the gateway owns its errors).
    if (host.getType() !== "http") throw exception;

    const http = host.switchToHttp();
    const res = http.getResponse<{
      status(code: number): { json(body: unknown): unknown };
      setHeader?(name: string, value: string): unknown;
    }>();

    // Intentional HttpExceptions are a first-class contract: keep their status and response body.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // `new HttpException("text", …)` keeps the bare string as its body, which reached clients as a JSON
      // string with no `.message` (E2E 2026-10-05 FS-3) — give it the same envelope Nest's own
      // exceptions carry.
      res.status(status).json(typeof body === "string" ? { statusCode: status, message: body } : body);
      return;
    }

    // Everything else is an UNEXPECTED failure. Tag it with a correlation id, log the real error
    // (message + stack) server-side, and return a generic envelope that leaks no internal detail.
    const correlationId = randomUUID();
    const req = http.getRequest<{ method?: string; url?: string }>();
    this.logger.error(
      `Unhandled exception [${correlationId}] ${req.method ?? "?"} ${req.url ?? "?"}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    // Aggregated crash view (roadmap 1.1) — a no-op unless SENTRY_DSN is configured. The correlationId
    // ties the Sentry event back to this server log line and the generic 500 the client received.
    captureException(exception, { correlationId, method: req.method, url: req.url });

    if (isTransientDbError(exception)) {
      res.setHeader?.("Retry-After", String(DB_UNAVAILABLE_RETRY_AFTER_SEC));
      res.status(503).json({ statusCode: 503, message: "Service temporarily unavailable", correlationId });
      return;
    }

    res.status(500).json({ statusCode: 500, message: "Internal server error", correlationId });
  }
}
