import { uploadDeliveryProof } from "../delivery-proof";

jest.mock("../image-downscale", () => ({
  downscaleForUpload: jest.fn(async () => ({ uri: "file://small.jpg", contentType: "image/jpeg" })),
}));
jest.mock("../../api/uploads", () => ({
  requestDeliveryProofUpload: jest.fn(async () => ({
    uploadUrl: "https://gcs/put",
    key: "delivery-proof/r1/abc.jpg",
    headers: { "Content-Type": "image/jpeg", "X-Goog-Content-Length-Range": "0,999" },
  })),
  uploadImage: jest.fn(async () => undefined),
}));
jest.mock("../../api/orders", () => ({ attachDeliveryProof: jest.fn(async () => ({ orderId: "o1", deliveryProofKey: "delivery-proof/r1/abc.jpg" })) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const uploads = require("../../api/uploads");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const orders = require("../../api/orders");

const asset = { uri: "file://raw.jpg", width: 1200, height: 1600, contentType: "image/jpeg" as const };

describe("uploadDeliveryProof (KB-POD-DISPUTE Phase A)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("downscales → mints → PUTs with the signed headers → attaches the key WITH coords", async () => {
    await uploadDeliveryProof("o1", asset, { lat: -17.83, lng: 31.05 });
    expect(uploads.requestDeliveryProofUpload).toHaveBeenCalledWith("image/jpeg");
    // The signed PUT carries the exact headers the mint returned (the V4 signature is minted over them).
    expect(uploads.uploadImage).toHaveBeenCalledWith(
      "https://gcs/put",
      "file://small.jpg",
      expect.objectContaining({ "Content-Type": "image/jpeg" }),
    );
    // Attach persists the object key + the rider's GPS at the door.
    expect(orders.attachDeliveryProof).toHaveBeenCalledWith("o1", "delivery-proof/r1/abc.jpg", { lat: -17.83, lng: 31.05 });
  });

  it("attaches without coords when the GPS fix was unavailable (a denied fix must not block the photo)", async () => {
    await uploadDeliveryProof("o1", asset);
    expect(orders.attachDeliveryProof).toHaveBeenCalledWith("o1", "delivery-proof/r1/abc.jpg", undefined);
  });
});
