// Central configuration for the whole app.
// Change values here rather than hunting through the codebase.

export const BINANCE_FAPI_BASE = 'https://fapi.binance.com';

// Seconds-per-bar for every interval the app understands.
// (Binance also has 2h/6h/8h/12h/3d/1w but we only expose the ones
// most useful for discretionary backtesting in the timeframe dropdown.)
export const INTERVAL_SECONDS = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '6h': 21600,
  '8h': 28800,
  '12h': 43200,
  '1d': 86400,
  '3d': 259200,
  '1w': 604800,
};

// Intervals offered in the header timeframe dropdown (drives the top chart).
export const TOP_TIMEFRAME_OPTIONS = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];

// The two fixed context charts at the bottom.
export const FIXED_INTERVALS = { hour: '1h', day: '1d' };

// Trading sessions shown as background shading, in UTC hours [start, end).
export const SESSIONS = {
  asia: { label: 'Asia', startHour: 0, endHour: 9, color: 'rgba(64, 152, 255, 0.10)' },
  newyork: { label: 'New York', startHour: 13, endHour: 22, color: 'rgba(168, 107, 255, 0.11)' },
};

// Hull Moving Average periods drawn on every chart.
export const HMA_PERIODS = [50, 200];
export const HMA_COLORS = { 50: '#4098ff', 200: '#3ecf8e' };

// How many bars of history to preload before the playback start point,
// so long indicators (HMA 200) already have valid values on bar one.
export const WARMUP_BARS = 260;

// Re-fetch the next page from Binance once fewer than this many
// un-revealed candles remain ahead of the playhead.
export const MIN_BARS_AHEAD = 100;

// Max candles kept per (symbol, interval) series before trimming the tail end.
export const MAX_KEPT_BARS = 12000;

// Klines page size requested per API call (Binance USDT-M futures max is 1500).
export const KLINES_PAGE_LIMIT = 1000;

// Playback speed slider -> ms between ticks (index 1..10).
export const SPEED_MS = [1600, 1100, 800, 550, 380, 260, 170, 110, 65, 30];

export const LS_PREFIX = 'bfbt:'; // "Binance Futures Back-Tester"
