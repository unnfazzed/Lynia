import { createHash, createPrivateKey, sign, type KeyObject } from "node:crypto";
import { connect, type ClientHttp2Session, type ClientHttp2Stream } from "node:http2";
import { Logger } from "@nestjs/common";
import { maskToken, type PushAdapter, type PushMessage, type PushResult } from "./push.interface";

/**
 * APNs-direct push for iOS devices (docs/APP-STORE-SUBMISSION.md B4). The app registers the RAW APNs
 * device token (`getDevicePushTokenAsync`, src/push/push.ts), which FCM cannot deliver to — the iOS
 * app embeds no Firebase SDK — so iOS pushes go straight to Apple over HTTP/2 with a token-based
 * (.p8) provider key. Same seam as FcmPush (D7); PlatformRoutedPush picks per device.
 */
export interface ApnsConfig {
  /** 10-character Key ID of the APNs auth key (Apple Developer → Keys). */
  keyId: string;
  /** 10-character Apple Developer Team ID. */
  teamId: string;
  /** The .p8 key's PEM text. Never logged. */
  privateKey: string;
  /** The app's bundle id — the only topic this key pushes to. */
  topic: string;
  /** Sandbox gateway: only Xcode-signed debug builds. TestFlight and App Store builds use production. */
  sandbox: boolean;
}

export const APNS_ORIGINS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

/** One APNs request, transport-neutral so the payload contract is unit-tested with no network. */
export interface ApnsRequest {
  path: string;
  headers: Record<string, string>;
  body: string;
}

/** Apple rejects an `apns-collapse-id` over 64 bytes (400 BadCollapseId). */
const APNS_COLLAPSE_ID_MAX_BYTES = 64;

/**
 * Pure mapper: transport-neutral PushMessage → APNs request.
 *
 * The custom `data` rides under a top-level `"body"` key, NOT beside `aps`: expo-notifications (iOS,
 * 0.29.14) reads a remote notification's `data` from `userInfo["body"]`
 * (EXNotificationSerializer.serializedNotificationData — the Expo push-service convention). Anywhere
 * else and the app's tap routing (src/push/push.ts pushDestination) receives `null` for every push.
 */
export function buildApnsRequest(message: PushMessage, topic: string, nowSec: number): ApnsRequest {
  const headers: Record<string, string> = {
    "apns-topic": topic,
    "apns-push-type": "alert",
    "apns-priority": "10",
  };
  // Time-critical push (Fix 5): `apns-expiration` is an ABSOLUTE epoch in seconds — same contract as
  // buildFcmMessage's APNs block.
  if (message.ttlSeconds !== undefined) headers["apns-expiration"] = String(nowSec + message.ttlSeconds);
  if (message.collapseKey !== undefined) headers["apns-collapse-id"] = apnsCollapseId(message.collapseKey);
  const payload: Record<string, unknown> = {
    aps: { alert: { title: message.title, body: message.body }, sound: "default" },
  };
  if (message.data && Object.keys(message.data).length > 0) payload.body = message.data;
  return { path: `/3/device/${message.token}`, headers, body: JSON.stringify(payload) };
}

/** A collapse key within Apple's 64-byte limit: as-is when it fits, else its SHA-256 hex (64 chars). */
export function apnsCollapseId(key: string): string {
  return Buffer.byteLength(key) <= APNS_COLLAPSE_ID_MAX_BYTES ? key : createHash("sha256").update(key).digest("hex");
}

/**
 * The APNs provider token: an ES256 JWT (`kid` = key id, `iss` = team id, `iat` = now). JWS needs the
 * raw r‖s signature, hence `dsaEncoding: "ieee-p1363"` (node's default is DER).
 */
