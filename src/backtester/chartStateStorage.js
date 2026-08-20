import { readJson, writeJson } from '../services/storage.js';

const CHART_STATE_PREFIX = 'solidBacktest:chartState:';

function getKey(symbol, interval, type) {
  return `${CHART_STATE_PREFIX}${symbol}:${interval}:${type}`;
}

export function loadChartState(symbol, interval, type) {
  const state = readJson(getKey(symbol, interval, type));
  if (!state?.logicalRange) return null;
  const { from, to } = state.logicalRange;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null;
  return { logicalRange: { from, to } };
}

export function saveChartState(symbol, interval, type, logicalRange) {
  if (!logicalRange || !Number.isFinite(logicalRange.from) || !Number.isFinite(logicalRange.to)) return;
  writeJson(getKey(symbol, interval, type), {
    logicalRange: { from: logicalRange.from, to: logicalRange.to },
  });
}
