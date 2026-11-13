import { Global, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { AzureBlobStorage } from "./azure-blob.storage";
import { GcsStorage } from "./gcs.storage";
import { R2Storage } from "./r2.storage";
import { StorageSweeper } from "./storage-sweeper";
import { STORAGE, type StorageAdapter } from "./storage.interface";
import { UploadVerifier } from "./upload-verifier";

/** Binds the StorageAdapter on `CLOUD_PROVIDER` (C1) — the adapter seam (D7): a cloud is a new impl +
 *  a branch here, never a business-logic edit. The env boot-guard guarantees the Azure / R2 vars are
 *  set when `azure` / `cloudflare` is selected. */
export function selectStorage(env: Env): StorageAdapter {
  if (env.CLOUD_PROVIDER === "azure") {
    const account = env.AZURE_STORAGE_ACCOUNT;
    const container = env.AZURE_STORAGE_CONTAINER;
    // Unreachable past the env boot-guard; kept so a hand-built Env in a harness fails loudly too.
    if (!account || !container) throw new Error("CLOUD_PROVIDER=azure needs AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_CONTAINER");
    return new AzureBlobStorage({ account, container, clientId: env.AZURE_CLIENT_ID });
  }
  if (env.CLOUD_PROVIDER === "cloudflare") {
    const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = env;
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("CLOUD_PROVIDER=cloudflare needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY");
    }
    return new R2Storage({ accountId, bucket: env.STORAGE_BUCKET, accessKeyId, secretAccessKey });
  }
  return new GcsStorage(env.STORAGE_BUCKET, { projectId: env.GCP_STORAGE_PROJECT_ID });
}

/** @Global so every attach path can inject the adapter, the attach-time {@link UploadVerifier} and the
 *  retention job's {@link StorageSweeper} without import wiring. */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ENV],
      useFactory: (env: Env): StorageAdapter => selectStorage(env),
    },
    UploadVerifier,
    StorageSweeper,
  ],
  exports: [STORAGE, UploadVerifier, StorageSweeper],
})
export class StorageModule {}
