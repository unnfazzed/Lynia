import { describe, expect, it } from "vitest";
import type { FleetBikerRow, OwnerFleetResponse } from "@lynia/shared";
import { bikersOnline } from "./use-fleet";

describe("bikersOnline (OB-M8 “My bikers · 2 online”)", () => {
  it("counts the bikers free to take a job: online, not on one or offline", () => {
    const b = (state: FleetBikerRow["state"]) => ({ state }) as FleetBikerRow;
    const fleet = { bikers: [b("on_a_job"), b("online"), b("online"), b("offline")] } as OwnerFleetResponse;
    expect(bikersOnline(fleet)).toBe(2);
  });
});
