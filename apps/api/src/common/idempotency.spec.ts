import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createOnce, IDEMPOTENCY_KEY_REUSED, replayFirst } from "./idempotency";

const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

describe("replayFirst", () => {
  it("looks the key up only when there is one", async () => {
    const find = vi.fn(async () => ({ id: "row-1" }));
    expect(await replayFirst(undefined, find)).toBeNull();
    expect(find).not.toHaveBeenCalled();
    expect(await replayFirst("k1", find)).toEqual({ id: "row-1" });
  });
});

describe("createOnce (R-3: one copy of the five endpoints' key pattern)", () => {
  it("returns the new row when the create succeeds", async () => {
    const out = await createOnce({ key: "k1", create: async () => ({ id: "new" }), find: async () => null });
    expect(out).toEqual({ created: true, row: { id: "new" } });
  });

  it("returns the winner of a concurrent duplicate submit instead of a 500 (replay, unchanged behaviour)", async () => {
    const out = await createOnce({
      key: "k1",
      create: async () => {
        throw p2002();
      },
      find: async () => ({ id: "winner" }),
    });
    expect(out).toEqual({ created: false, row: { id: "winner" } });
  });

  it("is a 409 idempotency_key_reused when the key belongs to another row the index covers (the old 500)", async () => {
    const err = await createOnce({
      key: "k1",
      create: async () => {
        throw p2002();
      },
      find: async () => null,
      heldElsewhere: async () => true,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ statusCode: 409, reason: IDEMPOTENCY_KEY_REUSED });
  });

  it.each([
    ["a unique violation that isn't the key (nothing holds it)", "k1", p2002(), async () => false],
    ["a unique violation with no key at all", undefined, p2002(), undefined],
    ["any other error", "k1", new Error("db down"), async () => true],
  ])("rethrows %s", async (_case, key, thrown, heldElsewhere) => {
    const find = vi.fn(async () => null);
    const err = await createOnce({
      key,
      create: async () => {
        throw thrown;
      },
      find,
      heldElsewhere,
    }).catch((e: unknown) => e);
    expect(err).toBe(thrown);
  });
});
