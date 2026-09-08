import { OFFLINE_INTERVALS, OFFLINE_MODES, OFFLINE_PACKAGE_URL, OFFLINE_SCHEMA_VERSION } from './offlineConfig.js';
import { decodeHistoryChunk, isHistoryChunkPayload } from './historyChunkFormat.js';
import { getCachedChunk, saveCachedChunk } from './offlineDatabase.js';
import { getOverlayChunk, saveOverlayChunk } from './offlineDatabase.js';
import { fetchKlines } from './binanceApi.js';
import { INTERVAL_SECONDS } from './config.js';

const MAX_L1_BYTES = 256 * 1024 * 1024;

function chunkKey(symbol, interval, path) {
  return `${symbol}:${interval}:${path}`;
}

function sortCandles(candles) {
  const byTime = new Map();
  for (const candle of candles) byTime.set(candle.time, candle);
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

function errorWithCode(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export class DataRepository {
  constructor({ mode = OFFLINE_MODES.LOCAL, packageUrl = OFFLINE_PACKAGE_URL } = {}) {
    this.mode = mode;
    this.packageUrl = packageUrl.replace(/\/$/, '');
    this.manifest = null;
    this.manifestPromise = null;
    this.worker = null;
    this.requestId = 0;
    this.pending = new Map();
    this.l1 = new Map();
    this.l1Bytes = 0;
    this.workerMessageHandler = (event) => {
      const request = this.pending.get(event.data.id);
      if (!request) return;
      this.pending.delete(event.data.id);
      if (event.data.error) request.reject(errorWithCode(event.data.error));
      else request.resolve(event.data.candles);
    };
  }

  setMode(mode) {
    if (!Object.values(OFFLINE_MODES).includes(mode)) throw new Error(`Unsupported data mode: ${mode}`);
    this.mode = mode;
  }

  async loadManifest() {
    if (this.manifest) return this.manifest;
    if (!this.manifestPromise) {
      this.manifestPromise = fetch(`${this.packageUrl}/manifest.json`).then(async (response) => {
        if (!response.ok) throw errorWithCode('DATA_FILE_MISSING', `Manifest HTTP ${response.status}`);
        const manifest = await response.json();
        if (manifest.schemaVersion !== OFFLINE_SCHEMA_VERSION) throw errorWithCode('DATA_SCHEMA_UNSUPPORTED');
        this.manifest = manifest;
        return manifest;
      });
    }
    return this.manifestPromise;
  }

  async getCoverage(symbol, interval) {
    await this.loadManifest();
    return this.manifest.symbols?.[symbol]?.[interval] || null;
  }

  async hasRange(symbol, interval, startTime, endTime) {
    const coverage = await this.getCoverage(symbol, interval);
    return Boolean(coverage && startTime >= coverage.firstTime && endTime <= coverage.lastTime);
  }

  async getRange(symbol, interval, startTime, endTime, signal) {
    if (!INTERVAL_SECONDS[interval]) throw errorWithCode('DATA_SCHEMA_UNSUPPORTED', `Unsupported interval: ${interval}`);
    if (!OFFLINE_INTERVALS.includes(interval) && this.mode !== OFFLINE_MODES.ONLINE) {
      throw errorWithCode('DATA_NOT_COVERED', `${interval} is available only in Online update`);
    }
    const coverage = await this.getCoverage(symbol, interval);
    if (!coverage || endTime < coverage.firstTime || startTime > coverage.lastTime) {
      if (this.mode !== OFFLINE_MODES.ONLINE) throw errorWithCode('DATA_NOT_COVERED');
      return this.getOnlineRange(symbol, interval, startTime, endTime, signal);
    }
    const result = [];
    const localStart = Math.max(startTime, coverage.firstTime);
    const localEnd = Math.min(endTime, coverage.lastTime);
    const chunks = coverage.chunks.filter((chunk) => chunk.lastTime >= localStart && chunk.firstTime <= localEnd);
    for (const chunk of chunks) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      result.push(...await this.getChunk(symbol, interval, chunk, localStart, localEnd, signal));
    }
    if (this.mode === OFFLINE_MODES.ONLINE && (startTime < localStart || endTime > localEnd)) {
      result.push(...await this.getOnlineRange(symbol, interval, Math.min(startTime, localStart), Math.max(endTime, localEnd), signal));
    }
    return sortCandles(result);
  }

  async getOnlineRange(symbol, interval, startTime, endTime, signal) {
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) throw errorWithCode('DATA_NOT_COVERED');
    const result = [];
    let cursor = startTime;
    let guard = 0;
    while (cursor <= endTime && guard < 1000) {
      guard += 1;
      const page = await fetchKlines(symbol, interval, {
        startTime: cursor * 1000,
        endTime: endTime * 1000,
        signal,
      });
      if (!page.length) break;
      result.push(...page);
      const next = page.at(-1).time + (page.length > 1 ? page[1].time - page[0].time : 1);
      if (next <= cursor) break;
      cursor = next;
      await saveOverlayChunk({
        key: `online:${symbol}:${interval}:${page[0].time}`,
        symbol,
        interval,
        source: 'online',
        candles: page,
        lastTime: page.at(-1).time,
      });
      if (page.length < 1000) break;
    }
    return result;
  }

  async getNearestBefore(symbol, interval, time, signal) {
    const candles = await this.getRange(symbol, interval, -Infinity, time, signal);
    return candles.at(-1) || null;
  }

  async getNearestAfter(symbol, interval, time, signal) {
    const coverage = await this.getCoverage(symbol, interval);
    if (!coverage) return null;
    const next = coverage.chunks.find((chunk) => chunk.lastTime >= time);
    if (!next) return null;
    const candles = await this.getChunk(symbol, interval, next, time, Infinity, signal);
    return candles[0] || null;
  }

  async getChunk(symbol, interval, chunk, startTime, endTime, signal) {
    const key = chunkKey(symbol, interval, chunk.path);
    const cached = this.l1.get(key);
    if (cached) {
      cached.lastAccessedAt = Date.now();
      return cached.candles.filter((candle) => candle.time >= startTime && candle.time <= endTime);
    }

    const stored = await getCachedChunk(key);
    let compressed = stored?.compressedData;
    if (!compressed) {
      const response = await fetch(`${this.packageUrl}/${chunk.path}`, { signal });
      if (!response.ok) throw errorWithCode(response.status === 404 ? 'DATA_FILE_MISSING' : 'DATA_CORRUPTED');
      compressed = await response.arrayBuffer();
      await saveCachedChunk({ key, symbol, interval, compressedData: compressed, byteSize: compressed.byteLength, checksum: chunk.sha256 });
    }

    const candles = await this.decode(compressed, -Infinity, Infinity, signal);
    this.putL1(key, compressed, candles);
    return candles.filter((candle) => candle.time >= startTime && candle.time <= endTime);
  }

  async decode(compressed, startTime, endTime, signal) {
    if (typeof Worker === 'undefined') {
      const bytes = new Uint8Array(compressed);
      if (isHistoryChunkPayload(bytes)) return decodeHistoryChunk(bytes, { startTime, endTime });
      if (typeof DecompressionStream === 'undefined') throw errorWithCode('DATA_SCHEMA_UNSUPPORTED');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const raw = await new Response(stream).arrayBuffer();
      return decodeHistoryChunk(new Uint8Array(raw), { startTime, endTime });
    }
    if (!this.worker) {
      this.worker = new Worker(new URL('./historyWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = this.workerMessageHandler;
    }
    const id = ++this.requestId;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    const abort = () => {
      this.pending.get(id)?.reject(new DOMException('Aborted', 'AbortError'));
      this.pending.delete(id);
    };
    signal?.addEventListener('abort', abort, { once: true });
    this.worker.postMessage({ id, buffer: compressed, startTime, endTime });
    return promise.finally(() => signal?.removeEventListener('abort', abort));
  }

  putL1(key, compressed, decoded) {
    const previous = this.l1.get(key);
    if (previous) this.l1Bytes -= previous.byteSize;
    const record = { candles: decoded, byteSize: compressed.byteLength, lastAccessedAt: Date.now() };
    this.l1.set(key, record);
    this.l1Bytes += record.byteSize;
    while (this.l1Bytes > MAX_L1_BYTES && this.l1.size > 1) {
      const oldest = [...this.l1.entries()].sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)[0][0];
      const removed = this.l1.get(oldest);
      this.l1.delete(oldest);
      this.l1Bytes -= removed.byteSize;
    }
  }

  clearRuntimeCache() {
    this.l1.clear();
    this.l1Bytes = 0;
  }

  dispose() {
    this.pending.forEach(({ reject }) => reject(new DOMException('Aborted', 'AbortError')));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.clearRuntimeCache();
  }
}

export const dataRepository = new DataRepository();