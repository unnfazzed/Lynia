import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { groupByDay } from "../../logic/rider-earnings";
import { useNow } from "../../logic/use-now";
import { useFleetMoney } from "../../query/use-my-fleet";
import { emptyCopy, EmptyRow, fillEmpty, SkeletonRows } from "..";
import { hhmm, RIDER_COPY as R, usd } from "./copy";
import { OBB } from "./fleet-copy";
import { LRow, RLabel, TABULAR } from "./kit";
import { useAutoRetry } from "./RiderErrorState";

/**
 * OB-R10 · Money for one of a business's own bikers (Own bikers v1, ledger D-117): the gold hero "Cash with you · owed
 * to Chicken Inn Avondale $14.00 · Hand it to the counter after each job.", then HISTORY by day — "Collected · #B204
 * +$14.00", "Returned to Chicken Inn −$9.50" — in ink, since none of it is theirs. No earnings, no commission, no top-up.
 * A failed read retries by itself (rider screens have no Retry button).
 */
export function FleetMoney({ shop, bottomPad, scrollRef }: { shop: string; bottomPad: number; scrollRef?: React.Ref<ScrollView> }): React.ReactElement {
  const now = useNow();
  const q = useFleetMoney();
  const data = q.data ?? null;
  const name = data?.shop || shop;
  const groups = data ? groupByDay(data.lines, (l) => new Date(l.at), now, OBB.todayH, R.yesterday) : [];
  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 12 }} showsVerticalScrollIndicator={false}>
      <View style={{ backgroundColor: tokens.color.highlightWash, borderWidth: 1, borderColor: tokens.color.highlightBorder, borderRadius: 16, padding: 16, gap: 4 }}>
        <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightInk }}>{OBB.cashHero(name)}</Text>
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 40, lineHeight: 48, fontWeight: tokens.font.weight.bold, letterSpacing: -0.8, color: tokens.color.ink, ...TABULAR }}>
          {data ? usd(Number(data.cashHeld)) : "—"}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{OBB.cashHeroB}</Text>
      </View>
      <RLabel style={{ marginTop: 8 }}>{OBB.history}</RLabel>
      {q.isLoading ? (
        <SkeletonRows count={3} />
      ) : !data ? (
        <FleetMoneyRetry onRetry={() => void q.refetch()} />
      ) : data.lines.length === 0 ? (
        <EmptyRow disc icon="receipt" text={emptyCopy.rider.noJobsToday} style={{ paddingVertical: 4 }} />
      ) : (
        <View>
          {groups.map((g) => (
            <View key={g.label}>
              <RLabel style={{ fontSize: 11, marginTop: 4, marginBottom: 2 }}>{g.label}</RLabel>
              {g.items.map((l, i) => (
                <LRow
                  key={`${l.kind}${l.ref}${l.at}`}
                  first={i === 0}
                  icon="banknote"
                  title={l.kind === "collected" ? OBB.hCollected(l.ref) : OBB.hReturned(name)}
                  meta={hhmm(new Date(l.at))}
                  text={`${l.kind === "collected" ? "+" : "−"}${usd(Number(l.amount))}`}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function FleetMoneyRetry({ onRetry }: { onRetry: () => void }): React.ReactElement {
  const left = useAutoRetry(onRetry, 20);
  return <Text style={{ fontSize: 13, lineHeight: 19, color: tokens.color.muted }}>{fillEmpty(emptyCopy.rider.retrying, { s: left })}</Text>;
}
