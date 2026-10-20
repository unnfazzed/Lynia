"use client";

import { type AdminFleetBill, type AdminFleetDetail, type AdminFleetRow, FLEET_ADMIN_REASON_CODES } from "@lynia/shared";
import { useId, useState, useTransition } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { IconBan, IconPause, IconX } from "../components/icons";
import { Pill } from "../components/StatusPill";
import { OBA, OBA_FRAME } from "../lib/own-bikers-copy";
import { adjustFleet, enableFleet, type FleetWriteResult, markFleetBillPaid, switchFleet } from "./actions";
import { billPill, billRides, rideLabel, statusPill, usd, weekLabel } from "./fleet-view";

/**
 * OB-A2 · a fleet's side panel (Own bikers v1, ledger D-117): the business, its status and one line (owner, branches,
 * bikers, online, unpaid); the fee (the commission rate, owner 2026-10-20); Pause (Unpause) and Disable behind OB-A3's
 * reason-code confirms, and Turn on for a disabled business; the
 * weekly bills with Mark paid and Adjust, which opens the correction form (amount, ride, reason). Every write is
 * audited by its endpoint with the operator's name.
 */
export function FleetPanel({
  row,
  detail,
  brand,
  branches,
  closeHref,
  connected,
}: {
  row: AdminFleetRow;
  detail: AdminFleetDetail;
  brand: string;
  branches: string[];
  closeHref: string;
  connected: boolean;
}) {
  const pill = statusPill(row.status);
  const online = detail.bikers.filter((b) => b.state !== "offline").length;
  const [adjusting, setAdjusting] = useState<AdminFleetBill | null>(null);
  const overdue = detail.bills.some((b) => b.state === "overdue");
  // NON_PAYMENT reads "· bill overdue" while one is (OB-A3); the code is what's recorded.
  const reasons = FLEET_ADMIN_REASON_CODES.map((c) => ({ value: c, label: c === "NON_PAYMENT" && overdue ? `${c} · bill overdue` : c }));
  const switchTo =
    (action: "pause" | "unpause" | "disable") =>
    async ({ reasonCode, note }: { reasonCode: string | null; note: string }) => {
      const res = await switchFleet(detail.ownerProfileId, action, reasonCode as (typeof FLEET_ADMIN_REASON_CODES)[number], note);
      if (!res.ok) throw new Error(res.message);
    };
  const modal = {
    target: detail.ownerProfileId,
    path: "/own-bikers",
    disabled: !connected,
    reasons,
    auditInEndpoint: true,
    danger: true,
    reasonLabel: OBA.reasonCode,
    noteLabel: OBA.note,
    auditLine: OBA.audit,
  } as const;

  return (
    <aside className="ob-panel" aria-label={brand}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{brand}</h2>
        <Pill kind={pill.kind} dot>
          {pill.label}
        </Pill>
        <a className="ob-close" href={closeHref} aria-label="Close">
          <IconX width={18} height={18} />
        </a>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: -14 }}>
        {OBA_FRAME.panelSub(detail.owner, branches.join(", "), detail.bikers.length, online, usd(row.unpaid))}
      </div>

      {detail.feePct != null ? <FeeLine pct={detail.feePct} /> : null}

      {detail.enabled ? (
        <div style={{ display: "flex", gap: 8 }}>
          {detail.paused ? (
            <ConfirmModal
              {...modal}
              action="merchant.fleet.unpause"
              triggerLabel={OBA.unpause}
              triggerVariant="ghost"
              title={`${OBA.unpause} ${brand}'s Own bikers?`}
              consequence={null}
              confirmLabel={OBA.unpause}
              danger={false}
              onConfirm={switchTo("unpause")}
            />
          ) : (
            <ConfirmModal
              {...modal}
              action="merchant.fleet.pause"
              triggerLabel={OBA.pause}
              triggerVariant="ghost"
              triggerIcon={<IconPause />}
              title={OBA.pauseT(brand)}
              consequence={OBA.pauseB(brand, detail.bikers.length)}
              confirmLabel={OBA.pause}
              onConfirm={switchTo("pause")}
            />
          )}
          <ConfirmModal
            {...modal}
            action="merchant.fleet.disable"
            triggerLabel={OBA.disable}
            triggerVariant="danger-wash"
            triggerIcon={<IconBan />}
            title={OBA.disableT(brand)}
            consequence={OBA.disableB(brand, detail.bikers.length)}
            confirmLabel={OBA.disable}
            onConfirm={switchTo("disable")}
          />
        </div>
      ) : detail.branches[0] ? (
        <div style={{ display: "flex", gap: 8 }}>
          <ConfirmModal
            {...modal}
            reasons={[]}
            action="merchant.fleet.enable"
            triggerLabel={OBA.turnOn}
            triggerVariant="ghost"
            title={OBA.turnOnT(brand)}
            consequence={null}
            confirmLabel={OBA.turnOn}
            danger={false}
            onConfirm={async ({ note }) => {
              const res = await enableFleet(detail.branches[0]!.merchantId, note);
              if (!res.ok) throw new Error(res.message);
            }}
          />
        </div>
      ) : null}

      <div style={{ fontSize: 14, fontWeight: 700 }}>{OBA.bills}</div>
      <Bills bills={detail.bills} connected={connected} onAdjust={setAdjusting} />
      {adjusting ? <AdjustForm key={adjusting.id} bill={adjusting} detail={detail} onDone={() => setAdjusting(null)} /> : null}
    </aside>
  );
}

