// expo-router's system-URL hook: the ID check's bare `lynia://` return is dropped while the app runs
// (see src/logic/native-intent.ts); every other URL passes through unchanged.
export { redirectSystemPath } from "../src/logic/native-intent";
