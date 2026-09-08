import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import { SYMBOLS_TO_ADD } from './additional-symbols.js';
import { encodeHistoryChunk } from '../src/backtester/historyChunkFormat.js';
import { ALL_SYMBOLS, INTERVALS, dayKeys, monthKeys, parseCsv, sha256, writeJson } from './history-utils.js';

const ROOT = fileURLToPath(new URL('../.history-source', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../public/historical-data', import.meta.url));
const SYMBOLS = [...new Set([...ALL_SYMBOLS, ...SYMBOLS_TO_ADD.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)])];

async function readZipCsv(paths) {
  const values = [];
  for (const path of paths) {
    try {
      const directory = await unzipper.Open.file(path);
      const csv = directory.files.find((entry) => entry.path.toLowerCase().endsWith('.csv'));
      if (csv) values.push((await csv.buffer()).toString('utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return values.join('\n');
}

async function buildChunk(sources, destination, intervalSeconds) {
  const csv = await readZipCsv(sources);
  if (!csv) return null;
  const candles = parseCsv(csv, intervalSeconds);
  if (!candles.length) return null;
  const raw = Buffer.from(encodeHistoryChunk(candles));
  await mkdir(join(destination, '..'), { recursive: true });
  await pipeline(ReadableFrom(raw), createGzip(), createWriteStream(destination));
  return { firstTime: candles[0].time, lastTime: candles.at(-1).time, count: candles.length, sha256: sha256(raw) };
}

function ReadableFrom(buffer) {
  return requireUnavailableReadable(buffer);
}

function requireUnavailableReadable(buffer) {
  return (async function* stream() { yield buffer; }());
}

const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), source: 'Binance Futures Vision UM', symbols: {} };
const exchangeInfo = JSON.parse(await readFile(join(ROOT, 'exchangeInfo.json'), 'utf8').catch(() => '{}'));
const precision = Object.fromEntries((exchangeInfo.symbols || [])
  .filter((item) => SYMBOLS.includes(item.symbol))
  .map((item) => [item.symbol, {
    stepSize: Number(item.filters?.find((filter) => filter.filterType === 'LOT_SIZE')?.stepSize) || null,
    tickSize: Number(item.filters?.find((filter) => filter.filterType === 'PRICE_FILTER')?.tickSize) || null,
  }]));
await rm(OUTPUT, { recursive: true, force: true });
for (const symbol of SYMBOLS) {
  manifest.symbols[symbol] = {};
  for (const interval of INTERVALS) {
    const intervalSeconds = interval === '5m' ? 300 : interval === '1h' ? 3600 : 86400;
    const chunks = [];
    const months = monthKeys(Number(process.env.HISTORY_START_YEAR) || 2017);
    const lastCompletedDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const month of months) {
      const sources = month === months.at(-1)
        ? dayKeys(month, lastCompletedDay).map((day) => join(ROOT, symbol, interval, `daily-${day}.zip`))
        : [join(ROOT, symbol, interval, `${month}.zip`)];
      const details = await buildChunk(sources, join(OUTPUT, 'chunks', symbol, interval, `${month}.bin.gz`), intervalSeconds);
      if (details) chunks.push({ path: relative(OUTPUT, join(OUTPUT, 'chunks', symbol, interval, `${month}.bin.gz`)), ...details });
    }
    if (chunks.length) manifest.symbols[symbol][interval] = { firstTime: chunks[0].firstTime, lastTime: chunks.at(-1).lastTime, candleCount: chunks.reduce((sum, chunk) => sum + chunk.count, 0), chunks };
  }
}
await writeJson(join(OUTPUT, 'manifest.json'), manifest);
await writeJson(join(OUTPUT, 'metadata', 'symbols.json'), SYMBOLS);
await writeJson(join(OUTPUT, 'metadata', 'precision.json'), precision);
console.log(`History package built at ${OUTPUT}`);