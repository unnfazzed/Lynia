const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
const mockPost = jest.fn();
jest.mock("../../api/orders", () => ({ postRiderFix: (...a: unknown[]) => mockPost(...a) }));
let mockToken: string | null = "access";
const mockConfigure = jest.fn();
jest.mock("../../api/client", () => {
  class ApiError extends Error {
    readonly status: number;
    constructor(code: number, message: string) {
      super(message);
      this.status = code;
    }
  }
  return { ApiError, configureApi: (h: unknown) => mockConfigure(h), currentAccessToken: () => mockToken };
});
const mockLoad = jest.fn();
jest.mock("../../auth/session", () => ({ loadSession: () => mockLoad(), saveSession: jest.fn() }));

import { ApiError } from "../../api/client";
import { rememberActiveJob, sendHeadlessFix } from "../headless-fix";

const ORDER = "2f1e9b3c-0000-4000-8000-000000000001";
const stop = jest.fn(async () => undefined);
const FIX = { lat: -17.8, lng: 31.05 };

beforeEach(async () => {
  mockStore.clear();
  mockPost.mockReset();
  stop.mockClear();
  mockToken = "access";
  mockConfigure.mockClear();
  mockLoad.mockReset();
});

describe("JQ-R2-01: the headless background fix", () => {
  it("posts the fix for the remembered job", async () => {
    await rememberActiveJob(ORDER);
    mockPost.mockResolvedValue({ ok: true });
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("sent");
    expect(mockPost).toHaveBeenCalledWith(ORDER, FIX);
    expect(stop).not.toHaveBeenCalled();
  });

  it("with no job on record, streams nothing and stops the service", async () => {
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("stopped");
    expect(mockPost).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it("a job that ended while the app was dead (403) is forgotten and the service stops", async () => {
    await rememberActiveJob(ORDER);
    mockPost.mockRejectedValue(new ApiError(403, "This job isn't active for you"));
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("stopped");
    expect(stop).toHaveBeenCalled();
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("stopped");
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("a dropped link loses only this fix — the job stays remembered for the next one", async () => {
    await rememberActiveJob(ORDER);
    mockPost.mockRejectedValueOnce(new ApiError(0, "network")).mockResolvedValue({ ok: true });
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("dropped");
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("sent");
    expect(stop).not.toHaveBeenCalled();
  });

  it("a headless runtime with no AuthProvider signs the client in from the stored session", async () => {
    await rememberActiveJob(ORDER);
    mockToken = null;
    mockLoad.mockResolvedValue({ accessToken: "stored", refreshToken: "r", profileId: "p" });
    mockConfigure.mockImplementation(() => {
      mockToken = "stored";
    });
    mockPost.mockResolvedValue({ ok: true });
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("sent");
    expect(mockConfigure).toHaveBeenCalled();
  });

  it("signed out: nothing is posted and the service stops", async () => {
    await rememberActiveJob(ORDER);
    mockToken = null;
    mockLoad.mockResolvedValue(null);
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("stopped");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("the stream's cleanup forgets the job", async () => {
    await rememberActiveJob(ORDER);
    await rememberActiveJob(null);
    await expect(sendHeadlessFix(FIX, stop)).resolves.toBe("stopped");
  });
});
