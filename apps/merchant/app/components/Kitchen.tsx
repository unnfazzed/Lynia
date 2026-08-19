import { KitchenBar } from "./KitchenBar";
import { KitchenNav } from "./KitchenNav";
import { ReconnectBanner } from "./ReconnectBanner";

/** The authenticated app shell — tablet-first 1024×680, degrades to phone (see .kitchen-shell in
 *  globals.css). Every authenticated route renders inside this. `backfillCount` (E2) is the number
 *  of orders the queue screen found that arrived while the tablet was dark — threaded down to the
 *  reconnect banner rather than computed here, since only the screen with a live queue knows it. */
export function Kitchen({
  active,
  backfillCount,
  children,
}: {
  active: string;
  backfillCount?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="kitchen-shell">
      <KitchenBar />
      <ReconnectBanner backfillCount={backfillCount} />
      <div className="kitchen-shell-body">
        <KitchenNav active={active} />
        <main className="kitchen-content">{children}</main>
      </div>
    </div>
  );
}
