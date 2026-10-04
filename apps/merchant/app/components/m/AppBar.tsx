"use client";

import Link from "next/link";
import { Icon } from "../icons";

/**
 * A pushed screen's back header (Merchant v2, ledger D-77: 52 tall, a 44px back target in the accent
 * text, the title 17/700, an optional figure on the right at 16/700). Back
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
  const chevron = <Icon name="chevron-left" size={20} />;
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
