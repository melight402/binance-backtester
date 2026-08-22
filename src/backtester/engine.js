import {
  CONTEXT_BARS,
  FIXED_INTERVALS,
  MIN_BARS_AHEAD,
  SPEED_MS,
  WARMUP_BARS,
} from './config.js';
import { TimeframeSeries } from './dataManager.js';
import { aggregateCandles, mergeContextCandles } from './aggregation.js';
import { loadDrawings, saveDrawings } from './drawingStorage.js';
import { INTERVAL_SECONDS } from './config.js';
import { DrawingAdapter } from '../chart/drawingAdapter.js';

const DEFAULT_START_OFFSET_SECONDS = 30 * 24 * 60 * 60;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function floorToInterval(time, intervalSeconds) {
  return Math.floor(time / intervalSeconds) * intervalSeconds;
}

function normalizeInterval(interval, fallback = '1h') {
  return INTERVAL_SECONDS[interval] ? interval : fallback;
}

export class BacktestEngine {
  constructor() {
    this.symbol = 'BTCUSDT';
    this.interval = '1h';
    this.speed = 1;
    this.simTime = floorToInterval(nowSeconds() - DEFAULT_START_OFFSET_SECONDS, 3600);
    this.isPlaying = false;
    this.series = {};
    this.listeners = new Set();
    this.timerId = null;
    this.loadToken = 0;
    this.initialized = false;
    this.mode = null;
    this.drawings = [];
    this.drawingAdapter = new DrawingAdapter();
    this.unsubscribeDrawings = null;
    this.bindDrawingSubscription();
    this.dataStatus = 'idle';
    this.dataError = null;
    this.contextChartsEnabled = true;
  }

  init({ symbol = this.symbol, interval = this.interval, startTime = null } = {}) {
    return this.initialize({ symbol, interval, startTime });
  }

  bindDrawingSubscription() {
    if (this.unsubscribeDrawings) return;
    this.unsubscribeDrawings = this.drawingAdapter.subscribe((nextDrawings) => {
      this.drawings = nextDrawings;
      saveDrawings(this.symbol, this.drawings);
      if (this.initialized) this.emit();
    });
  }

  async initialize({ symbol = this.symbol, interval = this.interval, startTime = null } = {}) {
    this.bindDrawingSubscription();
    this.pauseSimulation(false);
    const token = ++this.loadToken;
    this.initialized = false;
    this.dataStatus = 'loading';
    this.dataError = null;
    this.mode = null;
    const nextInterval = normalizeInterval(interval, this.interval);
    this.symbol = symbol;
    this.interval = nextInterval;
    this.simTime = this.normalizeStartTime(startTime);
    this.series = this.createSeries(symbol, nextInterval);
    this.drawings = this.drawingAdapter.import(loadDrawings(symbol));
    this.initialized = true;
    this.emit();
    await this.loadVisibleData(token);
    return this.emit();
  }

  createSeries(symbol, interval) {
    Object.values(this.series).forEach((series) => series.dispose?.());
    return {
      main: new TimeframeSeries(symbol, interval),
      hourly: new TimeframeSeries(symbol, FIXED_INTERVALS.hour),
      daily: new TimeframeSeries(symbol, FIXED_INTERVALS.day),
    };
  }

