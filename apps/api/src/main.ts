import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { corsOriginResolver, parseAllowedOrigins } from "./common/cors";
import { securityHeaders } from "./common/security-headers.middleware";
import { parseTrustProxy } from "./common/trust-proxy";
import { loadEnv } from "./config/env";
import { initObservability } from "./observability/otel";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
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

  // Security response headers (Helmet-equivalent, dependency-free) on every response.
  app.use(securityHeaders);

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
