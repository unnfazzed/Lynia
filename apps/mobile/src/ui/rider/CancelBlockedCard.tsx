import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, Card, Icon, type IconName } from "../index";

type Alternative = { icon: IconName; title: string; sub: string; onPress?: () => void };

/**
 * `cancel_blocked` (kit `explorations/restaurants/r-rider.jsx` — `RR.cancel_blocked`, "R2·b2 — cancel
 * is gone once the food is on the bike").
 *
 * The server has always enforced this (food-dispatch.service.ts's `droppable` set = assigned /
 * confirmed / en_route_pickup, mirrored by `FOOD_DROPPABLE`), but the app expressed it by simply not
 * rendering the "Drop this job" button any more. A control that vanishes teaches nothing: the rider
 * who wants out after collecting is left with an order they can't abandon and no stated way forward,
 * which is exactly when a job gets dumped on a doorstep. So the rule gets said out loud, and every
 * route that DOES exist gets named.
 *
 * Nothing here is new capability — each alternative is an affordance the screen already has (call the
 * customer, the existing Get help control, the N-10 no-show → return-the-food leg). This card is the
 * signpost to them.
 */
export function CancelBlockedCard({
  merchantName,
  paidUpfront,
  alternatives,
  onDismiss,
}: {
  merchantName?: string | null;
  /** `pay_upfront` only: the rider's OWN cash is already with the kitchen — the strongest reason of all. */
  paidUpfront?: number | null;
  alternatives: Alternative[];
  onDismiss: () => void;
}): React.ReactElement {
  const kitchen = merchantName ?? "the kitchen";
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          gap: tokens.space.sm,
          padding: tokens.space.md,
          borderRadius: tokens.radius.input,
          backgroundColor: tokens.color.dangerWash,
        }}
      >
        <Icon name="ban" size={19} color={tokens.color.dangerInk} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14.5, fontWeight: tokens.font.weight.bold, color: tokens.color.dangerInk }}>
            You can&apos;t drop a job after collecting
          </Text>
          <Text style={{ fontSize: 12.5, color: tokens.color.dangerInk, lineHeight: 18, marginTop: 4 }}>
            {paidUpfront != null && paidUpfront > 0
              ? `You already paid ${kitchen} ${formatMoney(paidUpfront)} and the food is on your bike.`
              : `The food is on your bike — ${kitchen} has already handed the order over.`}
          </Text>
        </View>
      </View>

      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, letterSpacing: 0.3, marginTop: tokens.space.md, marginBottom: 7 }}>
        WHAT YOU CAN DO INSTEAD
      </Text>
      {alternatives.map((a) => (
        <AlternativeRow key={a.title} {...a} />
      ))}

      <Button label="Continue delivery" onPress={onDismiss} />
    </Card>
  );
}

function AlternativeRow({ icon, title, sub, onPress }: Alternative): React.ReactElement {
  const inner = (
    <>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={16} color={tokens.color.accentText} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{title}</Text>
        <Text style={{ fontSize: 12, color: tokens.color.muted, lineHeight: 17 }}>{sub}</Text>
      </View>
      {onPress ? <Icon name="chevron-right" size={16} color={tokens.color.muted} /> : null}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: tokens.space.md,
    paddingVertical: 9,
    paddingHorizontal: tokens.space.md,
    minHeight: tokens.touchTargetMin,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.input,
    marginBottom: 7,
  };
  // A row with nowhere to go is described, not faked into a button — the kit draws all three as
  // tappable, but "return the food to the restaurant" isn't an action a rider can take on demand
  // (it only unlocks after the N-10 wait), so it reads as guidance until it genuinely is one.
  if (!onPress) return <View style={style}>{inner}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} style={style}>
      {inner}
    </Pressable>
  );
}
