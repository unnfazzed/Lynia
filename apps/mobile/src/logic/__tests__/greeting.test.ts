import { greetingFor, greetingLine } from "../greeting";

/** A local date at the given hour — the greeting reads the DEVICE clock, so local is the truth. */
const at = (hour: number): Date => new Date(2026, 7, 17, hour, 30, 0);

describe("greetingFor — the home 8c header's time-aware greeting", () => {
  it("uses the handoff's boundaries: morning < 12, afternoon < 18, evening after", () => {
    expect(greetingFor(at(0)).phrase).toBe("Good morning");
    expect(greetingFor(at(11)).phrase).toBe("Good morning");
    expect(greetingFor(at(12)).phrase).toBe("Good afternoon");
    expect(greetingFor(at(17)).phrase).toBe("Good afternoon");
    expect(greetingFor(at(18)).phrase).toBe("Good evening");
    expect(greetingFor(at(23)).phrase).toBe("Good evening");
  });

  it("flips the sticker to the moon on the SAME 18:00 line the words change on", () => {
    // One call drives both, so a screenshot can never show a midday sun over "Good evening".
    expect(greetingFor(at(17)).evening).toBe(false);
    expect(greetingFor(at(18)).evening).toBe(true);
  });
});

describe("greetingLine", () => {
  it("draws the mock's copy, broken over two lines: phrase on top, name beneath", () => {
    expect(greetingLine("Good morning", "Rudo")).toBe("Good morning,\nRudo");
    // Whitespace-normalized (what the rendered-conformance lane compares) it is the mock's string.
    expect(greetingLine("Good morning", "Rudo").replace(/\s+/g, " ")).toBe("Good morning, Rudo");
  });

  it("breaks in the SAME place whatever the time of day, so the header keeps one height", () => {
    for (const phrase of ["Good morning", "Good afternoon", "Good evening"]) {
      expect(greetingLine(phrase, "Rudo").split("\n")).toEqual([`${phrase},`, "Rudo"]);
    }
  });

  it("uses the first word only, so a two-part first name can't add a third line", () => {
    expect(greetingLine("Good evening", "Anna Maria")).toBe("Good evening,\nAnna");
  });

  it("caps a long name at 14 characters rather than overflowing its line", () => {
    expect(greetingLine("Good morning", "Bartholomewnathaniel")).toBe("Good morning,\nBartholomewnat");
  });

  it("degrades to the bare phrase on ONE line with no name — never a dangling comma or a placeholder", () => {
    expect(greetingLine("Good morning", null)).toBe("Good morning");
    expect(greetingLine("Good morning", undefined)).toBe("Good morning");
    expect(greetingLine("Good morning", "   ")).toBe("Good morning");
  });
});
