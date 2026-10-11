/**
 * P10 (customer review 2026-10-07): Home's idle warm-ups (route graphs, the 1×1 Maps SDK map) used to fire at
 * ~1.9 s of a cold start, inside Home's rise and the section entrance. `useBootSettled` holds them until the
 * boot has ended AND the last section has risen; a screen mounted after the boot is settled at once.
 */
import renderer, { act } from "react-test-renderer";

let mockBooting = true;
jest.mock("../boot-phase", () => ({ useBootPhase: () => ({ booting: mockBooting }) }));

import { reportSplashExit, resetBootReadinessForTest } from "../boot-readiness";
import { ENTRANCE_END_MS } from "../splash/BootEntrance";
import { useBootSettled } from "../use-boot-settled";

const seen: boolean[] = [];
function Probe(): null {
  seen.push(useBootSettled());
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  resetBootReadinessForTest();
  seen.length = 0;
});
afterEach(() => jest.useRealTimers());

it("stays false while booting, and after the boot until the entrance has finished", () => {
  mockBooting = true;
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  act(() => jest.advanceTimersByTime(5_000));
  expect(seen[seen.length - 1]).toBe(false);
  // The splash's exit starts, and its end (about 700 ms later) ends the boot.
  reportSplashExit(Date.now());
  act(() => jest.advanceTimersByTime(700));
  mockBooting = false;
  act(() => tree.update(<Probe />));
  expect(seen[seen.length - 1]).toBe(false);
  act(() => jest.advanceTimersByTime(ENTRANCE_END_MS - 700 - 1));
  expect(seen[seen.length - 1]).toBe(false);
  act(() => jest.advanceTimersByTime(2));
  expect(seen[seen.length - 1]).toBe(true);
  act(() => tree.unmount());
});

it("is settled at once for a screen mounted after the boot", () => {
  mockBooting = false;
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  expect(seen[0]).toBe(true);
  act(() => tree.unmount());
});
