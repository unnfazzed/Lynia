import { createSelfHealGate } from "../self-heal-gate";

describe("createSelfHealGate (B-O5)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires immediately on the first call", () => {
    const heal = jest.fn();
    const gated = createSelfHealGate(heal, 5000);
    gated();
    expect(heal).toHaveBeenCalledTimes(1);
  });

  it("drops a call within minIntervalMs of the last one that fired", () => {
    const heal = jest.fn();
    const gated = createSelfHealGate(heal, 5000);
    gated();
    jest.advanceTimersByTime(1000);
    gated(); // 1s after the first — still inside the 5s floor
    jest.advanceTimersByTime(1000);
    gated(); // 2s after the first — still inside the 5s floor
    expect(heal).toHaveBeenCalledTimes(1);
  });

  it("fires again once minIntervalMs has elapsed since the last successful call", () => {
    const heal = jest.fn();
    const gated = createSelfHealGate(heal, 5000);
    gated();
    jest.advanceTimersByTime(5000);
    gated();
    expect(heal).toHaveBeenCalledTimes(2);
  });

  it("resets the window from the last call that actually fired, not from a dropped attempt", () => {
    const heal = jest.fn();
    const gated = createSelfHealGate(heal, 5000);
    gated(); // fires at t=0
    jest.advanceTimersByTime(3000);
    gated(); // t=3000, dropped (inside the 5s floor from t=0)
    jest.advanceTimersByTime(3000);
    gated(); // t=6000 — 6s since the fire at t=0, so this fires
    expect(heal).toHaveBeenCalledTimes(2);
  });
});
