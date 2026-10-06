// expo-secure-store for the customer web build (redirected by ./web-runtime.js; web only). The real
// module is empty on web, so every save threw and sign-in could never stick. Same async API, backed by
// localStorage (owner decision W3, 2026-10-06: browser storage now, httpOnly cookies later), and by
// memory when storage is unavailable (private mode, blocked site data) so the app still runs for the
// session. Keys are namespaced so they can't collide with anything else on the origin.
const PREFIX = "lynia.secure:";
const memory = new Map();

function storage() {
  try {
    const s = globalThis.localStorage;
    const probe = `${PREFIX}__probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function getItem(key) {
  const s = storage();
  if (s) {
    try {
      return s.getItem(PREFIX + key);
    } catch {
      /* fall through to memory */
    }
  }
  return memory.has(key) ? memory.get(key) : null;
}

function setItem(key, value) {
  memory.set(key, value);
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PREFIX + key, value);
  } catch {
    /* quota or blocked: memory still holds it for this session */
  }
}

function deleteItem(key) {
  memory.delete(key);
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(PREFIX + key);
  } catch {
    /* nothing to clear */
  }
}

module.exports = {
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  isAvailableAsync: async () => true,
  getItemAsync: async (key) => getItem(key),
  setItemAsync: async (key, value) => setItem(key, value),
  deleteItemAsync: async (key) => deleteItem(key),
  getItem,
  setItem,
  canUseBiometricAuthentication: () => false,
};
