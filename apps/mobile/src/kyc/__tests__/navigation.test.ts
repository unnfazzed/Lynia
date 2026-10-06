/**
 * The in-app ID-check sheet's navigation policy (src/kyc/navigation.ts) — the completion detector.
 * These pin the real completion shapes (app-scheme deep link, the API's /kyc/return landing, the API's
 * own host), that the vendor's own hosts and page-internal pseudo-schemes never close the sheet, and
 * that any OTHER off-vendor link is `external` — opened outside, never read as a finished check (a
 * policy link used to land a rider on "We're checking your ID" for a check they never did).
 */
import { resolveKycWebNavigation } from "../navigation";

const INITIAL = "https://verify.didit.me/session/abc123";

describe("resolveKycWebNavigation", () => {
  it("allows navigation on the initial host", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://verify.didit.me/session/abc123/step/2")).toBe("allow");
  });

  it("allows any didit.me host — the flow moves between vendor subdomains", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://cdn.didit.me/assets/x.js")).toBe("allow");
    expect(resolveKycWebNavigation(INITIAL, "https://didit.me/help")).toBe("allow");
  });

  it("does NOT allow a didit.me lookalike host (evil-didit.me)", () => {
    // `.didit.me` suffix matching must not accept a registrable domain that merely ends with the
    // string — completion here is the safe reading (the sheet closes; the server corrects).
    expect(resolveKycWebNavigation(INITIAL, "https://evildidit.me/phish")).toBe("external");
  });

  it("treats an app-scheme redirect as completion (the deep-link callback)", () => {
    expect(resolveKycWebNavigation(INITIAL, "lynia://kyc-done")).toBe("completed");
    expect(resolveKycWebNavigation(INITIAL, "intent://verify#Intent;scheme=lynia;end")).toBe("completed");
  });

  it("treats the /kyc/return landing as completion, on whatever host the callback names", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://api.lyniago.com/kyc/return?session_id=abc")).toBe(
      "completed",
    );
    expect(resolveKycWebNavigation(INITIAL, "https://api.lyniago.com/kyc/return")).toBe("completed");
    expect(resolveKycWebNavigation(INITIAL, "https://api.lyniago.com/kyc/return/")).toBe("completed");
  });

  it("treats any page on the API's own host as completion", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://api.lyniago.com/done", "https://api.lyniago.com")).toBe("completed");
  });

  // Regression: a privacy/terms link on Didit's first screen closed the sheet as "completed", and the
  // board then told a rider who had submitted nothing that their ID was being checked.
  it("treats any other off-vendor link as external — never as a finished check", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://www.lyniago.com/privacy", "https://api.lyniago.com")).toBe("external");
    expect(resolveKycWebNavigation(INITIAL, "https://example.com/terms")).toBe("external");
    expect(resolveKycWebNavigation(INITIAL, "https://example.com/kyc/returned")).toBe("external");
    expect(resolveKycWebNavigation(INITIAL, "mailto:support@didit.me")).toBe("external");
    expect(resolveKycWebNavigation(INITIAL, "tel:+263000000")).toBe("external");
    expect(resolveKycWebNavigation(INITIAL, "intent://chat#Intent;scheme=whatsapp;end")).toBe("external");
  });

  it("allows page-internal pseudo-schemes — they are never a callback", () => {
    for (const url of ["about:blank", "data:text/html,hi", "blob:https://verify.didit.me/x", "javascript:void(0)"]) {
      expect(resolveKycWebNavigation(INITIAL, url)).toBe("allow");
    }
  });

  it("allows relative/fragment navigation", () => {
    expect(resolveKycWebNavigation(INITIAL, "/session/abc123/next")).toBe("allow");
    expect(resolveKycWebNavigation(INITIAL, "#liveness")).toBe("allow");
  });

  it("host comparison ignores case, port and userinfo", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://VERIFY.DIDIT.ME/session/abc123")).toBe("allow");
    expect(resolveKycWebNavigation(INITIAL, "https://user@verify.didit.me:443/x")).toBe("allow");
  });

  it("a backslash-delimited authority cannot spoof the vendor host (WHATWG: \\ ends the authority)", () => {
    // A browser/WebView navigates these to evil.example (backslash acts like a slash), so the
    // policy must NOT read the didit.me part after it as the host and keep the page in the sheet.
    expect(resolveKycWebNavigation(INITIAL, "https://evil.example\\@verify.didit.me/x")).toBe("external");
    expect(resolveKycWebNavigation(INITIAL, "https://evil.example\\.didit.me/x")).toBe("external");
  });

  it("lets an unparseable http URL through to the WebView (its error state owns the failure)", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://")).toBe("allow");
  });
});
