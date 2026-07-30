import { INTERVAL_SECONDS, KLINES_PAGE_LIMIT } from './config.js';
import { fetchKlines } from './binanceApi.js';
import { loadCandles, saveCandles } from './storage.js';

/**
 * Holds the candle history for one (symbol, interval) pair: an in-memory,
 * localStorage-backed array plus the two fetch operations the app needs:
 *  - ensureWarmup: fill in history *before* the playback start point, so
 *    indicators like HMA200 have valid values from bar one.
 *  - ensureAhead: top up the *future* side once the playhead gets within
 *    MIN_BARS_AHEAD candles of the end of what's cached.
 */
export class TimeframeSeries {
  constructor(symbol, interval) {
    this.symbol = symbol;
    this.interval = interval;
    this.intervalSeconds = INTERVAL_SECONDS[interval];
    this.candles = loadCandles(symbol, interval); // ascending by time
    this._fetchingAhead = false;
  }

  countAtOrBefore(time) {
    let n = 0;
    for (const c of this.candles) { if (c.time <= time) n++; else break; }
    return n;
  }

  countAfter(time) {
    let n = 0;
    for (let i = this.candles.length - 1; i >= 0; i--) {
      if (this.candles[i].time > time) n++; else break;
    }
    return n;
  }

  /** Returns all cached candles with time <= simTime, in ascending order. */
  visibleUpTo(simTime) {
    const out = [];
    for (const c of this.candles) {
      if (c.time <= simTime) out.push(c); else break;
    }
    return out;
  }

  /** Make sure at least `warmupBars` candles exist at or before `atTime`. */
  async ensureWarmup(atTime, warmupBars) {
    if (this.countAtOrBefore(atTime) >= warmupBars) return;

    let guard = 0;
    while (this.countAtOrBefore(atTime) < warmupBars && guard < 12) {
      guard++;
      const earliest = this.candles[0];
      const endTimeMs = earliest ? earliest.time * 1000 - 1 : atTime * 1000 + 999;
      const page = await fetchKlines(this.symbol, this.interval, {
        endTime: endTimeMs,
        limit: KLINES_PAGE_LIMIT,
      });
      if (!page.length) break;
      this._merge(page);
      if (page.length < KLINES_PAGE_LIMIT) break; // reached start of symbol's history
    }
    this._persist();
  }

  /** Make sure at least `minAhead` candles exist strictly after `simTime`. */
  async ensureAhead(simTime, minAhead) {
    if (this.countAfter(simTime) >= minAhead || this._fetchingAhead) return;
    this._fetchingAhead = true;
    try {
      let guard = 0;
      while (this.countAfter(simTime) < minAhead && guard < 8) {
        guard++;
        const last = this.candles[this.candles.length - 1];
        const startTimeMs = last
          ? (last.time + this.intervalSeconds) * 1000
          : simTime * 1000;
        const page = await fetchKlines(this.symbol, this.interval, {
          startTime: startTimeMs,
          limit: KLINES_PAGE_LIMIT,
        });
        if (!page.length) break;
        this._merge(page);
        if (page.length < KLINES_PAGE_LIMIT) break; // caught up to live data
      }
    } finally {
      this._fetchingAhead = false;
      this._persist();
    }
  }

  _merge(page) {
    const byTime = new Map(this.candles.map((c) => [c.time, c]));
    for (const c of page) byTime.set(c.time, c);
    this.candles = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
  }

  _persist() {
    this.candles = saveCandles(this.symbol, this.interval, this.candles);
  }
}
