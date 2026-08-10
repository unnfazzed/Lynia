/* LyniaGo Restaurants — gallery band data (ids + badges + labels), shared by the vertical gallery
   and the all-screens gallery. Plain script: window.RGD = { CUSTOMER, MERCHANT, RIDER }. */
(() => {
const CUSTOMER = [
  ["Act 0 · Home", "One home for both products — Send and Food launch together as tiles, not tabs. Pharmacies later is a fourth tile, not a navigation change.", [
    ["home", "0·1", "Home · service tiles"], ["orders", "0·2", "Orders (all services)"], ["orders_empty", "0·b1", "Orders · empty"],
  ]],
  ["Act 1 · Discover", "Tapping Food pushes the list full-screen — the root tab bar stays behind it. Corridor-scoped, distance first; closed kitchens stay visible with their hours.", [
    ["list", "1·1", "Restaurant list"], ["list_loading", "1·2", "Loading"], ["list_empty", "1·3", "Nothing open"],
    ["list_error", "1·4", "Offline / can't reach"], ["search", "1·5", "Search"],
  ]],
  ["Act 2 · Menu", "Out-of-stock dishes are visible but disabled — never hidden, so trust survives.", [
    ["menu", "2·1", "Menu"], ["item", "2·2", "Item sheet"], ["menu_closed", "2·3", "Closed restaurant"],
    ["closed_interrupt", "2·b1", "Closes while browsing"],
  ]],
  ["Act 3 · Cart", "ETA promised before payment; goods + per-km fee shown honestly, and every change re-totalled in front of the customer.", [
    ["cart", "3·1", "Cart"], ["cart_note", "3·2", "Note for the kitchen"], ["cart_oos", "3·b1", "Item sold out"], ["cart_price", "3·b2", "Price changed"], ["cart_empty", "3·b3", "Empty cart"], ["cart_min", "3·b4", "Under the minimum"],
  ]],
  ["Act 4 · Checkout", "CASH or WALLET for anyone — no first-order cap. Cash is collect-at-the-door (the rider fronts nothing); mobile money stays a first-class option.", [
    ["checkout_cash", "4·1", "Checkout · CASH"], ["checkout_wallet", "4·2", "Checkout · WALLET"],
    ["checkout_offline", "4·b1", "Offline mid-checkout"], ["placing", "4·b2", "Placing"],
  ]],
  ["Act 5 · Pay after accept (WALLET)", "No payment window, no auto-cancel. The kitchen calls to confirm, then requests payment — the money moves only to the merchant, including when the prompt fails and the customer pays by USSD. Unpaid orders close with the kitchen's day.", [
    ["await_accept", "5·1", "Waiting on the kitchen"], ["confirm_call", "5·1b", "They call to confirm"], ["pay_push", "5·2", "Push · payment requested"], ["pay_now", "5·3", "Pay the restaurant"],
    ["pay_wait", "5·4", "Prompt sent"], ["pay_manual", "5·5", "Paid another way"], ["pay_confirmed", "5·6", "Waiting to be confirmed"],
    ["pay_open", "5·b1", "Still unpaid · reminder"], ["pay_failed", "5·b2", "Payment declined"], ["item_removed", "5·b3", "One item unavailable"],
  ]],
  ["Act 6 · Track", "The shared Send tracker grammar + prep countdown + the rider-secured moment. Every exception is a designed screen.", [
    ["track_prep", "6·1", "Prep countdown"], ["track_secured", "6·2", "Rider secured"], ["track_way", "6·3", "On the way"],
    ["track_paused", "6·b1", "Live paused"], ["no_rider", "6·b2", "NO_RIDER"], ["rider_cancelled", "6·b6", "Rider cancelled · re-finding"], ["rejected", "6·b3", "Rejected · refund pending"],
    ["refunded", "6·b4", "Refunded"], ["cancel_sheet", "6·b5", "Cancel pre-pickup"],
  ]],
  ["Act 7 · Hand-off & close", "Food first, then cash, then both confirm in-app — the delivery code appears only after the handshake, so the money moment can't be skipped. A missing confirmation freezes the trip and auto-calls support.", [
    ["handoff", "7·1", "Pay at the door"], ["handoff_wait", "7·1b", "Waiting for rider confirm"], ["handoff_code", "7·1c", "Both confirmed · code"], ["delivered_rate", "7·2", "Delivered · rate"],
    ["handoff_dispute", "7·b3", "Rider didn't confirm"], ["failed_noshow", "7·b1", "No-show · returned"], ["resume", "7·b2", "App resumed mid-order"],
  ]],
];

const MERCHANT = [
  ["Act 0 · Get on shift", "Phone + OTP, then the alarm-unlock tap — browsers only allow looping audio after a gesture, so login IS the unlock.", [
    ["login", "M0·1", "Phone + OTP login"], ["setup", "M0·2", "First login · setup"], ["reboot", "M0·b1", "Tablet rebooted mid-shift"],
  ]],
  ["Act 1 · The queue", "The money screen. A new order changes the whole screen, not a corner of it.", [
    ["queue_empty", "M1·1", "Open · no orders"], ["queue_loading", "M1·2", "Loading"], ["queue_new", "M1·3", "NEW ORDER · alarm"], ["queue_board", "M1·4", "Kitchen board · 3 live"],
    ["two_orders", "M1·b1", "Two orders at once"], ["offline", "M1·b2", "Connection lost"], ["offline_order", "M1·b3", "Order arrived offline"],
  ]],
  ["Act 2 · Accept & cook", "Accept, call the customer to confirm, request payment — no payment clock, no auto-cancel. The kitchen does not start until the money is confirmed and 'rider secured' turns green.", [
    ["order_accept", "M2·1", "Accept + prep time"], ["call_confirm", "M2·6", "Call, then request payment"], ["awaiting_payment", "M2·7", "Awaiting payment · no clock"], ["reject_sheet", "M2·2", "Reject · reason"], ["waiting_rider", "M2·3", "Accepted · do not cook yet"],
    ["cook_now", "M2·4", "Rider secured · cook now"], ["mark_ready", "M2·5", "Mark ready"], ["no_rider_merchant", "M2·b1", "NO_RIDER · never cooked"], ["rider_cancelled", "M2·b2", "Rider cancelled · re-dispatch"],
    ["item_out", "M2·8", "Don't have an item"], ["item_out_wait", "M2·9", "New total · customer confirming"],
  ]],
  ["Act 3 · Pickup confirm", "The second money screen. Under collect-and-return the food leaves against a recorded debt; under pay-me-upfront the cash is counted first. Either way, confirming means acknowledging a number.", [
    ["pickup_cash", "M3·1", "Upfront · confirm cash"], ["pickup_collect", "M3·1b", "Collect-and-return · release"], ["pickup_wallet", "M3·2", "WALLET · confirm before cooking"],
    ["wallet_mismatch", "M3·b1", "Short payment blocked"], ["pickup_done", "M3·3", "Handed over"], ["cash_return", "M3·4", "Count the returned cash"], ["rider_noshow", "M3·b2", "Rider no-show"],
    ["refund_exec", "M3·b3", "Refund after wallet paid"],
    ["pickup_reveal", "M3·5", "Pickup code · hidden"], ["pickup_revealed", "M3·6", "Pickup code · revealed"],
  ]],
  ["Act 4 · Run the shop", "The merchant defines the menu structure: categories first, dishes added into them, and the customer's menu tabs are a mirror of that list. Every dish needs a photo before it can go live.", [
    ["catalog", "M4·1", "Menu · grouped by category"], ["category_manage", "M4·2", "Categories · reorder & hide"], ["category_edit", "M4·3", "New category"],
    ["category_rename", "M4·4", "Edit / delete category"], ["catalog_empty", "M4·b1", "No categories yet"], ["item_edit", "M4·5", "Edit dish · photo required"],
    ["dish_photo", "M4·6", "Dish photo · crop"], ["dish_draft", "M4·b2", "Draft · needs a photo"], ["oos_sheet", "M4·7", "Out of stock today"],
    ["hours", "M4·8", "Operating hours"], ["statement", "M4·9", "Weekly statement"], ["eod", "M4·10", "End of day"],
  ]],
  ["Act 5 · Shop front", "The banner, logo and blurb customers meet before the menu — edited against a live preview of the customer's screen, and live the moment it saves.", [
    ["shop", "M5·1", "Shop profile"], ["cash_rule", "M5·4", "Your cash rule"], ["shop_crop", "M5·2", "Position the banner"], ["shop_upload", "M5·3", "Uploading · compressing"],
    ["shop_upload_failed", "M5·b1", "Upload paused · offline"],
  ]],
];

const RIDER = [
  ["Act 1 · The auto offer", "No bidding for merchant orders. Collect-and-return is the default — nothing from the rider's pocket, no minimum balance, no float checks anywhere. A kitchen can ask for cash upfront; riders self-judge whether they're carrying enough.", [
    ["offer_cash", "R1·1", "Offer · CASH collect"], ["offer_upfront", "R1·1b", "Offer · kitchen wants upfront"], ["offer_wallet", "R1·2", "Offer · WALLET"],
    ["offer_expired", "R1·b2", "Offer expired"],
  ]],
  ["Act 2 · Restaurant leg", "Navigate and take the food. WALLET orders arrive already PAID and confirmed by the kitchen — the rider sees it in one glance and collects nothing. Paying the merchant first happens only at kitchens whose rule is upfront.", [
    ["nav_rest", "R2·1", "To the restaurant"], ["pay_merchant", "R2·2", "Pay the merchant"], ["pickup_confirm", "R2·3", "Collect · CASH job"], ["pickup_paid", "R2·3b", "Collect · already PAID"],
    ["cancel_reason", "R2·b1", "Drop the job · before pickup"], ["cancel_blocked", "R2·b2", "Can't drop after collecting"],
  ]],
  ["Act 3 · Customer leg", "Food first, cash second, both confirm — the code closes the trip only after the handshake. Then the food money rides back to the kitchen as a real leg.", [
    ["nav_cust", "R3·1", "To the customer"], ["doorstep", "R3·2", "Collect · confirm cash"], ["cash_dispute", "R3·b2", "Customer confirmed, you didn't"], ["code_wrong", "R3·b1", "Wrong code"],
    ["delivered", "R3·3", "Delivered · earnings"], ["return_cash", "R3·4", "Return the cash"],
  ]],
  ["Act 4 · When the door doesn't open", "A structured wait, logged attempts, then a return leg with its own navigation and hand-back.", [
    ["unreachable", "R4·1", "Customer unreachable"], ["return_rest", "R4·2", "Return to restaurant"], ["handback", "R4·3", "Hand back confirm"],
    ["offline_resume", "R4·b1", "Resumed mid-delivery"],
  ]],
];
window.RGD = { CUSTOMER, MERCHANT, RIDER };
})();
