import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { corsOriginResolver, parseAllowedOrigins } from "./common/cors";
import { securityHeaders } from "./common/security-headers.middleware";
import { loadEnv } from "./config/env";
import { initObservability } from "./observability/otel";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  // Start tracing before the app so the SDK can patch http before the server begins handling requests.
  await initObservability(env.OTEL_SERVICE_NAME, env.OTEL_EXPORTER_OTLP_ENDPOINT);

  // rawBody enables HMAC verification of the Didit KYC webhook against the unparsed body.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });

  // Strip the Express `X-Powered-By` fingerprint at the adapter level. Express sets this header at
  // send-time, so removing it in middleware is a no-op — disabling the setting on the underlying
  // Express instance is the only way to actually suppress it.
  app.getHttpAdapter().getInstance().disable("x-powered-by");

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

  Logger.log(`Lynia API listening on :${env.PORT} (cloud=${env.CLOUD_PROVIDER})`, "Bootstrap");
}

void bootstrap();
