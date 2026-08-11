// Web shim for expo-image-manipulator. A static render never resizes/crops, so manipulateAsync just
// echoes the input uri and SaveFormat is inert.
export async function manipulateAsync(uri) { return { uri, width: 0, height: 0 }; }
export const SaveFormat = { JPEG: "jpeg", PNG: "png", WEBP: "webp" };
export const FlipType = { Vertical: "vertical", Horizontal: "horizontal" };
export default { manipulateAsync, SaveFormat, FlipType };
