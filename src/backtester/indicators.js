// Weighted Moving Average and Hull Moving Average.
// Implemented with O(n) rolling sums so recomputing on every playback
// tick stays cheap even with thousands of bars in view.

/**
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|undefined)[]} same length as values; undefined until enough history exists
 */
export function wma(values, period) {
  const n = values.length;
  const out = new Array(n).fill(undefined);
  if (period <= 0 || n < period) return out;

  const denom = (period * (period + 1)) / 2;
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
    wsum += values[i] * (i + 1);
  }
  out[period - 1] = wsum / denom;

  for (let i = period; i < n; i++) {
    wsum += period * values[i] - sum;
    sum += values[i] - values[i - period];
    out[i] = wsum / denom;
  }
  return out;
}

/**
 * Hull Moving Average: WMA( 2*WMA(n/2) - WMA(n), sqrt(n) )
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|undefined)[]} same length as values
 */
export function hma(values, period) {
  const n = values.length;
  const out = new Array(n).fill(undefined);
  if (period <= 1 || n === 0) return out;

  const halfPeriod = Math.max(1, Math.round(period / 2));
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)));

  const wmaHalf = wma(values, halfPeriod);
  const wmaFull = wma(values, period);

  const diff = new Array(n).fill(undefined);
  for (let i = 0; i < n; i++) {
    if (wmaHalf[i] !== undefined && wmaFull[i] !== undefined) {
      diff[i] = 2 * wmaHalf[i] - wmaFull[i];
    }
  }

  const firstDefined = diff.findIndex((v) => v !== undefined);
  if (firstDefined === -1) return out;

  const tail = diff.slice(firstDefined);
  const tailWma = wma(tail, sqrtPeriod);
  for (let i = 0; i < tail.length; i++) {
    if (tailWma[i] !== undefined) out[firstDefined + i] = tailWma[i];
  }
  return out;
}

/**
 * Build lightweight-charts LineSeries data from candles for a given HMA period.
 * @param {{time:number, close:number}[]} candles
 * @param {number} period
 * @returns {{time:number, value:number}[]}
 */
export function buildHmaLineData(candles, period) {
  const closes = candles.map((c) => c.close);
  const values = hma(closes, period);
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    if (values[i] !== undefined) out.push({ time: candles[i].time, value: values[i] });
  }
  return out;
}

