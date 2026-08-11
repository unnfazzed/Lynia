// RC.checkout_wallet — the food checkout, WALLET (mobile money) path. Same screen as
// food_checkout_cash; the only difference is which payment row is selected, which is component state
// (defaults to "cash") with no route/prop to preset it. So after the screen mounts we click the
// "Mobile money" row — RN-web maps Pressable onPress to a bubbling DOM click — flipping paymentMethod
// to "wallet". That re-labels the CTA ("pay after they accept"), the row subtitle/expander and the
// cancellation/footnote copy, which is the whole point of the separate wallet mock.
import { installRouter } from "./_harness.mjs";
import { DISHES, MENU, line, withCheckout } from "./_food.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1500;

installRouter([{ match: /^\/restaurants\/[^/]+\/menu$/, json: MENU }]);

function selectMobileMoney() {
  if (typeof document === "undefined") return;
  const attempt = (n) => {
    const leaf = Array.from(document.querySelectorAll("div,span")).find(
      (e) => e.children.length === 0 && /Mobile money/.test(e.textContent || ""),
    );
    if (leaf) {
      for (const type of ["pointerdown", "pointerup", "click"]) {
        leaf.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
    } else if (n < 30) {
      setTimeout(() => attempt(n + 1), 40);
    }
  };
  setTimeout(() => attempt(0), 60);
}

export default {
  wrap: withCheckout([line(DISHES.sadza, 2), line(DISHES.chicken, 1), line(DISHES.drink, 2, "Extra cold")], selectMobileMoney),
};
