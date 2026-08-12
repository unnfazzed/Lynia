// GENERATED — do not edit by hand. Structural-parity source of truth for RJM.offer_parcel#offer.
// Source mock: packages/design/explorations/journey/rider-one-app.jsx :: offer_parcel :: region offer
// Regenerate:  node tools/parity/codegen/cli.mjs gen RJM.offer_parcel#offer
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/rider/(tabs)/index.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text } from "react-native";
import { tokens } from "@lynia/shared";
import { Field, Card, Money } from "../../../src/ui";
import { TypeTag } from "../../../src/ui/rider/TypeTag";

export type RiderOfferParcelCardViewProps = {
  /** The sender's asking price (the mock header Money). */
  proposedFare: string | number | null | undefined;
  /** The rider's fare bid — the always-shown "Your fare (USD)" field (seeded with the asking price). */
  fare: string;
  onChangeFare: (v: string) => void;
  /** Honest fare hint — the mock's "$2.96 usual" market figure is not modelled, so the container
   *  feeds its own copy (structurally invisible; the normalizer drops text). */
  fareHint?: string;
  /** The rider's ETA-to-pickup in minutes — the "You'll be there in" field. */
  eta: string;
  onChangeEta: (v: string) => void;
};

export function RiderOfferParcelCardView({
  proposedFare,
  fare,
  onChangeFare,
  fareHint,
  eta,
  onChangeEta
}: RiderOfferParcelCardViewProps): React.ReactElement {
  return <Card style={{
    padding: 12
  }}>
        <View style={{
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
      flexDirection: "row"
    }}><TypeTag /><View style={{
        flex: 1
      }} /><Text style={{
        fontSize: 12,
        color: tokens.color.muted
      }}>Sender asking</Text><Money v={proposedFare} size={20} /></View>
        <Field label="Your fare (USD)" value={fare} onChangeText={onChangeFare} keyboardType="decimal-pad" hint={fareHint} />
        <Field label="You'll be there in" hint="Be honest — arriving late is what loses you the next job." value={eta} onChangeText={onChangeEta} keyboardType="number-pad" maxLength={3} />
      </Card>;
}
