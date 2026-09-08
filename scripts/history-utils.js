import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SYMBOLS = [
  'TRADOORUSDT', 'LABUSDT', 'VELVETUSDT', 'BILLUSDT', 'BANKUSDT',
  'ESPORTSUSDT', 'RIVERUSDT', 'RAVEUSDT', 'AAVEUSDT', 'JTOUSDT',
  'XPLUSDT', 'INJUSDT', 'FIDAUSDT', 'EDENUSDT', 'BEATUSDT',
  'FARTCOINUSDT', 'AEROUSDT', 'UBUSDT', 'NEARUSDT', 'AKEUSDT',
  'WLDUSDT', 'ALLOUSDT', 'BTCUSDT', 'ETHUSDT',
];
export const ALL_SYMBOLS = [...new Set(SYMBOLS)];
export const INTERVALS = ['5m', '1h', '1d'];

export function monthKeys(startYear = 2017, end = new Date()) {
  const result = [];
  const cursor = new Date(Date.UTC(startYear, 0, 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    result.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

export function dayKeys(month, end = new Date()) {
  const [year, monthNumber] = month.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, monthNumber - 1, 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const result = [];
  while (cursor <= last && cursor.getUTCFullYear() === year && cursor.getUTCMonth() === monthNumber - 1) {
    result.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function parseCsv(text, intervalSeconds) {
  const candles = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('open_time')) continue;
    const fields = line.split(',');
    if (fields.length < 6) continue;
    const time = Math.round(Number(fields[0]) / 1000);
    const candle = {
      time,
      open: Number(fields[1]),
      high: Number(fields[2]),
      low: Number(fields[3]),
      close: Number(fields[4]),
      volume: Number(fields[5]),
    };
    if (!Number.isInteger(time) || time <= 0 || !Number.isFinite(candle.open) || !Number.isFinite(candle.high)
      || !Number.isFinite(candle.low) || !Number.isFinite(candle.close) || !Number.isFinite(candle.volume)
      || candle.volume < 0 || candle.high < Math.max(candle.open, candle.close, candle.low)
      || candle.low > Math.min(candle.open, candle.close, candle.high)) continue;
    if (candles.has(time) && candles.get(time).time + intervalSeconds !== time) continue;
    candles.set(time, candle);
  }
  return Array.from(candles.values()).sort((a, b) => a.time - b.time);
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}