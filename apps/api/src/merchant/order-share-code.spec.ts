import { describe, expect, it } from "vitest";
import { FoodOrderPlacing } from "./food-order.placing";
import type { FoodOrderService } from "./food-order.service";

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function placing(codes: Record<string, string>, broken = false): FoodOrderPlacing {
  const prisma = {
    merchantShareCode: {
      findUnique: async ({ where }: { where: { code: string } }) => {
        if (broken) throw new Error("db down");
        return codes[where.code] ? { merchantId: codes[where.code] } : null;
      },
    },
  };
  return new FoodOrderPlacing({ prisma } as unknown as FoodOrderService);
}

describe("Order.shareCode at placement (D-129)", () => {
  it("keeps the business's own code, normalised", async () => {
    expect(await placing({ "7KQ2MX": KITCHEN }).shareCodeFor(KITCHEN, " 7kq2mx ")).toBe("7KQ2MX");
  });

  it("drops another business's code, an unknown code, junk and nothing", async () => {
    const p = placing({ "7KQ2MX": OTHER });
    expect(await p.shareCodeFor(KITCHEN, "7KQ2MX")).toBeNull();
    expect(await p.shareCodeFor(KITCHEN, "ZZZZZZ")).toBeNull();
    expect(await p.shareCodeFor(KITCHEN, "not-a-code")).toBeNull();
    expect(await p.shareCodeFor(KITCHEN, undefined)).toBeNull();
  });

  it("a lookup failure never fails the order", async () => {
    expect(await placing({}, true).shareCodeFor(KITCHEN, "7KQ2MX")).toBeNull();
  });
});
