import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";
import { initObservability } from "./observability/otel";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  initObservability(env.OTEL_SERVICE_NAME, env.OTEL_EXPORTER_OTLP_ENDPOINT);

  // rawBody enables HMAC verification of the Didit KYC webhook against the unparsed body.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  app.enableShutdownHooks();
  await app.listen(env.PORT);

  Logger.log(`Lynia API listening on :${env.PORT} (cloud=${env.CLOUD_PROVIDER})`, "Bootstrap");
}

void bootstrap();
