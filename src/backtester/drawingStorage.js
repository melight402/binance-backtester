import { readJson, removeStorage, writeJson } from '../services/storage.js';

const DRAWINGS_KEY_PREFIX = 'solidBacktest:drawings:';

function normalizeDrawing(value) {
  if (!value || typeof value !== 'object' || typeof value.type !== 'string') return null;
  if (value.type === 'level') {
    return Number.isFinite(Number(value.price)) ? { ...value, price: Number(value.price), sourceChartId: value.sourceChartId || null } : null;
  }
  if (value.type !== 'position' || !['long', 'short'].includes(value.side)) return null;
  const prices = ['entryPrice', 'stopPrice', 'targetPrice'].map((key) => Number(value[key]));
  if (prices.some((price) => !Number.isFinite(price) || price <= 0)) return null;
  return { ...value, entryPrice: prices[0], stopPrice: prices[1], targetPrice: prices[2], sourceChartId: value.sourceChartId || null };
}

function getKey(symbol) {
  return `${DRAWINGS_KEY_PREFIX}${symbol}`;
}

export function loadDrawings(symbol) {
  const drawings = readJson(getKey(symbol), []);
  return Array.isArray(drawings) ? drawings.map(normalizeDrawing).filter(Boolean) : [];
}

export function saveDrawings(symbol, drawings) {
  const value = Array.isArray(drawings) ? drawings.map(normalizeDrawing).filter(Boolean) : [];
  if (value.length === 0) {
    removeStorage(getKey(symbol));
    return;
  }
  writeJson(getKey(symbol), value);
}

export function clearDrawings(symbol) {
  removeStorage(getKey(symbol));
}
