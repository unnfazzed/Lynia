import { z } from "zod";

/** The dev/CI default JWT secret. Booting production with this (or any short secret) means tokens are
 *  signed with a publicly-known key → universal forgery, so the production boot-guard rejects it. */
export const INSECURE_JWT_DEFAULT = "dev-insecure-secret-change-me-please";
/** The dev/CI default PII-encryption key. Booting production with it (or any short key) would encrypt
 *  national IDs under a publicly-known key — no better than plaintext — so the prod boot-guard rejects it. */
export const INSECURE_PII_KEY_DEFAULT = "dev-insecure-pii-key-change-me-please";
/** Minimum entropy we require of a production signing secret (bytes ≈ chars for the ASCII secrets we mint). */
const MIN_PROD_SECRET_LEN = 32;

/** Obvious 6-digit sequences rejected for the (fixed, non-rotating) Play-review demo code, on top of
 *  the all-same-digit check. Not exhaustive — just the codes a human reaches for first. */
const TRIVIAL_DEMO_CODES = new Set([
  "012345", "123456", "234567", "345678", "456789", "567890",
  "987654", "876543", "765432", "654321", "543210", "098765",
]);

/** Optional URL that treats an empty string as absent. The deploy injects some optional vars with an
 *  empty value when their repo Variable is unset (e.g. `--set-env-vars DIDIT_CALLBACK_URL=`); "" is not
 *  `undefined`, so a bare `.url().optional()` would reject it and crash boot. Coerce "" → undefined. */
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

