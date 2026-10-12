import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { DiditKycVendor } from "./didit-kyc-vendor";
import { StubKycVendor } from "./kyc-vendor";

const env = { DIDIT_API_KEY: "key_1", DIDIT_WORKFLOW_ID: "wf", DIDIT_BASE_URL: "https://verification.didit.me" } as Env;
const respond = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("DiditKycVendor.deleteSession (KYC-R26-05)", () => {
  it("DELETEs /v3/session/{id}/delete/ with the API key", async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal("fetch", fetchMock);
    expect(await new DiditKycVendor(env).deleteSession("sess/1")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://verification.didit.me/v3/session/sess%2F1/delete/");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key_1");
  });

  it("treats 404 as success (already gone)", async () => {
    vi.stubGlobal("fetch", respond(404));
    expect(await new DiditKycVendor(env).deleteSession("sess_1")).toBe(true);
  });

  it("never throws: a 5xx or a network failure is `false`, for the caller to log", async () => {
    vi.stubGlobal("fetch", respond(503));
    expect(await new DiditKycVendor(env).deleteSession("sess_1")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await new DiditKycVendor(env).deleteSession("sess_1")).toBe(false);
  });

  it("the stub vendor holds nothing, so deleting is a no-op success", async () => {
    expect(await new StubKycVendor().deleteSession("kyc_x")).toBe(true);
  });
});

describe("DiditKycVendor.sessionStatus (KYC-R26-11)", () => {
  it("returns ONLY the status string out of the full decision body", async () => {
    vi.stubGlobal("fetch", respond(200, { status: "In Review", id_verifications: [{ document_number: "63-123456-A-42", first_name: "T" }] }));
    expect(await new DiditKycVendor(env).sessionStatus("sess_1")).toBe("In Review");
  });

  it("null for a missing / non-string status, a non-2xx, or a throw", async () => {
    vi.stubGlobal("fetch", respond(200, { status: 3 }));
    expect(await new DiditKycVendor(env).sessionStatus("sess_1")).toBeNull();
    vi.stubGlobal("fetch", respond(404));
    expect(await new DiditKycVendor(env).sessionStatus("sess_1")).toBeNull();
  });
});

describe("DiditKycVendor.sessionDecision (KYC-R26-03)", () => {
  it("returns the decision payload for the reconciler, null on any failure", async () => {
    const body = { status: "Approved", face_matches: [{ score: 97 }] };
    vi.stubGlobal("fetch", respond(200, body));
    expect(await new DiditKycVendor(env).sessionDecision("sess_1")).toEqual(body);
    vi.stubGlobal("fetch", respond(500));
    expect(await new DiditKycVendor(env).sessionDecision("sess_1")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await new DiditKycVendor(env).sessionDecision("sess_1")).toBeNull();
  });
});
