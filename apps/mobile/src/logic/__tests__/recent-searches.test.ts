import { RECENT_MAX, parseRecent, withRecent } from "../recent-searches";

describe("recent searches (Browse v2 X1, D-57)", () => {
  it("puts the newest first and drops an earlier copy, whatever its case", () => {
    expect(withRecent(["pizza", "Sadza"], "sadza")).toEqual(["sadza", "pizza"]);
  });

  it("keeps at most RECENT_MAX", () => {
    const many = Array.from({ length: RECENT_MAX }, (_, i) => `term ${i}`);
    const next = withRecent(many, "new one");
    expect(next).toHaveLength(RECENT_MAX);
    expect(next[0]).toBe("new one");
  });

  it("ignores a term under two characters", () => {
    expect(withRecent(["pizza"], " a ")).toEqual(["pizza"]);
  });

  it("reads only a list of strings back, and nothing from junk", () => {
    expect(parseRecent(JSON.stringify(["a", 2, "b"]))).toEqual(["a", "b"]);
    expect(parseRecent("{nope")).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent(JSON.stringify({ a: 1 }))).toEqual([]);
  });
});
