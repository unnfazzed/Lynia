import { useRouter } from "expo-router";
import { useEffect } from "react";
import { loadPendingShop } from "./pending-shop";

let handedOver = false;

/**
 * Home's hand-over to a shop share link (D-129, README §2 "Signed out"): every way out of sign-up lands on Home
 * (after the permission asks), so Home opens `/s/<CODE>` when a link is pending. Once per app run once it has handed over: Back from a
 * link that couldn't open (SH-A5 keeps the code for Try again) must not bounce the customer straight back.
 */
export function usePendingShopHandoff(): void {
  const router = useRouter();
  useEffect(() => {
    if (handedOver) return;
    void loadPendingShop().then((p) => {
      if (!p || handedOver) return;
      handedOver = true;
      router.push({ pathname: "/s/[code]", params: { code: p.code } });
    });
  }, [router]);
}

/** Tests only. */
export function resetPendingShopHandoffForTests(): void {
  handedOver = false;
}
