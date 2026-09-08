import { AHEAD_BUFFER_BARS, INTERVAL_SECONDS, MAX_ACTIVE_BARS } from './config.js';
import { dataRepository } from './dataRepository.js';

function uniqueSorted(candles) {
  const byTime = new Map();
  for (const candle of candles || []) byTime.set(candle.time, candle);
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

/**
 * Holds only the active warmup, visible, and ahead window for one series.
 * The complete history remains in the local package and is queried through
 * DataRepository on demand.
 */
export class TimeframeSeries {
  constructor(symbol, interval, repository = dataRepository) {
    this.symbol = symbol;
    this.interval = interval;
    this.intervalSeconds = INTERVAL_SECONDS[interval];
    this.repository = repository;
    this.candles = [];
    this._fetchingWarmup = false;
    this._fetchingAhead = false;
    this.requestController = new AbortController();
    this.requestGeneration = 0;
  }

  countAtOrBefore(time) {
    let count = 0;
    for (const candle of this.candles) {
      if (candle.time <= time) count += 1;
      else break;
    }
    return count;
  }

  countAfter(time) {
    let count = 0;
    for (let index = this.candles.length - 1; index >= 0; index -= 1) {
      if (this.candles[index].time > time) count += 1;
      else break;
    }
    return count;
  }

  visibleUpTo(simTime) {
    return this.candles.filter((candle) => candle.time <= simTime);
  }

  async ensureWarmup(atTime, warmupBars) {
    if (this._fetchingWarmup || !this.intervalSeconds) return;
    if (this.countAtOrBefore(atTime) >= warmupBars) return;
    const generation = this.requestGeneration;
    this._fetchingWarmup = true;
    try {
      const coverage = await this.repository.getCoverage(this.symbol, this.interval);
      const requestedStart = atTime - (warmupBars + 1) * this.intervalSeconds;
      const requestedEnd = atTime + AHEAD_BUFFER_BARS * this.intervalSeconds;
      if (!coverage && this.repository.mode !== 'online') throw this.repositoryError('DATA_NOT_COVERED');
      const startTime = coverage ? Math.max(coverage.firstTime, requestedStart) : requestedStart;
      const endTime = coverage ? Math.min(coverage.lastTime, requestedEnd) : requestedEnd;
      const loaded = await this.repository.getRange(this.symbol, this.interval, startTime, endTime, this.requestController.signal);
      if (generation === this.requestGeneration) this.candles = uniqueSorted(loaded);
    } finally {
      if (generation === this.requestGeneration) this._fetchingWarmup = false;
    }
  }

  async ensureAhead(simTime, minAhead) {
    if (this._fetchingAhead || !this.intervalSeconds) return;
    if (this.countAfter(simTime) >= minAhead) return;
    const generation = this.requestGeneration;
    this._fetchingAhead = true;
    try {
      const coverage = await this.repository.getCoverage(this.symbol, this.interval);
      const currentEnd = this.candles.at(-1)?.time ?? simTime;
      const requestedStart = currentEnd + this.intervalSeconds;
      const requestedEnd = Math.max(requestedStart, simTime + (minAhead + 1) * this.intervalSeconds);
      if (!coverage && this.repository.mode !== 'online') throw this.repositoryError('DATA_NOT_COVERED');
      const startTime = coverage ? Math.max(coverage.firstTime, requestedStart) : requestedStart;
      const endTime = coverage ? Math.min(coverage.lastTime, requestedEnd) : requestedEnd;
      if (startTime <= endTime) {
        const loaded = await this.repository.getRange(this.symbol, this.interval, startTime, endTime, this.requestController.signal);
        if (generation === this.requestGeneration) this.candles = this.trimWindow(uniqueSorted([...this.candles, ...loaded]), simTime);
      }
    } finally {
      if (generation === this.requestGeneration) this._fetchingAhead = false;
    }
  }

  trimWindow(candles, anchorTime) {
    if (candles.length <= MAX_ACTIVE_BARS) return candles;
    const firstAllowed = Math.max(0, candles.length - MAX_ACTIVE_BARS);
    const anchorIndex = candles.findIndex((candle) => candle.time >= anchorTime);
    const start = anchorIndex >= 0 ? Math.min(firstAllowed, anchorIndex) : firstAllowed;
    return candles.slice(start);
  }

  repositoryError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  resetWindow() {
    this.candles = [];
    this.resetRequests();
  }

  dispose() {
    this.requestGeneration += 1;
    this.requestController.abort();
    this.candles = [];
  }

  resetRequests() {
    this.requestGeneration += 1;
    this.requestController.abort();
    this.requestController = new AbortController();
    this._fetchingWarmup = false;
    this._fetchingAhead = false;
  }
}

export { BacktestEngine } from './engine.js';
import { BacktestEngine } from './engine.js';

export const dataManager = new BacktestEngine();
