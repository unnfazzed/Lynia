"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../../../components/icons";
import { Kitchen } from "../../../components/Kitchen";
import { useKitchenConnection } from "../../../components/KitchenConnectionProvider";
import { useEnterBranch } from "../../../components/branches/use-enter-branch";
import { AppBar } from "../../../components/m/AppBar";
import { LocationField } from "../../../components/m/LocationField";
import { Switch } from "../../../components/m/Switch";
import { ApiError, getMyAccount } from "../../../lib/api-client";
import { BRANCH_ERRORS, type BranchFormError, branchErrorFor, catalogueCount } from "../../../lib/branches";
import { createBranch } from "../../../lib/branches-api";
import { useBusiness } from "../../../lib/business";
import { supportWhatsAppUrl } from "../../../lib/config";
import { insideServiceArea } from "../../../lib/geo";
import { listCategories, listDishes } from "../../../lib/menu-api";
import type { SignUpLocation } from "../../../lib/sign-up";
import { toBranchRequest } from "../../../lib/branch-form";

/**
 * C7 · Add a branch (merchant-mobile README section F; handoff branches/README.md §4; ledger D-51). A
 * pushed screen whose fixed parent is C4, however it was opened. Branch name (empty, with the drawn
 * hint), A4's location block, "Copy my menu" / "Copy my items" (on by default, with live counts), the
 * line about what comes along, and "Create branch" pinned at the bottom. No phone field: the branch's
 * contact number is the owner's sign-in number, the same rule as A4.
 *
 * The primary is enabled with a name, a location, a connection and no banner error. Success switches to
 * the new branch: its Orders home (not live yet) with "{name} is ready".
 */
export default function AddBranchPage() {
  const router = useRouter();
  const business = useBusiness();
  const { actionsDisabled } = useKitchenConnection();
  const enterBranch = useEnterBranch();
  const [name, setName] = useState("");
  const [location, setLocation] = useState<SignUpLocation | null>(null);
  const [copy, setCopy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<BranchFormError | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ items: number; categories: number } | null>(null);
  const shop = business?.businessType === "shop";
  const help = supportWhatsAppUrl();

  // Owner only (README §3): staff never reach it from the app; a typed URL goes back to Account.
  useEffect(() => {
    if (business && business.myRole !== "owner") router.replace("/account");
  }, [business, router]);

  useEffect(() => {
    let alive = true;
    getMyAccount()
      .then((a) => {
        if (alive) setPhone(a.phone);
      })
      .catch(() => {});
    Promise.all([listDishes(), listCategories()])
      .then(([dishes, categories]) => {
        if (alive) setCounts({ items: dishes.length, categories: categories.length });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const banner = error?.where === "banner" ? error : null;
  const canCreate = name.trim() !== "" && location !== null && !actionsDisabled && !banner && phone !== null && !saving;

  async function create() {
    if (!canCreate || !location || !phone) return;
    if (!insideServiceArea(location.point)) {
      setError(BRANCH_ERRORS.outside_service_area);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await createBranch(toBranchRequest({ name, location, copyMenu: copy, contactPhone: phone }));
      enterBranch(next, `${next.name} is ready`);
    } catch (err) {
      setSaving(false);
      setError(branchErrorFor(err instanceof ApiError ? err.reason : undefined, err instanceof ApiError ? err.message : "Couldn't create the branch. Try again."));
    }
  }

  return (
    <Kitchen active="account" tabs={false}>
      <div className={`m-page${saving ? " m-c7-saving" : ""}`}>
        <AppBar back="/account" title="Add a branch" />
        {actionsDisabled && (
          <div className="m-offline m-c7-offline" role="alert">
            <Icon name="wifi-off" size={16} />
            <span>No connection, retrying…</span>
          </div>
        )}
        <div className="m-c7" aria-busy={saving || undefined}>
          {banner && (
            <div className="m-c7-banner" role="alert">
              <Icon name="circle-alert" size={16} />
              <span>
                {banner.message}{" "}
                {help && (
                  <a href={help} target="_blank" rel="noreferrer">
                    Open WhatsApp
                  </a>
                )}
              </span>
            </div>
          )}

          <div className="m-fld">
            <label htmlFor="branch-name">Branch name</label>
            <div className="m-in" data-invalid={error?.where === "name" || undefined} style={error?.where === "name" ? { borderColor: "var(--danger)" } : undefined}>
              <input
                id="branch-name"
                value={name}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  if (error?.where === "name") setError(null);
                }}
              />
            </div>
            {error?.where === "name" ? (
              <span className="m-c7-err" role="alert">
                <Icon name="circle-alert" size={15} />
                {error.message}
              </span>
            ) : (
              <span className="m-hint">How customers will see it, like Mama’s Kitchen · Avondale</span>
            )}
          </div>

          <LocationField
            value={location}
            searchMeta="From search"
            errorStyle="card"
            error={error?.where === "location" ? error.message : undefined}
            onChange={(loc) => {
              setLocation(loc);
              if (error?.where === "location") setError(null);
            }}
          />

          <div className="m-c7-copy">
            <div className="m-t">
              <b>{shop ? "Copy my items" : "Copy my menu"}</b>
              {counts && <span>{catalogueCount(business?.businessType, counts.items, counts.categories)}</span>}
            </div>
            <Switch checked={copy} label={shop ? "Copy my items" : "Copy my menu"} onChange={setCopy} />
          </div>

          <p className="m-c7-note">Your logo, photos, opening hours and cash rule come too. You can change them in the new branch.</p>
        </div>

        <div className="m-foot m-c7-foot">
          <button type="button" className="m-btn" disabled={!canCreate} aria-busy={saving || undefined} onClick={() => void create()}>
            {saving ? (
              <>
                <span className="m-spin" aria-hidden="true" />
                Creating branch…
              </>
            ) : (
              "Create branch"
            )}
          </button>
        </div>
      </div>
    </Kitchen>
  );
}
