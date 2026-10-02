// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrescriptionCheckPage from "./page";
import { ToastProvider } from "../../../../components/m/Toast";
import { approvePrescription, declinePrescription, getOrder, getPrescriptionPhotos } from "../../../../lib/orders-api";
import { merchantOrder, merchantProfile } from "../../../../testing/fixtures";

const ID = "f7c10000-0000-4000-8000-000000000001";
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push: vi.fn() };
  return { useRouter: () => router, useParams: () => ({ id: "f7c10000-0000-4000-8000-000000000001" }) };
});
vi.mock("../../../../lib/orders-api", () => ({
  getOrder: vi.fn(),
  getPrescriptionPhotos: vi.fn(),
  approvePrescription: vi.fn(async () => ({})),
  declinePrescription: vi.fn(async () => ({})),
}));
const business = vi.hoisted(() => ({ pharmacist: true }));
vi.mock("../../../../lib/business", () => ({
  useBusiness: () => merchantProfile({ businessType: "shop", shopKind: "pharmacy", myIsPharmacist: business.pharmacist }),
}));
vi.mock("../../../../components/KitchenConnectionProvider", () => ({ useKitchenConnection: () => ({ actionsDisabled: false }) }));
vi.mock("../../../../components/Kitchen", () => ({ Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  business.pharmacist = true;
});

function show() {
  vi.mocked(getOrder).mockResolvedValue(
    merchantOrder({
      id: ID,
      merchantPhase: "preparing",
      items: [{ itemId: "b0000001-0000-4000-8000-000000000000", dishId: null, name: "Amoxicillin 500mg (21 caps)", priceUsd: 6.2, quantity: 1, note: null, available: true, rxRequired: true }],
      prescription: { status: "pending", patientName: "Rudo Moyo", pageCount: 2 },
    }),
  );
  vi.mocked(getPrescriptionPhotos).mockResolvedValue({
    photos: [
      { page: 2, url: "https://storage.example/rx-2.jpg" },
      { page: 1, url: "https://storage.example/rx-1.jpg" },
    ],
    expiresInSeconds: 300,
  });
  render(
    <ToastProvider>
      <PrescriptionCheckPage />
    </ToastProvider>,
  );
}

describe("M8a / M8b · Prescription check (Order flow v2, D-59)", () => {
  it("shows page 1 of 2, the patient and the items that need a prescription; Approve goes back to the ticket", async () => {
    show();
    expect(await screen.findByText("Rudo Moyo")).toBeTruthy();
    expect(screen.getByText("Amoxicillin 500mg (21 caps)")).toBeTruthy();
    expect((screen.getByRole("img", { name: "Prescription page 1" }) as HTMLImageElement).src).toBe("https://storage.example/rx-1.jpg");
    expect(screen.getByRole("button", { name: "Next page" }).textContent).toBe("1 / 2");
    fireEvent.click(screen.getByRole("button", { name: "Approve prescription" }));
    await vi.waitFor(() => expect(approvePrescription).toHaveBeenCalledWith(ID));
    expect(replace).toHaveBeenCalledWith(`/queue/${ID}`);
  });

  it("Decline asks why, then tells the customer with the reason and the note", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(screen.getByText("The rest of the order carries on unless the customer cancels.")).toBeTruthy();
    const send = screen.getByRole("button", { name: "Decline and tell the customer" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Expired" }));
    fireEvent.change(screen.getByLabelText("Note for the customer"), { target: { value: "Dated March 2026" } });
    fireEvent.click(send);
    await vi.waitFor(() => expect(declinePrescription).toHaveBeenCalledWith(ID, { reason: "expired", note: "Dated March 2026" }));
  });

  it("someone who isn't a pharmacist can look but not answer", async () => {
    business.pharmacist = false;
    show();
    expect(await screen.findByText("Rudo Moyo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve prescription" })).toBeNull();
  });
});
