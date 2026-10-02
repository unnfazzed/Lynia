// Order flow v2 R8a/R8b · Review · pharmacy with a "Prescription needed" item, rxEnabled on. R8a is the empty
// block (placing blocked); the shoot stages R8b by tapping Take photo / the add tile (the expo-image-picker
// shim hands back a placeholder page), typing the patient and ticking the consent. See _review.mjs.
import { RX_LINES, stage } from "./_review.mjs";

export default stage({ service: "pharmacy", lines: RX_LINES, rx: true });
