import type { MakeOfferRequest, OfferType } from "@lynia/shared";
import { apiFetch } from "./client";

export interface OfferRow {
  id: string;
  type: OfferType;
  offeredFare: string;
  etaMinutes: number;
  rider: {
    profileId: string;
    ratingAvg: string;
    ratingCount: number;
    tripsCount: number;
    profile: { firstName: string; lastName: string; photoUrl: string | null };
  };
}

export interface SelectResult {
  orderId: string;
  riderId: string;
  agreedFare: string;
  status: "assigned";
  /** Shown once to the customer to relay to the recipient; the rider enters it at handover. */
  deliveryCode: string;
}

export function listOffers(orderId: string): Promise<OfferRow[]> {
  return apiFetch<OfferRow[]>(`/orders/${orderId}/offers`);
}

export function selectOffer(orderId: string, offerId: string): Promise<SelectResult> {
  return apiFetch<SelectResult>(`/orders/${orderId}/offers/${offerId}/select`, { method: "POST" });
}

export interface MakeOfferResult {
  id: string;
  type: OfferType;
  offeredFare: string;
  etaMinutes: number;
  status: string;
}

export function makeOffer(orderId: string, body: Omit<MakeOfferRequest, "orderId">): Promise<MakeOfferResult> {
  return apiFetch<MakeOfferResult>(`/orders/${orderId}/offers`, { method: "POST", body });
}
