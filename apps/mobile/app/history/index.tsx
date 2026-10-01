import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { SectionList, Text, View } from "react-native";
import type { OrderHistoryRow } from "../../src/api/orders";
import { groupByDay, isRiderRow, matchesService, paidFare, type ServiceFilter, summarise } from "../../src/logic/rider-earnings";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { useHistoryFeed } from "../../src/query/use-history-feed";
import { AppScreen, Button, SkeletonRows, Tappable } from "../../src/ui";
import { Notice } from "../../src/ui/send/kit";
import { hhmm, RIDER_COPY as R, RF, usd } from "../../src/ui/rider/copy";
import { CentreState, Chips, LRow, PushHeader, RLabel } from "../../src/ui/rider/kit";

function title(o: OrderHistoryRow): string {
  const from = o.orderType === "merchant" ? o.merchantName || o.pickup.landmark : o.pickup.landmark;
  return `${from || R.stPickup} → ${o.dropoff.landmark || R.stDrop}`;
}

// A placed food order opens the food tracker (`app/order/[id].tsx` has no food handling). That
// tracker is customer-only, so a food job the rider CARRIED stays on `/order/:id`, which renders the
// rider viewer.
function orderHref(o: OrderHistoryRow): string {
  return o.role === "customer" && o.orderType === "merchant" ? `/food/order/${o.id}` : `/order/${o.id}`;
}

function outcome(o: OrderHistoryRow): string {
  if (o.status === "delivered" || o.status === "completed") return R.delivered;
  if (o.status === "undelivered") return R.undelivered;
  if (o.status === "cancelled") return R.cancelled;
  return o.status;
}

/**
 * Job history (Rider v2 C12) and Trip history (C13), split by side (ledger D-54): `?side=rider` lists
 * only jobs the rider carried, with the fare (green) and a this-week summary; `?side=customer` lists
 * only orders the customer placed, with the price in ink. Rows group by day; a row opens its order.
 */
export default function HistoryScreen(): React.ReactElement {
  const router = useRouter();
  const { side } = useLocalSearchParams<{ side?: string }>();
  const rider = side === "rider";
  const now = useNow();
  const { merchantDispatchAutoEnabled } = useFeatureFlags();
  const { rows, showingStale, isFetching, hasLiveData, refetch } = useHistoryFeed();
  const [filter, setFilter] = useState<ServiceFilter>("all");

  const mine = useMemo(() => (rows ?? []).filter((r) => (rider ? isRiderRow(r) : r.role === "customer")), [rows, rider]);
  const shown = useMemo(() => (rider ? mine.filter((r) => matchesService(r, filter)) : mine), [mine, rider, filter]);
  const sections = useMemo(
    () => groupByDay(shown, (r) => new Date(r.createdAt), now, R.todayH, R.yesterday).map((g) => ({ title: g.label, data: g.items })),
    [shown, now],
  );
  const week = rider ? summarise(mine, "week", now) : null;

  const renderRow = (o: OrderHistoryRow, first: boolean): React.ReactElement => {
    const at = new Date(o.createdAt);
    const time = Number.isNaN(at.getTime()) ? "" : rider ? hhmm(at) : at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const fare = paidFare(o);
    const price = Number(o.agreedFare ?? o.proposedFare);
    return (
      <Tappable onPress={() => router.push(orderHref(o))} accessibilityRole="button">
        <LRow
          first={first}
          icon={o.orderType === "merchant" ? "utensils" : "package"}
          title={title(o)}
          meta={RF.lMeta(outcome(o), time)}
          amount={rider && fare != null ? fare : undefined}
          text={rider ? (fare == null ? R.noFare : undefined) : usd(Number.isFinite(price) ? price : 0)}
        />
      </Tappable>
    );
  };

  return (
    <AppScreen banner={<PushHeader title={rider ? R.tJobHist : R.tTripHist} onBack={() => router.back()} />}>
      {rows ? (
        <SectionList
          sections={sections}
          keyExtractor={(o) => o.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 12 }}>
              {showingStale ? <Notice icon="wifi-off" text="Showing your last saved trips — we'll refresh when you're back online." /> : null}
              {week ? (
                <View style={{ backgroundColor: tokens.color.accentWash, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>
                    {RF.histWeek(week.jobs, week.total)}
                  </Text>
                </View>
              ) : null}
              {rider && merchantDispatchAutoEnabled ? (
                <Chips
                  list={[
                    { id: "all", label: R.all },
                    { id: "parcel", label: R.parcels },
                    { id: "food", label: R.foodF },
                  ]}
                  value={filter}
                  onChange={setFilter}
                />
              ) : null}
              {!rider && shown.length === 0 && hasLiveData ? <Text style={{ fontSize: 14, color: tokens.color.muted }}>{R.tripsEmpty}</Text> : null}
            </View>
          }
          renderSectionHeader={({ section }) => <RLabel style={{ fontSize: 11, marginTop: 8 }}>{section.title}</RLabel>}
          renderItem={({ item, index }) => renderRow(item, index === 0)}
        />
      ) : isFetching ? (
        <View style={{ padding: 16 }}>
          <SkeletonRows />
        </View>
      ) : (
        <CentreState icon="wifi-off" title="Couldn't load your trips" body="Check your connection and try again.">
          <Button label="Retry" onPress={refetch} loading={isFetching} />
        </CentreState>
      )}
    </AppScreen>
  );
}

