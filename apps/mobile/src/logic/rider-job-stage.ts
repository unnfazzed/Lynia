import * as SecureStore from "expo-secure-store";

/**
 * Rider v2 active job (ledger D-54, handoff § 2): which stage the job screen draws.
 *
 * The server knows the trip's statuses (assigned → confirmed → en_route_pickup → picked_up →
 * en_route_dropoff → delivered); the handoff draws the rider's ARRIVALS ("I'm at pickup", "I'm at the
 * drop-off"), which the server has no status for. So the screen advances the server on its own
 * (assigned/confirmed → en_route_pickup on open, picked_up → en_route_dropoff right after the collect)
 * and keeps the arrival as a small on-device mark per order, which survives an app kill.
 */
export type ParcelStage = "toPickup" | "atPickup" | "toDrop" | "code";
export type FoodStage = "toKitchen" | "atKitchen" | "toCustomer" | "code";
export type Arrival = "pickup" | "drop";

const BEFORE_COLLECT = new Set(["assigned", "confirmed", "en_route_pickup"]);

export function parcelStage(status: string, arrived: Arrival | null): ParcelStage {
  if (BEFORE_COLLECT.has(status)) return arrived === "pickup" ? "atPickup" : "toPickup";
  return arrived === "drop" ? "code" : "toDrop";
}

/** Statuses the job screen moves on by itself (no rider tap is drawn for them). */
export const AUTO_ADVANCE: Readonly<Record<string, "confirmed" | "en_route_pickup" | "en_route_dropoff">> = {
  assigned: "confirmed",
  confirmed: "en_route_pickup",
  picked_up: "en_route_dropoff",
};

/** The step track's current column: Pickup · Collected · Drop-off · Done. */
export function stepFor(stage: ParcelStage | FoodStage): number {
  return stage === "toPickup" || stage === "atPickup" || stage === "toKitchen" || stage === "atKitchen" ? 0 : 2;
}

/** The wait before "Mark undelivered" unlocks (X3): 8 minutes, the server's food no-show window
 *  (`RESTAURANTS_DEBT.noShowWindowMs`), for parcels too since D-59 changed the copy 10 → 8 min. */
export const REACH_WAIT_MS = 8 * 60_000;

export interface ArrivalMark {
  orderId: string;
  at: Arrival;
}

export const RIDER_JOB_ARRIVAL_KEY = "lynia.riderJobArrival";

export function parseArrival(raw: string | null | undefined): ArrivalMark | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<ArrivalMark> | null;
    if (!d || typeof d.orderId !== "string" || !d.orderId || (d.at !== "pickup" && d.at !== "drop")) return null;
    return { orderId: d.orderId, at: d.at };
  } catch {
    return null;
  }
}

// Best-effort like the other job drafts: a storage failure never rejects; the rider can tap again.
export async function loadArrival(): Promise<ArrivalMark | null> {
  try {
    return parseArrival(await SecureStore.getItemAsync(RIDER_JOB_ARRIVAL_KEY));
  } catch {
    return null;
  }
}

export async function saveArrival(mark: ArrivalMark): Promise<void> {
  try {
    await SecureStore.setItemAsync(RIDER_JOB_ARRIVAL_KEY, JSON.stringify(mark));
  } catch {
    /* best-effort */
  }
}

export async function clearArrival(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(RIDER_JOB_ARRIVAL_KEY);
  } catch {
    /* best-effort */
  }
}
