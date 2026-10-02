// Suggested view-models for the Orders tab. Adapt names to the codebase; fields marked NB need backend work.
export type Service = 'send' | 'restaurants' | 'shops';

export type Outcome =
  | 'delivered'          // delivered | completed
  | 'cancelledByYou'     // cancelled, reason by_customer          NB: cancel reason
  | 'cancelledByRider'   // cancelled, reason by_rider
  | 'kitchenTimeout'     // merchant cancelled, reason kitchen_timeout (food → "Restaurant…", shop → "Shop…")
  | 'noRider'            // expired
  | 'notDelivered'       // undelivered (problem tone)
  | 'refunded';          // NB: refund flag + amount

export type NowStage =
  | 'finding' | 'assigned' | 'toPickup' | 'collected' | 'onWay'      // parcel
  | 'awaitingAccept' | 'preparing' | 'ready';                         // food / shop (then 'onWay')

/** stage → filled progress segments (of 7) */
export const STAGE_SEGMENTS: Record<NowStage, number> = {
  finding: 1, assigned: 2, toPickup: 3, collected: 4, onWay: 6,
  awaitingAccept: 1, preparing: 2, ready: 4,
};

export interface NowCardVM {
  id: string;
  service: Service;
  stage: NowStage;
  title: string;          // built from ordersCopy.now_
  sub: string;
  etaMin?: number;        // yellow chip only when present and GPS fresh
  pill?: string;          // "4:12 left" | "No ETA" | "As of 09:24"
  riderMoving: boolean;   // disc icon → bike
}

export interface HistoryRowVM {
  id: string;
  service: Service;
  createdAt: string;      // ISO; day label + time derive from it
  title: string;          // "Parcel to <area>" | venue name
  items: string;          // "Documents · from Eastgate Mall" | "Sadza & beef stew, Mazoe ×2" | "3 items"
  outcome: Outcome;
  chargedUsd: number;     // NB: 0 → "No charge"
  refundUsd?: number;     // NB: present → "$x back"
  riderName?: string;     // "Tendai M."
  rating?: 1 | 2 | 3 | 4 | 5;
  dropoffArea?: string;   // NB: suburb; fallback first segment of dropoff address
}

export interface OrdersPage { rows: HistoryRowVM[]; nextCursor: string | null; firstOrderAt?: string }
