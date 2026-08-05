import { tokens } from "@lynia/shared";
import React from "react";
import { View } from "react-native";
import { Button, EmptyState } from "../index";

/**
 * The kit's `generic_error` (`explorations/journey/rider-screens.jsx` — `GenericError`): "Something
 * went wrong … your active job is safe" with Try again / Back to board.
 *
 * The reassurance is the whole point of the screen and it's load-bearing for a rider: a failed READ
 * (the active-job poll, the food-order read) never touches the order server-side, so the job the
 * rider is carrying is exactly where they left it. Before this, both rider job screens fell back to a
 * bare "Couldn't load your job" — honest about the failure, silent about the one thing the rider is
 * actually anxious about mid-delivery.
 *
 * Deliberately NOT used for a network-shaped failure that already has a better, more specific screen
 * (job.tsx's offline cold-start still paints the last-known job summary first) — this is the
 * unclassified "that didn't load" fallback underneath it.
 */
export function RiderErrorState({
  onRetry,
  retrying,
  onBack,
  backLabel = "Back to board",
  /** Override the kit's copy where a screen genuinely knows more (e.g. "we couldn't load the order"). */
  title = "Something went wrong",
  message = "That didn't load. Check your connection and try again — your active job is safe.",
}: {
  onRetry: () => void;
  retrying?: boolean;
  onBack: () => void;
  backLabel?: string;
  title?: string;
  message?: string;
}): React.ReactElement {
  return (
    <View>
      <EmptyState icon="circle-alert" title={title} message={message}>
        <Button label="Try again" onPress={onRetry} loading={retrying} />
        <Button label={backLabel} variant="ghost" onPress={onBack} />
      </EmptyState>
      <View style={{ height: tokens.space.md }} />
    </View>
  );
}
