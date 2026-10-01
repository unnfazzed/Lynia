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

type Confirm = null | "sign-out" | "leave";

/**
 * C4 · Account (packages/design/handoff/merchant-mobile): the business's initials avatar, its name and
 * "Farai · Owner", then Shop front · Opening hours · Branches (owner, D-51) · Taking orders (owner, restaurant) · Preferred riders · Team (the gold count is the
 * invites still waiting) · Help, and a red "Sign out" behind the confirm sheet. It is where the old
 * top bar's person menu, the setup banner and the side rail's Shop / Hours / Riders / Team went.
 *
 * Staff don't see Shop front or Team (README C4: "Staff should not see Money or Team"; the shop front
 * is the owner's). A staff member also gets "Leave this business" — the one person-menu action with no
 * other home, so it stays, behind the same confirm sheet.
 */
export default function AccountPage() {
  const router = useRouter();
  const business = useBusiness();
  const { signOut } = useKitchenConnection();
  const toast = useToast();
  const [pendingInvites, setPendingInvites] = useState(0);
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

  const person = business ? `${business.myName ? `${firstName(business.myName)} · ` : ""}${ROLE_LABEL[business.myRole]}` : "";

  return (
    <Kitchen active="account">
      <div className="m-hd">
        <div className="m-hdt">
          <div className={`m-th ${shop ? "m-tile-shop" : "m-tile-food"}`} style={{ width: 52, height: 52, borderRadius: "50%", fontSize: 20 }}>
            {business ? initials(business.name) : ""}
          </div>
          <div className="m-biz">
            <b style={{ fontSize: 18 }}>{business?.name ?? ""}</b>
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>{person}</span>
          </div>
        </div>
      </div>

      <div className="m-bd" style={{ paddingTop: 6, gap: 0 }}>
        {owner && <Row href="/shop" icon="store" label="Shop front" />}
        <Row href="/hours" icon="clock" label="Opening hours" />
        {/* Branches (ledger D-51): owner only, the count once there are 2+; opens C7. */}
        {owner && <Row href="/branches/new" icon="map-pin" label="Branches" count={branches.length >= 2 ? String(branches.length) : undefined} />}
        {/* Auto-accept and the customer-facing number are the owner's, and only a restaurant takes orders. */}
        {owner && !shop && <Row href="/ordering" icon="inbox" label="Taking orders" />}
        <Row href="/riders" icon="bike" label="Preferred riders" />
        {owner && <Row href="/team" icon="user" label="Team" badge={pendingInvites > 0 ? String(pendingInvites) : undefined} />}
        {help && <Row href={help} external icon="phone" label="Help" />}
        {business?.myRole === "staff" && (
          <button type="button" className="m-lnk m-red" style={{ justifyContent: "flex-start" }} onClick={() => setConfirm("leave")}>
            Leave this business
          </button>
        )}
        <button type="button" className="m-lnk m-red" style={{ justifyContent: "flex-start" }} onClick={() => setConfirm("sign-out")}>
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
  count,
  external,
}: {
  href: string;
  icon: IconName;
  label: string;
  badge?: string;
  /** A plain muted count (Branches), unlike the gold `badge` (Team's waiting invites). */
  count?: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <Icon name={icon} size={18} color="var(--accent-text)" />
      <div className="m-t">
        <b>{label}</b>
      </div>
      {badge && <span className="m-pl m-gold">{badge}</span>}
      {count && (
        <span className="m-num" style={{ fontSize: 12, color: "var(--muted)" }}>
          {count}
        </span>
      )}
      <Icon name="chevron-right" size={18} color="var(--muted)" />
    </>
  );
  return external ? (
    <a className="m-li" href={href} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link className="m-li" href={href}>
      {inner}
    </Link>
  );
}
