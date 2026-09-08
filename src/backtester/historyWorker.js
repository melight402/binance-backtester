import { decodeHistoryChunk, isHistoryChunkPayload } from './historyChunkFormat.js';

async function decodeCompressed(buffer, startTime, endTime) {
  const bytes = new Uint8Array(buffer);
  if (isHistoryChunkPayload(bytes)) return decodeHistoryChunk(bytes, { startTime, endTime });
  if (typeof DecompressionStream === 'undefined') throw new Error('DATA_SCHEMA_UNSUPPORTED');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = await new Response(stream).arrayBuffer();
  return decodeHistoryChunk(new Uint8Array(raw), { startTime, endTime });
}

self.onmessage = async (event) => {
  const { id, buffer, startTime, endTime } = event.data;
  try {
    const candles = await decodeCompressed(buffer, startTime, endTime);
    self.postMessage({ id, candles });
  } catch (error) {
    self.postMessage({ id, error: error.message || 'DATA_CORRUPTED' });
  }
};