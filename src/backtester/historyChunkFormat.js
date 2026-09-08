const MAGIC = 'BFTK1';
const HEADER_BYTES = 32;
const RECORD_BYTES = 48;

export const HISTORY_CHUNK_VERSION = 1;

export function isHistoryChunkPayload(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < MAGIC.length) return false;
  return String.fromCharCode(...bytes.slice(0, MAGIC.length)) === MAGIC;
}

function assertRange(value, name) {
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}`);
}

export function encodeHistoryChunk(candles) {
  const values = Array.isArray(candles) ? candles : [];
  const bytes = new ArrayBuffer(HEADER_BYTES + values.length * RECORD_BYTES);
  const view = new DataView(bytes);
  for (let index = 0; index < MAGIC.length; index += 1) view.setUint8(index, MAGIC.charCodeAt(index));
  view.setUint8(5, HISTORY_CHUNK_VERSION);
  view.setUint32(8, values.length, true);
  view.setBigInt64(12, BigInt(values[0]?.time || 0), true);
  view.setBigInt64(20, BigInt(values.at(-1)?.time || 0), true);
  view.setUint32(28, RECORD_BYTES, true);

  values.forEach((candle, index) => {
    const offset = HEADER_BYTES + index * RECORD_BYTES;
    assertRange(candle.time, 'time');
    view.setBigInt64(offset, BigInt(Math.round(candle.time)), true);
    view.setFloat64(offset + 8, Number(candle.open), true);
    view.setFloat64(offset + 16, Number(candle.high), true);
    view.setFloat64(offset + 24, Number(candle.low), true);
    view.setFloat64(offset + 32, Number(candle.close), true);
    view.setFloat64(offset + 40, Number(candle.volume || 0), true);
  });
  return new Uint8Array(bytes);
}

export function decodeHistoryChunk(input, { startTime = -Infinity, endTime = Infinity } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTES) throw new Error('DATA_CORRUPTED');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.slice(0, MAGIC.length));
  if (magic !== MAGIC || view.getUint8(5) !== HISTORY_CHUNK_VERSION) throw new Error('DATA_SCHEMA_UNSUPPORTED');
  const count = view.getUint32(8, true);
  const recordBytes = view.getUint32(28, true);
  if (recordBytes !== RECORD_BYTES || HEADER_BYTES + count * RECORD_BYTES > bytes.byteLength) throw new Error('DATA_CORRUPTED');

  const candles = [];
  for (let index = 0; index < count; index += 1) {
    const offset = HEADER_BYTES + index * RECORD_BYTES;
    const time = Number(view.getBigInt64(offset, true));
    if (time < startTime || time > endTime) continue;
    candles.push({
      time,
      open: view.getFloat64(offset + 8, true),
      high: view.getFloat64(offset + 16, true),
      low: view.getFloat64(offset + 24, true),
      close: view.getFloat64(offset + 32, true),
      volume: view.getFloat64(offset + 40, true),
    });
  }
  return candles;
}

export function getHistoryChunkBounds(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTES) throw new Error('DATA_CORRUPTED');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.slice(0, MAGIC.length));
  if (magic !== MAGIC || view.getUint8(5) !== HISTORY_CHUNK_VERSION) throw new Error('DATA_SCHEMA_UNSUPPORTED');
  return {
    count: view.getUint32(8, true),
    firstTime: Number(view.getBigInt64(12, true)),
    lastTime: Number(view.getBigInt64(20, true)),
  };
}