/** Validated environment. Secrets are injected as env at deploy (D7: no managed-identity lock-in). */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Deployment tier WITHIN NODE_ENV=production. "staging" is the pre-prod stack
  // (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §2d): it keeps every SECRET-strength/REDIS boot-guard
  // below (staging must be prod-shaped) but relaxes only the launch-hygiene guards, so the k6
  // load harness and QA devices can authenticate vendor-free (console OTP / stub KYC) against
  // it. Defense against this flag ever weakening prod: it defaults to "production", and the
  // prod deploy (release.yml) HARDCODES APP_ENV=production — no repo Variable is interpolated
  // into it — while only deploy-staging.yml sets "staging" on the separate staging service.
  APP_ENV: z.enum(["production", "staging"]).default("production"),
  PORT: z.coerce.number().int().positive().default(3000),
  // Express `trust proxy` — how many reverse-proxy hops sit in front of the API, so req.ip / the
  // X-Forwarded-For client IP the per-IP rate limits key off resolves to the real caller instead of
  // the load balancer (otherwise every request shares one bucket and the caps become a global DoS).
  //
  // Default "1" is VERIFIED for the deployed topology (infra/terraform/lb.tf): client → global external
  // HTTPS ALB → serverless NEG → Cloud Run, with the default *.run.app URL disabled so ALL traffic
  // arrives via the ALB. Per Google's Cloud Run contract the app then sees `X-Forwarded-For:
  // <client>, <lb>` — exactly one trusted hop — so trust proxy = 1 makes req.ip the real client AND is
  // spoof-resistant (a client-injected XFF lands left of the real client and is ignored). Cloud Armor
  // (armor.tf) also rate-limits per client IP at the edge; this app-level limiter is defence-in-depth.
  //
  // "false" disables it for a direct/dev deploy; a subnet list ("loopback, 10.0.0.0/8") is also
  // accepted. Change only if the proxy chain changes (extra CDN/proxy hop). See common/trust-proxy.ts.
  TRUST_PROXY: z.string().default("1"),
  DATABASE_URL: z.string().min(1),
  // Explicit Prisma connection-pool tuning (E6). Applied to the datasource URL in PrismaService; both
  // optional — the pool size falls back to a deterministic default and pool_timeout to Prisma's.
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().optional(),
  DATABASE_POOL_TIMEOUT: z.coerce.number().int().nonnegative().optional(),
  REDIS_URL: z.string().min(1).optional(),
  // --- Micro-cache runtime control (docs/PERFORMANCE.md wave 2 — the DoorDash "runtime flags per
  // cache" lesson, expressed as per-revision env so ops can flip behavior without a code deploy). ---
  // Kill-switch: "true" bypasses every read-through micro-cache (loaders run directly). The escape
  // hatch if cached staleness is ever suspected in an incident; default off.
  MICRO_CACHE_DISABLED: z.enum(["true", "false"]).default("false"),
  // Opt-in shared L2 over the existing Redis: instances then share warm entries (hit rate rises with
  // instance count). Off by default — L1-only is wave-1 behavior; requires REDIS_URL to have effect.
  MICRO_CACHE_REDIS_L2: z.enum(["true", "false"]).default("false"),
  // Per-cache TTL overrides (ms). Absent ⇒ the code defaults (orders.service.ts constants). Bounded
  // to keep a typo from pinning informational reads for hours: 0 disables that single cache.
  MICRO_CACHE_TTL_MS_NEARBY_COUNT: z.coerce.number().int().min(0).max(300_000).optional(),
  // C-O4: serve-stale hard bound for the nearby-count cache — how long past its own TTL a value may
  // still be served on an upstream (PostGIS) failure before degrading to the honest "unknown" null.
  // Bounded to 10 minutes: informational-count staleness, never a permanent trade for correctness.
  MICRO_CACHE_STALE_TTL_MS_NEARBY_COUNT: z.coerce.number().int().min(0).max(600_000).optional(),
  // Ceiling 600s = the code default: a cached signed URL must always reach the client with ≥5 min of
  // its 15-min validity left (photo download headroom on 2G) — a higher override would break that.
  MICRO_CACHE_TTL_MS_PICKUP_PHOTO_URL: z.coerce.number().int().min(0).max(600_000).optional(),
  // Merchant photo read-URLs (RCA 2026-08-17 §5.1): ceiling 14 h = the code default — with the
  // cache's ±10% TTL jitter the worst-case entry lives 15.4 h of the URL's 24 h validity, so any
  // served URL keeps ≥8.6 h of signed life; a higher override would erode that jitter-aware margin.
  MICRO_CACHE_TTL_MS_MERCHANT_PHOTO_URL: z.coerce.number().int().min(0).max(50_400_000).optional(),
  // Cloud chosen: GCP (2026-06-27). Single value today; the adapter seam (D7) is where a second
  // cloud would slot in.
  CLOUD_PROVIDER: z.enum(["gcp"]).default("gcp"),
  STORAGE_BUCKET: z.string().default("lynia-media"),
  // GCS signing: project id for the Storage client. Signing creds come from ADC on Cloud Run
  // (the attached SA + IAM signBlob), so no private key lives in env.
  GCP_STORAGE_PROJECT_ID: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  OTEL_SERVICE_NAME: z.string().default("lynia-api"),
  // --- Crash / error reporting (Sentry, roadmap 1.1 / LR20) ---
  // Inert without a DSN: initSentry() no-ops when SENTRY_DSN is unset, so dev/test and any env the
  // founder hasn't provisioned stay quiet (mirrors the OTEL/push seam). Set as a Secret Manager value
  // wired into the runtime SA to turn it on. Traces sample rate is bounded [0,1]; environment tags the
  // release channel in the dashboard.
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  SENTRY_ENVIRONMENT: z.string().optional(),
  // --- Push (lane A4) ---
  // "fcm" sends via firebase-admin (ADC creds on Cloud Run — no key in env); "noop" logs only
  // (dev/test, and prod until the Firebase project + messaging role are provisioned).
  PUSH_PROVIDER: z.enum(["fcm", "noop"]).default("noop"),
  // Optional project override. On Cloud Run ADC supplies the project, so this is usually unset.
  FCM_PROJECT_ID: z.string().optional(),
  // --- Auth (lane B) ---
  JWT_SIGNING_SECRET: z.string().min(16).default(INSECURE_JWT_DEFAULT),
  // Optional previous signing secret, accepted on verify only, for a zero-downtime rotation window
  // (see docs/SECRET-ROTATION.md). Remove it once older access tokens have expired (> ACCESS_TTL).
  JWT_SIGNING_SECRET_PREVIOUS: z.string().min(16).optional(),
  // Optional dedicated key for HMAC-hashing OTP codes + refresh tokens. Separating it from the JWT
  // signing secret lets the signing secret rotate without invalidating stored refresh-token hashes.
  // Defaults to JWT_SIGNING_SECRET when unset (backward-compatible).
  TOKEN_HASH_SECRET: z.string().min(16).optional(),
  // PII at-rest key (LR8): HKDF-derived AES-256-GCM (encrypt national IDs) + HMAC (dedup hash). Same bar
  // as the JWT secret — the dev default / any <32-char key is rejected in production (see boot-guard).
  PII_ENCRYPTION_KEY: z.string().min(16).default(INSECURE_PII_KEY_DEFAULT),
  ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // One year. Sign-in is the ONLY place an OTP is sent, so this is what decides how often a user pays
  // the SMS round-trip again: refresh rotates the session and re-stamps this window, so anyone who
  // opens the app at least once a year never re-verifies (product decision 2026-07-25 — the inDrive
  // "stay signed in" model). Only a >1y dormant user is asked for a code again.
  //
  // Two consequences worth knowing. (1) A stolen handset grants access for up to this long unless the
  // session is revoked — the trade every consumer app makes, bounded by logout/revoke. (2) Phone is the
  // account key, so the dormant users who DO re-verify are now concentrated in the 12-months-plus band,
  // where carrier number recycling is likeliest — the window in which someone can inherit a recycled
  // number's account. That path is unchanged here and is still only a log line (P2-8, auth.service.ts);
  // making it measurable, and deciding how hard to gate the rebind, is tracked separately.
  REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(31_536_000),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  // OTP send caps (auth.service.ts `rlFrom`). Overridable so the ceiling can be TIGHTENED during an
  // incident, or widened for a launch push, without shipping code — the lever you want at 2am.
  //
  // The global daily cap is a SPEND ceiling as much as an abuse one: `POST /auth/otp/request` is
  // unauthenticated because it IS the signup entry point, and on the live Bird channel each send costs
  // ~EUR 0.195. So worst-case daily spend is roughly OTP_RL_GLOBAL_MAX x that price. The default is
  // sized for a pilot (500/day ~ EUR 98/day), not for launch volume — raise the repo Variable before
  // opening signups, or real users will hit the ceiling.
  OTP_RL_PHONE_MAX: z.coerce.number().int().positive().default(5), // per phone, per hour
  OTP_RL_IP_MAX: z.coerce.number().int().positive().default(20), // per IP, per hour
  OTP_RL_GLOBAL_MAX: z.coerce.number().int().positive().default(500), // all senders, per day
  OTP_RL_DEVICE_SIGNUP_MAX: z.coerce.number().int().positive().default(3), // NEW accounts per device, per day
  // E4: WhatsApp default, SMS behind a flag (schedule insurance vs BSP delay). "bird" delivers the OTP
  // as an SMS via bird.com (product decision 2026-07-18) while WhatsApp Business verification is pending;
  // "local-sms" delivers via a local A2P gateway (the Zimbabwe fallback for when Bird's international
  // route is throttled on Econet — same product decision). Both are one-line flips to/from "whatsapp".
  // "console" logs the code for local/dev testing without any messaging provider.
  OTP_CHANNEL: z.enum(["whatsapp", "sms", "bird", "local-sms", "console"]).default("whatsapp"),
  // QA/test only: comma-separated phone numbers for which requestOtp returns the code in its
  // response, so end-to-end signup is testable on a real device with no WhatsApp BSP. ONLY
  // effective on the "console" channel and ONLY for numbers in this list — an arbitrary phone
  // is never exposed, so this is not an account-takeover hole. Empty = exposure off (default).
  // MUST be empty (and OTP_CHANNEL not "console" or the unimplemented "sms" stub) before real launch —
  // see docs/PILOT-READINESS.md.
  OTP_TEST_PHONES: z.string().default(""),
  // Play-review demo account (docs/PLAY-STORE-SUBMISSION.md §7.1). A single allowlisted phone whose
  // login accepts a FIXED code, so a Google reviewer — who cannot receive a Zimbabwean OTP — can sign
  // in with credentials supplied in the Play Console "App access" form. UNLIKE OTP_TEST_PHONES this
  // NEVER echoes a code in any response and is deliberately ALLOWED in production (that is its whole
  // purpose). Both vars must be set together to arm it; either unset → the feature is entirely off.
  // The code must be exactly 6 digits — that is all POST /auth/otp/verify accepts and all the app's
  // code field allows. Validated in the superRefine below (in every environment).
  DEMO_OTP_PHONE: z.string().optional(),
  DEMO_OTP_CODE: z.string().optional(),
  // WhatsApp Cloud API (Meta) — only needed when OTP_CHANNEL=whatsapp. ACCESS_TOKEN is the secret.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default("en"),
  WHATSAPP_GRAPH_VERSION: z.string().default("v21.0"),
  // Plain string (not .url()) so an injected empty value can never crash boot (ENG-REVIEW §4).
  WHATSAPP_GRAPH_BASE_URL: z.string().default("https://graph.facebook.com"),
  // Meta "authentication"-category templates carry a one-tap/copy-code button that also takes the
  // code as a parameter; set "false" if your approved template is body-only.
  WHATSAPP_OTP_COPY_CODE_BUTTON: z.enum(["true", "false"]).default("true"),
  // Delivery-status webhook (whatsapp.controller.ts) — Meta's POST /messages 200 only means "accepted
  // into Meta's send queue", not delivered; without this webhook a failed OTP send (bad number,
  // quality-rating throttling, etc.) is invisible to both the user and ops. WHATSAPP_APP_SECRET signs
  // the callback's X-Hub-Signature-256 (Meta App Secret, distinct from WHATSAPP_ACCESS_TOKEN);
  // WHATSAPP_WEBHOOK_VERIFY_TOKEN answers Meta's one-time GET subscription handshake. Both optional —
  // same deliberate boot-tradeoff as the other WHATSAPP_* vars above (a hard crash on missing config
  // would take the whole API down rather than just this one webhook).
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  // Bird (bird.com) SMS — only needed when OTP_CHANNEL=bird. Bird is a delivery pipe: we still
  // generate/hash/verify the code ourselves (otp-store.ts), Bird only sends the SMS. BIRD_ACCESS_KEY is
  // the secret — a workspace-scoped API key (`bk_<region>_…`) sent as `Authorization: Bearer <key>`.
  // Because the key already carries the workspace, the send needs no workspace/channel id: the SMS API
  // (POST /v1/sms/messages) has no notion of channels at all. Optional like the WHATSAPP_* vars so a
  // misconfigured bird channel boots green and fails loud at send (BirdOtpSender) rather than crashing
  // the whole API — the release workflow validates it before a production deploy.
  BIRD_ACCESS_KEY: z.string().optional(),
  // Sender shown on the OTP SMS: an alphanumeric sender ID (1–11 chars), an E.164 number, or a short
  // code. Omitted, Bird picks from its shared pool — but a destination with no eligible pool sender
  // rejects the send with E12003 ("No eligible sender is available for this message"), which is what
  // Zimbabwe/+263 does. Set this once a sender is registered for the destination country.
  BIRD_SMS_FROM: z.string().optional(),
  // Signing secret for Bird's delivery-status webhook (`whsec_…`), returned EXACTLY ONCE when the
  // endpoint is created and never retrievable again — capture it at creation or rotate the endpoint.
  // Optional for the same boot-tradeoff as the vars above, but BirdWebhookController fails closed
  // when it is missing in production or while Bird is the live OTP channel: an unverifiable receiver
  // is worse than no receiver, since anyone could then forge delivery events.
  BIRD_WEBHOOK_SECRET: z.string().optional(),
  // Plain string (not .url()) so an injected empty value can never crash boot (same tradeoff as
  // WHATSAPP_GRAPH_BASE_URL). Bird's API is REGION-SCOPED and the host must match the workspace's
  // region — `bird auth status` reports it, and the key prefix encodes it (`bk_eu1_…` → eu1). The
  // default is eu1; override per-deploy for a workspace in another region (e.g. us1).
  BIRD_BASE_URL: z.string().default("https://eu1.platform.bird.com"),
  // Brand shown in the OTP SMS body ("<code> is your <brand> verification code."). The product/company
  // name — LyniaGo — not the repo name. Overridable per-deploy without a code change.
  BIRD_BRAND_NAME: z.string().default("LyniaGo"),
  // Optional Android SMS Retriever app-hash (11 chars). When set it is appended to the OTP SMS so the
  // app can auto-read the code with zero taps (Google SMS Retriever API). Leave empty to keep the SMS
  // clean — iOS autofill (textContentType=oneTimeCode) and Android's autofill hint (autoComplete=
  // sms-otp) still work without it. Derive it from the release signing cert (SMS Retriever docs).
  BIRD_ANDROID_SMS_HASH: z.string().optional(),
  // Local A2P SMS gateway — only needed when OTP_CHANNEL=local-sms. The Zimbabwe fallback for when
  // Bird's international route is throttled on Econet's grey-route filtering: point this at Econet A2P
  // (direct) or a local bulk-SMS aggregator. Delivery pipe only — we still generate/hash/verify the
  // code ourselves. LOCAL_SMS_API_KEY is the secret (sent as `Authorization: Bearer <key>`); confirm the
  // exact request shape (otp-sender.ts buildLocalSmsRequest) + auth against the provider's API doc.
  // Optional so a misconfigured channel boots green and fails loud at send, like the WHATSAPP_*/BIRD_*
  // vars — the release workflow validates them before a production deploy.
  LOCAL_SMS_API_URL: z.string().optional(),
  LOCAL_SMS_API_KEY: z.string().optional(),
  // Alphanumeric sender ID shown as the SMS "from" AND the brand in the body ("<code> is your <sender>
  // verification code."). Zimbabwe allows alphanumeric senders up to 11 chars — "LyniaGo" fits. Register
  // it with the operators/POTRAZ; you can send on a default route while the branded ID is pending.
  LOCAL_SMS_SENDER_ID: z.string().default("LyniaGo"),
  // Optional Android SMS Retriever app-hash for this channel (same purpose as BIRD_ANDROID_SMS_HASH).
  LOCAL_SMS_ANDROID_HASH: z.string().optional(),
  // --- KYC (lane E) ---
  // auto = submit to the vendor; manual = leave pending for admin review (T7 backstop).
  KYC_MODE: z.enum(["auto", "manual"]).default("auto"),
  // Didit verifies Zimbabwean national IDs. Default "stub" keeps CI/tests vendor-free.
  KYC_PROVIDER: z.enum(["stub", "didit"]).default("stub"),
  DIDIT_API_KEY: z.string().optional(),
  DIDIT_WORKFLOW_ID: z.string().optional(),
  DIDIT_WEBHOOK_SECRET: z.string().optional(),
  DIDIT_CALLBACK_URL: optionalUrl,
  // Explicit browser-origin allow-list for HTTP + WebSocket CORS (comma-separated). Empty = deny all
  // cross-origin (native mobile clients send no Origin and are unaffected; a stray browser origin is
  // refused). Set to the admin console / any browser client origins in prod. See common/cors.ts.
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  // Coerce an injected empty string to "absent" so the default applies — the deploy sets some optional
  // vars to "" when their repo Variable is unset, and a bare .url() would reject "" and fail boot (the
  // same hazard already handled for DIDIT_CALLBACK_URL / OTEL_EXPORTER_OTLP_ENDPOINT via optionalUrl).
  DIDIT_BASE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().default("https://verification.didit.me"),
  ),
  // --- App version gate (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1c) ---
  // Minimum mobile app version the API still supports, served by GET /app/version-gate and enforced
  // client-side as a blocking force-update screen. Dotted-version dialect ("0.2.0"); "0.0.0" = gate
  // off (default). Set the MIN_SUPPORTED_APP_VERSION repo Variable only when a breaking change must
  // walk stranded installs to the Play Store — prefer keeping contracts backward-compatible instead.
  // Empty string (deploy injects "" when the Variable is unset) coerces to the off default.
  MIN_SUPPORTED_APP_VERSION: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().max(24).regex(/^\d+(\.\d+)*$/, "must be a dotted version like 0.2.0").default("0.0.0"),
  ),
  // --- Data retention (LR8, docs/DATA-RETENTION.md) ---
  // GPS coords on order_events are scrubbed this many days after the event; expired sessions are
  // hard-deleted this many days after they lapse. Driven by the POST /admin/retention/purge sweep.
  GPS_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  SESSION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  // Service-account email whose Google-signed OIDC identity tokens may call the scheduler-driven
  // admin endpoints (the daily Cloud Scheduler retention sweep — docs/LAUNCH-EXECUTION-RUNBOOK.md §2).
  // Unset/empty = the OIDC path is off and those routes accept only an admin JWT. The deploy injects
  // the Cloud Run runtime SA here (the same SA the scheduler job mints its token as); "" coerces to
  // absent like the other deploy-injected optionals.
  SCHEDULER_SERVICE_ACCOUNT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().email().optional(),
  ),
  // --- Broadcast reach (policy BROADCAST) ---
  // Optional per-deploy overrides for the initial broadcast radius and the ghost-rider heartbeat
  // cutoff (common/broadcast-policy.ts reads them at the use site). Validated here so a malformed
  // override fails loud at boot instead of silently falling back to the default. "" = unset, like
  // the other deploy-injected optionals.
  BROADCAST_BASE_RADIUS_M: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  BROADCAST_HEARTBEAT_MAX_AGE_MS: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  // --- Commission wallet (policy COMMISSION, docs/plans/2026-rider-wallet-design.md) ---
  // The commission "flip" is an ENV change, not a code deploy (design OV-2A): this overrides the
  // bundled COMMISSION.ratePct default (0). Launch = unset/0 (no debits, wallet hidden); the flip sets
  // it to the calibrated take-rate (e.g. 10). Clamped [0,100] and resolved in ONE place
  // (resolveCommissionRatePct); a malformed value falls back to the launch default rather than charging
  // a wrong rate. "" (deploy injects it when the Variable is unset) coerces to absent. NEVER hardcode a
  // percentage anywhere else — read the resolved rate the API serves in /wallet/config.
  COMMISSION_RATE_PCT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().min(0).max(100).optional(),
  ),
  // Shadow-accrual rate (%) used during the 0% period (design OV-5A): every completion logs the
  // would-be commission at this rate (never a ledger row) so the debit computation soaks on real
  // traffic and finance has data to calibrate the real rate + the floor before the flip. Default 10.
  COMMISSION_SHADOW_RATE_PCT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().min(0).max(100).default(10),
  ),
  // Server-driven wallet visibility flag (design OV-5A). Controls the rider-facing wallet surfaces
  // (Earnings balance row + Wallet route); the rate flip (>0) also reveals them regardless. **Default
  // on** (product decision 2026-07-15): the wallet is shown from launch even at 0% commission — riders
  // see their $0 prepaid balance and the honest "no commission yet" copy, and no one is gated
  // (`commission_low_balance` only fires once the rate is > 0, so visibility never blocks going online).
  // Set to "false" to hide it again (a kill-switch). "true"/"false".
  WALLET_REVEAL: z.enum(["true", "false"]).default("true"),
  // --- Non-core kill switches (roadmap 3.1) ---
  // NON-CORE surface kill switch. The in-app notifications feed (GET /notifications/feed) is derived
  // from ~9 reads per open; it is NOT on the money path (browse → bid → accept → pay → settle). If it
  // ever misbehaves (a slow query, a bad synthesis), flip this to "false" and the endpoint FAILS SOFT —
  // returns an empty feed instead of erroring — so a non-core defect can never block checkout. Core
  // surfaces (auth, offer loop, order lifecycle, wallet, tracking, SOS) have NO such switch by design:
  // they cannot be turned off. See docs/ARCHITECTURE.md §Core vs non-core.
  NOTIFICATIONS_FEED_ENABLED: z.enum(["true", "false"]).default("true"),
  // --- Merchant verticals kill switches (docs/plans/2026-07-26-merchant-verticals-plan.md §0b.3) ---
  // Env-var flags per the eng-review decision 3A: fail-safe OFF by default; cohort gating lives on
  // domain rows (Merchant/Profile), NOT here. Mobile reads these via GET /app/feature-flags (the
  // version-gate precedent) — flipping one is a Cloud Run env update (~1 min revision), the accepted
  // kill-switch latency. Names are mirrored in @lynia/shared MerchantFeatureFlagsResponse; remove
  // per TODOS.md "Post-launch flag cleanup (the Piranha pass)" once Restaurants is permanently live.
  RESTAURANTS_ENABLED: z.enum(["true", "false"]).default("false"),
  MERCHANT_DISPATCH_AUTO_ENABLED: z.enum(["true", "false"]).default("false"),
  MERCHANT_WALLET_ENABLED: z.enum(["true", "false"]).default("false"),
  // Per-entry cap (USD) on an ops manual credit — an abuse backstop on the admin credit path
  // (design OV-3A). Default $50 (= COMMISSION.maxTopUp).
  WALLET_MANUAL_CREDIT_CAP_USD: z.coerce.number().positive().default(50),
}).superRefine((env, ctx) => {
  // The boot-guards below fail LOUD in production rather than let the API come up in an insecure or
  // half-configured state. Each stays permissive in dev/test so local work and CI are unaffected.
  const reject = (path: string, message: string): void =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  // Boot-guard: several consumers silently degrade to in-memory without REDIS_URL. Critically the
  // OTP/rate-limit store (auth/otp-store.ts InMemoryOtpStore is per-process), so on multi-instance
  // prod the brute-force cap is multiplied per instance, and the Socket.IO adapter is per-instance.
  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    reject(
      "REDIS_URL",
      "REDIS_URL is required in production — the in-memory OTP/rate-limit store and Socket.IO adapter are per-instance without it",
    );
  }

  if (env.NODE_ENV === "production") {
    // A publicly-known or low-entropy JWT secret means anyone can forge access tokens (incl. admin).
    // Reject the shipped default and anything below MIN_PROD_SECRET_LEN — a missing Secret Manager
    // value that falls back to the default must NOT boot. The same bar applies to the optional
    // rotation/hash secrets when present, so a weak one can't sneak in through the side door.
    const weakInProd = (value: string): boolean =>
      value === INSECURE_JWT_DEFAULT || value.length < MIN_PROD_SECRET_LEN;
    if (weakInProd(env.JWT_SIGNING_SECRET)) {
      reject(
        "JWT_SIGNING_SECRET",
        `JWT_SIGNING_SECRET must be a unique secret of at least ${MIN_PROD_SECRET_LEN} chars in production (the dev default is rejected) — set it from Secret Manager`,
      );
    }
    if (env.JWT_SIGNING_SECRET_PREVIOUS !== undefined && weakInProd(env.JWT_SIGNING_SECRET_PREVIOUS)) {
      reject("JWT_SIGNING_SECRET_PREVIOUS", `JWT_SIGNING_SECRET_PREVIOUS, when set, must also be a strong secret (>= ${MIN_PROD_SECRET_LEN} chars)`);
    }
    // The PII key encrypts national IDs at rest; the dev default (or a short key) is publicly known, so
    // encrypting under it is no better than plaintext. Require a real key from Secret Manager in prod.
    if (env.PII_ENCRYPTION_KEY === INSECURE_PII_KEY_DEFAULT || env.PII_ENCRYPTION_KEY.length < MIN_PROD_SECRET_LEN) {
      reject(
        "PII_ENCRYPTION_KEY",
        `PII_ENCRYPTION_KEY must be a unique secret of at least ${MIN_PROD_SECRET_LEN} chars in production — set it from Secret Manager`,
      );
    }
    if (env.TOKEN_HASH_SECRET !== undefined && weakInProd(env.TOKEN_HASH_SECRET)) {
      reject("TOKEN_HASH_SECRET", `TOKEN_HASH_SECRET, when set, must also be a strong secret (>= ${MIN_PROD_SECRET_LEN} chars)`);
    }
    // Launch-hygiene guards: scoped to the PRODUCTION tier only. The staging tier (APP_ENV=staging,
    // its own service/DB/secrets — never the live one) legitimately runs the QA bypasses so load
    // tests and QA devices can authenticate vendor-free; every guard ABOVE this line still applies
    // to staging (prod-shaped secrets are non-negotiable on any internet-facing deploy).
    if (env.APP_ENV !== "staging") {
      // The console channel logs codes and pairs with the devCode escape hatch; never in production.
      if (env.OTP_CHANNEL === "console") {
        reject("OTP_CHANNEL", "OTP_CHANNEL=console is a dev-only channel and must not be used in production");
      }
      // SmsOtpSender.send() is an unimplemented stub (see otp-sender.ts) — it logs and returns success
      // with NO code ever delivered. This flag exists as config-only insurance against a WhatsApp BSP
      // onboarding delay, but flipping it today would silently and completely break sign-in/sign-up for
      // every user. Reject at boot instead of failing invisibly in production traffic.
      if (env.OTP_CHANNEL === "sms") {
        reject("OTP_CHANNEL", "OTP_CHANNEL=sms has no real SMS gateway wired up yet (SmsOtpSender is a stub) — implement it before using this channel in production");
      }
      // OTP_TEST_PHONES returns the live OTP in the response for listed numbers — a takeover vector if
      // it ever leaks into prod. Must be empty in production (it is only honoured on the console channel,
      // which is itself now rejected above, but this guards it independently as defense in depth).
      if (env.OTP_TEST_PHONES.trim() !== "") {
        reject("OTP_TEST_PHONES", "OTP_TEST_PHONES must be empty in production — it exposes live OTP codes in the response");
      }
      // The stub KYC provider auto-passes verification in auto mode — shipping it to prod would verify
      // every rider without any ID check. Require the real vendor (or manual admin review).
      if (env.KYC_PROVIDER === "stub" && env.KYC_MODE === "auto") {
        reject(
          "KYC_PROVIDER",
          "KYC_PROVIDER=stub auto-passes verification; production must use the real vendor (KYC_PROVIDER=didit) or manual review (KYC_MODE=manual)",
        );
      }
    }
  }

  // Play-review demo account (docs/PLAY-STORE-SUBMISSION.md §7.1). Validated in EVERY environment, not
  // just production: a malformed value is a dead config anywhere, and this path is meant to run in
  // prod. The auth-service demo branch is gated on BOTH vars being present, so these checks make the
  // "armed" state well-formed — they never force the feature on.
  const demoPhoneSet = (env.DEMO_OTP_PHONE ?? "").trim() !== "";
  const demoCodeSet = (env.DEMO_OTP_CODE ?? "").trim() !== "";
  if (demoPhoneSet !== demoCodeSet) {
    reject(
      demoPhoneSet ? "DEMO_OTP_CODE" : "DEMO_OTP_PHONE",
      "DEMO_OTP_PHONE and DEMO_OTP_CODE must be set together (both or neither) — one without the other cannot authenticate the reviewer demo account",
    );
  }
  if (demoCodeSet) {
    const c = (env.DEMO_OTP_CODE ?? "").trim();
    if (!/^\d{6}$/.test(c)) {
      reject(
        "DEMO_OTP_CODE",
        "DEMO_OTP_CODE must be exactly 6 digits — POST /auth/otp/verify only accepts a 6-digit code and the app's code field allows nothing else",
      );
    } else if (/^(\d)\1{5}$/.test(c) || TRIVIAL_DEMO_CODES.has(c)) {
      // It never rotates, so a weak fixed code is a standing takeover vector on the demo number.
      // Block all-same-digit and the obvious ascending/descending runs.
      reject(
        "DEMO_OTP_CODE",
        "DEMO_OTP_CODE is trivially guessable — choose a non-sequential, non-repeated 6-digit code (it is a fixed, non-rotating secret)",
      );
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = JSON.stringify(parsed.error.flatten().fieldErrors);
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return parsed.data;
}
