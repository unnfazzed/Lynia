"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAlarmController } from "../../components/alarm-singleton";
import { Icon, type IconName } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { ConfirmSheet } from "../../components/m/ConfirmSheet";
import { useToast } from "../../components/m/Toast";
import { ApiError } from "../../lib/api-client";
import { useBranches } from "../../lib/branches";
import { clearBusinessCache, useBusiness } from "../../lib/business";
import { supportWhatsAppUrl } from "../../lib/config";
import { firstName, initials, ROLE_LABEL } from "../../lib/team";
import { getTeam, leaveBusiness } from "../../lib/team-api";
import { dayKeyFor } from "../../lib/hours";
import { listRiders } from "../../lib/riders-api";

type Confirm = null | "sign-out" | "leave";

/**
 * T3 · Account (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77) over D-48's C4. The mint
 * top card: the business's initials, its name and "Farai · Owner · 2 branches". Then two grouped cards,
 * each row showing its current value so most visits need no tap — YOUR SHOP FRONT (Profile & photos ·
 * Opening hours "08:00–22:00" · Branches "2") and ORDERS & PEOPLE (Taking orders "Auto-accept off" ·
 * Preferred riders "4" · Team "1 invite open") — and the red "Sign out" pill behind the confirm sheet.
 *
 * Staff don't see the shop front, Branches or Team (merchant-mobile README C4). A staff member also gets
 * "Leave this business". Help (WhatsApp) stays as the last row (D-77 §4).
 */
export default function AccountPage() {
  const router = useRouter();
  const business = useBusiness();
  const { signOut } = useKitchenConnection();
  const toast = useToast();
  const [pendingInvites, setPendingInvites] = useState(0);
  const [riderCount, setRiderCount] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = business?.myRole === "owner";
  const shop = business?.businessType === "shop";
  const help = supportWhatsAppUrl();
  const branches = useBranches(owner);

  useEffect(() => {
    if (!owner) return undefined;
    let alive = true;
    getTeam()
      .then((team) => {
        if (alive) setPendingInvites(team.invites.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [owner]);

  useEffect(() => {
    let alive = true;
    listRiders()
      .then((r) => {
        if (alive) setRiderCount(r.riders.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function leave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await leaveBusiness();
      clearBusinessCache();
      getAlarmController().stop();
      toast("You left the business");
      router.replace("/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't leave. Try again.");
      setBusy(false);
    }
  }

  const branchCount = branches.length;
  const person = business
    ? [business.myName ? firstName(business.myName) : null, ROLE_LABEL[business.myRole], owner && branchCount >= 2 ? `${branchCount} branches` : null]
        .filter(Boolean)
        .join(" · ")
    : "";
  const todayHours = business?.hours ? (business.hours as Record<string, { open: string; close: string } | undefined>)[dayKeyFor(new Date())] : undefined;
  const hoursValue = business?.hours ? (todayHours ? `${todayHours.open}–${todayHours.close}` : "Closed today") : undefined;
  const takingValue = shop ? (business?.freeDelivery ? "Free delivery on" : undefined) : business?.autoAccept ? "Auto-accept on" : "Auto-accept off";

  return (
    <Kitchen active="account">
      <div className="m-hd m-acct">
        <span className={shop ? "m-tile-shop" : "m-acct-av"}>{business ? initials(business.name) : ""}</span>
        <div>
          <b>{business?.name ?? ""}</b>
          <span>{person}</span>
        </div>
      </div>

      <div className="m-bd" style={{ paddingTop: 16, gap: 10 }}>
        {owner && (
          <>
            <h2 className="m-bh">YOUR SHOP FRONT</h2>
            <div className="m-group">
              <Row href="/shop" icon="store" label="Profile & photos" />
              <Row href="/hours" icon="clock" label="Opening hours" value={hoursValue} />
              <Row href="/branches/new" icon="map-pin" label="Branches" value={branchCount >= 1 ? String(branchCount) : undefined} />
            </div>
          </>
        )}
        <h2 className="m-bh" style={owner ? { marginTop: 6 } : undefined}>
          ORDERS &amp; PEOPLE
        </h2>
        <div className="m-group">
          {!owner && <Row href="/hours" icon="clock" label="Opening hours" value={hoursValue} />}
          {owner && <Row href="/ordering" icon="inbox" label="Taking orders" value={takingValue} />}
          <Row href="/riders" icon="bike" label="Preferred riders" value={riderCount !== null ? String(riderCount) : undefined} />
          {owner && <Row href="/team" icon="user" label="Team" badge={pendingInvites > 0 ? `${pendingInvites} invite${pendingInvites === 1 ? "" : "s"} open` : undefined} />}
          {help && <Row href={help} external icon="phone" label="Help" />}
        </div>
        {business?.myRole === "staff" && (
          <button type="button" className="m-lnk m-red" onClick={() => setConfirm("leave")}>
            Leave this business
          </button>
        )}
        <button type="button" className="m-signout" onClick={() => setConfirm("sign-out")}>
          Sign out
        </button>
      </div>

      {confirm === "sign-out" && (
        <ConfirmSheet
          title="Sign out?"
          body="New orders won’t ring on this phone."
          confirmLabel="Sign out"
          onConfirm={() => {
            setConfirm(null);
            signOut();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "leave" && business && (
        <ConfirmSheet
          title={`Leave ${business.name}?`}
          body="You’ll stop seeing its orders. The owner can add you again."
          confirmLabel="Leave"
          busy={busy}
          error={error}
          onConfirm={() => void leave()}
          onCancel={() => {
            setConfirm(null);
            setError(null);
          }}
        />
      )}
    </Kitchen>
  );
}

function Row({
  href,
  icon,
  label,
  badge,
  value,
  external,
}: {
  href: string;
  icon: IconName;
  label: string;
  /** A worded gold badge ("1 invite open"), never a bare count. */
  badge?: string;
  /** The row's current value ("08:00–22:00", "Auto-accept off", "4"). */
  value?: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <Icon name={icon} size={20} color="var(--accent-text)" />
      <b>{label}</b>
      {value && <span className="m-num">{value}</span>}
      {badge && <em>{badge}</em>}
      <Icon name="chevron-right" size={16} color="var(--muted)" />
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link href={href}>{inner}</Link>
  );
}
