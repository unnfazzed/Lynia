import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useCallback } from "react";

/**
 * The rider's on-device preferences from Settings › Rider (Rider v2 S1–S3, ledger D-54): which
 * navigation app Navigate opens, and the default mobile-money provider + number Top up prefills.
 * Stored on the phone only — none of it needs the server.
 */
export type NavApp = "gmaps" | "waze";
export type TopupProviderId = "ecocash" | "innbucks" | "omari";
export const TOPUP_PROVIDERS: readonly { id: TopupProviderId; name: string }[] = [
  { id: "ecocash", name: "EcoCash" },
  { id: "innbucks", name: "InnBucks" },
  { id: "omari", name: "O'mari" },
];

export interface RiderPrefs {
  navApp: NavApp;
  topupProvider: TopupProviderId;
  /** Null = use the account phone. */
  topupPhone: string | null;
}

const PREFS_SLOT = "lynia.riderPrefs.v1";
export const RIDER_PREFS_KEY = ["riderPrefs"] as const;
export const DEFAULT_RIDER_PREFS: RiderPrefs = { navApp: "gmaps", topupProvider: "ecocash", topupPhone: null };

export function parseRiderPrefs(raw: string | null): RiderPrefs {
  if (!raw) return DEFAULT_RIDER_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<RiderPrefs>;
    return {
      navApp: v.navApp === "waze" ? "waze" : "gmaps",
      topupProvider: TOPUP_PROVIDERS.some((p) => p.id === v.topupProvider) ? (v.topupProvider as TopupProviderId) : "ecocash",
      topupPhone: typeof v.topupPhone === "string" && v.topupPhone.trim() ? v.topupPhone.trim() : null,
    };
  } catch {
    return DEFAULT_RIDER_PREFS;
  }
}

export async function loadRiderPrefs(): Promise<RiderPrefs> {
  try {
    return parseRiderPrefs(await SecureStore.getItemAsync(PREFS_SLOT));
  } catch {
    return DEFAULT_RIDER_PREFS;
  }
}

export function providerName(id: TopupProviderId): string {
  return TOPUP_PROVIDERS.find((p) => p.id === id)?.name ?? "EcoCash";
}

/** Read + write the prefs through one query key so Settings and Top up stay in step. */
export function useRiderPrefs(): { prefs: RiderPrefs; save: (patch: Partial<RiderPrefs>) => void } {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: RIDER_PREFS_KEY, queryFn: loadRiderPrefs, staleTime: Infinity });
  const prefs = q.data ?? DEFAULT_RIDER_PREFS;
  const save = useCallback(
    (patch: Partial<RiderPrefs>) => {
      const next = { ...(qc.getQueryData<RiderPrefs>(RIDER_PREFS_KEY) ?? DEFAULT_RIDER_PREFS), ...patch };
      qc.setQueryData(RIDER_PREFS_KEY, next);
      void SecureStore.setItemAsync(PREFS_SLOT, JSON.stringify(next)).catch(() => undefined);
    },
    [qc],
  );
  return { prefs, save };
}

/** The deep link Navigate opens for a point, in the chosen app. */
export function navUrl(app: NavApp, p: { lat: number; lng: number }): string {
  return app === "waze"
    ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
}
