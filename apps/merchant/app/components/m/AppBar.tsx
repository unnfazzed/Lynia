"use client";

import Link from "next/link";
import { Icon } from "../icons";

/**
 * A pushed screen's bar (merchant-mobile README "Screens": a back chevron plus a 16px/700 title). Back
 * goes to the screen's FIXED parent (README "Navigation model"), never the browser history, so a deep
 * link or a reload still backs out to the right place. `onBack` replaces the link when a screen has to
 * run something first (the sign-up steps step back inside one page).
 */
export function AppBar({
  title,
  back,
  onBack,
  center = false,
  right,
}: {
  title?: React.ReactNode;
  back?: string;
  onBack?: () => void;
  center?: boolean;
  right?: React.ReactNode;
}) {
  const chevron = <Icon name="chevron-left" size={22} />;
  return (
    <div className="m-ab">
      {onBack ? (
        <button type="button" className="m-back" aria-label="Back" onClick={onBack}>
          {chevron}
        </button>
      ) : back ? (
        <Link href={back} className="m-back" aria-label="Back">
          {chevron}
        </Link>
      ) : null}
      <b style={center ? { textAlign: "center", fontSize: 13, color: "var(--muted)", fontWeight: 600 } : undefined}>{title}</b>
      {right ?? (center ? <span style={{ width: 36 }} /> : null)}
    </div>
  );
}
