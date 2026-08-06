import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  session: "doodoo_session",
  users: "doodoo_users",
  tasks: "doodoo_tasks",
  fields: "doodoo_categories",
  notifications: "doodoo_notifications"
};

const LEGACY_KEYS = {
  session: "doodoo.session",
  users: "doodoo.users",
  tasks: "doodoo.tasks",
  fields: "doodoo.fields",
  notifications: "doodoo.notifications"
};

export async function loadJson(key, fallback) {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

export async function loadStoredJson(name, fallback) {
  const key = STORAGE_KEYS[name];
  const legacyKey = LEGACY_KEYS[name];
  const raw = await AsyncStorage.getItem(key);
  if (raw) return JSON.parse(raw);
  const legacyRaw = legacyKey ? await AsyncStorage.getItem(legacyKey) : null;
  if (legacyRaw) {
    const parsed = JSON.parse(legacyRaw);
    await saveJson(key, parsed);
    return parsed;
  }
  return fallback;
}

export async function saveJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function saveStoredJson(name, value) {
  await saveJson(STORAGE_KEYS[name], value);
}

export async function removeItem(key) {
  await AsyncStorage.removeItem(key);
}

export async function removeStoredItem(name) {
  await removeItem(STORAGE_KEYS[name]);
  if (LEGACY_KEYS[name]) await removeItem(LEGACY_KEYS[name]);
}
