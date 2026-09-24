import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  type UserDelegationKey,
} from "@azure/storage-blob";
import { Logger } from "@nestjs/common";
import { UPLOAD_KINDS } from "./upload-kinds";
import type { CloudProvider, ObjectStat, StorageAdapter, StoredObject, UploadTarget } from "./storage.interface";

/** Clock-skew allowance on every SAS and on the delegation key (C1): a phone or edge node running a
 *  few minutes fast would otherwise see a "not yet valid" 403. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** S4/E13: an upload SAS lives 10 minutes, whatever the caller asks for. */
const UPLOAD_SAS_MAX_SECONDS = 10 * 60;
/** S4: a read SAS over a KYC / national-ID image lives 5 minutes, generated per view. */
const KYC_READ_SAS_MAX_SECONDS = 5 * 60;
/** Matches GcsStorage's default read TTL, so a caller that passes none sees the same lifetime on both. */
const DEFAULT_READ_SECONDS = 15 * 60;
/** S4: the user-delegation key's whole lifetime (start → expiry, skew allowance included) stays ≤ 24 h. */
const DELEGATION_KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** Refresh a cached key once it has less than this left — comfortably above the longest non-read SAS. */
const DELEGATION_KEY_REFRESH_MARGIN_MS = 60 * 60 * 1000;
/** A key younger than this is reused even when a long read SAS would outlive it (the SAS is clamped
 *  instead), so a burst of 24 h merchant-photo reads can't turn into one key fetch per request. */
const DELEGATION_KEY_MIN_AGE_MS = 10 * 60 * 1000;

/** The subset of the SDK the adapter touches — a seam so specs can drive it with no network. */
export type AzureBlobServiceClient = Pick<BlobServiceClient, "getUserDelegationKey" | "getContainerClient">;

export interface AzureBlobStorageOptions {
  /** Storage account name (`<account>.blob.core.windows.net`). */
  account: string;
  container: string;
  /** User-assigned managed identity's client id (AZURE_CLIENT_ID). Omit locally to fall back to the
   *  developer's `az login` / env credential chain. */
  clientId?: string;
  /** Test seams. */
  credential?: TokenCredential;
  serviceClient?: AzureBlobServiceClient;
  now?: () => number;
}

const statusOf = (err: unknown): number | undefined => (err as { statusCode?: number } | null)?.statusCode;
const isNotFound = (err: unknown): boolean => statusOf(err) === 404;

/**
 * Azure Blob Storage adapter (C1). The client PUTs/GETs the blob directly through a **user-delegation
 * SAS**, signed with a key the API fetches with its managed identity — no account key exists anywhere.
 *
 * A SAS binds neither Content-Type nor size, unlike a GCS V4 signature. Both checks therefore move to
 * attach time (upload-verifier.ts: stat + magic bytes, E8), and the orphan sweep (storage-sweeper.ts,
 * E2) bounds what an unattached upload can cost.
 */
export class AzureBlobStorage implements StorageAdapter {
  private readonly logger = new Logger(AzureBlobStorage.name);
  private readonly service: AzureBlobServiceClient;
  private readonly now: () => number;
  /** S4: in memory only — never persisted, never logged. */
  private delegationKey?: { key: UserDelegationKey; fetchedAt: number; expiresAt: number };
  private inflightKey?: Promise<UserDelegationKey>;

  constructor(private readonly opts: AzureBlobStorageOptions) {
    this.now = opts.now ?? Date.now;
    // No network at construction — the credential is only exercised on the first key fetch.
    this.service =
      opts.serviceClient ??
      new BlobServiceClient(
        `https://${opts.account}.blob.core.windows.net`,
        opts.credential ?? new DefaultAzureCredential(opts.clientId ? { managedIdentityClientId: opts.clientId } : {}),
      );
  }

  provider(): CloudProvider {
    return "azure";
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = UPLOAD_SAS_MAX_SECONDS,
    _maxBytes?: number,
  ): Promise<UploadTarget> {
    // `cw`, not create-only `c` (E13): a network retry of a PUT that already landed would 409 on `c`, and
    // shipped binaries report that as a failure. The key is server-generated and unique per mint, and the
    // attach-time etag makes a later overwrite detectable. `maxBytes` cannot be bound into a SAS — the
    // attach-time stat enforces the per-kind cap instead.
    const url = await this.sasUrl(key, "cw", Math.min(expiresInSeconds, UPLOAD_SAS_MAX_SECONDS));
    return { url, key, headers: { "Content-Type": contentType, "x-ms-blob-type": "BlockBlob" } };
  }

