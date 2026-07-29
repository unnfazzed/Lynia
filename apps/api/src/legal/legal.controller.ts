import { Controller, Get, Header } from "@nestjs/common";
import { accountDeletionHtml, privacyPolicyHtml } from "./legal.content";

/**
 * Public legal pages (`/legal/privacy`, `/legal/account-deletion`).
 *
 * Google Play will not review a listing without a reachable privacy-policy URL, and — for any app
 * that lets users create an account — a separate account/data-deletion URL on the Data safety form.
 * Lynia has no marketing site, so these are served from the API host that is already live and
 * CI-deployed. Copy lives in `legal.content.ts`, derived from the PII manifest + docs/DATA-RETENTION.md.
 *
 * Deliberately UNAUTHENTICATED and cheap: Play's reviewers (and its automated crawler) fetch these
 * with no credentials and from outside Zimbabwe, so any guard, sign-in wall or geo-restriction here
 * fails the review. Like `/healthz` and `/app/version-gate` these are static reads that touch neither
 * the database nor Redis, so they can never add load-shed pressure.
 */
@Controller("legal")
export class LegalController {
  /**
   * The global middleware stack is tuned for a JSON API that renders no HTML, so these two routes
   * override three of its defaults:
   *
   *  - **Content-Type**: Nest would infer `text/html` from neither the return type nor the path;
   *    stated explicitly (with charset) so the page is rendered, not downloaded.
   *  - **CSP**: `security-headers.middleware.ts` sets no page CSP because nothing served HTML until
   *    now. These pages are entirely self-contained — one inline `<style>`, no script, no image, no
   *    remote font — so they get the tightest policy that still renders: everything denied except
   *    inline style. A policy page must never be able to load third-party code.
   *  - **Cache-Control**: overrides the global `private, no-cache` (the last `setHeader` wins, and
   *    controllers run after middleware). The body is identical for every caller and changes only
   *    when the copy is revised, so a day of shared caching is safe and keeps the page fast — and
   *    available — for a reviewer on a slow link.
   */
  @Get("privacy")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
  @Header("Cache-Control", "public, max-age=86400")
  privacy(): string {
    return privacyPolicyHtml();
  }

  @Get("account-deletion")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
  @Header("Cache-Control", "public, max-age=86400")
  accountDeletion(): string {
    return accountDeletionHtml();
  }
}
