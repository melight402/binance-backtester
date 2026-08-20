function getStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function readStorage(key) {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key, value) {
  try {
    getStorage()?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  try {
    getStorage()?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readJson(key, fallback = null) {
  const raw = readStorage(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    return writeStorage(key, JSON.stringify(value));
  } catch {
    return false;
  }
}