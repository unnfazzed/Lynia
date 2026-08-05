"use client";

import { tokens } from "@lynia/shared";
import { ConfirmModal } from "../../components/ConfirmModal";
import { REASONS } from "../../lib/reasons";
import { creditRiderWallet } from "../actions";
import { IconWifiOff } from "../../components/icons";

/**
 * DOC-16-03 rider-wallet credit control. A reason-coded <ConfirmModal> with an amount field that posts a
 * manual prepaid credit (the launch top-up rail). `auditInEndpoint` because WalletService.creditManual
 * writes the ledger + audit row transactionally — the modal must NOT also POST a standalone audit row.
 * Inert off the connected path.
 */
export function WalletCreditButton({ id, name, connected }: { id: string; name: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="rider.wallet_credit"
      auditInEndpoint
      target={name}
      path={`/riders/${id}`}
      triggerLabel="Credit account…"
      triggerVariant="solid"
      disabled={!connected}
      title={`Credit ${name}'s commission account?`}
      consequence="Adds a manual prepaid credit to this rider's commission balance (e.g. a launch grace credit or a support correction). It lands on the wallet ledger below, attributed to you."
      amount={{ label: "Amount", prefix: "$", placeholder: "0.00", required: true }}
      noteRequired
      notePlaceholder="Why this credit — shows on the ledger (e.g. launch grace, support adjustment)."
      confirmLabel="Credit account"
      onConfirm={(v) => creditRiderWallet(id, v.amount, v.note, v.idempotencyKey)}
    />
  );
}

/**
 * `commission_freeze` wallet hold — kit `riders.html` lines 226-228 / 256-257, design OV-4A
 * (`docs/plans/2026-rider-wallet-design.md`: "a wallet freeze is a `Rider.heldReason:
 * "commission_freeze"` hold — admin-clear-only exactly like the RH-01 `velocity` pattern").
 *
 * ─── WIRING STATUS: BOTH ACTIONS ARE DELIBERATELY DEAD ─────────────────────────────────────────
 * Three separate things are missing api-side, and each on its own is enough to make a live control here
 * dishonest:
 *  1. NO WRITE. Nothing in `apps/api/src` ever writes `heldReason = "commission_freeze"`. The admin
 *     rider mutations are suspend / lift / ban / clear-hold; there is no set-hold route at all.
 *     `@lynia/shared`'s `HeldReason` union is still `reliability | velocity` — the design's third value
 *     was never added, so `"commission_freeze"` is not yet a legal hold reason.
 *  2. NO READ. Neither `GET /admin/riders/:id` (`getRiderDetail` selects `onHold`, never `heldReason`)
 *     nor `GET /admin/riders/:id/wallet` (`walletView` returns balance + ledger only) reports freeze
 *     state, so the console cannot tell a frozen wallet from a healthy one — `RiderDetail.status ===
 *     "on_hold"` says a rider is held but never WHY.
 *  3. NO ENFORCEMENT. `WalletService` checks no hold on any credit or top-up path, so even a
 *     hand-set freeze would not actually disable top-ups the way the copy promises.
 * `POST /admin/riders/:id/clear-hold` exists and is already bound to the reliability "Clear hold…"
 * button, but it clears ANY hold indiscriminately (`onHold: false, heldReason: null`) — pointing
 * "Clear wallet freeze" at it would let ops clear a *reliability* hold while believing they cleared a
 * *wallet* one. That is a worse failure than an unfinished button, so it is not wired.
 *
 * Both triggers are therefore hard-disabled, `auditInEndpoint` prevents an audit row for an action that
 * never happened, and `onConfirm` throws as a tripwire if either is ever enabled ahead of the API.
 */
export function WalletFreezeActions({
  id,
  name,
  frozen,
}: {
  id: string;
  name: string;
  /** `true` frozen · `false` not frozen · `undefined` the API doesn't report freeze state (today's
   *  reality — see `WalletView.frozen`). `undefined` must NOT be rendered as "not frozen". */
  frozen: boolean | undefined;
}) {
  const unknown = frozen === undefined;
  // While the state is unknown, offer BOTH actions rather than guessing which one applies — showing
  // only "Freeze wallet…" would silently assert the wallet is currently unfrozen.
  const showFreeze = unknown || frozen === false;
  const showClear = unknown || frozen === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="offline-banner" style={{ padding: "10px 14px", fontSize: 12.5, marginBottom: 0 }}>
        <IconWifiOff />
        <span>
          <b>Not yet wired — there is no wallet-freeze endpoint.</b> The API never sets or reports a{" "}
          <span className="mono">commission_freeze</span> hold, so the console can neither apply one nor
          tell you whether one is already in place, and a freeze would not currently block top-ups. These
          controls stay disabled until that ships. To stop a rider earning today, use{" "}
          <b>Suspend rider…</b> above — that is enforced.
        </span>
      </div>

      {showFreeze ? (
        <ConfirmModal
          action="rider.wallet_freeze"
          auditInEndpoint // nothing to audit — no endpoint runs. See the header comment.
          target={name}
          path={`/riders/${id}`}
          triggerLabel="Freeze wallet…"
          triggerVariant="danger"
          danger
          disabled // hard-disabled: unwired, not merely offline
          title={`Freeze ${name}'s wallet?`}
          consequence={
            <span>
              Places a <b>commission_freeze</b> hold. Top-ups are disabled and the rider can&apos;t clear it
              themselves — an admin must lift it. Existing balance and ledger are untouched.
            </span>
          }
          reasons={REASONS.walletFreeze}
          noteRequired
          notePlaceholder="What prompted the freeze? Shown in the audit log."
          confirmLabel="Freeze wallet"
          onConfirm={() => {
            throw new Error("Wallet freeze is not wired: the API has no commission_freeze endpoint. Nothing changed.");
          }}
        />
      ) : null}

      {showClear ? (
        <ConfirmModal
          action="rider.wallet_freeze_clear"
          auditInEndpoint // nothing to audit — no endpoint runs. See the header comment.
          target={name}
          path={`/riders/${id}`}
          triggerLabel="Clear wallet freeze…"
          triggerVariant="solid"
          disabled // hard-disabled: unwired, not merely offline
          title={`Clear the freeze on ${name}'s wallet?`}
          consequence={
            <span>
              Removes the <b>commission_freeze</b> hold. Top-ups are enabled again immediately.
            </span>
          }
          reasons={REASONS.walletClearFreeze}
          confirmLabel="Clear freeze"
          onConfirm={() => {
            throw new Error(
              "Clear wallet freeze is not wired: the API has no commission_freeze endpoint. Nothing changed.",
            );
          }}
        />
      ) : null}

      {unknown ? (
        <div style={{ fontSize: 11, color: tokens.color.muted }}>
          Both actions are shown because the freeze state is unreadable — the console isn&apos;t asserting
          this wallet is either frozen or clear.
        </div>
      ) : null}
    </div>
  );
}
