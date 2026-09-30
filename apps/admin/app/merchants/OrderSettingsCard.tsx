"use client";

import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import { Pill } from "../components/StatusPill";
import { setMerchantOrderSettings } from "./actions";

type Setting = "autoAccept" | "showPhoneToCustomers";

const COPY: Record<Setting, { label: string; line: string; onConsequence: string; offConsequence: string }> = {
  autoAccept: {
    label: "Accept orders automatically",
    line: "New orders skip the 3-minute accept. You confirm each one by phone before a rider is sent.",
    onConsequence:
      "New orders go straight to cooking and appear on Orders to confirm. Call the restaurant for each one: no rider is sent until you confirm.",
    offConsequence: "New orders wait for the restaurant to accept them in the merchant app again, and are cancelled after 3 minutes without an answer.",
  },
  showPhoneToCustomers: {
    label: "Show the restaurant's number to customers",
    line: "Only switch on if the restaurant agreed.",
    onConsequence: "Customers with a live order see the restaurant's number and can call it.",
    offConsequence: "Customers stop seeing the restaurant's number.",
  },
};

/**
 * Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md): how a restaurant takes orders, set by
 * ops on its behalf — most auto-accept restaurants never open the merchant app. Each switch goes through
 * the reason-coded ConfirmModal; the endpoint writes the audit row (A-01).
 */
export function OrderSettingsCard({
  merchantId,
  name,
  autoAccept,
  showPhoneToCustomers,
  connected,
}: {
  merchantId: string;
  name: string;
  autoAccept: boolean;
  showPhoneToCustomers: boolean;
  connected: boolean;
}) {
  const current: Record<Setting, boolean> = { autoAccept, showPhoneToCustomers };
  return (
    <section className="card" aria-label="Taking orders">
      <div className="block-title">Taking orders</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        {(Object.keys(COPY) as Setting[]).map((key) => {
          const on = current[key];
          const c = COPY[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {c.label} {on ? <Pill kind="good">on</Pill> : <Pill kind="mut">off</Pill>}
                </div>
                <div className="mut" style={{ fontSize: 12 }}>
                  {c.line}
                </div>
              </div>
              <ConfirmModal
                action="merchant.order_settings"
                auditInEndpoint
                target={merchantId}
                path={`/merchants/${merchantId}`}
                triggerLabel={on ? "Turn off…" : "Turn on…"}
                triggerVariant={on ? "ghost" : "solid"}
                disabled={!connected}
                title={`${on ? "Turn off" : "Turn on"} "${c.label.toLowerCase()}" for ${name}?`}
                consequence={on ? c.offConsequence : c.onConsequence}
                reasons={REASONS.merchantOrderSettings}
                notePlaceholder="Who did you speak to? (optional)"
                confirmLabel={on ? "Turn off" : "Turn on"}
                onConfirm={async (r) => {
                  const res = await setMerchantOrderSettings(merchantId, { [key]: !on }, r.reasonCode, r.note);
                  if (!res.ok) throw new Error(res.message);
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
