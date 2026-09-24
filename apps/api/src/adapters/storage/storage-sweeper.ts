import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { STORAGE, type StorageAdapter, type StoredObject } from "./storage.interface";
import { UPLOAD_KINDS, type UploadKind } from "./upload-kinds";

/** An unattached upload older than this is an orphan (E2). Far past the 10-minute upload SAS, so an
 *  in-progress mint → PUT → attach can never be swept out from under a client. */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
/** Keys looked up per DB round-trip. */
const REFERENCE_BATCH = 200;
/** Upper bound on objects examined per kind per run, so one sweep can't run unbounded; the next day's
 *  run picks up the rest. */
const MAX_SCANNED_PER_KIND = 20_000;

export interface OrphanSweepResult {
  scanned: number;
  deleted: number;
}

/**
 * Orphan sweep (C1 / E2): deletes objects under the upload prefixes that are older than 24 h and not
 * referenced by any row. Together with the attach-time check this bounds what an unattached upload —
 * a minted SAS the client never attached, or a rejected-then-abandoned flow — can cost. It runs as the
 * retention job's second step (POST /admin/retention/purge), never as another in-process timer.
 */
@Injectable()
export class StorageSweeper {
  private readonly logger = new Logger(StorageSweeper.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async sweepOrphans(now: Date = new Date()): Promise<OrphanSweepResult> {
    const cutoff = now.getTime() - ORPHAN_MIN_AGE_MS;
    let scanned = 0;
    let deleted = 0;
    for (const kind of Object.keys(UPLOAD_KINDS) as UploadKind[]) {
      let batch: string[] = [];
      let kindScanned = 0;
      const flush = async (): Promise<void> => {
        if (batch.length === 0) return;
        const referenced = await this.referencedKeys(kind, batch);
        for (const key of batch) {
          if (referenced.has(key)) continue;
          await this.storage.deleteObject(key);
          deleted++;
        }
        batch = [];
      };
      for await (const obj of this.storage.listObjects(UPLOAD_KINDS[kind].prefix)) {
        if (kindScanned >= MAX_SCANNED_PER_KIND) break;
        kindScanned++;
        if (!isOld(obj, cutoff)) continue;
        batch.push(obj.key);
        if (batch.length >= REFERENCE_BATCH) await flush();
      }
      await flush();
      scanned += kindScanned;
    }
    this.logger.log(`Orphan sweep: scanned ${scanned} upload objects, deleted ${deleted} unreferenced`);
    return { scanned, deleted };
  }

  /** Which of `keys` a row still points at, per kind — the same columns the attach paths write. */
  private async referencedKeys(kind: UploadKind, keys: string[]): Promise<Set<string>> {
    const found: Array<string | null> = [];
    switch (kind) {
      case "kyc": {
        // The rider selfie; profile.photoUrl is included defensively (the erasure purge treats the two
        // together), so a key either column points at is never swept.
        const [riders, profiles] = await Promise.all([
          this.prisma.rider.findMany({ where: { photoUrl: { in: keys } }, select: { photoUrl: true } }),
          this.prisma.profile.findMany({ where: { photoUrl: { in: keys } }, select: { photoUrl: true } }),
        ]);
        found.push(...riders.map((r) => r.photoUrl), ...profiles.map((p) => p.photoUrl));
        break;
      }
      case "pickup": {
        const rows = await this.prisma.order.findMany({ where: { pickupPhotoKey: { in: keys } }, select: { pickupPhotoKey: true } });
        found.push(...rows.map((r) => r.pickupPhotoKey));
        break;
      }
      case "delivery-proof": {
        const rows = await this.prisma.order.findMany({ where: { deliveryProofKey: { in: keys } }, select: { deliveryProofKey: true } });
        found.push(...rows.map((r) => r.deliveryProofKey));
        break;
      }
      case "dish": {
        const rows = await this.prisma.merchantDish.findMany({ where: { photoUrl: { in: keys } }, select: { photoUrl: true } });
        found.push(...rows.map((r) => r.photoUrl));
        break;
      }
      case "banner": {
        const rows = await this.prisma.merchant.findMany({
          where: { OR: [{ coverPhotoUrl: { in: keys } }, { logoUrl: { in: keys } }] },
          select: { coverPhotoUrl: true, logoUrl: true },
        });
        found.push(...rows.flatMap((r) => [r.coverPhotoUrl, r.logoUrl]));
        break;
      }
    }
    return new Set(found.filter((k): k is string => typeof k === "string"));
  }
}

function isOld(obj: StoredObject, cutoff: number): boolean {
  return obj.createdAt.getTime() < cutoff;
}
