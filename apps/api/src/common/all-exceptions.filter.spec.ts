import { type ArgumentsHost, ForbiddenException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { AllExceptionsFilter, DB_UNAVAILABLE_RETRY_AFTER_SEC } from "./all-exceptions.filter";

/** Builds a fake HTTP ArgumentsHost whose response captures the status + json body. */
function makeHost(): {
  host: ArgumentsHost;
  captured: { status?: number; body?: unknown; headers: Record<string, string> };
} {
  const captured: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
    },
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

  it("wraps a bare-string HttpException body in the { statusCode, message } envelope (E2E 2026-10-05 FS-3)", () => {
    const filter = new AllExceptionsFilter();
    const { host, captured } = makeHost();

    filter.catch(new HttpException("Too many requests — try again later", HttpStatus.TOO_MANY_REQUESTS), host);

    expect(captured.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(captured.body).toEqual({ statusCode: 429, message: "Too many requests — try again later" });
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

  describe("LC-D22: transient DB-unavailable errors become a 503 with Retry-After", () => {
    const known = (code: string) =>
      new Prisma.PrismaClientKnownRequestError("db down", { code, clientVersion: "7.10.0" });

    it.each([
      ["pg-pool acquire timeout (plain Error, as the pg adapter surfaces it)", new Error("timeout exceeded when trying to connect")],
      ["pg-pool new-connection timeout", new Error("Connection terminated due to connection timeout")],
      ["a pool timeout wrapped as a cause", new Error("query failed", { cause: new Error("timeout exceeded when trying to connect") })],
      ["P1001 can't reach database", known("P1001")],
      ["P1002 server timed out", known("P1002")],
      ["P1008 socket timeout", known("P1008")],
      ["P1017 connection closed", known("P1017")],
      ["P2024 engine pool timeout", known("P2024")],
      ["P2037 too many connections", known("P2037")],
      ["init error P1001", new Prisma.PrismaClientInitializationError("cannot reach", "7.10.0", "P1001")],
      [
        "P2028 interactive $transaction maxWait (pool exhaustion on a write)",
        new Prisma.PrismaClientKnownRequestError("Transaction API error: Unable to start a transaction in the given time.", {
          code: "P2028",
          clientVersion: "7.10.0",
        }),
      ],
    ])("%s → 503", (_label, err) => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { host, captured } = makeHost();
      new AllExceptionsFilter().catch(err, host);
      expect(captured.status).toBe(503);
      expect(captured.headers["Retry-After"]).toBe(String(DB_UNAVAILABLE_RETRY_AFTER_SEC));
      const body = captured.body as { statusCode: number; message: string; correlationId: string };
      expect(body.statusCode).toBe(503);
      expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(body)).not.toContain("db down");
      errSpy.mockRestore();
    });

    it("P2028 for an expired / closed transaction (an app bug, not exhaustion) stays a 500", () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { host, captured } = makeHost();
      const expired = new Prisma.PrismaClientKnownRequestError(
        "Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction.",
        { code: "P2028", clientVersion: "7.10.0" },
      );
      new AllExceptionsFilter().catch(expired, host);
      expect(captured.status).toBe(500);
      expect(captured.headers["Retry-After"]).toBeUndefined();
      errSpy.mockRestore();
    });

    it("a non-transient Prisma error (P2002 unique violation) stays a plain 500 with no Retry-After", () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { host, captured } = makeHost();
      new AllExceptionsFilter().catch(known("P2002"), host);
      expect(captured.status).toBe(500);
      expect(captured.headers["Retry-After"]).toBeUndefined();
      errSpy.mockRestore();
    });
  });
});
