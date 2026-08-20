import { BINANCE_FAPI_BASE, KLINES_PAGE_LIMIT } from './config.js';
import { normalizeCandles } from './candleModel.js';

let exchangeInfoCache = null;
let exchangeInfoLoadedAt = 0;
const EXCHANGE_INFO_TTL_MS = 5 * 60 * 1000;
const BINANCE_REQUEST_TIMEOUT_MS = 15000;

async function requestJson(url, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BINANCE_REQUEST_TIMEOUT_MS);
  const abortRequest = () => controller.abort();
  signal?.addEventListener('abort', abortRequest, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Binance HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    try {
      return await response.json();
    } catch (error) {
      const parseError = new Error('Binance returned invalid JSON');
      parseError.code = 'BINANCE_INVALID_JSON';
      parseError.cause = error;
      throw parseError;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      if (signal?.aborted) throw error;
      const timeoutError = new Error(`Binance request timed out after ${BINANCE_REQUEST_TIMEOUT_MS}ms`);
      timeoutError.code = 'BINANCE_TIMEOUT';
      throw timeoutError;
    }
    if (error instanceof TypeError) {
      const networkError = new Error('Binance API is unavailable');
      networkError.code = 'BINANCE_UNAVAILABLE';
      networkError.cause = error;
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortRequest);
  }
}

export async function fetchFuturesExchangeInfo({ signal } = {}) {
  if (exchangeInfoCache && Date.now() - exchangeInfoLoadedAt < EXCHANGE_INFO_TTL_MS) {
    return exchangeInfoCache;
  }
  const data = await requestJson(`${BINANCE_FAPI_BASE}/fapi/v1/exchangeInfo`, signal);
  if (!Array.isArray(data.symbols)) throw new Error('Invalid exchangeInfo response');
  exchangeInfoCache = data;
  exchangeInfoLoadedAt = Date.now();
  return data;
}

/**
 * List every tradable USDT-margined perpetual future on Binance.
 * Returns [{ symbol, baseAsset, quoteAsset }]
 */
export async function fetchFuturesSymbols({ signal } = {}) {
  const data = await fetchFuturesExchangeInfo({ signal });
  return data.symbols
    .filter((s) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
    .map((s) => ({ symbol: s.symbol, baseAsset: s.baseAsset, quoteAsset: s.quoteAsset }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export const binanceApi = {
  async getTradingPairs(options) {
    const symbols = await fetchFuturesSymbols(options);
    return symbols.map(({ symbol }) => symbol);
  },
};

/**
 * Fetch one page of klines and normalise it into
 * { time (unix seconds), open, high, low, close, volume }.
 * Pass either { endTime } to page backwards or { startTime } to page forwards.
 */
export async function fetchKlines(symbol, interval, { startTime, endTime, limit = KLINES_PAGE_LIMIT, signal } = {}) {
  const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (startTime != null) params.set('startTime', String(Math.round(startTime)));
  if (endTime != null) params.set('endTime', String(Math.round(endTime)));

  const rows = await requestJson(`${BINANCE_FAPI_BASE}/fapi/v1/klines?${params.toString()}`, signal);
  if (!Array.isArray(rows)) {
    const error = new Error(`Invalid klines response for ${symbol} ${interval}`);
    error.code = 'BINANCE_INVALID_KLINES';
    throw error;
  }
  return normalizeCandles(rows.map((r) => ({
    time: Math.round(r[0] / 1000),
    open: parseFloat(r[1]),
    high: parseFloat(r[2]),
    low: parseFloat(r[3]),
    close: parseFloat(r[4]),
    volume: parseFloat(r[5]),
  })));
}
