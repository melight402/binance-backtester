import { readJson, writeJson } from '../services/storage.js';

const STORAGE_KEYS = ['trading_favorites', 'backtester_favorites'];

function normalizeFavorites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((symbol) => typeof symbol === 'string' && symbol.length > 0))];
}

export function loadFavorites() {
  for (const key of STORAGE_KEYS) {
    const value = readJson(key);
    if (value) return normalizeFavorites(value);
  }
  return [];
}

export function saveFavorites(favorites) {
  const normalized = normalizeFavorites(favorites);
  writeJson(STORAGE_KEYS[0], normalized);
  writeJson(STORAGE_KEYS[1], normalized);
}