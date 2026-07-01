import { type CallHandler, type ExecutionContext, ConflictException } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { MetricsInterceptor } from "./metrics.interceptor";
import type { MetricsService } from "./metrics.service";

/** Spy metrics fake — assert recordHttp is called with the route template + status class. */
function fakeMetrics() {
  return { startTimer: () => () => 5, recordHttp: vi.fn() } as unknown as MetricsService & {
    recordHttp: ReturnType<typeof vi.fn>;
  };
}

/** Minimal HTTP ExecutionContext: carries a request/response and route-template metadata via
 *  Reflect.getMetadata("path", class|handler). We stamp the metadata on stand-in class/handler fns. */
function httpContext(opts: {
  method?: string;
  statusCode?: number;
  routePath?: string;
  classPath?: string;
  handlerPath?: string;
}): ExecutionContext {
  class OrdersController {}
  function handler(): void {}
  if (opts.classPath !== undefined) Reflect.defineMetadata("path", opts.classPath, OrdersController);
  if (opts.handlerPath !== undefined) Reflect.defineMetadata("path", opts.handlerPath, handler);

  const req = { method: opts.method ?? "GET", route: opts.routePath ? { path: opts.routePath } : undefined };
  const res = { statusCode: opts.statusCode ?? 200 };
  return {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getClass: () => OrdersController,
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

/** A non-HTTP (e.g. WS) context — the interceptor must ignore it entirely. */
function wsContext(): ExecutionContext {
  return {
    getType: () => "ws",
    switchToHttp: () => {
      throw new Error("switchToHttp must not be called for a WS context");
    },
  } as unknown as ExecutionContext;
}

const handlerOf = (obs: unknown): CallHandler => ({ handle: () => obs as never });

describe("MetricsInterceptor", () => {
  it("records http_request_duration_ms with the route TEMPLATE + status class on success", async () => {
    const metrics = fakeMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const ctx = httpContext({ method: "post", statusCode: 201, classPath: "orders", handlerPath: "" });

    await lastValueFrom(interceptor.intercept(ctx, handlerOf(of({ ok: true }))));

    expect(metrics.recordHttp).toHaveBeenCalledTimes(1);
    // route = controller class path joined with the handler path (template, not the raw URL).
    expect(metrics.recordHttp).toHaveBeenCalledWith("/orders", "POST", "2xx", 5);
  });

  it("records the error's status class AND re-throws (never swallows)", async () => {
    const metrics = fakeMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const ctx = httpContext({ method: "get", classPath: "orders", handlerPath: ":id" });
    const err = new ConflictException("nope"); // getStatus() === 409 → 4xx

    await expect(
      lastValueFrom(interceptor.intercept(ctx, handlerOf(throwError(() => err)))),
    ).rejects.toBe(err);

    expect(metrics.recordHttp).toHaveBeenCalledWith("/orders/:id", "GET", "4xx", 5);
  });

  it("maps a non-HttpException error to 5xx and still re-throws", async () => {
    const metrics = fakeMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const ctx = httpContext({ method: "get", classPath: "orders" });
    const err = new Error("boom");

    await expect(
      lastValueFrom(interceptor.intercept(ctx, handlerOf(throwError(() => err)))),
    ).rejects.toBe(err);

    expect(metrics.recordHttp).toHaveBeenCalledWith("/orders", "GET", "5xx", 5);
  });

  it("ignores non-HTTP (WS) contexts — passes through without recording", async () => {
    const metrics = fakeMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const result = await lastValueFrom(interceptor.intercept(wsContext(), handlerOf(of("passthrough"))));

    expect(result).toBe("passthrough");
    expect(metrics.recordHttp).not.toHaveBeenCalled();
  });
});
