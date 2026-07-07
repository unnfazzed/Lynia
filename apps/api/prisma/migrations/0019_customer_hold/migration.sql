-- Customer account "on hold" (journey S·2). A held customer is blocked from broadcasting a new order
-- (OrdersService.create returns 403 { reason: "on_hold" }); `hold_reason` backs the audit row + the
-- admin console. Additive/defaulted so existing rows take `on_hold = false` (not held) — non-destructive.
ALTER TABLE "profiles"
  ADD COLUMN "on_hold"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hold_reason" TEXT;
