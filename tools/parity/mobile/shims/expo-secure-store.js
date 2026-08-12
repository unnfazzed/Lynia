// In-memory SecureStore for the parity renderer — same async surface as the real module, so a
// fixture can seed per-order device state a populated screen draws from SecureStore (e.g. the
// customer's stored delivery code on the home LiveOrderCard, `lynia.deliveryCode.<orderId>`).
// Seed at fixture top level: `import * as SecureStore from "expo-secure-store"` resolves here.
const store = new Map();

export async function getItemAsync(key) {
  return store.has(key) ? store.get(key) : null;
}
export async function setItemAsync(key, value) {
  store.set(key, String(value));
}
export async function deleteItemAsync(key) {
  store.delete(key);
}

export default { getItemAsync, setItemAsync, deleteItemAsync };
