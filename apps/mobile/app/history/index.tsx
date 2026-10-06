import { tokens } from "@lynia/shared/tokens";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { SectionList, Text, View } from "react-native";
import type { OrderHistoryRow } from "../../src/api/orders";
import { groupByDay, isRiderRow, matchesService, paidFare, type ServiceFilter, summarise } from "../../src/logic/rider-earnings";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { useHistoryFeed } from "../../src/query/use-history-feed";
import { AppScreen, EmptyState, emptyCopy, fillEmpty, SkeletonRows, Tappable } from "../../src/ui";
import { Notice } from "../../src/ui/send/kit";
import { hhmm, RIDER_COPY as R, RF, usd } from "../../src/ui/rider/copy";
import { Chips, LRow, PushHeader, RLabel } from "../../src/ui/rider/kit";
import { useAutoRetry } from "../../src/ui/rider/RiderErrorState";

function title(o: OrderHistoryRow): string {
  const from = o.orderType === "merchant" ? o.merchantName || o.pickup.landmark : o.pickup.landmark;
  return `${from || R.stPickup} → ${o.dropoff.landmark || R.stDrop}`;
}

// Every order opens the one order screen (`app/order/[id].tsx`, D-59): it draws a placed food order
// with the Order flow v2 stages, and a food job the rider CARRIED with the After Send
// rider viewer.
function orderHref(o: OrderHistoryRow): string {
  return `/order/${o.id}`;
}

function outcome(o: OrderHistoryRow): string {
  if (o.status === "delivered" || o.status === "completed") return R.delivered;
  if (o.status === "undelivered") return R.undelivered;
  if (o.status === "cancelled") return R.cancelled;
  return o.status;
}

/**
 * Job history (Rider v2 C12, ledger D-54): only jobs the rider carried, with the fare (green) and a
 * this-week summary. Rows group by day; a row opens its order. The customer's Trip history (C13) is
 * retired — Orders is the customer's only history (Orders v2, D-63) — so any other `side` lands there.
 */
export default function HistoryRoute(): React.ReactElement {
  const { side } = useLocalSearchParams<{ side?: string }>();
  return side === "rider" ? <JobHistoryScreen /> : <Redirect href="/orders" />;
}

function JobHistoryScreen(): React.ReactElement {
  const router = useRouter();
  const now = useNow();
  const { merchantDispatchAutoEnabled } = useFeatureFlags();
  const { rows, showingStale, isFetching, refetch } = useHistoryFeed();
  const [filter, setFilter] = useState<ServiceFilter>("all");

  const mine = useMemo(() => (rows ?? []).filter(isRiderRow), [rows]);
  const shown = useMemo(() => mine.filter((r) => matchesService(r, filter)), [mine, filter]);
  const sections = useMemo(
    () => groupByDay(shown, (r) => new Date(r.createdAt), now, R.todayH, R.yesterday).map((g) => ({ title: g.label, data: g.items })),
    [shown, now],
  );
  const week = summarise(mine, "week", now);

  const renderRow = (o: OrderHistoryRow, first: boolean): React.ReactElement => {
    const at = new Date(o.createdAt);
    const time = Number.isNaN(at.getTime()) ? "" : hhmm(at);
    const fare = paidFare(o);
    return (
      <Tappable onPress={() => router.push(orderHref(o))} accessibilityRole="button">
        <LRow
          first={first}
          icon={o.orderType === "merchant" ? "utensils" : "package"}
          title={title(o)}
          meta={RF.lMeta(outcome(o), time)}
          amount={fare != null ? fare : undefined}
          text={fare == null ? R.noFare : undefined}
        />
      </Tappable>
    );
  };

  return (
    <AppScreen banner={<PushHeader title={R.tJobHist} onBack={() => router.back()} />}>
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
              {/* Plain text, not a banner: "This week · 0 jobs · $0.00" (empty-states v2, D-78). */}
              <WeekLine jobs={week.jobs} total={week.total} />
              {merchantDispatchAutoEnabled ? (
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
            </View>
          }
          renderSectionHeader={({ section }) => <RLabel style={{ fontSize: 11, marginTop: 8 }}>{section.title}</RLabel>}
          renderItem={({ item, index }) => renderRow(item, index === 0)}
          ListEmptyComponent={<EmptyState icon="bike" title={emptyCopy.rider.historyEmpty.title} body={emptyCopy.rider.historyEmpty.body} offsetTop={HISTORY_EMPTY_TOP} />}
        />
      ) : isFetching ? (
        <View style={{ padding: 16 }}>
          <SkeletonRows />
        </View>
      ) : (
        <LoadFailed onRetry={refetch} />
      )}
    </AppScreen>
  );
}

/** The empty list's mark sits this far below the summary and chips, as drawn. */
const HISTORY_EMPTY_TOP = 56;

/** "This week · 0 jobs · $0.00": the label muted, the figures 600 ink (empty-states v2, D-78). */
function WeekLine({ jobs, total }: { jobs: number; total: number }): React.ReactElement {
  // One job reads "1 job", not the template's "1 jobs".
  const line = fillEmpty(emptyCopy.rider.historySummary, { count: jobs, amount: usd(total) }).replace(" 1 jobs ", " 1 job ");
  const cut = line.indexOf(" · ");
  const label = line.slice(0, cut);
  const fig = line.slice(cut + 3);
  return (
    <Text style={{ fontSize: 14, lineHeight: 20.3, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
      {`${label} · `}
      <Text style={{ fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{fig}</Text>
    </Text>
  );
}

/** Couldn't load and nothing saved: say what the app is doing, and do it (no Retry button on rider screens). */
function LoadFailed({ onRetry }: { onRetry: () => void }): React.ReactElement {
  const left = useAutoRetry(onRetry);
  return <EmptyState icon="wifi-off" tone="info" title="Couldn't load your trips" body={fillEmpty(emptyCopy.rider.retrying, { s: left })} />;
}
