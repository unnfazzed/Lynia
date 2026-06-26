import { describe, expect, it } from "vitest";
import type { Env } from "../../config/env";
import { selectStorage } from "./storage.module";

const base = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgresql://localhost/lynia",
  CLOUD_PROVIDER: "azure",
  STORAGE_BUCKET: "lynia-media",
  OTEL_SERVICE_NAME: "lynia-api",
} as Env;

describe("storage adapter selection (D7 portability)", () => {
  it("selects Azure Blob when CLOUD_PROVIDER=azure", () => {
    expect(selectStorage({ ...base, CLOUD_PROVIDER: "azure" }).provider()).toBe("azure");
  });

  it("selects GCS when CLOUD_PROVIDER=gcp — a config-only switch", () => {
    expect(selectStorage({ ...base, CLOUD_PROVIDER: "gcp" }).provider()).toBe("gcp");
  });

  it("both adapters honour the same upload-URL contract", async () => {
    const azure = await selectStorage({ ...base, CLOUD_PROVIDER: "azure" }).createUploadUrl("k", "image/jpeg");
    const gcp = await selectStorage({ ...base, CLOUD_PROVIDER: "gcp" }).createUploadUrl("k", "image/jpeg");
    expect(azure.key).toBe("k");
    expect(gcp.key).toBe("k");
    expect(azure.url).toContain("blob.core.windows.net");
    expect(gcp.url).toContain("storage.googleapis.com");
  });
});
