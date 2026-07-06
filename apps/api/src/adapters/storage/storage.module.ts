import { Global, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { GcsStorage } from "./gcs.storage";
import { STORAGE, type StorageAdapter } from "./storage.interface";

/** Binds the StorageAdapter to the GCS impl — the adapter seam (D7) stays, so a second cloud is a
 *  new impl + selector, not a rewrite. */
export function selectStorage(env: Env): StorageAdapter {
  return new GcsStorage(env.STORAGE_BUCKET, { projectId: env.GCP_STORAGE_PROJECT_ID });
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ENV],
      useFactory: (env: Env): StorageAdapter => selectStorage(env),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
