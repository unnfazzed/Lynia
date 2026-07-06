/**
 * Global exception filter. An HttpException passes through UNCHANGED (its status + response body are
 * preserved), so intentional 4xx contracts (validation, auth, not-found) reach the client verbatim.
 * ANYTHING ELSE — an unexpected throw, a bug, a driver error — is coerced to a SAFE generic 500:
 *   { statusCode: 500, message: "Internal server error", correlationId }
 * The real error (message + stack) is logged server-side against the same correlationId so it stays
 * diagnosable, but is NEVER leaked to the client. Registered globally via APP_FILTER in AppModule.
 */
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

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
      res.status(exception.getStatus()).json(exception.getResponse());
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

    res.status(500).json({ statusCode: 500, message: "Internal server error", correlationId });
  }
}
