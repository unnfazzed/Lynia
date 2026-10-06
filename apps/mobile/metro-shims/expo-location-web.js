// expo-location for the customer web build (redirected by ./web-runtime.js; web only). Everything is the
// real module except the two geocoding calls, which have no browser implementation (reverseGeocodeAsync
// throws, geocodeAsync returns nothing) and go to Google's Geocoding API instead (../src/web/geocode-google.ts).
// web-runtime.js resolves this file's own `expo-location` import to the real package.
const Location = require("expo-location");
const { geocodeGoogle, reverseGeocodeGoogle } = require("../src/web/geocode-google");

const key = () => process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY || null;

module.exports = {
  ...Location,
  reverseGeocodeAsync: (location) => reverseGeocodeGoogle(location, key()),
  geocodeAsync: (address) => geocodeGoogle(address, key()),
};
