import { OFFLINE_PACKAGE_URL, OFFLINE_SYMBOLS } from './offlineConfig.js';

let symbolsPromise;
let precisionPromise;
let manifestPromise;

async function readMetadata(name, fallback) {
  try {
    const response = await fetch(`${OFFLINE_PACKAGE_URL}/metadata/${name}`);
    if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
    return await response.json();
  } catch {
    return fallback;
  }
}

export function loadOfflineSymbols() {
  symbolsPromise ||= readMetadata('symbols.json', OFFLINE_SYMBOLS);
  return symbolsPromise;
}

export function loadOfflineStartTimes() {
  manifestPromise ||= fetch(`${OFFLINE_PACKAGE_URL}/manifest.json`)
    .then(async response => {
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
      return response.json();
    })
    .catch(() => ({ symbols: {} }));
  return manifestPromise.then(manifest => Object.fromEntries(
    Object.entries(manifest.symbols || {}).map(([symbol, intervals]) => {
      const firstTimes = Object.values(intervals || {})
        .map(interval => Number(interval?.firstTime))
        .filter(Number.isFinite);
      return [symbol, firstTimes.length > 0 ? Math.min(...firstTimes) : null];
    }),
  ));
}

export function loadOfflinePrecision() {
  precisionPromise ||= readMetadata('precision.json', {});
  return precisionPromise;
}

export function clearOfflineMetadataCache() {
  symbolsPromise = null;
  precisionPromise = null;
  manifestPromise = null;
}