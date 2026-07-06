import { ACTIVE_RIDE_STATUSES, type AdvanceStatusRequest, RIDER_CANCELLABLE_STATUSES, UndeliveredReason } from "@lynia/shared";
import type { IconName } from "../ui/Icon";

export const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
// R2: the rider may only cancel pre-pickup — the server rejects a cancel once the parcel is collected,
// so the button must hide there (post-pickup, "Can't complete delivery" is the exit, not Cancel).
export const RIDER_CANCELLABLE = RIDER_CANCELLABLE_STATUSES as string[];
export const NEXT: Record<string, { to: AdvanceStatusRequest["to"]; label: string }> = {
  assigned: { to: "confirmed", label: "Confirm the job" },
  confirmed: { to: "en_route_pickup", label: "Head to pickup" },
  en_route_pickup: { to: "picked_up", label: "Mark parcel collected" },
  picked_up: { to: "en_route_dropoff", label: "Head to drop-off" },
};

// Delivery-OTP cap (R9). Mirrors the server's DELIVERY_OTP_MAX_ATTEMPTS: the server enforces the lock;
// the client counts wrong tries to show attempts-remaining and disable the field at the cap.
export const DELIVERY_OTP_MAX_ATTEMPTS = 5;

// The post-pickup "can't complete delivery" reasons (R1) — the shared UndeliveredReason enum paired
// with rider-facing copy + an icon, mirroring the "Couldn't deliver" mockup (rider-screens.jsx).
export const UNDELIVERED_OPTIONS: { reason: UndeliveredReason; label: string; icon: IconName }[] = [
  { reason: UndeliveredReason.UNREACHABLE, label: "Recipient unreachable", icon: "phone" },
  { reason: UndeliveredReason.REFUSED, label: "Recipient refused", icon: "circle-alert" },
  { reason: UndeliveredReason.WRONG_ADDRESS, label: "Wrong address", icon: "map-pin" },
  { reason: UndeliveredReason.BREAKDOWN, label: "Couldn't complete (breakdown)", icon: "bike" },
];
export const UNDELIVERED_LABEL = Object.fromEntries(UNDELIVERED_OPTIONS.map((o) => [o.reason, o.label])) as Record<UndeliveredReason, string>;
