// Web shim for expo-image-picker. Permissions are granted and every launch "takes" the next page of a
// placeholder document (an inline SVG in the handoff's striped photo style, labelled "page N"), so a
// parity shoot can stage a picked photo by tapping the screen's own camera / gallery buttons — the
// Order flow v2 prescription block (R8b) is shot this way.
let page = 0;

function shot() {
  page += 1;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80">` +
    `<defs><pattern id="s" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="12" height="12" fill="#EEF1F3"/><rect width="6" height="12" fill="#F8F9FA"/></pattern></defs>` +
    `<rect width="64" height="80" fill="url(#s)"/>` +
    `<rect x="8" y="33" width="48" height="14" rx="3" fill="#fff"/>` +
    `<text x="32" y="43.5" font-family="monospace" font-size="9" text-anchor="middle" fill="#14181B">page ${page}</text></svg>`;
  return { canceled: false, assets: [{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, width: 64, height: 80, mimeType: "image/jpeg" }] };
}

export const MediaTypeOptions = { All: "All", Images: "Images", Videos: "Videos" };
export async function requestCameraPermissionsAsync() {
  return { granted: true, status: "granted" };
}
export const requestMediaLibraryPermissionsAsync = requestCameraPermissionsAsync;
export async function launchCameraAsync() {
  return shot();
}
export const launchImageLibraryAsync = launchCameraAsync;
export default { MediaTypeOptions, requestCameraPermissionsAsync, requestMediaLibraryPermissionsAsync, launchCameraAsync, launchImageLibraryAsync };
