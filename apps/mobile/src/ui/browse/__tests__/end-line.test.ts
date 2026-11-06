import { endLine } from "../copy";

describe("endLine (D-126)", () => {
  it("reads in the singular at one venue", () => {
    expect(endLine("shops", 1, "Bulawayo")).toBe("That’s the only shop delivering to Bulawayo.");
    expect(endLine("food", 1, "Belgravia")).toBe("That’s the only restaurant delivering to Belgravia.");
    expect(endLine("pharmacy", 1, "Avondale")).toBe("That’s the only pharmacy delivering to Avondale.");
  });

  it("keeps the handoff's line from two up", () => {
    expect(endLine("shops", 2, "Bulawayo")).toBe("That’s all 2 shops delivering to Bulawayo.");
  });
});
