import { readJson, writeJson } from '../services/storage.js';

const INDICATOR_SETTINGS_KEY = 'solidBacktest:indicatorSettings';

const DEFAULT_SETTINGS = {
  hma50: { visible: true, period: 50 },
  hma200: { visible: true, period: 200 },
  sessions: true,
};

function normalizeLine(value, fallback) {
  return {
    visible: value?.visible === true,
    period: Math.max(1, Math.min(1000, Math.round(Number(value?.period) || fallback.period))),
  };
}

export function normalizeIndicatorSettings(value) {
  return {
    hma50: normalizeLine(value?.hma50 || value?.ma50, DEFAULT_SETTINGS.hma50),
    hma200: normalizeLine(value?.hma200 || value?.ma200, DEFAULT_SETTINGS.hma200),
    sessions: value?.sessions !== false,
  };
}

export function loadIndicatorSettings() {
  return normalizeIndicatorSettings(readJson(INDICATOR_SETTINGS_KEY, DEFAULT_SETTINGS));
}

export function saveIndicatorSettings(settings) {
  writeJson(INDICATOR_SETTINGS_KEY, normalizeIndicatorSettings(settings));
}
