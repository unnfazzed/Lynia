"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MerchantBranchResponse, MerchantProfileResponse } from "@lynia/shared";
import { ApiError } from "../../lib/api-client";
import { isLive } from "../../lib/branches";
import { switchBranch } from "../../lib/branches-api";
import { Icon } from "../icons";
import { useKitchenConnection } from "../KitchenConnectionProvider";
import { useToast } from "../m/Toast";
import { useEnterBranch } from "./use-enter-branch";

/**
 * C6 · Branches (merchant-mobile README section F; handoff `branches/README.md` §2): a bottom sheet over
 * the Orders home. "Your branches", one row per branch with the current one first (a check) and a grey
 * "Not live yet" pill on a branch LyniaGo hasn't switched on, then "+ Add a branch" (owner only), which
 * pushes C7. Offline: the red bar under the title, rows and Add disabled at 45%.
 */
export function BranchSheet({
  business,
  branches,
  onClose,
}: {
  business: MerchantProfileResponse;
  branches: MerchantBranchResponse[];
  onClose: () => void;
}) {
  const { actionsDisabled } = useKitchenConnection();
  const enterBranch = useEnterBranch();
  const toast = useToast();
  const [switching, setSwitching] = useState<string | null>(null);
  const owner = business.myRole === "owner";
  const offline = actionsDisabled;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pick(branch: MerchantBranchResponse) {
    if (branch.active || branch.id === business.id) {
      onClose();
      return;
    }
    if (switching || offline) return;
    setSwitching(branch.id);
    try {
      const next = await switchBranch(branch.id);
      onClose();
      enterBranch(next, `Now at ${next.name}`);
    } catch (err) {
      setSwitching(null);
      toast(err instanceof ApiError ? err.message : "Couldn't switch branch. Try again.");
    }
  }

  return (
    <div className="m-overlay" style={{ zIndex: 50 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label="Close" onClick={onClose} />
        <div className="m-sheet m-branches" role="dialog" aria-modal="true" aria-labelledby="m-branches-title">
          <div className="m-grab" />
          <b id="m-branches-title" className="m-branches-title">
            Your branches
          </b>
          {offline && (
            <div className="m-offline m-branches-offline" role="alert">
              <Icon name="wifi-off" size={16} />
              <span>No connection, retrying…</span>
            </div>
          )}
          <div className="m-branches-list" aria-disabled={offline || undefined}>
            {branches.map((b) => {
              const current = b.active || b.id === business.id;
              const notLive = !current && !isLive({ pilotEnabled: b.pilotEnabled, businessType: business.businessType });
              const label = [b.name, b.landmark, current ? "current branch" : null, notLive ? "not live yet" : null].filter(Boolean).join(", ");
              return (
                <button
                  key={b.id}
                  type="button"
                  className="m-branch"
                  aria-label={label}
                  disabled={offline || (switching !== null && switching !== b.id)}
                  aria-current={current ? "true" : undefined}
                  onClick={() => void pick(b)}
                >
                  <span className="m-t">
                    <b>{b.name}</b>
                    {b.landmark && <span>{b.landmark}</span>}
                  </span>
                  {current ? (
                    <Icon name="check" size={20} color="var(--accent-text)" />
                  ) : (
                    notLive && <span className="m-pl m-grey">Not live yet</span>
                  )}
                </button>
              );
            })}
          </div>
          {owner &&
            (offline ? (
              <button type="button" className="m-gh m-branches-add" disabled>
                <Icon name="plus" size={16} />
                Add a branch
              </button>
            ) : (
              <Link href="/branches/new" className="m-gh m-branches-add" onClick={onClose}>
                <Icon name="plus" size={16} />
                Add a branch
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
