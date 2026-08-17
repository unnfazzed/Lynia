import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "../index";

/**
 * The service tag on a rider job — PARCEL vs FOOD — the one mark that says which service a job came
 * from (`packages/design/explorations/journey/rider-one-app.jsx` `TypeTag`; RIDER-ONE-APP-PLAN.md
 * decision 2). Extracted as a shared DS primitive so the mock→RN codegen can render the RJM
 * `offer_food` card's `<TypeTag food />` from ONE tokens-only source of truth (the board's own
 * `JobCard` keeps its private copy). Tokens-only, so the design-token-conformance guardrail owns its
 * colours; it imports `Icon` from the barrel but is deliberately NOT re-exported there (the generated
 * view imports it from this module — emit.mjs NON_BARREL — so no `no-circular` cruiser cycle forms).
 */
export function TypeTag({ food = false }: { food?: boolean }): React.ReactElement {
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
