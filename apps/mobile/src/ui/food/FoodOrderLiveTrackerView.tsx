import { CUSTOMER_CANCELLABLE_STATUSES, tokens, type MerchantOrderResponse } from "@lynia/shared";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import type { OrderSnapshot } from "../../api/orders";
import type { RiderIdentity } from "../../logic/rider-identity";
import { handshakeState } from "../../logic/food-doorstep";
import { Button, Card, ErrorText, Icon, OfflineBanner, Screen, SkeletonCard } from "../index";
import { GetHelpControl, SosControl } from "../safety";
import { LiveTrackingCard } from "../order/LiveTrackingCard";
import { CashHandshakeCard } from "./CashHandshakeCard";
import { DeliveryCodeCard } from "./DeliveryCodeCard";
import { OrderHeader } from "./FoodOrderHelpers";

const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
// Post-pickup cancels get the harsher "it's already on the bike" warning, mirroring app/order/[id].tsx.
const POST_PICKUP_CANCEL = new Set<string>(["picked_up", "en_route_dropoff"]);

const TRACK_STATUS_LABEL: Record<string, string> = {
  assigned: "Rider secured",
  confirmed: "At the restaurant",
  en_route_pickup: "Picking up",
  picked_up: "Picked up",
  en_route_dropoff: "On the way",
};

type LiveTrackerOrder = Pick<MerchantOrderResponse, "status" | "paymentMethod" | "customerCashConfirmedAt" | "riderCashConfirmedAt" | "cashHandshakeFrozenAt" | "cashHandshakeAmount" | "total" | "merchantGoodsTotal" | "rider">;

/** RF-18: the "a rider is secured" (`order.riderId != null && ACTIVE.includes(order.status)`) branch of
 *  app/food/order/[orderId].tsx, extracted verbatim — once dispatched a food order rides the same
 *  generic assigned→…→en_route_dropoff edges a parcel does (D3), including the CASH doorstep handshake
 *  + delivery code (D4/R-04/R-09) and the post-dispatch confirm-first cancel (D3). */
