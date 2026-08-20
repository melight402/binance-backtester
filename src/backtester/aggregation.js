import { INTERVAL_SECONDS } from './config.js';

function bucketStart(time, intervalSeconds) {
  return Math.floor(time / intervalSeconds) * intervalSeconds;
}

/**
 * Aggregates candles into UTC buckets and includes the current partial bucket.
 * The input must be sorted by ascending Unix-second timestamp.
 */
export function aggregateCandles(candles, interval) {
  const intervalSeconds = INTERVAL_SECONDS[interval];
  if (!intervalSeconds || !Array.isArray(candles)) return [];

  const buckets = new Map();
  for (const candle of candles) {
    if (!candle || !Number.isFinite(candle.time)) continue;
    const time = bucketStart(candle.time, intervalSeconds);
    const existing = buckets.get(time);

    if (!existing) {
      buckets.set(time, {
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: Number.isFinite(candle.volume) ? candle.volume : 0,
      });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += Number.isFinite(candle.volume) ? candle.volume : 0;
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}
