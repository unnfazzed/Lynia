"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantOrderResponse, PrescriptionPhotosResponse, RxDeclineReason } from "@lynia/shared";
import { Icon } from "../../../../components/icons";
import { Kitchen } from "../../../../components/Kitchen";
import { useKitchenConnection } from "../../../../components/KitchenConnectionProvider";
import { AppBar } from "../../../../components/m/AppBar";
import { useToast } from "../../../../components/m/Toast";
import { RetryableError } from "../../../../components/RetryableError";
import { ApiError } from "../../../../lib/api-client";
import { useBusiness } from "../../../../lib/business";
import { approvePrescription, declinePrescription, getOrder, getPrescriptionPhotos } from "../../../../lib/orders-api";
import { orderLabel } from "../../../../lib/orders-view";
import { ORDER_FLOW as OF } from "../../../../lib/vocabulary";

type Load = { status: "loading" } | { status: "ready"; order: MerchantOrderResponse; photos: PrescriptionPhotosResponse["photos"] } | { status: "error"; message: string };

/**
 * P1 · Check the prescription (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77) over Order
 * flow v2's M8a/M8b (D-59). Pharmacists only, and only for an order that carries a prescription. The
 * 200 photo with Zoom (and paging over several pages), the patient and the medicine, then the checklist —
 * Name matches the patient · Signed and stamped · Dated in the last 6 months — and the line that the
 * customer shows the original to the rider. Approve stays disabled until every box is ticked; the ticks
 * are stored with the check. Decline opens M8b's sheet, already filled in from the unticked box. Either
 * answer goes back to the ticket.
 */
