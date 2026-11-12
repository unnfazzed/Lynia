/**
 * How every `KeyboardAvoidingView` in the app lifts its content: by padding, on BOTH platforms.
 *
 * Android used to be left to the window's `adjustResize`, but SDK 54 draws edge-to-edge on every Android
 * version (app.config.ts), and an edge-to-edge window is no longer resized for the keyboard. A `<Modal>` is
 * its own window and never was. So on Android the keyboard covered the field being typed in, app-wide:
 * the national ID sheet in Bike & documents sat entirely behind it (owner report 2026-11-12, KB-01).
 *
 * Padding is safe where a window does still resize: `KeyboardAvoidingView` pads by how far the keyboard
 * overlaps its own frame, which is zero once the window has shrunk, so nothing lifts twice.
 */
export const KEYBOARD_LIFT = "padding" as const;
