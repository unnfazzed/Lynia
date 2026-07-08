import { DELIVERY_OTP_MAX_ATTEMPTS as SHARED_DELIVERY_OTP_MAX_ATTEMPTS } from "@lynia/shared";
import { DELIVERY_OTP_MAX_ATTEMPTS } from "../rider-job";

describe("DELIVERY_OTP_MAX_ATTEMPTS", () => {
  it("is re-exported from @lynia/shared, not a locally-duplicated copy", () => {
    // Regression guard: this used to be a hand-copied `= 5` that could silently drift from the
    // server's own cap (apps/api/src/orders/order-lifecycle.service.ts).
    expect(DELIVERY_OTP_MAX_ATTEMPTS).toBe(SHARED_DELIVERY_OTP_MAX_ATTEMPTS);
  });
});