export function FoodOrderLiveTrackerView({
  orderId,
  order,
  restaurantName,
  reachable,
  now,
  error,
  busy,
  trackData,
  deliveryCode,
  confirmCashBusy,
  onConfirmCash,
  onRevealCode,
  cancelConfirm,
  onCancelConfirmChange,
  onCancelActive,
}: {
  orderId: string;
  order: LiveTrackerOrder;
  restaurantName: string;
  reachable: boolean;
  now: number;
  error: string | null;
  busy: boolean;
  trackData: OrderSnapshot | undefined;
  deliveryCode: string | null;
  confirmCashBusy: boolean;
  onConfirmCash: () => void;
  onRevealCode: () => void;
  cancelConfirm: boolean;
  onCancelConfirmChange: (value: boolean) => void;
  onCancelActive: () => void;
}): React.ReactElement {
  // D4/money-safety: once the customer has confirmed handing over cash (R-04), a "cancel" no longer
  // means anything sane — the money already left their hands and there's no undo path for it. Kept
  // conservative (hide the action) rather than guessing at a new cancel-after-cash-confirm behaviour.
  const cancellable = CUSTOMER_CANCELLABLE.has(order.status) && !(order.paymentMethod === "cash" && order.customerCashConfirmedAt != null);
  const postPickup = POST_PICKUP_CANCEL.has(order.status);
  const justSecured = order.status === "assigned";
  const atDoor = order.status === "en_route_dropoff";
  const cash = handshakeState({
    paymentMethod: order.paymentMethod,
    customerCashConfirmedAt: order.customerCashConfirmedAt,
    riderCashConfirmedAt: order.riderCashConfirmedAt,
    cashHandshakeFrozenAt: order.cashHandshakeFrozenAt,
  });
  // #671: the assigned rider's identity (name · plate · vehicle · rating · KYC) for the "rider
  // secured" card, built live from the food order read. A food rider is auto-dispatched, so unlike
  // the parcel path there is no cached offer to recover it from — the order carries it directly.
  // `ratingAvg` arrives as a raw JSON number (Prisma Float); RiderMini expects a string.
  const riderIdentity: RiderIdentity | null = order.rider
    ? {
        orderId,
        profileId: order.rider.profileId,
        firstName: order.rider.firstName,
        lastName: order.rider.lastName,
        photoUrl: order.rider.photoUrl,
        ratingAvg: String(order.rider.ratingAvg),
        ratingCount: order.rider.ratingCount,
        tripsCount: order.rider.tripsCount,
        plate: order.rider.plate,
        vehicleInfo: order.rider.vehicleInfo,
        kycVerified: order.rider.kycVerified,
      }
    : null;
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      {justSecured ? (
        <Card accent style={{ marginBottom: tokens.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Icon name="circle-check" size={18} color={tokens.color.accentText} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>
              Rider secured — {restaurantName} is cooking your order
            </Text>
          </View>
        </Card>
      ) : null}
      <OrderHeader restaurantName={restaurantName} pillLabel={TRACK_STATUS_LABEL[order.status] ?? "On the way"} pillTone="success" />
      <ScrollView showsVerticalScrollIndicator={false}>
        {trackData ? (
          <LiveTrackingCard
            orderId={orderId}
            status={order.status}
            isActive
            jobType="food"
            feeLabel="Order total"
            fare={trackData.agreedFare ?? trackData.proposedFare}
            pickup={trackData.pickup.point}
            dropoff={trackData.dropoff.point}
            events={trackData.events}
            counterpartyPhone={trackData.counterpartyPhone}
            riderIdentity={riderIdentity}
            connectionState={reachable ? "live" : "reconnecting"}
          />
        ) : (
          <SkeletonCard />
        )}
        {/* D4/R-04/R-09: the CASH doorstep handshake + the (masked, CASH; plain, WALLET) delivery
            code — only relevant once the rider is genuinely at the door. */}
        {atDoor && order.paymentMethod === "cash" ? (
          <>
            <CashHandshakeCard
              state={cash}
              amount={order.cashHandshakeAmount ?? order.total ?? order.merchantGoodsTotal ?? 0}
              confirmedAt={order.customerCashConfirmedAt ?? null}
              nowMs={now}
              onConfirm={onConfirmCash}
              busy={confirmCashBusy}
            />
            {cash === "confirmed" ? (
              <Card accent style={{ marginBottom: tokens.space.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <Icon name="circle-check" size={18} color={tokens.color.accentText} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>Cash confirmed by both of you</Text>
                </View>
              </Card>
            ) : null}
            <DeliveryCodeCard
              code={deliveryCode}
              masked
              unavailableHint={
                cash === "frozen" ? "This order is on hold — support is looking into it." : "Appears once you and your rider both confirm the cash."
              }
              onReveal={onRevealCode}
            />
          </>
        ) : atDoor ? (
          <DeliveryCodeCard code={deliveryCode} masked={false} unavailableHint="Fetching your code…" />
        ) : null}
        {/* D-28: Express's safety surface, reused verbatim — same riders, same risk, same controls. */}
        <GetHelpControl orderId={orderId} />
        <SosControl orderId={orderId} />
        <ErrorText message={error} />
        {cancellable ? (
          cancelConfirm ? (
            <Card style={{ borderColor: tokens.color.danger }}>
              <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.xs }}>
                {postPickup ? "Cancel after pickup?" : "Cancel this order?"}
              </Text>
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
                {postPickup
                  ? `Your rider already has your order from ${restaurantName}. If you cancel now, you'll arrange getting it back directly with them.`
                  : `Your rider is on the way to ${restaurantName}. Cancelling now lets them go — you can order again any time.`}
              </Text>
              <Button
                label="Yes, cancel this order"
                onPress={() => {
                  onCancelConfirmChange(false);
                  onCancelActive();
                }}
                loading={busy}
              />
              <Button label="Keep my order" variant="ghost" onPress={() => onCancelConfirmChange(false)} />
            </Card>
          ) : (
            <Button label="Cancel order" variant="ghost" onPress={() => onCancelConfirmChange(true)} disabled={busy} />
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}
