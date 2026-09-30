import { KitchenNav, type MerchantTab } from "./KitchenNav";
import { ReconnectBanner } from "./ReconnectBanner";

/** Which tab each older screen id belongs to, while the account pages still render inside the tab
 *  shell (they become pushed screens under Account as each is redrawn). */
const TAB_FOR: Record<string, MerchantTab> = {
  queue: "orders",
  deliveries: "orders",
  catalog: "catalog",
  money: "money",
  account: "account",
  shop: "account",
  hours: "account",
  ordering: "account",
  riders: "account",
  team: "account",
};

/**
 * The authenticated app shell — the merchant-mobile redesign's phone frame (packages/design/handoff/
 * merchant-mobile): the offline bar when the connection is lost, the screen's own header and body, and
 * the bottom tab bar. A root screen draws its own mint header as the first child.
 *
 * `backfillCount` is the number of orders the queue screen found that arrived while the phone was
 * offline — threaded to the reconnect note, since only the screen with a live queue knows it.
 */
export function Kitchen({
  active,
  backfillCount,
  tabs = true,
  children,
}: {
  active: string;
  backfillCount?: number;
  /** False on a pushed screen (an AppBar with a back chevron instead of the tab bar). */
  tabs?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="m-app">
      <ReconnectBanner backfillCount={backfillCount} />
      <main className="m-scroll">{children}</main>
      {tabs && <KitchenNav active={TAB_FOR[active] ?? "orders"} />}
    </div>
  );
}
