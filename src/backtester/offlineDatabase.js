import Dexie from 'dexie';

export const offlineDatabase = new Dexie('SolidBacktestOffline');

offlineDatabase.version(1).stores({
  appMeta: 'key',
  chunkCache: 'key, symbol, interval, lastAccessedAt',
  overlayChunks: 'key, symbol, interval',
  settings: 'key',
});

export async function getCachedChunk(key) {
  return offlineDatabase.chunkCache.get(key);
}

export async function saveCachedChunk(record) {
  await offlineDatabase.chunkCache.put({ ...record, lastAccessedAt: Date.now() });
}

export async function clearCachedChunks() {
  await offlineDatabase.chunkCache.clear();
}

export async function getOverlayChunk(key) {
  return offlineDatabase.overlayChunks.get(key);
}

export async function saveOverlayChunk(record) {
  await offlineDatabase.overlayChunks.put(record);
}