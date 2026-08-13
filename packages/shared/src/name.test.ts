import { describe, expect, it } from "vitest";
import { formatNameShort } from "./name";

describe("formatNameShort", () => {
  it("renders the mock's identity-row form: first name + surname initial", () => {
    expect(formatNameShort("Chipo Marufu")).toBe("Chipo M.");
    expect(formatNameShort("Tendai Moyo")).toBe("Tendai M.");
    expect(formatNameShort("  Ana  Maria  Silva ")).toBe("Ana S.");
  });

  it("passes single-word and empty names through unchanged (display never drops text)", () => {
    expect(formatNameShort("Chipo")).toBe("Chipo");
    expect(formatNameShort("  ")).toBe("");
  });
});
