/**
 * Global exception filter. An HttpException passes through UNCHANGED (its status + response body are
 * preserved; a bare-string body is wrapped as `{ statusCode, message }`), so intentional 4xx contracts (validation, auth, not-found) reach the client verbatim.
 * ANYTHING ELSE — an unexpected throw, a bug, a driver error — is coerced to a SAFE generic 500:
 *   { statusCode: 500, message: "Internal server error", correlationId }
 * The real error (message + stack) is logged server-side against the same correlationId so it stays
 * diagnosable, but is NEVER leaked to the client. Registered globally via APP_FILTER in AppModule.
 */
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { captureException } from "../observability/sentry";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Only HTTP is handled here — WS/RPC contexts fall through untouched (the gateway owns its errors).
    if (host.getType() !== "http") throw exception;

    const http = host.switchToHttp();
    const res = http.getResponse<{ status(code: number): { json(body: unknown): unknown } }>();

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

    res.status(500).json({ statusCode: 500, message: "Internal server error", correlationId });
  }
}
