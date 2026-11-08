/** SH-A2 (handoff shop-share-v1 README §4, D-129): with no delivery address the info strip keeps the rating and offers "Set where to deliver". */
import renderer, { act } from "react-test-renderer";
import type { VenueView } from "../../../logic/browse";
import { SH } from "../../share/copy";
import { InfoStrip } from "../store";

const v = { rating: 4.6, ratingCount: 120, etaLow: null, etaHigh: null, feeUsd: null, feeLowUsd: null, freeDelivery: false } as unknown as VenueView;
const texts = (t: renderer.ReactTestRenderer): string[] => t.root.findAll((n) => typeof n.props?.children === "string").map((n) => n.props.children as string);

it("no address: rating + one cell that opens the address ask", () => {
  const onSet = jest.fn();
  let t!: renderer.ReactTestRenderer;
  act(() => {
    t = renderer.create(<InfoStrip v={v} onSetAddress={onSet} />);
  });
  expect(texts(t)).toEqual(expect.arrayContaining([SH.arrival.setAddr, SH.arrival.setAddrSub]));
  const cell = t.root.find((n) => n.props?.accessibilityLabel === `${SH.arrival.setAddr}, ${SH.arrival.setAddrSub}` && typeof n.props?.onPress === "function");
  act(() => cell.props.onPress());
  expect(onSet).toHaveBeenCalled();
});

it("with an address the strip is the usual cells", () => {
  let t!: renderer.ReactTestRenderer;
  act(() => {
    t = renderer.create(<InfoStrip v={{ ...v, etaLow: 20, etaHigh: 30, feeUsd: 1.5 }} />);
  });
  expect(texts(t)).not.toContain(SH.arrival.setAddr);
});
