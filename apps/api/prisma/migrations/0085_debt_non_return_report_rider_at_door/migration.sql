-- Reviewed list 2026-10-07, owner decisions D3 + D5. Expand-only: two nullable columns, no default, no
-- rewrite; existing rows stay null.
--  * D3 (MJ-RH1): the merchant's "It wasn't returned" is a FLAG for support, not a write-off. The report is
--    stamped here; the debt stays open and only an admin writes it off or suspends the rider.
--  * D5 (U10): the rider's "I'm here" at the drop-off, stamped on the server. A hint only (never a gate):
--    the customer's door card and the start of the cash-handshake window read it.
ALTER TABLE "orders" ADD COLUMN "debt_non_return_reported_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "rider_at_dropoff_at" TIMESTAMP(3);
