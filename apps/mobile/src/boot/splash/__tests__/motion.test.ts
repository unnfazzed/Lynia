/**
 * The splash's curve builders (./motion.ts). They are what let every splash animation run as one
 * native-driven timing: pinned here so a delay, a pop overshoot or a keyframe loop keeps the handoff's
 * shape while never needing a JS timer or a JS-chained sequence.
 */
import { held, keyframesEasing, keyframesInput, popEasing } from "../motion";

const linear = (x: number): number => x;

describe("held", () => {
  it("folds the delay into the duration and holds at 0 until it has passed", () => {
    const { duration, easing } = held(300, 700, linear);
    expect(duration).toBe(1000);
    expect(easing(0)).toBe(0);
    expect(easing(0.3)).toBe(0);
    expect(easing(0.3 + 0.7 / 2)).toBeCloseTo(0.5);
    expect(easing(1)).toBe(1);
  });

  it("is the plain timing when there is no delay", () => {
    const { duration, easing } = held(0, 500, linear);
    expect(duration).toBe(500);
    expect(easing).toBe(linear);
  });
});

describe("popEasing", () => {
  it("rises to the peak at 70%, then settles at exactly 1", () => {
    const pop = popEasing(linear);
    expect(pop(0)).toBe(0);
    expect(pop(0.35)).toBeCloseTo(0.54);
    expect(pop(0.7)).toBeCloseTo(1.08);
    expect(pop(1)).toBeCloseTo(1);
  });
});

describe("keyframesEasing", () => {
  it("maps each eased segment onto its share of the output, monotonically, ending at the timing's toValue", () => {
    const ease = keyframesEasing(3, (x) => x * x);
    expect(ease(0)).toBe(0);
    expect(ease(1 / 3)).toBeCloseTo(1 / 3);
    expect(ease(1 / 6)).toBeCloseTo(0.25 / 3); // half-way through segment 0, eased
    expect(ease(2 / 3)).toBeCloseTo(2 / 3);
    expect(ease(1)).toBe(1);
    let prev = -1;
    for (let x = 0; x <= 1; x += 0.01) {
      expect(ease(x)).toBeGreaterThanOrEqual(prev);
      prev = ease(x);
    }
  });

  it("pairs with an evenly spaced inputRange", () => {
    expect(keyframesInput(2)).toEqual([0, 0.5, 1]);
    expect(keyframesInput(3)).toEqual([0, 1 / 3, 2 / 3, 1]);
  });
});
