import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYMBOLS_TO_ADD } from './additional-symbols.js';
import { ALL_SYMBOLS, INTERVALS, dayKeys, monthKeys } from './history-utils.js';

const ROOT = fileURLToPath(new URL('../.history-source', import.meta.url));
const BASE = 'https://data.binance.vision/data/futures/um';
const concurrency = Math.max(1, Number(process.env.HISTORY_CONCURRENCY) || 4);
const symbols = [...new Set(SYMBOLS_TO_ADD.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
const knownSymbols = new Set(ALL_SYMBOLS);

if (!symbols.length) {
  console.log('No additional symbols configured. Edit scripts/additional-symbols.js first.');
  process.exit(0);
}

for (const symbol of symbols) {
  if (!/^[A-Z0-9]+USDT$/.test(symbol)) throw new Error(`Invalid USDT-M symbol: ${symbol}`);
  if (knownSymbols.has(symbol)) console.log(`${symbol} is already in the configured symbol list; refreshing missing files only.`);
}

await mkdir(ROOT, { recursive: true });
try {
  const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
  if (response.ok) await writeFile(join(ROOT, 'exchangeInfo.json'), Buffer.from(await response.arrayBuffer()));
} catch {
  console.warn('exchangeInfo unavailable; existing precision metadata will be preserved during package build.');
}

async function download(url, target) {
  try {
    await access(target);
    return 'cached';
  } catch {
    // Continue with download.
  }
  const response = await fetch(url);
  if (response.status === 404) return 'missing';
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return 'downloaded';
}

async function worker(queue) {
  while (queue.length) {
    const item = queue.shift();
    const fileName = item.type === 'daily' ? `daily-${item.day}.zip` : `${item.month}.zip`;
    const target = join(ROOT, item.symbol, item.interval, fileName);
    const url = item.type === 'daily'
      ? `${BASE}/daily/klines/${item.symbol}/${item.interval}/${item.symbol}-${item.interval}-${item.day}.zip`
      : `${BASE}/monthly/klines/${item.symbol}/${item.interval}/${item.symbol}-${item.interval}-${item.month}.zip`;
    const result = await download(url, target);
    if (result === 'missing') console.log(`Missing archive before listing or unavailable: ${item.symbol} ${item.interval} ${fileName}`);
  }
}

const months = monthKeys(Number(process.env.HISTORY_START_YEAR) || 2017);
const currentMonth = months.at(-1);
const lastCompletedDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
const queue = symbols.flatMap((symbol) => INTERVALS.flatMap((interval) => [
  ...months.filter((month) => month !== currentMonth).map((month) => ({ symbol, interval, month, type: 'monthly' })),
  ...dayKeys(currentMonth, lastCompletedDay).map((day) => ({ symbol, interval, month: currentMonth, day, type: 'daily' })),
]));
await Promise.all(Array.from({ length: concurrency }, () => worker(queue)));

const exchangeInfoPath = join(ROOT, 'exchangeInfo.json');
try {
  const exchangeInfo = JSON.parse(await readFile(exchangeInfoPath, 'utf8'));
  const available = new Set((exchangeInfo.symbols || []).map((item) => item.symbol));
  for (const symbol of symbols) if (!available.has(symbol)) console.warn(`No current exchangeInfo entry for ${symbol}; historical archives may still exist.`);
} catch {
  // The package builder can use the previous metadata file.
}

console.log(`Additional symbol download complete: ${symbols.join(', ')}`);