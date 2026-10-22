import { describe, expect, it, vi } from "vitest";
import { AdminUpdateShopFrontRequest } from "@lynia/shared";
import type { UploadVerifier } from "../adapters/storage/upload-verifier";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminShopFrontService, SHOP_FRONT_AUDIT_ACTION } from "./admin-shop-front.service";
import { MerchantService } from "./merchant.service";

const M = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OPS_KEY = `banner/ops-${M}/aaaaaaaa-0000-4000-8000-000000000001.jpg`;
const ROW = { name: "Mama's Kitchen", description: null, logoUrl: null, coverPhotoUrl: "banner/p1/aaaaaaaa-0000-4000-8000-000000000003.jpg", cuisineTags: ["Sadza"], priceLevel: 2 };

function harness(row: typeof ROW | null = ROW) {
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...ROW, ...data }));
  const audit = vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: "audit-1" }));
  const txFind = vi.fn(async () => row);
  const tx = { merchant: { findUnique: txFind, update }, auditLog: { create: audit } };
  const prisma = {
    merchant: { findUnique: vi.fn(async () => row), update },
    auditLog: { create: audit },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  const storage = {
    createReadUrl: async (key: string) => `https://signed.example/${key}`,
    readObject: async () => null,
    createUploadUrl: vi.fn(async (key: string, contentType: string) => ({ url: `https://put.example/${key}`, key, headers: { "Content-Type": contentType } })),
  };
  const verify = vi.fn(async () => ({}));
  const merchant = new MerchantService(prisma as unknown as PrismaService, storage as never, undefined, undefined, undefined, { verify } as unknown as UploadVerifier);
  const s = new AdminShopFrontService(prisma as unknown as PrismaService, merchant, storage as never);
  return { s, update, audit, verify, storage, txFind };
}

describe("AdminShopFrontService (ops editing a shop front on the business's behalf)", () => {
  it("mints the upload under the business's own ops namespace, at the banner cap", async () => {
    const h = harness();
    const res = await h.s.mintPhoto(M, { contentType: "image/jpeg" });
    expect(res.key).toMatch(new RegExp(`^banner/ops-${M}/[0-9a-f-]{36}\\.jpg$`));
    expect(h.storage.createUploadUrl).toHaveBeenCalledWith(res.key, "image/jpeg", 600, 250 * 1024);
  });

  it("changes the name and about, and records the reason with only the changed fields before and after", async () => {
    const h = harness();
    const res = await h.s.update("ops@lyniago.com", M, { name: "Mama's Kitchen Avondale", description: "Home cooking", reasonCode: "Owner asked by phone", note: "Spoke to Tendai" });
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: M }, data: { name: "Mama's Kitchen Avondale", description: "Home cooking" } }));
    expect(h.audit.mock.calls[0]![0].data).toEqual({
      actor: "ops@lyniago.com",
      action: SHOP_FRONT_AUDIT_ACTION,
      target: M,
      targetType: "merchant",
      reasonCode: "Owner asked by phone",
      note: "Spoke to Tendai",
      before: { name: "Mama's Kitchen", description: null },
      after: { name: "Mama's Kitchen Avondale", description: "Home cooking" },
    });
    expect(res).toEqual({ id: M, auditId: "audit-1" });
  });

  it("takes the audit's before from inside the transaction, so an edit landing in between can't make it lie", async () => {
    const h = harness();
    h.txFind.mockResolvedValueOnce({ ...ROW, name: "Renamed by the owner a moment ago" });
    await h.s.update("ops", M, { name: "Mama's Kitchen Avondale", reasonCode: "x" });
    expect(h.audit.mock.calls[0]![0].data).toMatchObject({ before: { name: "Renamed by the owner a moment ago" } });
  });

  it("attaches a logo minted for this business, verified as a banner photo", async () => {
    const h = harness();
    await h.s.update("ops", M, { logoUrl: OPS_KEY, reasonCode: "Setting up the shop" });
    expect(h.verify).toHaveBeenCalledWith(OPS_KEY, "banner");
    expect(h.update.mock.calls[0]![0].data).toMatchObject({ logoUrl: OPS_KEY });
  });

  it("refuses a photo from another business's ops namespace or an owner's own, writing nothing", async () => {
    const h = harness();
    await expect(h.s.update("ops", M, { logoUrl: `banner/ops-${OTHER}/aaaaaaaa-0000-4000-8000-000000000001.jpg`, reasonCode: "x" })).rejects.toThrow(/invalid photo key/i);
    await expect(h.s.update("ops", M, { coverPhotoUrl: "banner/p2/aaaaaaaa-0000-4000-8000-000000000009.jpg", reasonCode: "x" })).rejects.toThrow(/invalid photo key/i);
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("removes the cover and its thumbnail on null", async () => {
    const h = harness();
    await h.s.update("ops", M, { coverPhotoUrl: null, reasonCode: "Wrong photo" });
    expect(h.update.mock.calls[0]![0].data).toEqual({ coverPhotoUrl: null, coverThumbKey: null });
    expect(h.audit.mock.calls[0]![0].data).toMatchObject({ before: { coverPhotoUrl: ROW.coverPhotoUrl }, after: { coverPhotoUrl: null } });
  });

  it("404s an unknown business", async () => {
    const h = harness(null);
    await expect(h.s.update("ops", M, { name: "X", reasonCode: "x" })).rejects.toThrow(/not found/i);
    await expect(h.s.mintPhoto(M, { contentType: "image/png" })).rejects.toThrow(/not found/i);
  });
});

describe("AdminUpdateShopFrontRequest", () => {
  it("needs a reason and at least one change", () => {
    expect(AdminUpdateShopFrontRequest.safeParse({ name: "X" }).success).toBe(false);
    expect(AdminUpdateShopFrontRequest.safeParse({ reasonCode: "Owner asked" }).success).toBe(false);
    expect(AdminUpdateShopFrontRequest.safeParse({ name: "X", reasonCode: "Owner asked" }).success).toBe(true);
    expect(AdminUpdateShopFrontRequest.safeParse({ priceLevel: null, reasonCode: "Owner asked" }).success).toBe(true);
    expect(AdminUpdateShopFrontRequest.safeParse({ name: "X", reasonCode: "Owner asked", hours: {} }).success).toBe(false);
  });
});
