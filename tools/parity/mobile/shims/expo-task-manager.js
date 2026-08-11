// Web shim for expo-task-manager. background-location-task.ts calls TaskManager.defineTask() at
// MODULE TOP LEVEL (Expo requires the registration outside React), so a namespace member must exist
// or the module throws at import. A static screenshot runs no background tasks — all no-ops.
export function defineTask() {}
export async function isTaskRegisteredAsync() { return false; }
export async function unregisterTaskAsync() {}
export async function unregisterAllTasksAsync() {}
export async function getRegisteredTasksAsync() { return []; }
export async function isAvailableAsync() { return false; }
export default { defineTask, isTaskRegisteredAsync, unregisterTaskAsync, unregisterAllTasksAsync, getRegisteredTasksAsync, isAvailableAsync };
