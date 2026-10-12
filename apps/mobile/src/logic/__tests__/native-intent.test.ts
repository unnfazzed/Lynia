/**
 * app/+native-intent.tsx: the ID check's bare `lynia://` return (src/kyc/verify.ts, the API's /kyc/return
 * landing) is dropped while the app runs — expo-router used to resolve it to `/` and stack a second boot
 * redirect (a second board, or the board over R1). A launch by it, and every other URL, passes through.
 */
import { isKycReturnUrl, redirectSystemPath } from "../native-intent";
import { KYC_RETURN_REDIRECT } from "../../kyc/verify";

describe("redirectSystemPath", () => {
  it.each(["lynia://", "lynia:///", "lynia://kyc/return", "lynia:///kyc/return", "lynia://kyc/return?status=Approved", "LYNIA://"])("drops %s while the app is running", (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe("");
  });

  it("drops exactly the URL the browser fallback waits for", () => {
    expect(isKycReturnUrl(KYC_RETURN_REDIRECT)).toBe(true);
    expect(redirectSystemPath({ path: KYC_RETURN_REDIRECT, initial: false })).toBe("");
  });

  it("a cold start BY the return URL still boots through it", () => {
    expect(redirectSystemPath({ path: "lynia://", initial: true })).toBe("lynia://");
  });

  it.each(["lynia://order/o1", "lynia://rider/job", "lynia://kyc/returned", "https://lyniago.com/kyc/return", "/order/o1"])("passes %s through untouched", (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    expect(redirectSystemPath({ path, initial: true })).toBe(path);
  });
});
