// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoPicker } from "./PhotoPicker";
import { compressImage } from "../../lib/image-compress";
import { mintDishPhotoUpload, uploadPhotoBlob } from "../../lib/menu-api";

vi.mock("../../lib/image-compress", () => ({
  compressImage: vi.fn(),
  MAX_DIMENSION_BY_KIND: { dish: 1200, banner: 1600, logo: 512 },
}));
vi.mock("../../lib/menu-api", () => ({
  mintDishPhotoUpload: vi.fn(),
  mintBannerPhotoUpload: vi.fn(),
  uploadPhotoBlob: vi.fn(),
}));
// The reposition frame is its own tested component: here it just confirms the framing.
vi.mock("./PhotoCropSheet", () => ({
  PhotoCropSheet: ({ file, onConfirm }: { file: File; onConfirm: (crop: undefined) => void }) => (
    <button type="button" onClick={() => onConfirm(undefined)}>
      Frame {file.name}
    </button>
  ),
}));

const BLOB = new Blob(["jpeg"], { type: "image/jpeg" });
const TARGET = { uploadUrl: "https://upload/1", key: "dish/p1/k1.jpg", headers: {} };

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview-1");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(compressImage).mockResolvedValue(BLOB);
  vi.mocked(mintDishPhotoUpload).mockResolvedValue(TARGET);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function pick(name: string, type: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], name, { type })] } });
}

function renderPicker(props: Partial<Parameters<typeof PhotoPicker>[0]> = {}) {
  const onUploaded = vi.fn();
  const onBusy = vi.fn();
  render(<PhotoPicker kind="dish" aspect={1} maxBytes={300 * 1024} currentUrl={null} onUploaded={onUploaded} onBusy={onBusy} {...props} />);
  return { onUploaded, onBusy };
}

describe("PhotoPicker", () => {
  it("MJ-RL14: takes any image — a phone's WebP or HEIC goes to the framing step, not a 'JPEG or PNG' refusal", () => {
    renderPicker();
    expect((document.querySelector('input[type="file"]') as HTMLInputElement).accept).toBe("image/*");
    pick("IMG_0042.HEIC", "image/heic");
    expect(screen.getByRole("button", { name: "Frame IMG_0042.HEIC" })).toBeTruthy();
    expect(screen.queryByText(/isn't a JPEG or PNG/)).toBeNull();
  });

  it("MJ-RM11 / MJ-RM17: reports busy while the photo is on its way, and hands over the key and its preview once it landed", async () => {
    let finish: () => void = () => {};
    vi.mocked(uploadPhotoBlob).mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const { onUploaded, onBusy } = renderPicker();
    pick("dish.webp", "image/webp");
    fireEvent.click(screen.getByRole("button", { name: "Frame dish.webp" }));
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(true));
    expect(onUploaded).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
    expect(onUploaded).toHaveBeenCalledWith("dish/p1/k1.jpg", "blob:preview-1");
  });

  it("MJ-RL21: a failed upload's Retry re-sends the same compressed photo, without decoding it again", async () => {
    vi.mocked(uploadPhotoBlob).mockRejectedValueOnce(new Error("The upload timed out — check your connection and try again.")).mockResolvedValueOnce();
    const { onUploaded } = renderPicker();
    pick("dish.jpg", "image/jpeg");
    fireEvent.click(screen.getByRole("button", { name: "Frame dish.jpg" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("dish/p1/k1.jpg", "blob:preview-1"));
    expect(compressImage).toHaveBeenCalledTimes(1);
    expect(uploadPhotoBlob).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadPhotoBlob).mock.calls[1]![1]).toBe(BLOB);
    expect(mintDishPhotoUpload).toHaveBeenCalledTimes(2);
  });

  it("review: unmounting mid-upload reports not busy, so the form's Save isn't held for good", async () => {
    vi.mocked(uploadPhotoBlob).mockImplementation(() => new Promise<void>(() => {}));
    const { onBusy } = renderPicker();
    pick("dish.jpg", "image/jpeg");
    fireEvent.click(screen.getByRole("button", { name: "Frame dish.jpg" }));
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(true));
    cleanup();
    expect(onBusy).toHaveBeenLastCalledWith(false);
  });
});

