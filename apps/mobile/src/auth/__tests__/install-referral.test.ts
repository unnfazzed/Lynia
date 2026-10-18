import { Platform } from "react-native";
import { INSTALL_REFERRER_TIMEOUT_MS, installReferralCode, resetInstallReferralForTests } from "../install-referral";

const mockReferrer = jest.fn<Promise<string>, []>();
jest.mock("expo-application", () => ({ getInstallReferrerAsync: () => mockReferrer() }));

const originalOS = Platform.OS;
const setOS = (os: string) => Object.defineProperty(Platform, "OS", { value: os, configurable: true });

beforeEach(() => {
  resetInstallReferralForTests();
  mockReferrer.mockReset();
  setOS("android");
});
afterEach(() => {
  jest.useRealTimers();
  setOS(originalOS);
});

describe("installReferralCode (D-112)", () => {
  it("reads the code from a biker's link, once per launch", async () => {
    mockReferrer.mockResolvedValue("utm_source=lyniago.com&utm_medium=biker_referral&utm_campaign=biker_referral&utm_content=K7P3QX");
    await expect(installReferralCode()).resolves.toBe("K7P3QX");
    await expect(installReferralCode()).resolves.toBe("K7P3QX");
    expect(mockReferrer).toHaveBeenCalledTimes(1);
  });

  it("has no code for any other install", async () => {
    mockReferrer.mockResolvedValue("utm_source=google-play&utm_medium=organic");
    await expect(installReferralCode()).resolves.toBeUndefined();
  });

  it("never throws when Play's referrer service fails", async () => {
    mockReferrer.mockRejectedValue(new Error("SERVICE_UNAVAILABLE"));
    await expect(installReferralCode()).resolves.toBeUndefined();
  });

  it("gives up after the timeout so sign-up isn't held", async () => {
    jest.useFakeTimers();
    mockReferrer.mockReturnValue(new Promise(() => {}));
    const read = installReferralCode();
    jest.advanceTimersByTime(INSTALL_REFERRER_TIMEOUT_MS);
    await expect(read).resolves.toBeUndefined();
  });

  it("doesn't ask off Android", async () => {
    setOS("web");
    await expect(installReferralCode()).resolves.toBeUndefined();
    expect(mockReferrer).not.toHaveBeenCalled();
  });
});