/** The fee: every business pays the commission rate on each ride's cost (owner, 2026-10-20). Read-only. */
function FeeLine({ pct }: { pct: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
      <span style={{ color: "var(--muted)" }}>{OBA.fee}</span>
      <span style={{ fontWeight: 600 }}>{OBA.feeLine(pct)}</span>
    </div>
  );
}

/** Weekly bills: Week · Rides · Amount · Status, with Mark paid and Adjust on a bill not yet paid. */
function Bills({ bills, connected, onAdjust }: { bills: AdminFleetBill[]; connected: boolean; onAdjust: (b: AdminFleetBill) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const head = OBA_FRAME.billCols;
  return (
    <div>
      <table className="data">
        <thead>
          <tr>
            <th style={{ paddingLeft: 0 }}>{head[0]}</th>
            <th style={{ textAlign: "right" }}>{head[1]}</th>
            <th style={{ textAlign: "right" }}>{head[2]}</th>
            <th>{head[3]}</th>
            <th>
              <span className="sr-only">{OBA.markPaid}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => {
            const p = billPill(b);
            return (
              <tr key={b.id}>
                <td style={{ paddingLeft: 0, whiteSpace: "nowrap" }}>{weekLabel(b.periodStart, b.periodEnd)}</td>
                <td style={{ textAlign: "right" }}>{billRides(b)}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{usd(b.total)}</td>
                <td>
                  <Pill kind={p.kind} dot>
                    {p.label}
                  </Pill>
                </td>
                <td style={{ textAlign: "right" }}>
                  {b.state !== "paid" ? (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={!connected || pending}
                        onClick={() =>
                          start(async () => {
                            const res = await markFleetBillPaid(b.id);
                            setError(res.ok ? null : res.message);
                          })
                        }
                      >
                        {OBA.markPaid}
                      </button>
                      <button type="button" className="btn quiet" disabled={!connected} onClick={() => onAdjust(b)}>
                        {OBA.adjust}
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? <WriteError message={error} /> : null}
    </div>
  );
}

/**
 * OB-A2 Adjust: an amount (a credit is negative), the ride and a reason; all three are needed. The correction lands
 * on the fleet's open week, billed to the ride's branch.
 */
function AdjustForm({ bill, detail, onDone }: { bill: AdminFleetBill; detail: AdminFleetDetail; onDone: () => void }) {
  const ids = { amount: useId(), ride: useId(), reason: useId() };
  const rides = detail.recentRides ?? [];
  const [amount, setAmount] = useState("");
  const [orderId, setOrderId] = useState(rides[0]?.orderId ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(amount.replace("−", "-").replace(/\$/g, ""));
  const ride = rides.find((r) => r.orderId === orderId);
  const valid = amount.trim() !== "" && Number.isFinite(n) && n !== 0 && Math.abs(n) <= 1000 && ride != null && reason.trim().length >= 3;
  const save = () =>
    start(async () => {
      const res: FleetWriteResult = await adjustFleet(detail.ownerProfileId, {
        merchantId: ride!.merchantId,
        orderId: ride!.orderId,
        amount: Math.round(n * 100) / 100,
        reason: reason.trim(),
      });
      if (res.ok) onDone();
      else setError(res.message);
    });
  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{OBA_FRAME.adjustT(weekLabel(bill.periodStart, bill.periodEnd), usd(bill.total))}</div>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
        <label className="ob-field" htmlFor={ids.amount}>
          {OBA.adjAmount}
          <input id={ids.amount} inputMode="decimal" value={amount} placeholder="−1.50" onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="ob-field" htmlFor={ids.ride}>
          {OBA.adjRide}
          <select id={ids.ride} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            {rides.map((r) => (
              <option key={r.orderId} value={r.orderId}>
                {rideLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="ob-field" htmlFor={ids.reason}>
        {OBA.adjReason}
        <input id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error ? <WriteError message={error} /> : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn quiet" onClick={onDone} disabled={pending}>
          {OBA.cancel}
        </button>
        <button type="button" className="btn solid" disabled={!valid || pending} onClick={save}>
          {OBA_FRAME.saveAdjustment}
        </button>
      </div>
    </div>
  );
}

function WriteError({ message }: { message: string }) {
  return (
    <div role="alert" className="ob-error-row" style={{ marginTop: 8 }}>
      {message}
    </div>
  );
}