type Checks = { nameMatches: boolean; signedStamped: boolean; recentDate: boolean };
const CHECKS: readonly [keyof Checks, string][] = [
  ["nameMatches", "Name matches the patient"],
  ["signedStamped", "Signed and stamped"],
  ["recentDate", "Dated in the last 6 months"],
];
/** BRIEF §8: Decline arrives filled in from the first unticked box. */
const PREFILL: Record<keyof Checks, { reason: RxDeclineReason; note: string }> = {
  nameMatches: { reason: "not_valid", note: "The name doesn’t match the patient." },
  signedStamped: { reason: "not_valid", note: "It isn’t signed and stamped." },
  recentDate: { reason: "expired", note: "It’s more than 6 months old." },
};
export default function PrescriptionCheckPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const business = useBusiness();
  const { actionsDisabled } = useKitchenConnection();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [checks, setChecks] = useState<Checks>({ nameMatches: false, signedStamped: false, recentDate: false });
  const [reason, setReason] = useState<RxDeclineReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [order, photos] = await Promise.all([getOrder(id), getPrescriptionPhotos(id)]);
      setLoad({ status: "ready", order, photos: [...photos.photos].sort((a, b) => a.page - b.page) });
    } catch (err) {
      setLoad({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load the prescription." });
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(action: () => Promise<unknown>, done: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      toast(done);
      router.replace(`/queue/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const back = `/queue/${id}`;
  if (load.status !== "ready") {
    return (
      <Kitchen active="queue" tabs={false}>
        <AppBar back={back} title={OF.rxT} />
        <div className="m-bd">{load.status === "loading" ? <div className="m-hint">Loading…</div> : <RetryableError message={load.message} onRetry={() => void refresh()} />}</div>
      </Kitchen>
    );
  }

  const { order, photos } = load;
  const rx = order.prescription;
  const shown = photos[Math.min(page, photos.length - 1)];
  const rxItems = order.items.filter((i) => i.rxRequired).map((i) => `${i.name}${i.quantity > 1 ? ` · ${i.quantity}` : ""}`);
  const canCheck = rx?.status === "pending" && business?.myIsPharmacist === true;
  const disabled = actionsDisabled || busy;
  const allTicked = checks.nameMatches && checks.signedStamped && checks.recentDate;

  function openDecline() {
    const first = CHECKS.find(([k]) => !checks[k]);
    if (first) {
      setReason(PREFILL[first[0]].reason);
      setNote(PREFILL[first[0]].note);
    }
    setDeclining(true);
  }

  return (
    <Kitchen active="queue" tabs={false}>
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        <AppBar back={back} title="Check the prescription" right={<span className="m-num" style={{ flex: "none", fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>{orderLabel(order)}</span>} />
        <div className="m-bd" style={{ flex: 1, paddingTop: 4 }}>
          <div className="m-rxphoto" data-zoom={zoom ? "" : undefined}>
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element -- a 5-minute signed URL, never cached
              <img src={shown.url} alt={`Prescription page ${shown.page}`} />
            ) : null}
            {photos.length > 1 && (
              <button type="button" className="m-rxpage m-num" aria-label="Next page" onClick={() => setPage((p) => (p + 1) % photos.length)}>
                {Math.min(page, photos.length - 1) + 1} of {photos.length}
              </button>
            )}
            <button type="button" className="m-rxzoom" aria-pressed={zoom} onClick={() => setZoom((z) => !z)}>
              <Icon name="zoom-in" size={16} />
              {OF.zoom}
            </button>
          </div>
          <div className="m-rxkv">
            {rx && (
              <div>
                <span>{OF.rxPatient}</span>
                <b>{rx.patientName}</b>
              </div>
            )}
            {rxItems.length > 0 && (
              <div>
                <span>Medicine</span>
                <b>{rxItems.join(", ")}</b>
              </div>
            )}
          </div>
          {canCheck && (
            <div className="m-rxlist" role="group" aria-label="Checklist">
              {CHECKS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="checkbox"
                  aria-checked={checks[key]}
                  onClick={() => setChecks((c) => ({ ...c, [key]: !c[key] }))}
                >
                  <i>{checks[key] && <Icon name="check" size={16} />}</i>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="m-rxnote">
            <Icon name="shield-check" size={16} />
            The customer shows the original to the rider
          </div>
          {error && !declining && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
        </div>
        {canCheck && (
          <div className="m-cta m-cta-pin" style={{ flexDirection: "row" }}>
            <button type="button" className="m-btn2" style={{ flex: 1, minHeight: 52, fontSize: 16 }} disabled={disabled} onClick={openDecline}>
              {OF.rxDecline}
            </button>
            <button
              type="button"
              className={`m-btn${allTicked ? "" : " m-off"}`}
              style={{ flex: 1.4, width: "auto" }}
              disabled={disabled || !allTicked}
              onClick={() =>
                void act(
                  () => approvePrescription(order.id, { checklist: { nameMatches: true, signedStamped: true, recentDate: true } }),
                  "Prescription approved · start packing",
                )
              }
            >
              Approve
            </button>
          </div>
        )}
      </div>

      {declining && (
        <div className="m-overlay" style={{ zIndex: 70 }}>
          <div className="m-overlay-frame">
            <button type="button" className="m-scrim" aria-label={OF.keep} onClick={() => setDeclining(false)} />
            <div className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-rx-why">
              <div className="m-grab" />
              <b id="m-rx-why" style={{ fontSize: 19 }}>
                {OF.rxWhy}
              </b>
              <div className="m-chips" style={{ flexWrap: "wrap" }} role="radiogroup" aria-label={OF.rxWhy}>
                {OF.rxR.map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={reason === value} className={`m-chip${reason === value ? " m-g" : ""}`} onClick={() => setReason(value)}>
                    {reason === value && <Icon name="check" size={14} />}
                    {label}
                  </button>
                ))}
              </div>
              <label className="m-in" style={{ minHeight: 56 }}>
                <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="Note for the customer" />
              </label>
              <p className="m-sub" style={{ fontSize: 13 }}>
                {OF.rxRest}
              </p>
              {error && (
                <div className="m-alert" role="alert">
                  {error}
                </div>
              )}
              <button
                type="button"
                className="m-btn m-danger"
                disabled={disabled || !reason}
                onClick={() => reason && void act(() => declinePrescription(order.id, { reason, note: note.trim() || undefined, checklist: checks }), "Declined · the customer was told")}
              >
                {OF.rxSend}
              </button>
              <button type="button" className="m-gh" onClick={() => setDeclining(false)}>
                {OF.keep}
              </button>
            </div>
          </div>
        </div>
      )}
    </Kitchen>
  );
}
