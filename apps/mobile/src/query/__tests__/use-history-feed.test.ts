import { QueryClient } from "@tanstack/react-query";
import {
  EARNINGS_SUMMARY_KEY,
  HISTORY_KEY,
  invalidateCustomerOrderHistory,
  invalidateRiderJobQueries,
} from "../use-history-feed";

// WD-022: `deliverM` (confirmDelivery) — and its siblings cancelM/undeliverM, the rider job socket's
// reconnect self-heal, and the customer's order socket/foreground resume — used to invalidate only
// `["activeJob"]` (or `orderKey`/`["activeCustomerOrder"]`), never `["history"]`/`["earnings","summary"]`.
// A rider/customer who'd peeked at Trip History or Earnings within the 30s staleTime window just before
// a delivery/cancel/undeliver landed would see a stale total/list with no indication anything was stale.
// These two funnels are now the single place every one of those call sites invalidates through, so this
// test is the regression guard for the whole class, not just the one reported call site.
describe("invalidateRiderJobQueries (WD-022)", () => {
  it("invalidates the active job, Trip History, AND the earnings summary together", () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");

    invalidateRiderJobQueries(qc);

    expect(spy).toHaveBeenCalledWith({ queryKey: ["activeJob"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: HISTORY_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: EARNINGS_SUMMARY_KEY });
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe("invalidateCustomerOrderHistory (WD-022)", () => {
  it("invalidates Trip History (the customer side has no earnings aggregate)", () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");

    invalidateCustomerOrderHistory(qc);

    expect(spy).toHaveBeenCalledWith({ queryKey: HISTORY_KEY });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
