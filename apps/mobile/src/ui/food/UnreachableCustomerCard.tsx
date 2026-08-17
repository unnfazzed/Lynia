import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Linking, Text } from "react-native";
import { formatCountdown } from "./CountdownRing";
import { Button, Card, Sub } from "../index";

/**
 * D5/N-10: "can't reach the customer" — log at least 2 calls and wait 8:00 (both server-timestamped,
 * see logic/food-rider-job.ts's noShowStatus) before a no-show report is accepted. Reused as-is for
 * both the picked_up and en_route_dropoff legs (the server accepts a log-call at either).
 */
export function UnreachableCustomerCard({
  customerPhone,
  callsLogged,
  callsNeeded,
  waitRemainingMs,
  eligible,
  onLogCall,
  onReportNoShow,
  onReportRefused,
  logPending,
  reportPending,
}: {
  customerPhone: string | null;
  callsLogged: number;
  callsNeeded: number;
  waitRemainingMs: number;
  eligible: boolean;
  onLogCall: () => void;
  onReportNoShow: () => void;
  /** R-08: a distinct, separate failure — the customer WAS reached but refused/couldn't pay. */
  onReportRefused: () => void;
  logPending: boolean | "queued";
  reportPending: boolean | "queued";
}): React.ReactElement {
  return (
    <Card>
      <Text style={{ fontWeight: "700", marginBottom: 2 }}>Can&apos;t reach the customer?</Text>
      <Sub>Call at least twice and wait 8 minutes before reporting a no-show.</Sub>
      <Button
        label={customerPhone ? `Call customer (attempt ${callsLogged + 1})` : "Log a call attempt"}
        onPress={() => {
          if (customerPhone) void Linking.openURL(`tel:${customerPhone}`);
          onLogCall();
        }}
        loading={logPending}
        variant="ghost"
      />
      <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, marginTop: 4 }}>
        {callsLogged} call{callsLogged === 1 ? "" : "s"} logged
        {callsNeeded > 0 ? ` · ${callsNeeded} more needed` : waitRemainingMs > 0 ? ` · ${formatCountdown(waitRemainingMs)} left to wait` : " · ready to report"}
      </Text>
      <Button label="Report a no-show" onPress={onReportNoShow} loading={reportPending} disabled={!eligible} />
      <Button label="The customer refused the order" variant="ghost" onPress={onReportRefused} disabled={!!reportPending} />
    </Card>
  );
}
