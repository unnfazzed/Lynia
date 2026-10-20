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
import { getTeam, leaveBusiness, listMyInvites, noBusinessPath } from "../../lib/team-api";
import { dayKeyFor } from "../../lib/hours";
import { getFleet } from "../../lib/fleet-api";
import { ownBikersRow, type OwnBikersRow } from "../../lib/own-bikers";
import { OBM } from "../../lib/own-bikers-copy";

type Confirm = null | "sign-out" | "leave";

/**
 * T3 · Account (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77) over D-48's C4. The mint
 * top card: the business's initials, its name and "Farai · Owner · 2 branches". Then two grouped cards,
 * each row showing its current value so most visits need no tap — YOUR SHOP FRONT (Profile & photos ·
 * Opening hours "08:00–22:00" · Branches "2") and ORDERS & PEOPLE (Taking orders "Auto-accept off" ·
 * Preferred riders "4" · Team "1 invite open") — and the red "Sign out" pill behind the confirm sheet. Own bikers v1
 * (OB-M1, D-117): a business with Own bikers gets "Own bikers · 4 bikers · 1 invite open" (staff "4 bikers", a gold
 * "Paused" chip when paused) instead of Preferred riders, which goes for everyone once it is retired.
 *
 * Staff don't see the shop front, Branches or Team (merchant-mobile README C4). A staff member also gets
 * "Leave this business". Help & support (WhatsApp) is its own HELP group (D-77 follow-ups).
 */
export default function AccountPage() {
  const router = useRouter();
  const business = useBusiness();
  const { signOut } = useKitchenConnection();
  const toast = useToast();
  const [pendingInvites, setPendingInvites] = useState(0);
  const [invitedBy, setInvitedBy] = useState<string | null>(null);
  // Own bikers (OB-M1, D-117): undefined while the roster is read; null = this business has none.
  const [ownBikers, setOwnBikers] = useState<OwnBikersRow | undefined>(undefined);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = business?.myRole === "owner";
  const shop = business?.businessType === "shop";
  const help = supportWhatsAppUrl(`Hi LyniaGo, I need help with ${business?.name ?? "my business"}`);
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

  // MJ-RL15: staff work at one business, so an invite from another one can only be taken after Leave.
  const staff = business?.myRole === "staff";
  useEffect(() => {
    if (!staff) return undefined;
    let alive = true;
    listMyInvites()
      .then((r) => {
        if (alive) setInvitedBy(r.invites.find((i) => i.businessName !== business?.name)?.businessName ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [staff, business?.name]);

  useEffect(() => {
    let alive = true;
    // 503 (the merchant vertical switched off), or any failure: no row, as for a business admin disabled.
    getFleet()
      .then((fleet) => {
        if (alive) setOwnBikers(ownBikersRow(fleet));
      })
      .catch(() => {
        if (alive) setOwnBikers(null);
      });
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
      router.replace(await noBusinessPath());
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
          {/* OB-M1: "Own bikers" replaces Preferred riders, which is retired (owner, 2026-10-20). */}
          {ownBikers ? (
            <Row
              href="/own-bikers"
              icon="bike"
              label={OBM.ownBikers}
              value={ownBikers.kind === "value" ? ownBikers.text : undefined}
              badge={ownBikers.kind === "paused" ? OBM.ownBikersPaused : undefined}
            />
          ) : null}
          {owner && <Row href="/team" icon="user" label="Team" badge={pendingInvites > 0 ? `${pendingInvites} invite${pendingInvites === 1 ? "" : "s"} open` : undefined} />}
        </div>
        {/* T3 (D-77 follow-ups): a HELP group — "Help & support · WhatsApp", the text prefilled. */}
        {help && (
          <>
            <h2 className="m-bh" style={{ marginTop: 6 }}>
              HELP
            </h2>
            <div className="m-group">
              <Row href={help} external icon="circle-help" label="Help & support" value="WhatsApp" />
            </div>
          </>
        )}
        {staff && invitedBy && <p className="m-hint">{`${invitedBy} invited you. Leave this team to join.`}</p>}
        {staff && (
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
