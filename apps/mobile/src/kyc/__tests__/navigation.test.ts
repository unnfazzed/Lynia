/**
 * The in-app ID-check sheet's navigation policy (src/kyc/navigation.ts) — the completion detector.
 * These pin the two real completion shapes (app-scheme deep link, off-vendor https callback), that
 * the vendor's own hosts and page-internal pseudo-schemes never close the sheet, and the
 * completion-biased default for anything else off-vendor (a false "completed" self-corrects on the
 * board's next poll; a missed completion strands a finished rider — see the module header).
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
    expect(resolveKycWebNavigation(INITIAL, "https://evildidit.me/phish")).toBe("completed");
  });

  it("treats an app-scheme redirect as completion (the deep-link callback)", () => {
    expect(resolveKycWebNavigation(INITIAL, "lynia://kyc-done")).toBe("completed");
    expect(resolveKycWebNavigation(INITIAL, "intent://verify#Intent;scheme=lynia;end")).toBe("completed");
  });

  it("treats an off-vendor https redirect as completion (the hosted-callback shape)", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://lyniago.lyniafinance.com/kyc/return?session_id=abc")).toBe(
      "completed",
    );
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
    expect(resolveKycWebNavigation(INITIAL, "https://evil.example\\@verify.didit.me/x")).toBe("completed");
    expect(resolveKycWebNavigation(INITIAL, "https://evil.example\\.didit.me/x")).toBe("completed");
  });

  it("lets an unparseable http URL through to the WebView (its error state owns the failure)", () => {
    expect(resolveKycWebNavigation(INITIAL, "https://")).toBe("allow");
  });
});
