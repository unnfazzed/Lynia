/**
 * B-O2: `React.memo` boundary regression. `JobDetailsCard` mounts the ~950-line job screen's most
 * expensive piece (LiveMap + Stepper) — this pins that it does NOT re-render across an unrelated
 * screen re-render when `order`/`riderPoint` are referentially stable, and DOES re-render when the
 * rider's position actually moves. `riderPoint` in particular used to be a fresh `{lat,lng}` object
 * literal built inline on every render in job.tsx/food-job.tsx (even with identical values), which
 * would defeat the default shallow-prop memo comparison here regardless of this component's own memo
 * — the second test below pins exactly that failure mode, matching the fix (job.tsx/food-job.tsx now
 * `useMemo` it off the primitive lat/lng fields).
 *
 * LiveMap mounts react-native-maps (a native module this test environment can't render — see
 * live-tracking-isolation.test.tsx's identical note) — mocked to a trivial stand-in so the REAL
 * JobDetailsCard (not a probe) is under test.
 */
import React, { useState } from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import type { OrderSnapshot } from "../../../api/orders";
import { countMemoRenders } from "../../../testing/render-count";

jest.mock("../../LiveMap", () => ({
  LiveMap: () => null,
}));

import { JobDetailsCard } from "../JobDetailsCard";

const baseOrder: OrderSnapshot = {
  id: "order-1",
  status: "en_route_dropoff",
  agreedFare: "5.00",
  proposedFare: "4.50",
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
  rider: { profileId: "r1", currentLat: -17.825, currentLng: 31.055, updatedAt: "2026-07-12T12:00:00.000Z" },
  events: [{ status: "assigned", createdAt: "2026-07-12T11:50:00.000Z" }],
  counterpartyPhone: null,
  expiresAt: null,
};

describe("JobDetailsCard render isolation (B-O2)", () => {
  it("does not re-render when the parent re-renders but order/riderPoint are referentially unchanged", () => {
    const { count } = countMemoRenders(JobDetailsCard);
    const riderPoint = { lat: -17.825, lng: 31.055 };

    function Harness(): React.ReactElement {
      const [tick, setTick] = useState(0);
      return (
        <>
          <Text onPress={() => setTick((t) => t + 1)}>{tick}</Text>
          <JobDetailsCard order={baseOrder} riderPoint={riderPoint} isActive />
        </>
      );
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(count()).toBe(1);

    const trigger = tree.root.findByProps({ children: 0 });
    act(() => {
      (trigger.props as { onPress: () => void }).onPress();
    });
    expect(count()).toBe(1);
  });

  it("re-renders when riderPoint changes", () => {
    const { count } = countMemoRenders(JobDetailsCard);

    function Harness(): React.ReactElement {
      const [lat, setLat] = useState(-17.825);
      return (
        <>
          <Text onPress={() => setLat(-17.826)}>{lat}</Text>
          <JobDetailsCard order={baseOrder} riderPoint={{ lat, lng: 31.055 }} isActive />
        </>
      );
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(count()).toBe(1);

    const trigger = tree.root.findByProps({ children: -17.825 });
    act(() => {
      (trigger.props as { onPress: () => void }).onPress();
    });
    expect(count()).toBe(2);
  });

  it("a fresh riderPoint object with IDENTICAL values still re-renders (the pitfall the caller-side useMemo fixes)", () => {
    const { count } = countMemoRenders(JobDetailsCard);

    function Harness(): React.ReactElement {
      const [tick, setTick] = useState(0);
      // Deliberately NOT memoized — mirrors what job.tsx/food-job.tsx did before the B-O2 fix: a new
      // {lat,lng} object literal every render, even though the values never change.
      const riderPoint = { lat: -17.825, lng: 31.055 };
      return (
        <>
          <Text onPress={() => setTick((t) => t + 1)}>{tick}</Text>
          <JobDetailsCard order={baseOrder} riderPoint={riderPoint} isActive />
        </>
      );
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(count()).toBe(1);

    const trigger = tree.root.findByProps({ children: 0 });
    act(() => {
      (trigger.props as { onPress: () => void }).onPress();
    });
    // Same values, new object — JobDetailsCard's default shallow-prop memo can't tell the difference
    // from a real change, so it re-renders. This is exactly why the call sites useMemo riderPoint.
    expect(count()).toBe(2);
  });
});
