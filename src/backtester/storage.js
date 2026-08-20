// Thin wrapper around localStorage. Candles are stored as compact
// [time, open, high, low, close, volume] tuples to save space, and
// converted back to objects on read.

import { LS_PREFIX, MAX_KEPT_BARS } from './config.js';
import { normalizeCandles } from './candleModel.js';
import { readJson, removeStorage, writeJson } from '../services/storage.js';

function cacheKey(symbol, interval) {
  return `${LS_PREFIX}klines:${symbol}:${interval}`;
}

export function loadCandles(symbol, interval) {
  return normalizeCandles(readJson(cacheKey(symbol, interval), []));
}

export function saveCandles(symbol, interval, candles) {
  const normalized = normalizeCandles(candles);
  const trimmed = normalized.length > MAX_KEPT_BARS
    ? normalized.slice(normalized.length - MAX_KEPT_BARS)
    : normalized;
  const compact = trimmed.map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume]);
  writeJson(cacheKey(symbol, interval), compact);
  return trimmed;
}

export function clearCandleCache(symbol, interval) {
  removeStorage(cacheKey(symbol, interval));
}
