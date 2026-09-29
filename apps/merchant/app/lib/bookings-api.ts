import type {
  CreateMerchantBookingRequest,
  LatLng,
  MerchantBookingResponse,
  PickMerchantBookingOfferResponse,
  RetryMerchantBookingRequest,
  RotateMerchantBookingCodeResponse,
} from "@lynia/shared";
import { authedFetch } from "./api-client";

export type { MerchantBookingOffer, MerchantBookingResponse, MerchantBookingState } from "@lynia/shared";

/**
 * Book a rider (merchant web upgrade L2): `/merchant/bookings`. Every booking is a Send delivery the
 * business books from its own pin; any team member acts on any of them.
 */

export function listBookings(): Promise<MerchantBookingResponse[]> {
  return authedFetch<MerchantBookingResponse[]>("/merchant/bookings");
}

export function getBooking(id: string): Promise<MerchantBookingResponse> {
  return authedFetch<MerchantBookingResponse>(`/merchant/bookings/${id}`);
}

export function createBooking(body: CreateMerchantBookingRequest): Promise<MerchantBookingResponse> {
  return authedFetch<MerchantBookingResponse>("/merchant/bookings", { method: "POST", body });
}

/** Picks a rider. The delivery code comes back ONCE — only its hash is kept. */
export function pickOffer(bookingId: string, offerId: string): Promise<PickMerchantBookingOfferResponse> {
  return authedFetch<PickMerchantBookingOfferResponse>(`/merchant/bookings/${bookingId}/offers/${offerId}/pick`, { method: "POST" });
}

export function cancelBooking(bookingId: string, reason?: string): Promise<MerchantBookingResponse> {
  return authedFetch<MerchantBookingResponse>(`/merchant/bookings/${bookingId}/cancel`, { method: "POST", body: reason ? { reason } : {} });
}

/** "Send a new code": the new code replaces the old one. */
export function rotateBookingCode(bookingId: string): Promise<RotateMerchantBookingCodeResponse> {
  return authedFetch<RotateMerchantBookingCodeResponse>(`/merchant/bookings/${bookingId}/code`, { method: "POST" });
}

export function retryBooking(bookingId: string, body: RetryMerchantBookingRequest): Promise<MerchantBookingResponse> {
  return authedFetch<MerchantBookingResponse>(`/merchant/bookings/${bookingId}/try-again`, { method: "POST", body });
}

/** A Google Maps short link, which only the API can follow. */
export async function resolveMapLink(url: string): Promise<LatLng> {
  const res = await authedFetch<{ point: LatLng }>("/merchant/bookings/resolve-link", { method: "POST", body: { url } });
  return res.point;
}
