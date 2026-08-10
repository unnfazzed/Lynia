// Web shim for expo-constants. Provides the `extra` config the app reads at boot (store URL, a
// non-localhost API URL so config.ts doesn't throw, support URL). Values are inert placeholders — the
// parity render never hits the network.
export default {
  expoConfig: {
    extra: {
      apiUrl: "https://api.lynia.example",
      storeUrl: "https://play.google.com/store/apps/details?id=zw.co.lynia",
      supportUrl: "tel:+263778831938",
    },
  },
  manifest: {},
  executionEnvironment: "standalone",
  appOwnership: null,
};
