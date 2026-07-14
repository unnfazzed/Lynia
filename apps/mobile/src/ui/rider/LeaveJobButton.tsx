import React from "react";
import { Alert } from "react-native";
import { Button } from "../index";

/**
 * The rider job screen's "Back" action, extracted from app/rider/job.tsx. That screen only reaches
 * its live-job render branch for a non-terminal order (assigned…en_route_dropoff), where
 * useRiderLocationStream and useRiderJobSocket are actively streaming the customer's tracking and
 * this job's own socket — leaving unmounts both with zero warning to the rider. Gate navigation
 * behind a confirm while active; an inactive/terminal caller navigates straight through.
 */
export function LeaveJobButton({ isActive, onLeave }: { isActive: boolean; onLeave: () => void }): React.ReactElement {
  return (
    <Button
      label="Back"
      variant="ghost"
      onPress={() => {
        if (!isActive) {
          onLeave();
          return;
        }
        Alert.alert(
          "Leave this delivery?",
          "Your customer's live tracking pauses while you're away from this screen, and you won't get instant updates about this job. Come back anytime from the board.",
          [
            { text: "Stay", style: "cancel" },
            { text: "Leave anyway", style: "destructive", onPress: onLeave },
          ],
        );
      }}
    />
  );
}
