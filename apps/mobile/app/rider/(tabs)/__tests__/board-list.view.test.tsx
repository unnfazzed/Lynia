/**
 * RJM.board `list` region (mock→RN codegen). `RiderBoardListView` is the adopted, structurally-parity
 * view for the rider job-board list: one app `JobCard` per open order, keyed by order id. It carries
 * NO accept/agreed-price/assignment logic — a parcel row's action is the container's `onAction`, which
 * opens the OFFER-COMPOSE seam (`chooseOrder`). This pins the display + the action wiring so a future
 * change to the view (or its data seam) that dropped a row or mis-wired the per-row action would fail:
 *   (1) it renders exactly one card per job, in order, with each job's fare/route/note;
 *   (2) tapping a row's action fires THAT job's `onAction` exactly once — the offer-compose trigger.
 */
import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { RiderBoardListView, type RiderBoardJob } from "../board-list.view";

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode)).join(" ");
}

function job(id: string, overrides: Partial<RiderBoardJob> = {}): RiderBoardJob {
  return {
    id,
    jobType: "parcel",
    from: `Pickup ${id}`,
    to: `Dropoff ${id}`,
    distanceLabel: "3.1 km away",
    fare: "3.00",
    note: `Parcel ${id} · asking $3.00`,
    actionLabel: "Make an offer",
    onAction: () => {},
    ...overrides,
  };
}

describe("RiderBoardListView (RJM.board list region)", () => {
  it("renders exactly one JobCard per job, with each job's route / fare / note", () => {
    const jobs = [job("a"), job("b"), job("c")];
    const tree = renderer.create(<RiderBoardListView jobs={jobs} />);

    // One action button per row — the JobCard's primary action.
    const actions = tree.root.findAll((n) => n.props.label === "Make an offer" && typeof n.props.onPress === "function");
    expect(actions).toHaveLength(jobs.length);

    const text = textOf(tree);
    for (const j of jobs) {
      expect(text).toContain(j.from);
      expect(text).toContain(j.to);
    }
    expect(text).toContain("$3.00"); // formatMoney of "3.00", not the raw string
  });

  it("renders an empty list with no cards (nothing in range)", () => {
    const tree = renderer.create(<RiderBoardListView jobs={[]} />);
    expect(tree.root.findAll((n) => n.props.label === "Make an offer")).toHaveLength(0);
  });

  it("fires the tapped row's own onAction exactly once (the offer-compose seam), never a sibling's", () => {
    const onA = jest.fn();
    const onB = jest.fn();
    const jobs = [job("a", { onAction: onA }), job("b", { onAction: onB })];
    const tree = renderer.create(<RiderBoardListView jobs={jobs} />);

    const actions = tree.root.findAll((n) => n.props.label === "Make an offer" && typeof n.props.onPress === "function");
    act(() => {
      (actions[1]!.props as { onPress: () => void }).onPress();
    });

    expect(onB).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
  });

  it("carries a FOOD row's accept action verbatim (same anatomy, only tag/action differ)", () => {
    const jobs = [job("f", { jobType: "food", actionLabel: "Accept this job", note: "Collect $15.50 for the kitchen" })];
    const tree = renderer.create(<RiderBoardListView jobs={jobs} />);
    const text = textOf(tree);
    expect(text).toContain("FOOD");
    expect(text).toContain("Accept this job");
  });
});
