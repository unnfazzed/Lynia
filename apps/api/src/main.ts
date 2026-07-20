import "reflect-metadata";
import { constants as zlibConstants } from "node:zlib";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import { AppModule } from "./app.module";
import { cacheHeaders } from "./common/cache-headers.middleware";
import { corsOriginResolver, parseAllowedOrigins } from "./common/cors";
import { securityHeaders } from "./common/security-headers.middleware";
import { parseTrustProxy } from "./common/trust-proxy";
import { loadEnv } from "./config/env";
import { initObservability } from "./observability/otel";
import { initSentry } from "./observability/sentry";

/**
 * Defense-in-depth process-level backstops (F-12). The reliability-critical paths already attach a
 * `.catch` to every fire-and-forget async (the reconcilers, the post-commit rebroadcast/announce, the
 * queue enqueues), but a future missed call site would otherwise reject unhandled and — on Node 22,
 * whose default `--unhandled-rejections=throw` turns that into a fatal error — crash the whole
 * instance, taking every in-flight request with it. Log loudly and KEEP SERVING: we deliberately do
 * NOT `process.exit()` on an unhandledRejection (that exit is the very fleet-wide crash we're
 * preventing). enableShutdownHooks / SIGTERM handling is untouched — this only intercepts the two
 * crash signals. Registered before anything async runs so nothing can reject ahead of the handler.
 *
 * An `unhandledRejection` (the F-12 vector: a fire-and-forget async rejecting) is backstopped and we
 * KEEP SERVING — that swallowed rejection is exactly the fleet-wide crash we're preventing. An
 * `uncaughtException` is different: a synchronous throw that escaped every try/catch leaves the
 * process in an undefined state, and Node explicitly warns that resuming is unsafe — so we log for
 * attribution and then exit non-zero, letting the orchestrator restart a clean instance (Node's own
 * default also exits; the handler just gives us a structured log first).
 */
function installProcessBackstops(): void {
  const logger = new Logger("Process");
  process.on("unhandledRejection", (reason) => {
    logger.error(
      `Unhandled promise rejection (backstopped, not crashing): ${
        reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
      }`,
    );
  });
  process.on("uncaughtException", (err) => {
    logger.error(`Uncaught exception — exiting for a clean restart: ${err.stack ?? err.message}`);
    process.exit(1);
  });
}

async function bootstrap(): Promise<void> {
  installProcessBackstops();
  const env = loadEnv();
  // Crash reporting first (inert without SENTRY_DSN) so its global handlers are installed before any
  // async runs — mirrors the process backstops above, which catch what Sentry then also reports.
  initSentry({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    release: env.OTEL_SERVICE_NAME,
  });
  // Start tracing before the app so the SDK can patch http before the server begins handling requests.
  await initObservability(env.OTEL_SERVICE_NAME, env.OTEL_EXPORTER_OTLP_ENDPOINT);

  // rawBody enables HMAC verification of the Didit KYC webhook against the unparsed body.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false, rawBody: true });

  // Bound request bodies (defense-in-depth against oversized-payload abuse). rawBody stays intact for
  // the KYC webhook HMAC — Nest re-applies it when re-registering the parser.
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { limit: "1mb", extended: true });

  // Strip the Express `X-Powered-By` fingerprint at the adapter level. Express sets this header at
  // send-time, so removing it in middleware is a no-op — disabling the setting on the underlying
  // Express instance is the only way to actually suppress it.
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  // Trust the reverse proxy so req.ip / X-Forwarded-For is the real client, not the LB socket. Without
  // this every request behind the load balancer shares one `rl:ip:<lb-ip>` bucket and the per-IP OTP /
  // refresh caps become a platform-wide DoS (and give zero per-attacker granularity). See TRUST_PROXY.
  app.getHttpAdapter().getInstance().set("trust proxy", parseTrustProxy(env.TRUST_PROXY));

  // Pin Express's weak-ETag generation ON (it is the default, but the mobile client's conditional-GET
  // layer now DEPENDS on it: it echoes the ETag as If-None-Match and expects an empty 304 when the
  // body hasn't changed — see apps/mobile/src/api/client.ts). Pinning makes the contract explicit
  // instead of an inherited default a future Express upgrade could silently flip.
  app.getHttpAdapter().getInstance().set("etag", "weak");

  // Compress response bodies (gzip/deflate, and brotli for clients that advertise it). The target
  // market is metered 2G/3G — a JSON snapshot compresses ~4-8×, which is the single cheapest
  // latency/bandwidth win on that profile, paid for with negligible CPU. Registered before routing so
  // every handler (and the 1 MB-bounded JSON bodies they return) flows through it; the LB/CDN layer
  // does no compression of its own (see infra/terraform/lb.tf). Socket.IO traffic is unaffected —
  // engine.io attaches to the raw HTTP server, not the Express middleware chain.
  app.use(
    compression({
      // Don't spend CPU on tiny bodies — below ~1 KB the gzip header overhead eats the win.
      threshold: 1024,
      // Brotli's zlib default quality is 11 (archival), which is orders of magnitude too slow for
      // per-request dynamic JSON; 4 compresses slightly better than gzip at comparable speed.
      brotli: { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } },
    }),
  );

  // Security response headers (Helmet-equivalent, dependency-free) on every response.
  app.use(securityHeaders);

  // Deterministic Cache-Control on every response: GETs are store-but-revalidate (pairs with the
  // ETag/304 contract above), mutations are no-store. Route-level opt-outs override after this runs.
  app.use(cacheHeaders);

  // Explicit CORS allow-list (replaces the implicit default): native apps send no Origin and are
  // allowed; browser origins must be listed in CORS_ALLOWED_ORIGINS, else the request is refused.
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  app.enableCors({
    origin: corsOriginResolver(allowedOrigins),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"],
    maxAge: 600,
  });

  app.enableShutdownHooks();
  await app.listen(env.PORT);

  // Surface the resolved trust-proxy setting so ops can confirm the per-IP rate limiting sees the real
  // client IP (a mismatch with the actual proxy-hop count is otherwise silent until limits misbehave).
  Logger.log(
    `Lynia API listening on :${env.PORT} (cloud=${env.CLOUD_PROVIDER}, trustProxy=${env.TRUST_PROXY})`,
    "Bootstrap",
  );
}

void bootstrap();
