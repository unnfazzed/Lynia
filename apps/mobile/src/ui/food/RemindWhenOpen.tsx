import { tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { clearReopenReminder, getReopenReminder, setReopenReminder } from "../../api/restaurants";
import { haptic, Icon, useToast } from "../index";

/**
 * D1 `menu_closed` — "Remind me when they open".
 *
 * A closed kitchen was a dead end: the customer read "closed" and the only remaining move was to
 * remember to come back themselves. The kit puts this affordance on the closed menu (and the
 * nothing-open list) precisely so the closed state has an exit that isn't "give up".
 *
 * A toggle rather than a fire-and-forget button: the second most likely thing a customer does after
 * asking is change their mind, and a control that can't be undone teaches people not to press it.
 * Server state is the source of truth (the reminder outlives this screen, this session, and a
 * reinstall), so this reads it rather than holding a local flag.
 */
export function reopenReminderKey(restaurantId: string): [string, string] {
  return ["reopenReminder", restaurantId];
}

export function RemindWhenOpen({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }): React.ReactElement {
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: reopenReminderKey(restaurantId),
    queryFn: () => getReopenReminder(restaurantId),
    // The answer changes only when this customer acts, so don't spend a round trip re-asking on every
    // remount of a screen they're bouncing in and out of.
    staleTime: 5 * 60 * 1000,
  });
  const isSet = q.data?.set === true;

  const m = useMutation({
    mutationFn: () => (isSet ? clearReopenReminder(restaurantId) : setReopenReminder(restaurantId)),
    onSuccess: (res) => {
      qc.setQueryData(reopenReminderKey(restaurantId), res);
      if (res.alreadyOpen) {
        // The kitchen opened between the screen rendering and the tap. Banking a reminder that next
        // fires tomorrow morning would be a small lie, so the server declines and we say why.
        toast.show(`${restaurantName} is open now — pull to refresh the menu.`);
        return;
      }
      haptic("tap");
      toast.show(res.set ? `We'll tell you when ${restaurantName} opens.` : "Reminder off.");
    },
    onError: () => toast.show("Couldn't save that just now — try again."),
  });

  const onPress = useCallback(() => m.mutate(), [m]);
  const busy = m.isPending || q.isLoading;

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: isSet, busy }}
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
      {m.isPending ? (
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
