import { describe, expect, it } from "vitest";
import { accountPersonName, joinPersonName, validatePersonName } from "./person-name";

describe("person name (D-124: First name · Surname)", () => {
  it("needs both parts", () => {
    expect(validatePersonName({ firstName: " ", lastName: "" })).toEqual({ firstName: "Enter your first name.", lastName: "Enter your surname." });
    expect(validatePersonName({ firstName: "Tendai", lastName: " " })).toEqual({ lastName: "Enter your surname." });
    expect(validatePersonName({ firstName: "Tendai", lastName: "Moyo" })).toEqual({});
  });

  it("keeps the one-line team name within 60 letters", () => {
    expect(validatePersonName({ firstName: "x".repeat(30), lastName: "y".repeat(30) })).toEqual({ lastName: "Keep your name under 60 letters." });
    expect(validatePersonName({ firstName: "x".repeat(29), lastName: "y".repeat(30) })).toEqual({});
  });

  it("joins the trimmed parts into the team's one line", () => {
    expect(joinPersonName({ firstName: " Mary Jane ", lastName: " Moyo " })).toBe("Mary Jane Moyo");
  });

  it("reads the account's own name", () => {
    expect(accountPersonName({ firstName: " Tendai ", lastName: "Moyo" })).toEqual({ firstName: "Tendai", lastName: "Moyo" });
    expect(accountPersonName({ firstName: "", lastName: "" })).toEqual({ firstName: "", lastName: "" });
    expect(accountPersonName(null)).toEqual({ firstName: "", lastName: "" });
  });
});
