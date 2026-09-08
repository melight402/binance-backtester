import { OFFLINE_PACKAGE_URL, OFFLINE_SYMBOLS } from './offlineConfig.js';

let symbolsPromise;
let precisionPromise;

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

export function loadOfflinePrecision() {
  precisionPromise ||= readMetadata('precision.json', {});
  return precisionPromise;
}

export function clearOfflineMetadataCache() {
  symbolsPromise = null;
  precisionPromise = null;
}