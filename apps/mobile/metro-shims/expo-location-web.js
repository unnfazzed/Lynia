// expo-location for the customer web build (redirected by ./web-runtime.js; web only). Everything is the
// real module except the two geocoding calls, which have no browser implementation (reverseGeocodeAsync
// throws, geocodeAsync returns nothing). Those go to Google through the Maps JavaScript API's Geocoder
// (../src/web/geocode-google.ts explains why not the Geocoding web service), loaded by the map shim.
// web-runtime.js resolves this file's own `expo-location` import to the real package.
const Location = require("expo-location");
const { geocodeGoogle, reverseGeocodeGoogle } = require("../src/web/geocode-google");
const { loadGoogle } = require("./react-native-maps-web");

/** Rejects when there is no key or Google refuses it, which callers treat as "couldn't ask". */
const geocode = async (request) => {
  const google = await loadGoogle();
  return new google.maps.Geocoder().geocode(request);
};

module.exports = {
  ...Location,
  reverseGeocodeAsync: (location) => reverseGeocodeGoogle(location, geocode),
  geocodeAsync: (address) => geocodeGoogle(address, geocode),
};
