/**
 * A stable, random per-browser device id, sent as `x-device-id` on `POST /auth/otp/verify` only
 * (merchant web upgrade L1, docs/plans/2026-09-29-merchant-web-upgrade-plan.md D4).
 *
 * The API requires one to CREATE an account for a number it has never seen — that's how the per-device
 * sign-up cap works (3 new accounts per device per day, KB-IDENTITY-BINDING). The app always sends one;
 * the web never did (and the API's CORS didn't allow the header), so a cashier or a new owner who had
 * never used LyniaGo got a 400 at the code step.
 *
 * It is not a secret and says nothing about the person: a random UUID minted once per browser and kept
 * in localStorage, with a cookie fallback for private mode / blocked storage, so a reload or a second
 * tab reuses it and the cap counts this browser once. The `web-` prefix tells ops which surface a
 * session came from.
 */
const STORAGE_KEY = "lynia_merchant_device_id";
const COOKIE_NAME = "lynia_merchant_device_id";
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const DEVICE_ID_PATTERN = /^web-[0-9a-f-]{36}$/;

function readStorage(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && DEVICE_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function readCookie(): string | null {
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_NAME}=`));
    const value = match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : null;
    return value && DEVICE_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function persist(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage blocked — the cookie below still keeps it.
  }
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  } catch {
    // Both blocked: the id lives for this page only, which still lets this sign-in through.
  }
}

function mint(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
  return `web-${uuid}`;
}

let memo: string | null = null;

/** This browser's device id — read from storage, else minted once and persisted. Never throws. */
export function getDeviceId(): string {
  if (memo) return memo;
  const existing = typeof window === "undefined" ? null : (readStorage() ?? readCookie());
  memo = existing ?? mint();
  if (typeof window !== "undefined") persist(memo);
  return memo;
}

/** Test-only: forget the in-memory copy so a test can exercise the storage paths. */
export function resetDeviceIdMemoForTests(): void {
  memo = null;
}
