import { type ArgumentsHost, ForbiddenException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "./all-exceptions.filter";

/** Builds a fake HTTP ArgumentsHost whose response captures the status + json body. */
function makeHost(): {
  host: ArgumentsHost;
  captured: { status?: number; body?: unknown };
} {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return {
        json(body: unknown) {
          captured.body = body;
          return body;
        },
      };
    },
  };
  const host = {
    getType: () => "http",
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: "POST", url: "/orders" }),
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe("AllExceptionsFilter", () => {
  it("passes an HttpException through with its status and response body", () => {
    const filter = new AllExceptionsFilter();
    const { host, captured } = makeHost();

    filter.catch(new ForbiddenException("nope"), host);

    expect(captured.status).toBe(HttpStatus.FORBIDDEN);
    // The original HttpException response body is preserved verbatim.
    expect(captured.body).toMatchObject({ statusCode: HttpStatus.FORBIDDEN, message: "nope" });
  });

  it("preserves a custom HttpException status code", () => {
    const filter = new AllExceptionsFilter();
    const { host, captured } = makeHost();

    filter.catch(new HttpException("teapot", HttpStatus.I_AM_A_TEAPOT), host);

    expect(captured.status).toBe(HttpStatus.I_AM_A_TEAPOT);
  });

  it("coerces a plain Error to a safe generic 500 with no internal detail leaked", () => {
    // Silence the expected error log for a clean test run.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const filter = new AllExceptionsFilter();
    const { host, captured } = makeHost();

    filter.catch(new Error("DB password is hunter2 and the stack is secret"), host);

    expect(captured.status).toBe(500);
    const body = captured.body as { statusCode: number; message: string; correlationId: string };
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe("Internal server error");
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    // The response must NOT carry the internal message or a stack trace.
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(JSON.stringify(body)).not.toContain("stack");

    errSpy.mockRestore();
  });

  it("generates a distinct correlationId per unexpected error", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const filter = new AllExceptionsFilter();

    const a = makeHost();
    filter.catch(new Error("boom-1"), a.host);
    const b = makeHost();
    filter.catch(new Error("boom-2"), b.host);

    const idA = (a.captured.body as { correlationId: string }).correlationId;
    const idB = (b.captured.body as { correlationId: string }).correlationId;
    expect(idA).not.toBe(idB);

    errSpy.mockRestore();
  });
});
