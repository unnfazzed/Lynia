import { COMMISSION } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { useWalletConfig } from "../../src/query/use-wallet";
import { Heading, Screen, Sub } from "../../src/ui";
import { TopUpFlow } from "../../src/ui/rider/TopUpFlow";

/**
 * Rider top-up (kit `rider-screens-wallet.jsx`: amount → wait → success/declined).
 *
 * This screen has been three things. It is worth knowing which one you are looking at:
 *
 *  1. A self-serve form that ALWAYS failed. `POST /wallet/topups` opens a real intent, but
 *     `WalletService.creditFromTopup` — the only path that can confirm one — had no caller, so every
 *     attempt ran the 90s window down and landed on "The request expired". A live, user-facing,
 *     permanently-broken money flow (`DOC-16-02` in docs/KNOWN_BUGS.md).
 *  2. Then a "call support to top up" screen, and later a mock of the kit's four screens — honest
 *     about the missing rail, but not a client of anything.
 *  3. Now (2026-08-13, owner instruction: *"assume the rail will be fully implemented and i want the
 *     set up like its fully implemented"*) the REAL client again — but complete this time, which is
 *     what state 1 never was: idempotent creation, server-driven outcome, a durable `PendingTopup`
 *     marker so an app kill mid-wait is recoverable, and balance/ledger invalidation on a
 *     server-reported success.
 *
 * The difference between 1 and 3 is not the rail — that is still missing — it is that nothing here
 * pretends. A success renders only when the server says `succeeded`, an expiry is labelled an expiry,
 * and the support-call route that actually credits a balance today is on the screen throughout. When a
 * rail lands and calls `creditFromTopup`, this starts working with no change to the app.
 *
 * See `src/ui/rider/TopUpFlow.tsx` and `docs/PAYMENT-RAIL-OUTSTANDING.md`.
 */
export default function TopUpScreen(): React.ReactElement {
  const router = useRouter();
  const { config } = useWalletConfig();

  return (
    <Screen>
      <Heading>Top up</Heading>
      <Sub>Add to your prepaid commission balance.</Sub>
      <TopUpFlow
        minTopUp={config?.minTopUp ?? COMMISSION.minTopUp}
        maxTopUp={config?.maxTopUp ?? COMMISSION.maxTopUp}
        onExit={() => router.back()}
      />
    </Screen>
  );
}
