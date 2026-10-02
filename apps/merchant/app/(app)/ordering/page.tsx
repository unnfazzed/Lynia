"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantProfileResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { AppBar } from "../../components/m/AppBar";
import { Switch } from "../../components/m/Switch";
import { useToast } from "../../components/m/Toast";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { primeBusiness } from "../../lib/business";
import { getMerchantProfile, updateOrderSettings } from "../../lib/menu-api";

type LoadState = { status: "loading" } | { status: "ready"; profile: MerchantProfileResponse } | { status: "error"; message: string };
type Setting = "autoAccept" | "showPhoneToCustomers" | "freeDelivery";

const SETTINGS: { key: Setting; title: string; body: string }[] = [
  {
    key: "autoAccept",
    title: "Accept orders automatically",
    body: "New orders go straight to cooking. Confirm each one so a rider is sent.",
  },
  {
    key: "showPhoneToCustomers",
    title: "Show our number to customers",
    body: "Customers with a live order can call you.",
  },
  // D-71: free delivery paid by the business. The customer app draws the "Free delivery" tag; this
  // switch is how the business turns it on (not drawn in the merchant handoff — ledger D-71).
  {
    key: "freeDelivery",
    title: "Free delivery",
    body: "Customers pay $0 delivery on new orders. You pay the rider's delivery fee: it comes off the cash for each order.",
  },
];

/**
 * Taking orders (Account → owner only): how a restaurant that still takes orders by phone works with
 * LyniaGo — accept new orders automatically, and let customers with a live order call. Each switch saves
 * the moment it is flipped, the same way busy mode does on Opening hours. Staff reaching it by an old
 * link see one plain line; their Account never lists it.
 */
export default function OrderingPage() {
  const toast = useToast();
  const { actionsDisabled, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [saving, setSaving] = useState<Setting | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    getMerchantProfile()
      .then((profile) => setState({ status: "ready", profile }))
      .catch((err: unknown) => {
        if (redirectIfSessionExpired(err, signOut)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your settings." });
      });
  }, [signOut]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onToggle(key: Setting, value: boolean) {
    if (state.status !== "ready" || saving) return;
    setSaving(key);
    setError(null);
    try {
      const profile = await updateOrderSettings({ [key]: value });
      setState({ status: "ready", profile });
      primeBusiness(profile);
      toast("Saved");
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setError(err instanceof ApiError ? err.message : "Couldn't save — try again.");
    } finally {
      setSaving(null);
    }
  }

  const staff = state.status === "ready" && state.profile.myRole === "staff";
  // D-71: a shop or pharmacy never auto-accepts (Order flow v2), so it sees only the free-delivery switch.
  const shop = state.status === "ready" && state.profile.businessType === "shop";
  const settings = shop ? SETTINGS.filter((s) => s.key === "freeDelivery") : SETTINGS;

  return (
    <Kitchen active="account" tabs={false}>
      <div className="m-page">
        <AppBar back="/account" title="Taking orders" />
        <div className="m-bd" style={{ gap: 14 }}>
          {state.status === "loading" && <div className="m-hint">Loading…</div>}
          {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}
          {staff && <p className="m-sub">Only the owner changes how you take orders.</p>}
          {state.status === "ready" &&
            !staff &&
            settings.map((s) => (
              <div key={s.key} className="m-card" style={{ flexDirection: "row", alignItems: "center", padding: "10px 14px" }}>
                <div style={{ flex: 1 }}>
                  <b style={{ display: "block", fontSize: 15 }}>{s.title}</b>
                  <span className="m-hint" style={{ display: "block", lineHeight: 1.35, marginTop: 2 }}>
                    {s.body}
                  </span>
                </div>
                <Switch
                  checked={state.profile[s.key] === true}
                  label={s.title}
                  disabled={actionsDisabled || saving !== null}
                  onChange={(v) => void onToggle(s.key, v)}
                />
              </div>
            ))}
          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </Kitchen>
  );
}
