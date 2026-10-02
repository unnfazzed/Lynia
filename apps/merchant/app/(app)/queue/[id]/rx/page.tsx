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
 * M8a · Prescription check and M8b · Decline (packages/design/handoff/order-flow-v2, of-screens-mrg.js
 * `M8a`/`M8b`, BRIEF §13, ledger D-59). Pharmacists only, and only for an order that carries a
 * prescription (the `rxEnabled` flag off means none exists). The 250 photo with its page pill and Zoom,
 * the patient, the items that need a prescription and the consent line, then Decline / Approve. Decline
 * opens the sheet: "Why are you declining?", the four reason chips, a note, "The rest of the order carries
 * on unless the customer cancels.", "Decline and tell the customer" and "Keep". Either answer goes back to
 * the ticket.
 */
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
  const rxItems = order.items.filter((i) => i.rxRequired).map((i) => i.name);
  const canCheck = rx?.status === "pending" && business?.myIsPharmacist === true;
  const disabled = actionsDisabled || busy;

  return (
    <Kitchen active="queue" tabs={false}>
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        <AppBar back={back} title={OF.rxT} right={<span className="m-hint m-num" style={{ flex: "none" }}>{orderLabel(order)}</span>} />
        <div className="m-bd" style={{ flex: 1, paddingTop: 12 }}>
          <div style={{ position: "relative" }}>
            <div className="m-rx" data-zoom={zoom ? "" : undefined}>
              {shown ? (
                // eslint-disable-next-line @next/next/no-img-element -- a 5-minute signed URL, never cached
                <img src={shown.url} alt={`Prescription page ${shown.page}`} />
              ) : null}
            </div>
            {photos.length > 1 ? (
              <button
                type="button"
                className="m-pl m-num"
                aria-label="Next page"
                style={{ position: "absolute", left: 8, bottom: 14, background: "var(--bg)", border: "none", font: "inherit", fontWeight: 700, fontSize: 11.5 }}
                onClick={() => setPage((p) => (p + 1) % photos.length)}
              >
                {OF.rxPage(Math.min(page, photos.length - 1) + 1, photos.length)}
              </button>
            ) : photos.length === 1 ? (
              <span className="m-pl m-num" style={{ position: "absolute", left: 8, bottom: 14, background: "var(--bg)" }}>
                {OF.rxPage(1, 1)}
              </span>
            ) : null}
            <button type="button" className="m-gh" aria-pressed={zoom} style={{ position: "absolute", right: 8, bottom: 8 }} onClick={() => setZoom((z) => !z)}>
              <Icon name="zoom-in" size={16} />
              {OF.zoom}
            </button>
          </div>
          {rx && (
            <div className="m-kv">
              <span>{OF.rxPatient}</span>
              <b>{rx.patientName}</b>
            </div>
          )}
          {rxItems.length > 0 && (
            <div className="m-kv">
              <span>{OF.rxItems}</span>
              <b>{rxItems.join(", ")}</b>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Icon name="circle-check" size={16} color="var(--accent-text)" />
            {OF.rxConsent}
          </div>
          {error && !declining && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
        </div>
        {canCheck && (
          <div className="m-foot" style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            <button type="button" className="m-gh" style={{ flex: 1, minHeight: 52 }} disabled={disabled} onClick={() => setDeclining(true)}>
              {OF.rxDecline}
            </button>
            <button type="button" className="m-btn" style={{ flex: 1 }} disabled={disabled} onClick={() => void act(() => approvePrescription(order.id), "Prescription approved · start packing")}>
              {OF.rxApprove}
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
                onClick={() => reason && void act(() => declinePrescription(order.id, { reason, note: note.trim() || undefined }), "Declined · the customer was told")}
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
