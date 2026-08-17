import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Button, Card, Icon } from "../index";
import { Money } from "../Money";

/**
 * The one board, tagged cards (plan §5 B2; `packages/design/RIDER-ONE-APP-PLAN.md` decision 2;
 * `packages/design/explorations/journey/rider-one-app.jsx` `TypeTag`/`JobCard`). PARCEL/FOOD is the
 * only thing that says which service a job came from — everything else about the card is identical.
 */
function TypeTag({ jobType }: { jobType: "parcel" | "food" }): React.ReactElement {
  const food = jobType === "food";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: food ? tokens.color.highlightWash : tokens.color.accentWash,
        borderRadius: tokens.radius.pill,
        paddingVertical: 2,
        paddingHorizontal: 8,
      }}
    >
      <Icon name={food ? "utensils" : "package"} size={11} color={food ? tokens.color.highlightInk : tokens.color.accentText} />
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: tokens.font.weight.bold,
          letterSpacing: 0.4,
          color: food ? tokens.color.highlightInk : tokens.color.accentText,
        }}
      >
        {food ? "FOOD" : "PARCEL"}
      </Text>
    </View>
  );
}

/** Pickup → drop-off route line: an open dot at pickup, a filled square at drop-off, matching the
 *  gallery mock's `JobCard` — same shape for a bid (parcel) or an accept/decline (food) job. */
function RouteLine({ from, to }: { from: string; to: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: tokens.space.sm }}>
      <View style={{ alignItems: "center", paddingTop: 4, width: 9 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: tokens.color.accent }} />
        <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: tokens.color.line }} />
        <View style={{ width: 9, height: 9, borderRadius: 2, borderWidth: 2, borderColor: tokens.color.danger }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {from}
        </Text>
        <View style={{ height: 8 }} />
        <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {to}
        </Text>
      </View>
    </View>
  );
}

export interface JobCardProps {
  jobType: "parcel" | "food";
  from: string;
  to: string;
  /** Pre-formatted distance label ("3.1 km away", "? km trip", …) — the caller owns the
   *  haversine-vs-reported-distance choice; the card only renders whatever it's given. */
  distanceLabel: string;
  /** Fare/asking price as the server sends it (a Decimal string) — formatted here via `formatMoney`. */
  fare: string;
  note: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * One card anatomy for both job kinds (plan §5 B2 "identical card anatomy"): type tag + distance +
 * fare, a route line, a note, one action. No countdown on the card itself — a parcel broadcast that's
 * taken simply leaves the list (the existing `takenNotice`/`expiredOrderIds` board behaviour), and a
 * food offer follows the same "just disappears" rule per the RIDER-ONE-APP-PLAN.md decision-2 final
 * call (superseding that doc's own earlier "pin to top with a running timer" pitch language).
 *
 * B-O2: `React.memo` so an unrelated board re-render (a keystroke in the compose card, a gate/state
 * flip elsewhere on the screen) doesn't repaint every row — every prop here is a primitive except
 * `onAction`, so the memo only actually holds where the caller also keeps that callback referentially
 * stable across renders (see rider/index.tsx's `chooseOrder`/`renderItem`, B-O9).
 */
export const JobCard = React.memo(function JobCard(props: JobCardProps): React.ReactElement {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
        <TypeTag jobType={props.jobType} />
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{props.distanceLabel}</Text>
        <Money v={props.fare} size={16} />
      </View>
      <RouteLine from={props.from} to={props.to} />
      <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: tokens.space.sm, lineHeight: 18 }}>{props.note}</Text>
      {/* RJM `JobCard` draws the action as a filled `Button` (primary), not a ghost — one card, one
          clear primary action (bid on a parcel / accept a food job). */}
      <Button label={props.actionLabel} onPress={props.onAction} />
    </Card>
  );
});
