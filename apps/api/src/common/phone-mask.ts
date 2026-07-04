/**
 * Phone masking for the admin surface (INTERFACE-AUDIT A-03, P0 security). Ops sees a full number ONLY
 * when the reveal window is legitimately open (a party on a live order — the same `PHONE_REVEAL_STATUSES`
 * rule the customer/rider tracking uses in orders.service getSnapshot). Everywhere else the number is
 * masked so the roster/monitor can't be used as a bulk PII scrape.
 *
 * This is the ONE masking implementation the admin routes call — the reveal DECISION (is this party on
 * a reveal-status order right now?) stays with the caller, which already knows the order context, so
 * both the redaction rule and the mask live in a single place rather than being re-copied per query.
 *
 * Format: keep the leading country code (up to `+` and 3 digits) and the last 4 digits; bullet the
 * middle — `+263771234567` → `+263••••••4567`. Short/garbage input degrades to a fully-bulleted token
 * rather than leaking whatever digits it holds.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  // Split the leading country code (`+` and its digits) from the national part when present.
  const m = /^(\+\d{1,3})(\d+)$/.exec(trimmed);
  if (m) {
    const [, cc, rest] = m;
    if (rest!.length <= 4) return `${cc}${"•".repeat(rest!.length)}`;
    const last4 = rest!.slice(-4);
    return `${cc}${"•".repeat(rest!.length - 4)}${last4}`;
  }
  // No parseable country code — keep the last 4 digits, bullet everything before them.
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 4) return "•".repeat(Math.max(digits.length, 1));
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
