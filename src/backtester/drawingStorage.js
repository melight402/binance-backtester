import { readJson, removeStorage, writeJson } from '../services/storage.js';

const DRAWINGS_KEY_PREFIX = 'solidBacktest:drawings:';

function normalizeType(type) {
  if (!type || typeof type !== 'string') return type;
  const lower = type.toLowerCase();
  if (lower === 'level' || lower === 'hline') return 'hline';
  if (lower === 'horizontalray' || lower === 'horizontal_ray' || lower === 'horizontal-ray' || lower === 'ray') return 'ray';
  if (lower === 'trendline' || lower === 'trend-line' || lower === 'trend_line') return 'trendline';
  return lower;
}

function normalizeDrawing(value) {
  if (!value || typeof value !== 'object' || typeof value.type !== 'string') return null;
  const type = normalizeType(value.type);
  if (type === 'hline') {
    return Number.isFinite(Number(value.price)) ? { ...value, type: 'hline', price: Number(value.price), sourceChartId: value.sourceChartId || null } : null;
  }
  if (type === 'ray') {
    const price = Number(value.price);
    const startTime = Number(value.startTime);
    return Number.isFinite(price) && price > 0 && Number.isFinite(startTime)
      ? { ...value, type: 'ray', price, startTime, sourceChartId: value.sourceChartId || null }
      : null;
  }
  if (type === 'trendline') {
    const p1 = value.p1 || {};
    const p2 = value.p2 || {};
    const p1Time = Number(p1.time);
    const p1Price = Number(p1.price);
    const p2Time = Number(p2.time);
    const p2Price = Number(p2.price);
    if (Number.isFinite(p1Time) && Number.isFinite(p1Price) && Number.isFinite(p2Time) && Number.isFinite(p2Price)) {
      return { ...value, type: 'trendline', p1: { time: p1Time, price: p1Price }, p2: { time: p2Time, price: p2Price }, sourceChartId: value.sourceChartId || null };
    }
    return null;
  }
  if (type !== 'position' || !['long', 'short'].includes(value.side)) return null;
  const prices = ['entryPrice', 'stopPrice', 'targetPrice'].map((key) => Number(value[key]));
  if (prices.some((price) => !Number.isFinite(price) || price <= 0)) return null;
  return { ...value, type: 'position', entryPrice: prices[0], stopPrice: prices[1], targetPrice: prices[2], sourceChartId: value.sourceChartId || null };
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
