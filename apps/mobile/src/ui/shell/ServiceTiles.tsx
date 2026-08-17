import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "../Icon";

export type ServiceTile = {
  id: string;
  icon: IconName;
  label: string;
  sub: string;
  bg: string;
  soon?: boolean;
};

/** The default superapp launcher services. Adding a vertical is one more tile, never a nav change. */
export const SERVICES: ServiceTile[] = [
  { id: "express", icon: "package", label: "Send", sub: "Parcel", bg: tokens.color.accent },
  { id: "food", icon: "utensils", label: "Food", sub: "Restaurants", bg: tokens.color.accent },
  { id: "pharm", icon: "plus", label: "Pharmacy", sub: "Soon", bg: tokens.color.line, soon: true },
];

/**
 * `RESTAURANTS_ENABLED` escape hatch (plan §1: "flags become kill switches, not reveal tools"): with
 * the flag off, Food degrades to the same grey/non-interactive "Soon" treatment Pharmacy already
 * uses, rather than disappearing outright — so the grid never reflows and support can flip the
 * switch back without a release. `SERVICES` itself never gets a flag import; callers derive the
 * list to render from the fetched flag, keeping this pure and easy to unit test.
 *
 * Reachable only from a live server `false` since 2026-08-12 — `useFeatureFlags` defaults
 * `restaurantsEnabled` to true (restaurants is launched), so the "Soon" tile is no longer painted
 * as a cold-start frame before the flags fetch resolves.
 */
export function getServiceTiles(restaurantsEnabled: boolean): ServiceTile[] {
  if (restaurantsEnabled) return SERVICES;
  return SERVICES.map((s) => (s.id === "food" ? { ...s, sub: "Soon", bg: tokens.color.line, soon: true } : s));
}

/**
 * Lynia service tiles — the launcher grid on the root home. 62px round-square icon tiles, label +
 * sub beneath, equal columns. Soon-tiles render grey and non-interactive.
 */
export function ServiceTiles({
  services = SERVICES,
  columns,
  onService,
  dim = false,
}: {
  services?: ServiceTile[];
  columns?: number;
  onService?: (id: string) => void;
  dim?: boolean;
}): React.ReactElement {
  const cols = columns ?? Math.min(services.length, 4);
  return (
    <View style={{ flexDirection: "row", opacity: dim ? 0.5 : 1 }}>
      {services.map((s) => {
        const live = !s.soon && !!onService;
        return (
          <Pressable
            key={s.id}
            onPress={live ? () => onService?.(s.id) : undefined}
            disabled={!live}
            accessibilityRole={live ? "button" : undefined}
            accessibilityLabel={`${s.label} — ${s.sub}`}
            style={{ flex: 1 / cols, alignItems: "center", gap: 7, paddingVertical: 4 }}
          >
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 20,
                backgroundColor: s.bg,
                alignItems: "center",
                justifyContent: "center",
                ...(s.soon ? null : tokens.shadow.card),
              }}
            >
              <Icon name={s.icon} size={27} color={s.soon ? tokens.color.muted : tokens.color.onAccent} />
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: s.soon ? tokens.color.muted : tokens.color.ink }}>{s.label}</Text>
              <Text style={{ fontSize: 12, color: tokens.color.muted }}>{s.sub}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