  normalizeStartTime(startTime) {
    const candidate = startTime == null ? this.simTime : Number(startTime);
    const currentTime = nowSeconds();
    const safeTime = Number.isFinite(candidate) ? Math.min(candidate, currentTime) : currentTime;
    const intervalSeconds = this.series.main?.intervalSeconds || 3600;
    return floorToInterval(safeTime, intervalSeconds);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.initialized) listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    const visibleMain = this.series.main?.visibleUpTo(this.simTime) || [];
    return {
      symbol: this.symbol,
      interval: this.interval,
      simTime: this.simTime,
      isPlaying: this.isPlaying,
      speed: this.speed,
      mode: this.mode,
      drawings: this.drawings,
      dataStatus: this.dataStatus,
      dataError: this.dataError,
      main: visibleMain,
      hourly: mergeContextCandles(
        this.series.hourly?.candles,
        aggregateCandles(visibleMain, FIXED_INTERVALS.hour),
        FIXED_INTERVALS.hour,
        this.simTime,
      ),
      daily: mergeContextCandles(
        this.series.daily?.candles,
        aggregateCandles(visibleMain, FIXED_INTERVALS.day),
        FIXED_INTERVALS.day,
        this.simTime,
      ),
    };
  }

  emit() {
    const state = this.snapshot();
    this.listeners.forEach((listener) => listener(state));
    return state;
  }

  async loadVisibleData(token = this.loadToken) {
    if (!this.series.main || token !== this.loadToken) return;

    try {
      await Promise.all([
        this.series.main.ensureWarmup(this.simTime, WARMUP_BARS),
        ...this.contextWarmupTasks(),
      ]);

      if (token !== this.loadToken) return;

      await this.series.main.ensureAhead(this.simTime, MIN_BARS_AHEAD);
      if (token === this.loadToken) {
        this.dataStatus = 'ready';
        this.dataError = null;
      }
    } catch (error) {
      if (error.name === 'AbortError' || token !== this.loadToken) return;
      this.dataStatus = 'error';
      this.dataError = {
        message: error.message || 'Не удалось загрузить свечи',
        status: error.status || null,
        code: error.code || null,
      };
      this.pauseSimulation();
      this.emit();
    }
  }

  contextWarmupTasks() {
    if (!this.contextChartsEnabled) return [];
    return [
      this.series.hourly?.ensureWarmup(this.simTime, CONTEXT_BARS),
      this.series.daily?.ensureWarmup(this.simTime, CONTEXT_BARS),
    ].filter(Boolean);
  }

  setContextChartsEnabled(enabled) {
    const next = enabled === true;
    if (this.contextChartsEnabled === next) return;
    this.contextChartsEnabled = next;
    if (!next) {
      this.series.hourly?.resetRequests?.();
      this.series.daily?.resetRequests?.();
      return;
    }
    if (!this.initialized) return;
    const token = this.loadToken;
    Promise.all(this.contextWarmupTasks())
      .then(() => {
        if (token === this.loadToken) this.emit();
      })
      .catch((error) => {
        if (error.name === 'AbortError' || token !== this.loadToken) return;
      });
  }

  onDataUpdate(listener) {
    return this.subscribe(listener);
  }

  async changeSymbol(symbol) {
    return this.initialize({ symbol, interval: this.interval, startTime: this.simTime });
  }

  async changeTimeframe(interval) {
    return this.initialize({ symbol: this.symbol, interval, startTime: this.simTime });
  }

  setSpeed(speed) {
    const value = Math.max(1, Math.min(SPEED_MS.length, Number(speed) || 1));
    this.speed = value;
    this.emit();
  }

  setStartTime(timestampMs) {
    const timestampSeconds = Number(timestampMs) / 1000;
    if (!Number.isFinite(timestampSeconds)) return;
    const token = ++this.loadToken;
    this.series.main?.resetRequests?.();
    this.simTime = this.normalizeStartTime(timestampSeconds);
    this.dataStatus = 'loading';
    this.dataError = null;
    this.pauseSimulation();
    this.emit();
    this.loadVisibleData(token).then(() => {
      if (token === this.loadToken) this.emit();
    });
  }

  seek(timestampSeconds) {
    const seconds = Number(timestampSeconds);
    if (!Number.isFinite(seconds)) return;
    this.setStartTime(seconds * 1000);
  }

  setMode(mode) {
    this.mode = mode;
    this.emit();
  }

  startSimulation() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.emit();
    this.scheduleTick();
  }

  play() {
    this.startSimulation();
  }

  pauseSimulation(emitState = true) {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (emitState) this.emit();
  }

  pause() {
    this.pauseSimulation();
  }

  scheduleTick() {
    if (!this.isPlaying) return;
    if (this.timerId !== null) clearTimeout(this.timerId);
    const delay = SPEED_MS[this.speed - 1] || SPEED_MS[0];
    this.timerId = setTimeout(() => this.tick(), delay);
  }

  async tick() {
    if (!this.isPlaying) return;
    const token = this.loadToken;
    const series = this.series.main;
    if (!series?.intervalSeconds) {
      this.pauseSimulation();
      return;
    }
    this.simTime += this.series.main.intervalSeconds;
    try {
      await series.ensureAhead(this.simTime, MIN_BARS_AHEAD);
    } catch (error) {
      if (error.name === 'AbortError' || token !== this.loadToken) return;
      this.dataStatus = 'error';
      this.dataError = {
        message: error.message || 'Не удалось дозагрузить свечи',
        status: error.status || null,
        code: error.code || null,
      };
      this.pauseSimulation();
      return;
    }
    if (!this.isPlaying || token !== this.loadToken || series !== this.series.main) return;
    this.timerId = null;
    this.emit();
    this.scheduleTick();
  }

  clearAllPositionsAndLevels() {
    this.mode = null;
    this.drawingAdapter.removeAll();
    return true;
  }

  clearDrawingsByType(type) {
    if (!['position', 'level'].includes(type)) return false;
    this.mode = null;
    const removed = this.drawingAdapter.removeByType(type);
    if (!removed) this.emit();
    return removed;
  }

  addDrawing(drawing) {
    if (!drawing || !drawing.type) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const added = this.drawingAdapter.add({ ...drawing, id });
    if (!added) return;
    return id;
  }

  updateDrawing(drawingId, options) {
    if (!drawingId) return false;
    return this.drawingAdapter.updateOptions(drawingId, options);
  }

  removeDrawing(drawingId) {
    if (!drawingId) return false;
    if (!this.drawingAdapter.remove(drawingId)) return false;
    return true;
  }

  dispose() {
    this.pauseSimulation();
    this.loadToken += 1;
    Object.values(this.series).forEach((series) => series.dispose?.());
    this.unsubscribeDrawings?.();
    this.unsubscribeDrawings = null;
    this.drawingAdapter.dispose();
    this.listeners.clear();
    this.series = {};
    this.initialized = false;
  }
}
