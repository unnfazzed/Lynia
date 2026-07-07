import { tokens } from "@lynia/shared";
import React, { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import type { OfferRow } from "../../api/offers";
import { Avatar, Button, Card, Icon } from "../index";

/**
 * A single bid, animated in. A newly-arrived offer mounts with a fresh key, so this runs its
 * slide+fade entrance exactly once — existing cards keep their key and don't re-animate on re-sort
 * or poll. Honors reduce-motion (renders at rest). useNativeDriver so it stays cheap on low-end
 * Android; we deliberately avoid animating border colour (JS-thread) to keep it smooth.
 */
export function BidEntrance({ animate, children }: { animate: boolean; children: React.ReactNode }): React.ReactElement {
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (animate) Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [animate, v]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * F-07 counter-offer card. A rider bidding ABOVE the ask surfaces as ask-vs-counter (+delta) with an
 * Accept (assigns at the counter price) and a Decline. Decline is client-side dismissal only — the
 * bid stays live server-side and reverts to a normal choosable card at the countered price (one round,
 * no counter-back). Never shows an auto-charge above the customer's price.
 */
export function CounterOfferCard({
  offer,
  ask,
  onAccept,
  onDecline,
  loading,
  disabled,
}: {
  offer: OfferRow;
  ask: number;
  onAccept: () => void;
  onDecline: () => void;
  loading: boolean;
  disabled: boolean;
}): React.ReactElement {
  const counter = Number(offer.offeredFare);
  const delta = counter - ask;
  const name = `${offer.rider.profile.firstName} ${offer.rider.profile.lastName}`;
  return (
    <Card style={{ borderColor: tokens.color.accent }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
        <Avatar photoUrl={offer.rider.profile.photoUrl} firstName={offer.rider.profile.firstName} lastName={offer.rider.profile.lastName} seed={offer.rider.profileId} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{name}</Text>
          <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
            ★ {offer.rider.ratingCount > 0 ? Number(offer.rider.ratingAvg).toFixed(1) : "new"} · {offer.rider.tripsCount} trips · ETA {offer.etaMinutes} min
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "stretch", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
        <View style={{ flex: 1, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.input, padding: tokens.space.sm }}>
          <Text style={{ fontSize: tokens.font.size.micro, fontWeight: tokens.font.weight.bold, letterSpacing: 0.4, color: tokens.color.muted }}>YOUR PRICE</Text>
          <Text style={{ fontSize: tokens.font.size.price, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>${ask.toFixed(2)}</Text>
        </View>
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Icon name="arrow-right" size={16} color={tokens.color.muted} />
        </View>
        <View style={{ flex: 1, backgroundColor: tokens.color.accentWash, borderRadius: tokens.radius.input, padding: tokens.space.sm }}>
          <Text style={{ fontSize: tokens.font.size.micro, fontWeight: tokens.font.weight.bold, letterSpacing: 0.4, color: tokens.color.accentText }}>THEIR OFFER</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ fontSize: tokens.font.size.price, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>${counter.toFixed(2)}</Text>
            <Text style={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightInk, fontVariant: ["tabular-nums"] }}>+${delta.toFixed(2)}</Text>
          </View>
        </View>
      </View>
      <Button label={`Accept $${counter.toFixed(2)}`} onPress={onAccept} loading={loading} disabled={disabled} />
      <Button label="Decline" variant="ghost" onPress={onDecline} disabled={disabled} />
      <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, textAlign: "center", marginTop: 2 }}>
        Declining keeps {offer.rider.profile.firstName} in your list at ${counter.toFixed(2)} — one counter round, no counter-back.
      </Text>
    </Card>
  );
}