export function apnsProviderToken(keyId: string, teamId: string, key: KeyObject, nowSec: number): string {
  const segment = (part: object): string => Buffer.from(JSON.stringify(part)).toString("base64url");
  const unsigned = `${segment({ alg: "ES256", kid: keyId })}.${segment({ iss: teamId, iat: nowSec })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

/**
 * APNs responses that mean the token will never deliver (prune it): 410 Unregistered (the app was
 * removed), 400 BadDeviceToken (malformed, or minted for the other gateway), 400 DeviceTokenNotForTopic
 * (another app's token). Everything else — 403 provider-token errors, 429, 5xx, timeouts — is transient
 * and must never prune. A pruned token comes back the next time the app opens and re-registers.
 */
export function isDeadApnsToken(status: number, reason: string | undefined): boolean {
  return status === 410 || (status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic"));
}

/** What the transport reports back for one request. `status` 0 = no HTTP response (network, timeout). */
export interface ApnsResponse {
  status: number;
  reason?: string;
}

export type ApnsTransport = (request: ApnsRequest & { authorization: string }) => Promise<ApnsResponse>;

/** Apple: a provider token is valid for an hour, and refreshing more than once every 20 minutes is
 *  rejected (TooManyProviderTokenUpdates). Reuse each token for 50 minutes. */
const PROVIDER_TOKEN_TTL_SEC = 50 * 60;
/** In-flight requests per batch — well under APNs' per-connection stream limit. */
const APNS_CONCURRENCY = 50;
const APNS_REQUEST_TIMEOUT_MS = 10_000;

export class ApnsPush implements PushAdapter {
  private readonly logger = new Logger(ApnsPush.name);
  private readonly key: KeyObject;
  private token?: { value: string; issuedAt: number };

  constructor(
    private readonly config: ApnsConfig,
    private readonly transport: ApnsTransport = http2Transport(config.sandbox ? APNS_ORIGINS.sandbox : APNS_ORIGINS.production),
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    // Parsed once at construction, so a malformed key fails boot (via selectPush), not the first send.
    this.key = createPrivateKey(config.privateKey);
  }

  private providerToken(): string {
    const now = this.now();
    if (!this.token || now - this.token.issuedAt >= PROVIDER_TOKEN_TTL_SEC) {
      this.token = { value: apnsProviderToken(this.config.keyId, this.config.teamId, this.key, now), issuedAt: now };
    }
    return this.token.value;
  }

  async send(message: PushMessage): Promise<PushResult> {
    const request = buildApnsRequest(message, this.config.topic, this.now());
    let response: ApnsResponse;
    try {
      response = await this.transport({ ...request, authorization: `bearer ${this.providerToken()}` });
    } catch {
      response = { status: 0 };
    }
    if (response.status === 200) {
      this.logger.debug(`apns → ${maskToken(message.token)}: ${message.title}`);
      return { ok: true, invalidToken: false };
    }
    // A rejected provider token (expired, or the key rotated) is re-minted on the next send.
    if (response.status === 403) this.token = undefined;
    this.logger.warn(`apns send failed for ${maskToken(message.token)} (${response.status || "no response"} ${response.reason ?? ""})`.trim());
    return { ok: false, invalidToken: isDeadApnsToken(response.status, response.reason) };
  }

  /** APNs has no batch call: send concurrently over the one HTTP/2 connection, results in input order. */
  async sendEach(messages: PushMessage[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += APNS_CONCURRENCY) {
      results.push(...(await Promise.all(messages.slice(i, i + APNS_CONCURRENCY).map((m) => this.send(m)))));
    }
    return results;
  }
}

/**
 * The real transport: one lazily-opened HTTP/2 session to the APNs origin, reused across requests and
 * reopened after it closes or errors. Never throws — a transport failure resolves to `{ status: 0 }`.
 */
export function http2Transport(origin: string): ApnsTransport {
  let session: ClientHttp2Session | undefined;
  const open = (): ClientHttp2Session => {
    if (session && !session.closed && !session.destroyed) return session;
    const fresh = connect(origin);
    const forget = (): void => {
      if (session === fresh) session = undefined;
    };
    fresh.on("close", forget);
    fresh.on("error", forget);
    fresh.on("goaway", forget);
    // Don't hold the process open between pushes.
    fresh.unref();
    session = fresh;
    return fresh;
  };

  return (request) =>
    new Promise<ApnsResponse>((resolve) => {
      let stream: ClientHttp2Stream;
      try {
        stream = open().request({
          ":method": "POST",
          ":path": request.path,
          authorization: request.authorization,
          "content-type": "application/json",
          ...request.headers,
        });
      } catch {
        resolve({ status: 0 });
        return;
      }
      let status = 0;
      let body = "";
      stream.setEncoding("utf8");
      stream.setTimeout(APNS_REQUEST_TIMEOUT_MS, () => stream.close());
      stream.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      stream.on("data", (chunk: string) => {
        body += chunk;
      });
      stream.on("error", () => resolve({ status: 0 }));
      stream.on("close", () => {
        let reason: string | undefined;
        try {
          reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
        } catch {
          reason = undefined;
        }
        resolve({ status, reason });
      });
      stream.end(request.body);
    });
}
