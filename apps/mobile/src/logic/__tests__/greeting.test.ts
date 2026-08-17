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
  it("draws the mock's line", () => {
    expect(greetingLine("Good morning", "Rudo")).toBe("Good morning, Rudo");
  });

  it("uses the first word only, so a two-part first name can't wrap the header", () => {
    expect(greetingLine("Good evening", "Anna Maria")).toBe("Good evening, Anna");
  });

  it("caps a long name at 14 characters rather than pushing the 25px line into a second row", () => {
    expect(greetingLine("Good morning", "Bartholomewnathaniel")).toBe("Good morning, Bartholomewnat");
  });

  it("degrades to the bare phrase with no name — never a dangling comma or a placeholder", () => {
    expect(greetingLine("Good morning", null)).toBe("Good morning");
    expect(greetingLine("Good morning", undefined)).toBe("Good morning");
    expect(greetingLine("Good morning", "   ")).toBe("Good morning");
  });
});
