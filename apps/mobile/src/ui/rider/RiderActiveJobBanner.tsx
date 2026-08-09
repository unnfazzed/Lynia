import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import type { OrderSnapshot } from "../../api/orders";
import { formatMoney } from "../../logic/money";
import { Button, Card, Icon, statusPillLabel } from "../index";

/**
 * UX20-01: mirrors the customer home screen's ActiveOrderCheckFailedBanner — a rider with a genuine
 * assigned job who hits a query error on this check would otherwise see the ordinary online/board UI
 * with zero indication their active-job check failed and zero way back to /rider/job.
 */
function ActiveJobCheckFailedBanner({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }): React.ReactElement {
  return (
    <Card style={{ borderColor: tokens.color.danger }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: 2 }}>
        <Icon name="wifi-off" size={18} color={tokens.color.danger} />
        <Text style={{ fontWeight: "700", color: tokens.color.ink }}>Couldn&apos;t check for an active job</Text>
      </View>
      <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted }}>
        If you have an assigned delivery, retry to find your way back to it.
      </Text>
      <Button label="Retry" variant="ghost" onPress={onRetry} loading={retrying} />
    </Card>
  );
}

/**
 * The rider board's active-job banner, shared between the FlatList and ScrollView return branches
 * of `rider/(tabs)/index.tsx` (RF-22, extracted from that screen's hoisted `activeJobBanner` const).
 */
export function RiderActiveJobBanner({
  activeJob,
  isError,
  isFetching,
  onRetry,
  onOpenJob,
}: {
  activeJob: OrderSnapshot | null;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onOpenJob: () => void;
}): React.ReactElement | null {
  if (activeJob) {
    return (
      <Card accent>
        {activeJob.status === "assigned" ? (
          // The win state (3·3): a customer just picked this rider — say so, don't mumble.
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: 2 }}>
              <Icon name="check" size={18} color={tokens.color.accentText} />
              <Text style={{ fontWeight: "700", color: tokens.color.ink }}>A customer picked you!</Text>
            </View>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
              {activeJob.pickup.landmark} → {activeJob.dropoff.landmark} · {formatMoney(activeJob.agreedFare ?? activeJob.proposedFare)}
            </Text>
          </>
        ) : (
          <Text style={{ fontWeight: "700", color: tokens.color.ink }}>You have an active job ({statusPillLabel(activeJob.status)})</Text>
        )}
        {/* Ghost: the accent-bordered card already carries the emphasis — one primary per state. */}
        <Button label="Open job" variant="ghost" onPress={onOpenJob} />
      </Card>
    );
  }
  if (isError) {
    return <ActiveJobCheckFailedBanner onRetry={onRetry} retrying={isFetching} />;
  }
  return null;
}
