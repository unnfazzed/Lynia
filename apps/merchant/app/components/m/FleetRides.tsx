"use client";

import { billCards, branchLines, cachedLine, type FleetMoneyRead, noFleetRides, rideRows } from "../../lib/fleet-money";
import { OBM } from "../../lib/own-bikers-copy";
import { Icon } from "../icons";

/** The offline strip, first on the week ("Offline · showing this week as of 12:40"). */
export function FleetCachedStrip({ read }: { read: FleetMoneyRead }) {
  if (!read || read.status !== "ready" || !read.cachedAt) return null;
  return (
    <div className="m-ob-strip" style={{ marginBottom: 12 }}>
      <span className="m-ob-strip-ic">
        <Icon name="wifi-off" size={16} />
      </span>
      <div>{cachedLine(read.cachedAt)}</div>
    </div>
  );
}

const PILL = { unpaid: OBM.billUnpaid, paid: OBM.billPaid, overdue: OBM.billOverdue } as const;

/**
 * OB-M14 · Money · This week, FLEET RIDES (Own bikers v1, ledger D-117). The bill cards (receipt, state pill; overdue
 * in danger with "2 days overdue" in words), this branch's line and its rides ("#B204 · Tendai · 12:40 $1.50", a
 * credit in mint), the other branches' lines; or one "No fleet rides this week" row. Loading draws four skeleton
 * rows, couldn't-load a red strip with Try again, offline the last read under "Offline · showing this week as of".
 * Nothing at all for a business without Own bikers.
 */
export function FleetRides({
  read,
  merchantId,
  name,
  today,
  onRetry,
}: {
  read: FleetMoneyRead;
  merchantId: string;
  name: string;
  today: string;
  onRetry: () => void;
}) {
  if (read === null) return null;
  return (
    <section className="m-fr" aria-label={OBM.grpFleet}>
      <h2 className="m-bh">{OBM.grpFleet}</h2>
      {read === undefined ? (
        <div aria-busy="true" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="m-fr-row">
              <span className="m-ob-sk" style={{ width: "62%", height: 14, borderRadius: 6 }} />
              <span className="m-ob-sk" style={{ width: 44, height: 14, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : read.status === "fail" ? (
        <div className="m-ob-strip" data-tone="bad" data-act="" role="alert">
          <span className="m-ob-strip-ic">
            <Icon name="circle-alert" size={16} />
          </span>
          <div>
            <b>{OBM.moneyFailT}</b>
          </div>
          <button type="button" className="m-ob-pill" onClick={onRetry}>
            <Icon name="rotate-cw" size={16} />
            {OBM.tryAgain}
          </button>
        </div>
      ) : (
        <div className="m-fr-body" data-cached={read.cachedAt ? "" : undefined}>
          {billCards(read.data.bills, read.data.rides.weekStart, today).map((c) => (
            <div key={c.key} className="m-fr-bill" data-state={c.state}>
              <span className="m-fr-bill-ic">
                <Icon name="receipt-dollar" size={18} />
              </span>
              <div>
                <b className="m-num">{c.text}</b>
                {c.state === "overdue" && <span>{OBM.billOverdueSub(c.daysOverdue)}</span>}
              </div>
              <span className="m-fr-pill" data-state={c.state}>
                {c.state === "overdue" && <Icon name="circle-alert" size={14} />}
                {PILL[c.state]}
              </span>
            </div>
          ))}
          {noFleetRides(read.data) ? (
            <div className="m-fr-zero">
              <span>
                <Icon name="bike" size={20} />
              </span>
              {OBM.noFleet}
            </div>
          ) : (
            branchLines(read.data, merchantId, name).map((b) =>
              b.mine ? (
                <div key={b.key} className="m-fr-rides">
                  <b className="m-fr-branch m-num">{b.text}</b>
                  {rideRows(read.data.rides).map((r) => (
                    <div key={r.key} className="m-fr-row m-num" data-muted={r.muted ? "" : undefined}>
                      <span>{r.text}</span>
                      <b data-credit={r.credit ? "" : undefined}>{r.amount}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <b key={b.key} className="m-fr-branch m-num">
                  {b.text}
                </b>
              ),
            )
          )}
        </div>
      )}
    </section>
  );
}
