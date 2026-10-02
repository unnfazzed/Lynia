/**
 * Order flow v2 (ledger D-59): the old food order route only redirects to the one order screen, so an
 * old push, deep link or saved history row still lands on the order.
 */
import renderer, { act } from "react-test-renderer";

const mockRedirect = jest.fn((_p: { href: string }) => null);
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ orderId: "order-1" }),
  Redirect: (p: { href: string }) => mockRedirect(p),
}));

import FoodOrderRedirect from "../[orderId]";

it("redirects /food/order/:id to /order/:id", () => {
  act(() => {
    renderer.create(<FoodOrderRedirect />);
  });
  expect(mockRedirect).toHaveBeenCalledWith({ href: "/order/order-1" });
});
