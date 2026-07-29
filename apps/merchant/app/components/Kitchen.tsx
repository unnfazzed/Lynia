import { KitchenBar } from "./KitchenBar";
import { KitchenNav } from "./KitchenNav";
import { RearmBanner } from "./RearmBanner";
import { ReconnectBanner } from "./ReconnectBanner";

/** The authenticated app shell — tablet-first 1024×680, degrades to phone (see .kitchen-shell in
 *  globals.css). Every authenticated route renders inside this. */
export function Kitchen({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="kitchen-shell">
      <KitchenBar />
      <RearmBanner />
      <ReconnectBanner />
      <div className="kitchen-shell-body">
        <KitchenNav active={active} />
        <main className="kitchen-content">{children}</main>
      </div>
    </div>
  );
}
