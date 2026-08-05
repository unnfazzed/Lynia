import type { MerchantPaymentMethod } from "@lynia/shared";
import { Icon } from "../icons";

/**
 * The kit's PayTag — "the single most important token on a rider/merchant card"
 * (packages/design/explorations/restaurants/r-parts.jsx:281-295). CASH wears the highlight wash,
 * WALLET the accent wash, each with its own glyph; `lg` is the size the NEW ORDER takeover uses.
 * Presentation only — the label is still just the order's own payment method.
 */
export function PayTag({ pay, size = "md" }: { pay: MerchantPaymentMethod | null; size?: "md" | "lg" }) {
  // `paymentMethod` is nullable on the queue's own order shape; CASH stays the fallback reading, as
  // the plain-text label this replaces already did.
  const cash = pay !== "wallet";
  const big = size === "lg";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 8,
        padding: big ? "6px 12px" : "4px 9px",
        fontSize: big ? 15 : 12,
        fontWeight: 800,
        letterSpacing: ".04em",
        background: cash ? "var(--highlight-wash)" : "var(--accent-wash)",
        color: cash ? "var(--highlight-ink)" : "var(--accent-text)",
        border: `1px solid ${cash ? "var(--highlight-border)" : "#bfe7cf"}`,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={cash ? "banknote" : "wallet"} size={big ? 18 : 13} color={cash ? "var(--highlight-ink)" : "var(--accent-text)"} />
      {cash ? "CASH" : "WALLET"}
    </span>
  );
}
