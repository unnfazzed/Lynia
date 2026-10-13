import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nudgePerson } from "./actions";

/** Admin console v2 §4: the Nudge server action through the real admin API client (only `fetch` mocked). */
const { headersMock, revalidateMock } = vi.hoisted(() => ({ headersMock: vi.fn(), revalidateMock: vi.fn() }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

const fetchMock = vi.fn();
const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  headersMock.mockResolvedValue(new Headers({ "x-lynia-operator": "ops@corp.com" }));
  revalidateMock.mockReset();
  process.env.API_BASE_URL = "https://api.test";
  process.env.ADMIN_API_TOKEN = "t";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_BASE_URL;
  delete process.env.ADMIN_API_TOKEN;
});

describe("nudgePerson", () => {
  it("posts the person, the list and the reason, and resolves when the push went out", async () => {
    fetchMock.mockResolvedValue(res(201, { result: "sent", at: "2026-10-13T10:00:00Z" }));
    await nudgePerson("p1", "biker_no_didit", "Stuck on this step", "");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/admin/nudge");
    expect(JSON.parse(init.body as string)).toEqual({ profileId: "p1", step: "biker_no_didit", reason: "Stuck on this step", note: null });
    expect(revalidateMock).toHaveBeenCalledWith("/people");
  });

  it.each([
    [{ result: "no_push" }, /No push/],
    [{ result: "already_sent", at: "2026-10-13T08:05:00Z" }, /Already nudged for this today, at 10:05/],
    [{ result: "not_delivered", at: "2026-10-13T10:00:00Z" }, /wasn't accepted/],
  ])("keeps the dialog open with what happened: %j", async (body, msg) => {
    fetchMock.mockResolvedValue(res(201, body));
    await expect(nudgePerson("p1", "biker_no_didit", "Stuck on this step", "")).rejects.toThrow(msg);
  });

  it("an API refusal shows the API's words", async () => {
    fetchMock.mockResolvedValue(res(409, { message: "This person isn't a biker." }));
    await expect(nudgePerson("p1", "biker_no_didit", "Stuck on this step", "")).rejects.toThrow("Couldn't nudge: This person isn't a biker.");
  });
});
