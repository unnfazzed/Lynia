import type { RestaurantMenuDish } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import { isMerchantOpenNow, nextOpenDescription } from "@lynia/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFoodCart } from "../../src/food/cart-context";
import { formatMoney } from "../../src/logic/money";
import { useRestaurantMenu } from "../../src/query/use-restaurants";
import { Button, Card, EmptyState, Icon, Screen, SkeletonList, useToast } from "../../src/ui";
import { FoodThumb } from "../../src/ui/food/FoodThumb";
import { ItemSheet } from "../../src/ui/food/ItemSheet";
import { MenuRow } from "../../src/ui/food/MenuRow";
import { RemindWhenOpen } from "../../src/ui/food/RemindWhenOpen";

/** R2·1/R2·2 menu — category tabs mirror D-29's merchant-owned category order; the kitchen's own
 *  closed/open state is derived from `hours` (D1 does not yet know the customer's own address, so no
 *  distance/ETA line here — that lands with D2's checkout, which needs a dropoff anyway). */
export default function RestaurantMenuScreen(): React.ReactElement {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menu, isLoading, isError, refetch } = useRestaurantMenu(id, true);
  const cart = useFoodCart();

  const [categoryIdx, setCategoryIdx] = useState(0);
  const [openItem, setOpenItem] = useState<RestaurantMenuDish | null>(null);

  // R2·b1: recompute open/closed as time passes (hours are static data, no live push needed) so a
  // kitchen that closes mid-browse interrupts once instead of silently going stale.
  const [now, setNow] = useState(() => new Date());
  const [justClosed, setJustClosed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // Only interrupt on a genuine open→closed transition, not on first load of an already-closed shop.
  const prevOpenRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    if (!menu) return;
    const open = isMerchantOpenNow(menu.restaurant.hours, now);
    if (prevOpenRef.current === true && !open) setJustClosed(true);
    prevOpenRef.current = open;
  }, [menu, now]);

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  if (isError || !menu) {
    return (
      <Screen>
        <EmptyState icon="wifi-off" title="Couldn't load this menu" message="Check your connection and try again.">
          <Button label="Retry" onPress={refetch} />
        </EmptyState>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const restaurant = menu.restaurant;
  const open = isMerchantOpenNow(restaurant.hours, now);
  const closedReason = open ? null : "This kitchen is closed";
  const category = menu.categories[categoryIdx];
  const qtyInCartFor = (dishId: string): number => cart.cart.lines.filter((l) => l.dishId === dishId).reduce((s, l) => s + l.quantity, 0);

  const addToCart = (dish: RestaurantMenuDish, quantity: number, note: string): void => {
    const switched = cart.addItem(restaurant.id, restaurant.name, { dishId: dish.id, name: dish.name, priceUsd: dish.priceUsd, quantity, note });
    setOpenItem(null);
    if (switched) toast.show(`Started a new cart for ${restaurant.name} — your other cart was cleared`, "info");
    else toast.show(`Added ${dish.name}`, "success");
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: 4 }}>
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="chevron-right" size={20} color={tokens.color.ink} />
          </View>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <FoodThumb name={restaurant.name} photoUrl={restaurant.coverPhotoUrl} size={64} radius={14} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink }}>{restaurant.name}</Text>
            {restaurant.cuisineTags.length > 0 ? (
              <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }}>{restaurant.cuisineTags.join(" · ")}</Text>
            ) : null}
          </View>
        </View>

        {!open ? (
          <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
            <View style={{ flexDirection: "row", gap: 9 }}>
              <Icon name="clock" size={16} color={tokens.color.muted} />
              <Text style={{ flex: 1, fontSize: 13, color: tokens.color.ink, lineHeight: 18 }}>
                {restaurant.name} is closed. {nextOpenDescription(restaurant.hours, now) ?? "You can look, but you can't order yet."}
              </Text>
            </View>
            {/* The kit's `menu_closed` gives the closed state a way forward instead of a dead end. */}
            <RemindWhenOpen restaurantId={restaurant.id} restaurantName={restaurant.name} />
          </Card>
        ) : null}

        {menu.categories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {menu.categories.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryIdx(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: i === categoryIdx }}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  borderRadius: 999,
                  marginRight: 6,
                  borderWidth: 1,
                  borderColor: i === categoryIdx ? tokens.color.accent : tokens.color.line,
                  backgroundColor: i === categoryIdx ? tokens.color.accentWash : tokens.color.bg,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: i === categoryIdx ? tokens.color.accentText : tokens.color.muted }}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {category ? (
          category.dishes.length > 0 ? (
            category.dishes.map((dish) => (
              <MenuRow
                key={dish.id}
                dish={dish}
                qtyInCart={qtyInCartFor(dish.id)}
                disabledReason={closedReason}
                onPress={() => setOpenItem(dish)}
              />
            ))
          ) : (
            <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center", marginTop: 20 }}>Nothing in this category yet.</Text>
          )
        ) : (
          <EmptyState icon="utensils" title="No menu yet" message="This kitchen hasn't added any dishes." />
        )}
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>

      {cart.itemCount > 0 && cart.cart.restaurantId === restaurant.id ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: tokens.color.line,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>{cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink }}>{formatMoney(cart.subtotal)}</Text>
          </View>
          <Button label="View cart" onPress={() => router.push("/food/cart")} />
        </View>
      ) : null}

      {justClosed ? (
        <Pressable
          onPress={() => setJustClosed(false)}
          style={{ position: "absolute", inset: 0, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "center", padding: 18 }}
        >
          <Card>
            <View style={{ flexDirection: "row", gap: 9, marginBottom: 6 }}>
              <Icon name="clock" size={18} color={tokens.color.muted} />
              <Text style={{ fontSize: 16.5, fontWeight: "700", color: tokens.color.ink }}>{restaurant.name} just closed</Text>
            </View>
            <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 18, marginBottom: 4 }}>
              They stopped taking orders. Your cart is saved — nothing was ordered.
            </Text>
            <Button label="See other restaurants" onPress={() => router.push("/food")} />
            <Button label="Keep browsing" variant="ghost" onPress={() => setJustClosed(false)} />
          </Card>
        </Pressable>
      ) : null}

      {openItem ? (
        <ItemSheet dish={openItem} disabledReason={closedReason} onAdd={(qty, note) => addToCart(openItem, qty, note)} onClose={() => setOpenItem(null)} />
      ) : null}
    </Screen>
  );
}
