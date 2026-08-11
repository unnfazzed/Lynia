// Web shim for socket.io-client. A static screenshot has no live socket, so io() returns an inert
// socket whose on/emit/connect are no-ops — the screen mounts and paints its cache/props state
// without a realtime feed. (The live map/marker motion is a device concern, not this lane's.)
function makeSocket() {
  const s = {
    connected: false,
    on() { return s; },
    off() { return s; },
    once() { return s; },
    emit() { return s; },
    connect() { return s; },
    disconnect() { return s; },
    close() { return s; },
    io: { on() {}, off() {} },
  };
  return s;
}
export function io() { return makeSocket(); }
export const Manager = class { socket() { return makeSocket(); } };
export const Socket = class {};
export default io;
