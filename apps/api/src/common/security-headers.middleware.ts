import type { NextFunction, Request, Response } from "express";

/**
 * Baseline security response headers — a dependency-free equivalent of the Helmet defaults, tuned for
 * a JSON API + WebSocket backend (no HTML is served, so a page CSP is unnecessary; we lock the response
 * down instead). Applied globally in main.ts before routing.
 *
 * Kept as a small explicit middleware rather than pulling in `helmet` so there is no new dependency to
 * vet/patch and every header is auditable here. TLS is terminated at the ALB (managed cert +
 * HTTP→HTTPS redirect), so HSTS instructs conforming clients to stay on HTTPS.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Force HTTPS for a long window, including subdomains (safe: the whole platform is HTTPS-only).
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  // Never let a browser MIME-sniff a response into something executable.
  res.setHeader("X-Content-Type-Options", "nosniff");
  // This API renders no HTML; disallow being framed at all (clickjacking defense in depth).
  res.setHeader("X-Frame-Options", "DENY");
  // Don't leak URLs (which can carry ids) to third parties via the Referer header.
  res.setHeader("Referrer-Policy", "no-referrer");
  // Responses are private API data — deny cross-origin embedding of them.
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  // Drop the ambient-authority surface for a JSON API: no reason for any browser feature to be usable.
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  // Remove the framework fingerprint (defense in depth / less attacker recon). Note: Express sets
  // X-Powered-By at send-time, so this middleware call cannot actually strip it — the authoritative
  // suppression is `app.getHttpAdapter().getInstance().disable("x-powered-by")` in main.ts. This
  // line is kept as a harmless belt-and-braces for any header already present at this point.
  res.removeHeader("X-Powered-By");
  next();
}
