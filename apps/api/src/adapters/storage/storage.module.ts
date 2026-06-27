import { Global, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { AzureBlobStorage } from "./azure-blob.storage";
import { GcsStorage } from "./gcs.storage";
import { STORAGE, type StorageAdapter } from "./storage.interface";

/** Binds the StorageAdapter to the Azure or GCP impl based on CLOUD_PROVIDER (D7). */
export function selectStorage(env: Env): StorageAdapter {
  return env.CLOUD_PROVIDER === "gcp"
    ? new GcsStorage(env.STORAGE_BUCKET, { projectId: env.GCP_STORAGE_PROJECT_ID })
    : new AzureBlobStorage(env.STORAGE_BUCKET);
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
