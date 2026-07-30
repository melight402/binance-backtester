// Thin wrapper around localStorage. Candles are stored as compact
// [time, open, high, low, close, volume] tuples to save space, and
// converted back to objects on read.

import { LS_PREFIX, MAX_KEPT_BARS } from './config.js';

function cacheKey(symbol, interval) {
  return `${LS_PREFIX}klines:${symbol}:${interval}`;
}

export function loadCandles(symbol, interval) {
  try {
    const raw = localStorage.getItem(cacheKey(symbol, interval));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return arr.map(([time, open, high, low, close, volume]) => ({
      time, open, high, low, close, volume,
    }));
  } catch (err) {
    console.warn('storage.loadCandles failed', symbol, interval, err);
    return [];
  }
}

export function saveCandles(symbol, interval, candles) {
  try {
    const trimmed = candles.length > MAX_KEPT_BARS
      ? candles.slice(candles.length - MAX_KEPT_BARS)
      : candles;
    const compact = trimmed.map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume]);
    localStorage.setItem(cacheKey(symbol, interval), JSON.stringify(compact));
    return trimmed;
  } catch (err) {
    // Quota exceeded or storage disabled - non-fatal, we just lose caching.
    console.warn('storage.saveCandles failed (quota?)', symbol, interval, err);
    return candles;
  }
}

export function clearCandleCache(symbol, interval) {
  try {
    localStorage.removeItem(cacheKey(symbol, interval));
  } catch (err) { /* ignore */ }
}

const FAVORITES_KEY = `${LS_PREFIX}favorites`;

export function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

export function saveFavorites(list) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch (err) { /* ignore */ }
}
