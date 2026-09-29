// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonMenu } from "./PersonMenu";
import { ApiError } from "../lib/api-client";
import { clearBusinessCache } from "../lib/business";
import { leaveBusiness } from "../lib/team-api";
import { merchantProfile } from "../testing/fixtures";

const { replace, stop } = vi.hoisted(() => ({ replace: vi.fn(), stop: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push: vi.fn() };
  return { useRouter: () => router };
});
vi.mock("../lib/team-api", () => ({ leaveBusiness: vi.fn() }));
vi.mock("../lib/business", () => ({ clearBusinessCache: vi.fn() }));
vi.mock("./alarm-singleton", () => ({ getAlarmController: () => ({ stop }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Who is signed in (merchant web upgrade L4)", () => {
  it("shows the person and their role, and Switch person signs out for the next one", () => {
    const onSwitchPerson = vi.fn();
    render(<PersonMenu business={merchantProfile({ myName: "Farai Chari" })} onSwitchPerson={onSwitchPerson} />);

    const chip = screen.getByRole("button", { name: "Signed in: Farai · Owner" });
    expect(chip.textContent).toBe("Farai · Owner");
    expect(chip.querySelector(".kitchen-bar-person-role")?.textContent).toBe(" · Owner");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Owner at Test Kitchen")).toBeTruthy();
    // The owner can't leave: support hands a business over.
    expect(screen.queryByRole("button", { name: "Leave this business" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Switch person" }));
    expect(onSwitchPerson).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    render(<PersonMenu business={merchantProfile({ myName: "Farai Chari" })} onSwitchPerson={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Signed in/ }));
    expect(screen.getByRole("button", { name: "Switch person" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Switch person" })).toBeNull();
  });

  it("lets Staff leave after a confirm, then stops the alarm and goes to the sign-up", async () => {
    vi.mocked(leaveBusiness).mockResolvedValue({ ok: true });
    render(<PersonMenu business={merchantProfile({ myRole: "staff", myName: "Tendai" })} onSwitchPerson={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Signed in: Tendai · Staff" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave this business" }));
    expect(screen.getByText((_, el) => el?.tagName === "DIV" && el.textContent === "Leave Test Kitchen? You'll stop seeing its orders and deliveries. The owner can add you again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, leave" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
    expect(clearBusinessCache).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it("keeps Staff where they are when leaving fails", async () => {
    vi.mocked(leaveBusiness).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    render(<PersonMenu business={merchantProfile({ myRole: "staff", myName: "Tendai" })} onSwitchPerson={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Signed in/ }));
    fireEvent.click(screen.getByRole("button", { name: "Leave this business" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, leave" }));
    expect(await screen.findByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("an API older than L4 sends no name: the role alone", () => {
    render(<PersonMenu business={merchantProfile()} onSwitchPerson={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Signed in: Owner" }).textContent).toBe("Owner");
  });
});
