"use client";

import { useState, type CSSProperties } from "react";
import { tokens } from "@lynia/shared";
import { ConfirmModal } from "../components/ConfirmModal";
import { REASONS } from "../lib/reasons";
import { IconWifiOff } from "../components/icons";

/**
 * Bulk seed-credit — the flip-day tooling from the kit (`packages/design/ui_kits/admin/cash.html`
 * lines 35-51 / 117-160) and `docs/plans/2026-rider-wallet-design.md` Premise 5.
 *
 * ─── WIRING STATUS: THE APPLY ACTION IS DELIBERATELY DEAD ──────────────────────────────────────
 * There is NO bulk/campaign credit endpoint. `apps/api/src/admin/admin.controller.ts` exposes exactly
 * one credit route — `POST /admin/riders/:id/wallet-credit` (single rider, `WalletService.creditManual`)
 * — and a repo-wide grep for `campaignId` / `bulkCredit` / `seed-credit` across `apps/api/src` is empty
 * (the same finding `docs/KNOWN_BUGS.md` DOC-16-03 / ADM-07 record). The primitive the endpoint would
 * be built on DOES exist (`WalletService.creditAccount`, which takes an `idemKey` and writes a `grace` /
 * `adjustment` ledger row, and `CommissionLedger.idemKey` is UNIQUE so `(campaign, riderId)` keying is
 * already schema-supported) — but nothing routes HTTP traffic to it in bulk.
 *
 * So the confirm trigger is hard-disabled and the card says why, inline, in the operator's own terms.
 * This card moves money; a control that looked live and silently did nothing — or worse, popped a
 * success toast — would be far more dangerous than one that visibly isn't finished. Belt and braces:
 *   - the trigger is `disabled` unconditionally (the modal can never open),
 *   - `auditInEndpoint` is set so the modal can't POST an audit row for a credit that never happened,
 *   - `onConfirm` THROWS, so if someone later enables the trigger without building the endpoint the
 *     dialog stays open with an error instead of reporting a success that didn't occur.
 * The live preview and validation below are real and safe — they read nothing and write nothing.
 */

/** Per-rider seed cap. Mirrors the kit's $50 ceiling and the api's `WALLET_MANUAL_CREDIT_CAP_USD`
 *  default, which is what a real bulk endpoint would have to honour per row. */
const PER_RIDER_CAP = 50;

/** Kit `money()` — a negative renders as "−$X.XX", never "$-X.XX". */
function money(n: number): string {
  return `${n < 0 ? "−$" : "$"}${Math.abs(n).toFixed(2)}`;
}

export interface SeedCreditCardProps {
  /**
   * Riders that would receive a seed credit: standing `active`, not on a reliability hold, KYC
   * `verified` — i.e. the riders the online-gate would otherwise let online, and who the $2 floor
   * would therefore gate off the board at a $0 balance. `null` when the roster read failed, in which
   * case the preview refuses to invent a number.
   */
  eligibleCount: number | null;
  /** True when `GET /admin/riders` returned its full `take: 100` page — the count is then a FLOOR,
   *  not a fleet total, and the card must say so rather than quietly under-report a payout size. */
  rosterCapped: boolean;
}

