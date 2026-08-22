import { readJson, writeJson } from '../services/storage.js';

const APP_SETTINGS_KEY = 'solidBacktest:appSettings';
const VALID_INTERVALS = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']);
const VALID_PROFIT_LOSS = new Set(['profit', 'loss']);

const DEFAULT_SETTINGS = {
  symbol: 'BTCUSDT',
  timeframe: '1h',
  speed: 1,
  sidebarOpen: true,
  subChartsOpen: true,
  startTime: null,
  rr: 2,
  riskUsdt: 10,
  profitLoss: 'profit',
};

export function normalizeAppSettings(value) {
  const speed = Number(value?.speed);
  const startTime = Number(value?.startTime);
  const currentTimeSeconds = Math.floor(Date.now() / 1000);
  return {
    symbol: typeof value?.symbol === 'string' && value.symbol.length > 0 ? value.symbol : DEFAULT_SETTINGS.symbol,
    timeframe: VALID_INTERVALS.has(value?.timeframe) ? value.timeframe : DEFAULT_SETTINGS.timeframe,
    speed: Number.isFinite(speed) ? Math.max(1, Math.min(10, Math.round(speed))) : DEFAULT_SETTINGS.speed,
    sidebarOpen: value?.sidebarOpen !== false,
    subChartsOpen: value?.subChartsOpen !== false,
    startTime: Number.isFinite(startTime) && startTime > 0 ? Math.min(startTime, currentTimeSeconds) : null,
    rr: Number.isFinite(Number(value?.rr)) ? Math.max(0.1, Math.min(20, Number(value.rr))) : DEFAULT_SETTINGS.rr,
    riskUsdt: Number.isFinite(Number(value?.riskUsdt)) ? Math.max(0.01, Math.min(1000000, Number(value.riskUsdt))) : DEFAULT_SETTINGS.riskUsdt,
    profitLoss: VALID_PROFIT_LOSS.has(value?.profitLoss) ? value.profitLoss : DEFAULT_SETTINGS.profitLoss,
  };
}

export function loadAppSettings() {
  return normalizeAppSettings(readJson(APP_SETTINGS_KEY, DEFAULT_SETTINGS));
}

export function saveAppSettings(settings) {
  writeJson(APP_SETTINGS_KEY, normalizeAppSettings(settings));
}
