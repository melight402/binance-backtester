import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTERVALS, SYMBOLS, dayKeys, monthKeys } from './history-utils.js';

const ROOT = fileURLToPath(new URL('../.history-source', import.meta.url));
const BASE = 'https://data.binance.vision/data/futures/um';
const concurrency = Math.max(1, Number(process.env.HISTORY_CONCURRENCY) || 4);
const retries = Math.max(1, Number(process.env.HISTORY_RETRIES) || 5);
const timeoutMs = Math.max(5000, Number(process.env.HISTORY_TIMEOUT_MS) || 30000);
const failed = [];
const missingArchives = [];
let completed = 0;
let downloaded = 0;
let cached = 0;
let missing = 0;
let started = 0;

await mkdir(ROOT, { recursive: true });
let exchangeInfo = null;
try {
  const metadataResponse = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
  if (metadataResponse.ok) {
    const body = Buffer.from(await metadataResponse.arrayBuffer());
    await writeFile(join(ROOT, 'exchangeInfo.json'), body);
    exchangeInfo = JSON.parse(body.toString('utf8'));
  }
} catch {
  // Historical data remains usable when exchangeInfo is unavailable.
}

const onboardMonthBySymbol = new Map((exchangeInfo?.symbols || [])
  .filter((item) => item.symbol && Number.isFinite(Number(item.onboardDate)))
  .map((item) => {
    const date = new Date(Number(item.onboardDate));
    return [item.symbol, `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`];
  }));

async function download(url, target) {
  try {
    await access(target);
    return 'cached';
  } catch {
    // The archive is not present yet.
  }
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 404) return 'missing';
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await mkdir(join(target, '..'), { recursive: true });
      const body = Buffer.from(await response.arrayBuffer());
      const temporaryTarget = `${target}.part`;
      await writeFile(temporaryTarget, body);
      await rename(temporaryTarget, target);
      return 'downloaded';
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const delay = Math.min(30000, 1000 * (2 ** (attempt - 1)));
        console.warn(`Retry ${attempt}/${retries - 1} after ${error.code || error.message}: ${url}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timer);
      await rm(`${target}.part`, { force: true });
    }
  }
  throw new Error(`${lastError?.code || lastError?.message || 'Download failed'}: ${url}`);
}

async function worker(queue) {
  while (queue.length) {
    const item = queue.shift();
    const fileName = item.type === 'daily' ? `daily-${item.day}.zip` : `${item.month}.zip`;
    const target = join(ROOT, item.symbol, item.interval, fileName);
    const url = item.type === 'daily'
      ? `${BASE}/daily/klines/${item.symbol}/${item.interval}/${item.symbol}-${item.interval}-${item.day}.zip`
      : `${BASE}/monthly/klines/${item.symbol}/${item.interval}/${item.symbol}-${item.interval}-${item.month}.zip`;
    const label = `${item.symbol} ${item.interval} ${fileName}`;
    const taskNumber = ++started;
    console.log(`[${taskNumber}/${totalTasks}] CHECKING    ${label}`);
    try {
      const result = await download(url, target);
      completed += 1;
      if (result === 'cached') {
        cached += 1;
        console.log(`[${taskNumber}/${totalTasks}] CACHED      ${label}`);
      } else if (result === 'missing') {
        missing += 1;
        missingArchives.push({
          symbol: item.symbol,
          interval: item.interval,
          file: fileName,
          type: item.type,
          onboardMonth: onboardMonthBySymbol.get(item.symbol) || null,
          url,
        });
        console.log(`[${taskNumber}/${totalTasks}] MISSING     ${label}`);
      } else {
        downloaded += 1;
        console.log(`[${taskNumber}/${totalTasks}] DOWNLOADED  ${label}`);
      }
    } catch (error) {
      completed += 1;
      failed.push({ symbol: item.symbol, interval: item.interval, file: fileName, error: error.message });
      console.error(`[${taskNumber}/${totalTasks}] FAILED      ${label}: ${error.message}`);
    }
  }
}

const months = monthKeys(Number(process.env.HISTORY_START_YEAR) || 2017);
const currentMonth = months.at(-1);
const lastCompletedDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
const queue = SYMBOLS.flatMap((symbol) => INTERVALS.flatMap((interval) => [
  ...months
    .filter((month) => month !== currentMonth)
    .filter((month) => !onboardMonthBySymbol.has(symbol) || month >= onboardMonthBySymbol.get(symbol))
    .map((month) => ({ symbol, interval, month, type: 'monthly' })),
  ...dayKeys(currentMonth, lastCompletedDay).map((day) => ({ symbol, interval, month: currentMonth, day, type: 'daily' })),
]));
const totalTasks = queue.length;
console.log(`Starting historical download: ${totalTasks} archives, concurrency=${concurrency}`);
await Promise.all(Array.from({ length: concurrency }, () => worker(queue)));
console.log(`Historical source download complete: downloaded=${downloaded}, cached=${cached}, missing=${missing}, failed=${failed.length}`);
if (missingArchives.length) {
  await writeFile(join(ROOT, 'missing-archives.json'), `${JSON.stringify(missingArchives, null, 2)}\n`);
  console.warn(`Missing archive report written to ${join(ROOT, 'missing-archives.json')}`);
}
if (failed.length) {
  console.error(`Download finished with ${failed.length} failed files. Re-run the command to retry them.`);
  await writeFile(join(ROOT, 'download-failures.json'), `${JSON.stringify(failed, null, 2)}\n`);
  process.exitCode = 1;
}