// LyniaGo Browse v2 copy. Generated from browse-kit.js (object B). Ship verbatim.
// {x} placeholders are runtime values; use fmt(str, {x}) to fill them.
export const B = {
  "svc": {
    "food": {
      "title": "Restaurants",
      "short": "Food",
      "search": "Search restaurants or dishes",
      "search320": "Search food",
      "noun": "restaurants",
      "place": "kitchen",
      "places": "kitchens",
      "item": "dish",
      "items": "dishes",
      "itemsCap": "DISHES",
      "note": "Note for the kitchen",
      "time": "Ready in ~{m} min",
      "none": {
        "t": "No restaurants deliver to {area} yet",
        "s": "We’re bringing kitchens to your area. Try another address, or send a parcel today."
      },
      "err": "Couldn’t load restaurants",
      "end": "That’s all {n} restaurants delivering to {area}.",
      "off": {
        "t": "Restaurants are coming soon",
        "s": "Meals from kitchens near you, cooked to order. We’ll message you on WhatsApp the day they open in your area."
      }
    },
    "shops": {
      "title": "Shops",
      "short": "Shops",
      "search": "Search shops or items",
      "search320": "Search shops",
      "noun": "shops",
      "place": "shop",
      "places": "shops",
      "item": "item",
      "items": "items",
      "itemsCap": "ITEMS",
      "note": "Note for the shop",
      "time": "Packed in ~{m} min",
      "none": {
        "t": "No shops deliver to {area} yet",
        "s": "We’re signing up shops near you. Try another address, or send a parcel today."
      },
      "err": "Couldn’t load shops",
      "end": "That’s all {n} shops delivering to {area}.",
      "off": {
        "t": "Shops are coming soon",
        "s": "Groceries, butcheries, fashion and auto parts from shops near you. We’ll message you on WhatsApp the day they open in your area."
      }
    },
    "pharmacy": {
      "title": "Pharmacy",
      "short": "Pharmacy",
      "search": "Search pharmacy items",
      "search320": "Search pharmacy",
      "noun": "pharmacies",
      "place": "pharmacy",
      "places": "pharmacies",
      "item": "item",
      "items": "items",
      "itemsCap": "ITEMS",
      "note": "Note for the pharmacy",
      "time": "Packed in ~{m} min",
      "none": {
        "t": "No pharmacies deliver to {area} yet",
        "s": "We’re signing up pharmacies near you. Try another address, or send a parcel today."
      },
      "err": "Couldn’t load pharmacies",
      "end": "That’s all {n} pharmacies delivering to {area}.",
      "off": {
        "t": "Pharmacy is coming soon",
        "s": "Over-the-counter medicine, baby care and first aid from pharmacies near you. We’ll message you on WhatsApp the day it opens in your area."
      }
    }
  },
  "kinds": [
    "All",
    "Grocery",
    "Butchery",
    "Fashion",
    "Auto parts",
    "Hardware",
    "Electronics",
    "Other"
  ],
  "list": {
    "delivering": "DELIVERING TO",
    "noAddr": "NO ADDRESS YET",
    "setLoc": "Set your location",
    "all": "All",
    "free": "Free delivery",
    "sortBy": "Sort: {s}",
    "summary": "{n} places · {a}–{b} min",
    "summaryNoLoc": "{n} places in Harare",
    "closedNow": "Closed now",
    "opens": "Opens {t}",
    "opensTmr": "Opens tomorrow {t}",
    "closesIn": "Closes in {m} min",
    "isNew": "New",
    "otc": "Over-the-counter only. No prescription medicine yet.",
    "noMatch": {
      "t": "No places match",
      "s": "Nothing in {f} delivers to {area} right now.",
      "clear": "Clear filters"
    },
    "kindNone": {
      "t": "No {kind} shops here yet",
      "s": "We’re signing up {kind} shops in Harare. Try All shops in the meantime.",
      "cta": "See all shops"
    },
    "noLoc": {
      "t": "Where should we deliver?",
      "s": "Set your address to see delivery fees, times and distance.",
      "cta": "Use my location",
      "alt": "Type an address"
    },
    "noLocMeta": "Set your location to see fee and time",
    "retry": "↻ Try again",
    "errS": "Check your data connection. Nothing was lost.",
    "offline": "You’re offline · showing places from {t}",
    "offNone": {
      "t": "You’re offline",
      "s": "Connect to see places near you. We’ll load them as soon as you’re back."
    },
    "more": "Loading more…",
    "changeAddr": "Change address",
    "sendParcel": "Send a parcel",
    "count": "{n} places",
    "range": "{a}–{b} min",
    "closedSub": "Look now, order when they open."
  },
  "sort": {
    "title": "Sort by",
    "opts": [
      "Recommended",
      "Nearest",
      "Fastest",
      "Top rated",
      "Lowest delivery fee"
    ],
    "needsLoc": "Set your location to use this",
    "apply": "Show results"
  },
  "store": {
    "ratings": "{n} ratings",
    "noRatings": "No ratings yet",
    "min": "min",
    "delivery": "delivery",
    "away": "away",
    "free": "Free",
    "openUntil": "Open until {t}",
    "busy": "Busy · +10 min",
    "closingSoon": "Closes in {m} min · order by {t}",
    "closed": "Closed · opens {t}",
    "closedTmr": "Closed · opens tomorrow {t}",
    "remind": "Remind me when they open",
    "remindOn": "We’ll message you when {v} opens.",
    "closedRow": "Ordering opens at {t}",
    "oos": "Out of stock today",
    "window": "Served {a}–{b}",
    "windowNote": "Available from {a}. You can look now.",
    "searchIn": "Search {v}",
    "noHits": {
      "t": "Nothing called “{q}” at {v}",
      "s": "Check the spelling, or search all {noun}.",
      "cta": "Search all {noun}"
    },
    "errT": "Couldn’t load this {place}",
    "emptyT": "No items yet",
    "emptyS": "{v} is still adding items. Check back soon."
  },
  "item": {
    "qty": "Quantity",
    "noteHint": "No chilli, please",
    "noteShop": "Please pick ones with the longest date",
    "notePharm": "Blister packs, not loose",
    "noteRule": "Notes can’t change the price.",
    "add": "Add · {p}",
    "addN": "Add {n} · {p}",
    "update": "Update · {p}",
    "remove": "Remove from cart",
    "closedCta": "Opens at {t}",
    "close": "Close"
  },
  "cart": {
    "bar": "{n} items · {p}",
    "bar1": "1 item · {p}",
    "view": "View cart",
    "minHint": "Add {d} to skip the {f} small-order fee"
  },
  "newCart": {
    "t": "Start a new cart?",
    "s": "Your cart from {v} ({n} items, {p}) will be cleared.",
    "adding": "You’re adding {i} from {w}.",
    "yes": "Start new cart",
    "no": "Keep my cart"
  },
  "justClosed": {
    "t": "{v} just closed",
    "s": "They stopped taking orders. Your cart is saved — nothing was ordered.",
    "yes": "See open places",
    "no": "OK"
  },
  "search": {
    "home": "Search food, shops or parcels",
    "home320": "Search food or shops",
    "recent": "Recent",
    "clear": "Clear",
    "popular": "Popular near you",
    "places": "PLACES",
    "groups": {
      "food": "RESTAURANTS",
      "shops": "SHOPS",
      "pharmacy": "PHARMACY",
      "items": "DISHES & ITEMS"
    },
    "parcel": {
      "t": "Send a parcel",
      "s": "Documents, keys, anything. Name your price."
    },
    "none": {
      "t": "No matches for “{q}”",
      "s": "Try a shorter word, or a dish or shop name."
    },
    "offline": {
      "t": "You’re offline",
      "s": "Search needs a connection. Your recent searches still work."
    },
    "seeAll": "See all {n}"
  },
  "toast": {
    "added": "Added {i}",
    "err": "Couldn’t add that. Try again.",
    "reminder": "We’ll message you when {v} opens."
  },
  "off": {
    "cta": "Notify me",
    "no": "Not now"
  }
} as const;

export const fmt = (s: string, o: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? String(o[k]) : m));
