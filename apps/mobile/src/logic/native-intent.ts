/**
 * expo-router's system-URL hook (`app/+native-intent.tsx`), kept here so it is unit-tested.
 *
 * The ID check's browser fallback (src/kyc/verify.ts) opens Didit in an auth session that watches for the
 * bare app scheme: the API's `/kyc/return` landing bounces the tab to `lynia://`. The auth session takes
 * that hop — but on Android the same URL also reaches the running app as an ordinary deep link, which
 * expo-router resolved to `/` (app/index.tsx) and navigated there: a SECOND boot redirect on top of the
 * rider's stack (a second board, or the board over R1). While the app is running, that return URL is not a
 * destination at all, so it is dropped and the rider stays where the check left them.
 *
 * A launch BY that URL (`initial`) is a cold start like any other and still boots through `/`. Every other
 * URL passes through untouched. (Pushes route with `router.push`, not URLs, so nothing else uses the bare
 * scheme.)
 */
const KYC_RETURN = /^lynia:\/\/\/?(?:kyc\/return\/?)?(?:[?#].*)?$/i;

export function isKycReturnUrl(path: string): boolean {
  return KYC_RETURN.test(path.trim());
}

/** An empty string tells expo-router there is nowhere to go: the incoming URL is ignored. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (!initial && isKycReturnUrl(path)) return "";
    return path;
  } catch {
    return path;
  }
}