export function SeedCreditCard({ eligibleCount, rosterCapped }: SeedCreditCardProps) {
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("5.00");

  const name = campaign.trim();
  const amt = Number.parseFloat(amount);

  // Kit `seedPreview()` validation, in the same order.
  const error = !name
    ? "Give the campaign a name — it's the idempotency key."
    : !(amt > 0)
      ? "Enter a per-rider amount above $0.00."
      : amt > PER_RIDER_CAP
        ? `Per-rider seed credits are capped at ${money(PER_RIDER_CAP)}.`
        : null;

  const inputStyle: CSSProperties = {
    width: "100%",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "9px 12px",
    fontFamily: "var(--font-sans)",
    fontSize: 14,
  };
  const labelStyle: CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: tokens.color.muted,
    marginBottom: 6,
  };

  return (
    <section className="card" style={{ marginTop: tokens.space.lg }}>
      <div className="block-title">
        Bulk seed-credit
        <span className="right">Flip-day tooling · campaign-keyed, idempotent</span>
      </div>

      <p style={{ fontSize: 13, color: tokens.color.muted, margin: "0 0 16px", maxWidth: 640 }}>
        Before the rate flips off 0%, every rider&apos;s balance is $0 — below the $2 floor, which would gate the
        whole fleet offline. Seed a grace credit to every eligible rider first. Each row is keyed{" "}
        <span className="mono">(campaign, riderId)</span> on the ledger&apos;s unique{" "}
        <span className="mono">idemKey</span>, so re-running the same campaign never double-grants.
      </p>

      {/* The honest status of this control, stated before the operator fills anything in. Uses the
          console's existing "endpoint hasn't shipped" banner treatment (same as <SubsectionUnavailable>),
          not a new one-off style. */}
      <div className="offline-banner" style={{ padding: "10px 14px", fontSize: 12.5 }}>
        <IconWifiOff />
        <span>
          <b>Not yet wired — the bulk-credit endpoint doesn&apos;t exist yet.</b> The API has only the
          single-rider <span className="mono">POST /admin/riders/:id/wallet-credit</span>; there is no
          campaign/bulk route to call. You can size a campaign here, but <b>nothing can be applied</b> — the
          apply button stays disabled until that endpoint ships. To seed a rider today, use{" "}
          <b>Credit account…</b> on their profile, one rider at a time.
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr auto",
          gap: tokens.space.md,
          alignItems: "end",
          maxWidth: 680,
          marginTop: tokens.space.md,
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="seed-campaign">
            Campaign name
          </label>
          <input
            id="seed-campaign"
            type="text"
            value={campaign}
            placeholder="flip-jul-2026"
            onChange={(e) => setCampaign(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="seed-amount">
            Per rider (USD)
          </label>
          <input
            id="seed-amount"
            type="text"
            inputMode="decimal"
            className="num"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
          />
        </div>
        <ConfirmModal
          action="wallet.seed_campaign"
          // No endpoint exists, so there is nothing to audit — this stops <ConfirmModal> writing a
          // standalone audit row for a credit that never happened. See the header comment.
          auditInEndpoint
          target={name || "campaign"}
          path="/cash"
          triggerLabel="Preview & apply…"
          triggerVariant="solid"
          // Hard-disabled: unwired, not merely offline. Never make this conditional on `connected`
          // without a real bulk endpoint behind it.
          disabled
          title={`Seed grace credits — ${name || "campaign"}`}
          consequence={
            <span>
              Credits <b>{eligibleCount ?? "—"} eligible riders</b> {money(amt > 0 ? amt : 0)} each (
              <b>{eligibleCount !== null && amt > 0 ? money(eligibleCount * amt) : "—"}</b> total) as{" "}
              <span className="mono">adjustment</span> rows, keyed{" "}
              <span className="mono">({name || "…"}, riderId)</span> so a re-run never double-grants.
            </span>
          }
          reasons={REASONS.walletSeedCampaign}
          noteRequired
          notePlaceholder="Why this campaign is being run — recorded against every row it writes."
          confirmLabel={`Apply to ${eligibleCount ?? 0} riders`}
          onConfirm={() => {
            // Unreachable while the trigger is disabled. Kept as a live tripwire: if the trigger is
            // ever enabled before the endpoint exists, this surfaces an error in the dialog instead of
            // closing it as though a payout had been made.
            throw new Error(
              "Bulk seed-credit is not wired: the API has no campaign/bulk credit endpoint. Nothing was credited.",
            );
          }}
        />
      </div>

      {error ? (
        <div style={{ fontSize: 12, color: tokens.color.danger, marginTop: 6 }}>{error}</div>
      ) : (
        <div style={{ fontSize: 13, color: tokens.color.ink, marginTop: 14 }}>
          {eligibleCount === null ? (
            <span style={{ color: tokens.color.muted }}>
              Rider roster unavailable — can&apos;t size this campaign. Reload the page to try again.
            </span>
          ) : (
            <>
              Would credit <b>{eligibleCount} eligible riders</b> {money(amt)} each — total{" "}
              <b>{money(eligibleCount * amt)}</b>. Each row keyed{" "}
              <span className="mono">({name}, riderId)</span>.
            </>
          )}
        </div>
      )}

      {/* Idempotency chip. The kit shows "already applied · N riders" for a campaign that has run
          before; we CANNOT know that — there is no endpoint that reads campaign state (or ledger rows
          by `idemKey` prefix), so claiming either "already applied" or "not yet applied" would be a
          guess about whether money has already moved. Say what is actually true instead. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span className="kpill mut">idempotency not checkable</span>
        <span style={{ fontSize: 12, color: tokens.color.muted }}>
          No endpoint reads campaign state, so the console can&apos;t tell you whether{" "}
          <b>{name || "a campaign"}</b> has already been granted. The <span className="mono">idemKey</span>{" "}
          uniqueness that would make a re-run safe lives in the database, not in anything readable here.
        </span>
      </div>

      <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 12 }}>
        &ldquo;Eligible&rdquo; = standing <span className="mono">active</span>, not on a reliability hold, KYC{" "}
        <span className="mono">verified</span> — the riders the online-gate would otherwise admit, and who a
        $0 balance would therefore push under the floor.{" "}
        {rosterCapped ? (
          <b>
            Counted from the rider directory, which returns at most 100 riders — {eligibleCount} is a floor, not
            a fleet total.
          </b>
        ) : (
          <>Counted from the rider directory (`GET /admin/riders`).</>
        )}
      </div>
    </section>
  );
}
