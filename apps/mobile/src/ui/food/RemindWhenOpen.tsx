import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Icon } from "../index";

/**
 * D1 `menu_closed` — "Remind me when they open".
 *
 * A closed kitchen was a dead end: the customer read "closed" and the only remaining move was to
 * remember to come back themselves. The kit puts this affordance on the closed menu precisely so the
 * closed state has an exit that isn't "give up".
 *
 * A toggle rather than a fire-and-forget button: the second most likely thing a customer does after
 * asking is change their mind, and a control that can't be undone teaches people not to press it.
 *
 * Presentational only — the state and its network round trip live in `src/query/use-restaurants`
 * (`useReopenReminder`), per the `mobile-ui-no-api` boundary: the design-system layer takes props and
 * data flows in from the query layer.
 */
export function RemindWhenOpen(props: {
  restaurantName: string;
  isSet: boolean;
  isPending: boolean;
  disabled?: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const { isSet, isPending, restaurantName } = props;
  const busy = isPending || props.disabled === true;

  return (
    <Pressable
      onPress={props.onToggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: isSet, busy: isPending }}
      accessibilityLabel={isSet ? `Stop reminding me when ${restaurantName} opens` : `Remind me when ${restaurantName} opens`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.sm,
        minHeight: tokens.touchTargetMin,
        paddingHorizontal: tokens.space.md,
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: isSet ? tokens.color.accent : tokens.color.line,
        backgroundColor: isSet ? tokens.color.accentWash : tokens.color.bg,
        alignSelf: "flex-start",
        marginTop: tokens.space.sm,
        opacity: pressed || busy ? 0.7 : 1,
      })}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={tokens.color.accentText} />
      ) : (
        <Icon name={isSet ? "check" : "clock"} size={15} color={tokens.color.accentText} />
      )}
      <View>
        <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
          {isSet ? "We'll remind you" : "Remind me when they open"}
        </Text>
      </View>
    </Pressable>
  );
}