  async createReadUrl(key: string, expiresInSeconds = DEFAULT_READ_SECONDS): Promise<string> {
    const ttl = key.startsWith(UPLOAD_KINDS.kyc.prefix) ? Math.min(expiresInSeconds, KYC_READ_SAS_MAX_SECONDS) : expiresInSeconds;
    return this.sasUrl(key, "r", ttl);
  }

  async stat(key: string): Promise<ObjectStat | null> {
    try {
      const p = await this.blob(key).getProperties();
      return { size: p.contentLength ?? 0, contentType: p.contentType ?? null, etag: p.etag ?? null };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer | null> {
    try {
      return await this.blob(key).downloadToBuffer(0, bytes);
    } catch (err) {
      if (isNotFound(err)) return null;
      // A range past the end of a blob shorter than `bytes` is a 416 — the blob exists, it is just
      // tiny. Treat it as "no magic bytes" so the verifier rejects it rather than 503-ing.
      if (statusOf(err) === 416) return Buffer.alloc(0);
      throw err;
    }
  }

  async *listObjects(prefix: string): AsyncIterable<StoredObject> {
    for await (const item of this.service.getContainerClient(this.opts.container).listBlobsFlat({ prefix })) {
      yield { key: item.name, createdAt: item.properties.createdOn ?? item.properties.lastModified };
    }
  }

  /** DS15-03 best-effort purge — same contract as GcsStorage.deleteObject. */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.blob(key).deleteIfExists();
    } catch (err) {
      this.logger.warn(`deleteObject(${key}) failed (swallowed): ${(err as Error).message}`);
    }
  }

  private blob(key: string) {
    return this.service.getContainerClient(this.opts.container).getBlockBlobClient(key);
  }

  /** One blob, one permission set, https only (S4). The SAS never outlives the key that signs it. */
  private async sasUrl(key: string, permissions: "cw" | "r", ttlSeconds: number): Promise<string> {
    const now = this.now();
    const wantExpiry = now + ttlSeconds * 1000;
    const delegation = await this.userDelegationKey(wantExpiry);
    const expiresOn = new Date(Math.min(wantExpiry, delegation.signedExpiresOn.getTime()));
    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.opts.container,
        blobName: key,
        permissions: BlobSASPermissions.parse(permissions),
        startsOn: new Date(now - CLOCK_SKEW_MS),
        expiresOn,
        protocol: SASProtocol.Https,
      },
      delegation,
      this.opts.account,
    ).toString();
    return `${this.blob(key).url}?${sas}`;
  }

  /**
   * The cached user-delegation key, refreshed before it expires. A key is refetched when it has less
   * than the refresh margin left, or when it would cut the requested SAS short and is old enough that
   * refetching is not a per-request cost. Concurrent callers share one in-flight fetch.
   */
  private async userDelegationKey(wantExpiry: number): Promise<UserDelegationKey> {
    const now = this.now();
    const cached = this.delegationKey;
    if (cached) {
      const expiring = cached.expiresAt - now < DELEGATION_KEY_REFRESH_MARGIN_MS;
      const shortsTheSas = cached.expiresAt < wantExpiry && now - cached.fetchedAt >= DELEGATION_KEY_MIN_AGE_MS;
      if (!expiring && !shortsTheSas) return cached.key;
    }
    this.inflightKey ??= this.fetchDelegationKey(now).finally(() => {
      this.inflightKey = undefined;
    });
    return this.inflightKey;
  }

  private async fetchDelegationKey(now: number): Promise<UserDelegationKey> {
    const startsOn = new Date(now - CLOCK_SKEW_MS);
    const expiresOn = new Date(startsOn.getTime() + DELEGATION_KEY_LIFETIME_MS);
    let key: UserDelegationKey;
    try {
      key = await this.service.getUserDelegationKey(startsOn, expiresOn);
    } catch (err) {
      // A managed-identity token fetch or a cold role assignment can fail transiently: retry once, then
      // let the caller map it to a retryable 503 (E8). Logs the account + action only — never the key.
      this.logger.warn(`getUserDelegationKey(${this.opts.account}) failed, retrying once: ${(err as Error).message}`);
      key = await this.service.getUserDelegationKey(startsOn, expiresOn);
    }
    this.delegationKey = { key, fetchedAt: now, expiresAt: key.signedExpiresOn.getTime() };
    return key;
  }
}
