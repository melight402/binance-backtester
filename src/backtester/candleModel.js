function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

export function normalizeCandle(value) {
  const source = Array.isArray(value)
    ? { time: value[0], open: value[1], high: value[2], low: value[3], close: value[4], volume: value[5] }
    : value;
  const candle = {
    time: Math.round(Number(source?.time)),
    open: Number(source?.open),
    high: Number(source?.high),
    low: Number(source?.low),
    close: Number(source?.close),
    volume: Number(source?.volume),
  };
  if (!Number.isInteger(candle.time) || !finitePositive(candle.time)) return null;
  if (![candle.open, candle.high, candle.low, candle.close].every(finitePositive)) return null;
  if (!Number.isFinite(candle.volume) || candle.volume < 0) return null;
  if (candle.high < Math.max(candle.open, candle.close, candle.low)) return null;
  if (candle.low > Math.min(candle.open, candle.close, candle.high)) return null;
  return candle;
}

export function normalizeCandles(values) {
  const byTime = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const candle = normalizeCandle(value);
    if (candle) byTime.set(candle.time, candle);
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}