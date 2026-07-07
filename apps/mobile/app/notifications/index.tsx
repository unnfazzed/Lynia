import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getNotificationsFeed, type NotificationRow } from "../../src/api/notifications";
import { Button, EmptyState, Heading, Icon, Screen, SkeletonList } from "../../src/ui";

/**
 * A compact relative-time label for the feed (mockup A·3: "now", "2 min", "1 hr", "Yesterday").
 * Deterministic off the row's ISO time — no locale surprises. Falls back to a short date past a week.
 */
function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** One notification: mint-wash icon tile, title, message, relative time, and an unread dot. Tapping
 *  opens the order it's about — the row's whole point (e.g. "tap to rate your rider", "tap for
 *  details") was previously a dead end with no way to reach that order from the centre itself. */
function Row({ n, onPress }: { n: NotificationRow; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${n.title}: ${n.message}`}
      style={{ flexDirection: "row", gap: tokens.space.md, paddingVertical: tokens.space.md, borderBottomWidth: 1, borderBottomColor: tokens.color.line }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: tokens.color.accentWash,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={n.icon} size={18} color={tokens.color.accentText} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>{n.title}</Text>
        <Text style={{ fontSize: 12.5, color: tokens.color.muted, lineHeight: 18, marginTop: 1 }}>{n.message}</Text>
        <Text style={{ fontSize: 11, color: tokens.color.muted, marginTop: 2, fontVariant: ["tabular-nums"] }}>{fmtRelative(n.at)}</Text>
      </View>
      {n.unread ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.color.accent, flexShrink: 0, marginTop: 6 }} />
      ) : null}
    </Pressable>
  );
}

export default function NotificationsScreen(): React.ReactElement {
  const router = useRouter();
  const feedQ = useQuery({ queryKey: ["notifications"], queryFn: getNotificationsFeed });

  return (
    <Screen>
      <Heading>Notifications</Heading>
      {feedQ.isLoading ? (
        <SkeletonList />
      ) : feedQ.isError ? (
        <EmptyState icon="wifi-off" title="Couldn't load notifications" message="Check your connection and try again.">
          <Button label="Retry" onPress={() => void feedQ.refetch()} />
        </EmptyState>
      ) : (feedQ.data ?? []).length === 0 ? (
        <EmptyState icon="inbox" title="No notifications yet" message="Offers, delivery updates and account news will show up here." />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {(feedQ.data ?? []).map((n) => (
            <Row key={n.id} n={n} onPress={() => router.push(`/order/${n.orderId}`)} />
          ))}
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      )}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
