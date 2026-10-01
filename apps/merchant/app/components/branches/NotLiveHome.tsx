import Link from "next/link";
import type { MerchantBusinessType } from "@lynia/shared";
import { Icon } from "../icons";

/**
 * B1 / D1 · not live yet (merchant-mobile README section F; handoff branches/README.md §5): a branch
 * LyniaGo hasn't switched on. "Almost ready", the call it waits for, "Check your menu" (shop: items) and
 * "Set opening hours". Only an owner with 2+ branches sees it (ledger D-51).
 */
export function NotLiveHome({ businessType }: { businessType: MerchantBusinessType }) {
  const shop = businessType === "shop";
  return (
    <div className="m-notlive">
      <div className="m-notlive-ic">
        <Icon name="store" size={30} color="var(--muted)" />
      </div>
      <b>Almost ready</b>
      <p>LyniaGo will call you to switch this branch on. Customers can’t see it until then.</p>
      <Link href="/menu" className="m-gh">
        <Icon name={shop ? "package" : "utensils"} size={16} />
        {shop ? "Check your items" : "Check your menu"}
      </Link>
      <Link href="/hours" className="m-lnk">
        Set opening hours
      </Link>
    </div>
  );
}
