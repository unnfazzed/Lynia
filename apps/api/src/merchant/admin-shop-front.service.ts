import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AdminShopFrontPhotoRequest, AdminUpdateShopFrontRequest } from "@lynia/shared";
import { randomUUID } from "node:crypto";
import { STORAGE, type StorageAdapter, type UploadTarget } from "../adapters/storage/storage.interface";
import { MAX_BANNER_PHOTO_BYTES, opsUploadOwner, ownNamespace } from "../adapters/storage/upload-kinds";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantService } from "./merchant.service";

/** Written with the change, in its transaction; reserved in RESERVED_AUDIT_ACTIONS so the free-text audit
 *  path can't forge one. */
export const SHOP_FRONT_AUDIT_ACTION = "merchant.shop_front";

const EXT = { "image/jpeg": "jpg", "image/png": "png" } as const;

/** The shop-front fields an edit can touch, as the audit row's before/after records them. */
const AUDITED = { name: true, description: true, logoUrl: true, coverPhotoUrl: true, cuisineTags: true, priceLevel: true } as const;
type AuditedField = keyof typeof AUDITED;

/**
 * Ops setting up a business's shop front on its behalf (admin assist): the name, about, tags, price level,
 * logo and cover — the same fields and checks as the owner's `PATCH /merchant/profile`, through the same
 * MerchantService code. What differs is who uploads: the console has no profile, so its photos are minted
 * under the business's own ops namespace ({@link opsUploadOwner}) and only a key from there, for this
 * business, can be attached. Every save needs a reason and writes a before/after audit row in the same
 * transaction as the change.
 */
@Injectable()
export class AdminShopFrontService {
  private readonly logger = new Logger(AdminShopFrontService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly merchant: MerchantService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  /** A signed PUT for a logo or cover (they share the banner kind and its 250 KB cap). */
  async mintPhoto(merchantId: string, body: AdminShopFrontPhotoRequest): Promise<{ uploadUrl: string; key: string; headers: Record<string, string> }> {
    await this.findOrThrow(merchantId);
    const key = `${ownNamespace("banner", opsUploadOwner(merchantId))}${randomUUID()}.${EXT[body.contentType]}`;
    let target: UploadTarget;
    try {
      target = await this.storage.createUploadUrl(key, body.contentType, 600, MAX_BANNER_PHOTO_BYTES);
    } catch (err) {
      // Same as UploadsController.mint: a signing failure is transient from the caller's side (E8).
      this.logger.error(`Shop-front upload mint failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException({ reason: "uploads_unavailable", message: "Couldn't upload, try again" });
    }
    return { uploadUrl: target.url, key: target.key, headers: target.headers };
  }

  async update(actor: string, merchantId: string, body: AdminUpdateShopFrontRequest): Promise<{ id: string; auditId: string }> {
    const current = await this.findOrThrow(merchantId);
    const { reasonCode, note, ...fields } = body;
    // Photo checks and thumbnails read storage, so they run before the transaction, as on the owner's path.
    const data = await this.merchant.profileUpdateData(current, fields, opsUploadOwner(merchantId));
    const changed = (Object.keys(AUDITED) as AuditedField[]).filter((f) => fields[f] !== undefined);
    return this.prisma.$transaction(async (tx) => {
      // The before snapshot is re-read here so an owner's edit landing since the first read can't make it lie.
      const before = (await tx.merchant.findUnique({ where: { id: merchantId }, select: AUDITED })) ?? current;
      const updated = await tx.merchant.update({ where: { id: merchantId }, data, select: AUDITED });
      const audit = await tx.auditLog.create({
        data: {
          actor,
          action: SHOP_FRONT_AUDIT_ACTION,
          target: merchantId,
          targetType: "merchant",
          reasonCode,
          note: note || null,
          before: pick(before, changed),
          after: pick(updated, changed),
        },
        select: { id: true },
      });
      return { id: merchantId, auditId: audit.id };
    });
  }

  private async findOrThrow(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: AUDITED });
    if (!m) throw new NotFoundException("Merchant not found");
    return m;
  }
}

function pick(row: Record<AuditedField, unknown>, fields: AuditedField[]): Prisma.InputJsonObject {
  return Object.fromEntries(fields.map((f) => [f, (row[f] ?? null) as Prisma.InputJsonValue])) as Prisma.InputJsonObject;
}
