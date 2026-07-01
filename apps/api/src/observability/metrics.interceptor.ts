/**
 * HTTP latency interceptor — records http_request_duration_ms for every HTTP request with a BOUNDED
 * label set: the ROUTE TEMPLATE (never the raw URL), method, and status_class ∈ {2xx,3xx,4xx,5xx}.
 * Registered globally via APP_INTERCEPTOR. WS contexts are ignored (the gateway records manually).
 * Errors are recorded (mapping an HttpException's status to its class) and then RE-THROWN — never
 * swallowed.
 */
import { type CallHandler, type ExecutionContext, HttpException, Injectable, type NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { MetricsService, type StatusClass } from "./metrics.service";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only time HTTP. WS/RPC contexts fall straight through — the tracking gateway records its own
    // WS latencies, and labelling a WS event as an HTTP route would be meaningless.
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<{ method?: string; route?: { path?: string } }>();
    const method = (req.method ?? "UNKNOWN").toUpperCase();
    const route = this.routeTemplate(context, req);
    const done = this.metrics.startTimer();

    return next.handle().pipe(
      tap({
        next: () => {
          const status = http.getResponse<{ statusCode?: number }>().statusCode ?? 200;
          this.metrics.recordHttp(route, method, this.statusClass(status), done());
        },
        error: (err: unknown) => {
          // On a thrown HttpException the response status isn't set yet — read it off the exception.
          const status = err instanceof HttpException ? err.getStatus() : 500;
          this.metrics.recordHttp(route, method, this.statusClass(status), done());
          // never swallow — re-throw is implicit; tap's error callback does not consume the error.
        },
      }),
    );
  }

  /** Route TEMPLATE (bounded cardinality), NEVER the raw URL. Prefer the controller class path +
   *  handler path metadata; fall back to Express's resolved route path, then "unknown". */
  private routeTemplate(context: ExecutionContext, req: { route?: { path?: string } }): string {
    const classPath = Reflect.getMetadata("path", context.getClass()) as string | undefined;
    const handlerPath = Reflect.getMetadata("path", context.getHandler()) as string | undefined;
    if (classPath !== undefined || handlerPath !== undefined) {
      const joined = `/${classPath ?? ""}/${handlerPath ?? ""}`.replace(/\/+/g, "/").replace(/\/$/, "");
      return joined === "" ? "/" : joined;
    }
    return req.route?.path ?? "unknown";
  }

  private statusClass(status: number): StatusClass {
    if (status >= 500) return "5xx";
    if (status >= 400) return "4xx";
    if (status >= 300) return "3xx";
    return "2xx";
  }
}
