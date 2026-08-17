import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

/**
 * "Tell me when this launches" — on-device interest in a service that has not shipped yet.
 *
 * Home 8c keeps the Pharmacy tile live while it carries its SOON chip: *"tap opens the notify-me
 * sheet — never dead."* There is no pharmacy backend to register interest with, and inventing an
 * endpoint for a vertical that does not exist yet would be building the wrong thing first. So the
 * intent is recorded HERE, on the device, and the notification permission is asked for at the same
 * time — which is the part that actually has to be true before any launch notification can arrive.
 *
 * Deliberately reversible (the same reasoning as `RemindWhenOpen`: the second most likely thing a
 * customer does after asking is change their mind), and deliberately silent on failure — a
 * SecureStore or permission error must never turn a "coming soon" sheet into an error state.
 *
 * When the pharmacy vertical gets a real backend, this becomes the local half of a sync: read the
 * set here, POST it once, keep the same API. Nothing at the call site changes.
 */

/** SecureStore slot. No PII — a list of service ids the customer asked to hear about. */
export const SERVICE_INTEREST_KEY = "lynia.serviceInterest.v1";

/** Total, defensive parse — any non-string entry is dropped rather than trusted. */
export function parseInterest(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function loadServiceInterest(): Promise<string[]> {
  try {
    return parseInterest(await SecureStore.getItemAsync(SERVICE_INTEREST_KEY));
  } catch {
    return [];
  }
}

export async function isInterested(serviceId: string): Promise<boolean> {
  return (await loadServiceInterest()).includes(serviceId);
}

/**
 * Record interest and ask for notification permission if it has not been granted yet (and the OS
 * will still show the dialog). Returns the stored state so the sheet can confirm it — `true` even
 * when the permission ask is refused, because the interest itself IS recorded and a customer who
 * declines the prompt has not withdrawn their request.
 */
export async function addServiceInterest(serviceId: string): Promise<boolean> {
  try {
    const current = await loadServiceInterest();
    if (!current.includes(serviceId)) {
      await SecureStore.setItemAsync(SERVICE_INTEREST_KEY, JSON.stringify([...current, serviceId]));
    }
  } catch {
    return false;
  }
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (!existing.granted && existing.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch {
    /* best-effort — the interest is recorded either way; permission can be granted later in Settings */
  }
  return true;
}

export async function removeServiceInterest(serviceId: string): Promise<boolean> {
  try {
    const current = await loadServiceInterest();
    await SecureStore.setItemAsync(SERVICE_INTEREST_KEY, JSON.stringify(current.filter((s) => s !== serviceId)));
    return true;
  } catch {
    return false;
  }
}
