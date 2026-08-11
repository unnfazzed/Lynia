// RC.search — restaurant search, populated with results. The screen filters the already-fetched
// GET /restaurants list client-side over a query held in component state (useState(""), autoFocus) —
// there's no route/prop to preset it, and results only render once the query is non-empty. So after
// mount we type "chicken" into the search field (RN-web TextInput fires onChangeText on the DOM
// 'input' event), which paints the "PLACES" results list. Feature flags default ON (harness) so the
// list feed is enabled.
import { installRouter, withQuery } from "./_harness.mjs";

const open = { open: "00:00", close: "23:59" };
const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };
const LOC = { lat: -17.8292, lng: 31.0522 };

function restaurant(i, name, tags, price) {
  return {
    id: `0a1b2c3d-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
    name,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: tags,
    priceLevel: price,
    hours: HOURS,
    location: LOC,
  };
}

installRouter([
  {
    match: "/restaurants",
    json: {
      restaurants: [
        restaurant(1, "Gava's Kitchen", ["Zimbabwean", "Grills"], 2),
        restaurant(2, "Nando's Avondale", ["Chicken", "Portuguese"], 3),
        restaurant(3, "Pizza Inn", ["Pizza", "Fast food"], 1),
        restaurant(4, "Chicken Slice", ["Chicken", "Fast food"], 1),
        restaurant(5, "Amanzi Restaurant", ["Fine dining", "Continental"], 3),
      ],
    },
  },
]);

if (typeof window !== "undefined") {
  window.__PARITY_SETTLE_MS = 1500;
  const type = (n) => {
    const input = document.querySelector('input[type="text"], input:not([type])');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "chicken");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (n < 40) {
      setTimeout(() => type(n + 1), 40);
    }
  };
  setTimeout(() => type(0), 350);
}

export default { wrap: withQuery() };
