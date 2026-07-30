import { HMA_PERIODS, HMA_COLORS } from './config.js';
import { buildHmaLineData } from './indicators.js';
import { buildSessionSeriesData } from './sessions.js';

const { createChart, CandlestickSeries, LineSeries, HistogramSeries } = window.LightweightCharts;

const CHART_BASE_OPTIONS = {
  autoSize: true,
  layout: {
    background: { type: 'solid', color: '#0a0d12' },
    textColor: '#7d8a9c',
    fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
    fontSize: 11,
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: 'rgba(255,255,255,0.045)' },
    horzLines: { color: 'rgba(255,255,255,0.045)' },
  },
  crosshair: {
    mode: 0, // Normal
    vertLine: { color: 'rgba(160,180,210,0.35)', width: 1, style: 2, labelBackgroundColor: '#1b212c' },
    horzLine: { color: 'rgba(160,180,210,0.35)', width: 1, style: 2, labelBackgroundColor: '#1b212c' },
  },
  rightPriceScale: {
    borderColor: '#20262f',
    scaleMargins: { top: 0.08, bottom: 0.08 },
  },
  timeScale: {
    borderColor: '#20262f',
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 4,
  },
};

/**
 * @param {HTMLElement} container
 * @param {{ withSessions?: boolean, dailyMode?: boolean }} opts
 */
export function createChartPanel(container, opts = {}) {
  const { withSessions = false, dailyMode = false } = opts;

  const chart = createChart(container, {
    ...CHART_BASE_OPTIONS,
    timeScale: { ...CHART_BASE_OPTIONS.timeScale, secondsVisible: false, timeVisible: !dailyMode },
  });

  let sessionSeries = null;
  if (withSessions) {
    chart.priceScale('sessions').applyOptions({
      scaleMargins: { top: 0, bottom: 0 },
      visible: false,
    });
    sessionSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'sessions',
      base: 0,
      color: 'rgba(255,255,255,0.06)',
      priceLineVisible: false,
      lastValueVisible: false,
    });
  }

  const candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#22c3a6',
    downColor: '#ef4460',
    borderVisible: false,
    wickUpColor: '#22c3a6',
    wickDownColor: '#ef4460',
    priceLineVisible: true,
    priceLineWidth: 1,
    priceLineColor: 'rgba(255,255,255,0.25)',
  });

  const hmaSeriesByPeriod = {};
  for (const period of HMA_PERIODS) {
    hmaSeriesByPeriod[period] = chart.addSeries(LineSeries, {
      color: HMA_COLORS[period],
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      title: `HMA${period}`,
    });
  }

  // --- Title label (top-left) ---
  const labelEl = document.createElement('div');
  labelEl.className = 'chart-label';
  container.appendChild(labelEl);

  // --- Hover OHLC readout (top-left, below the title) ---
  const ohlcEl = document.createElement('div');
  ohlcEl.className = 'ohlc-box';
  ohlcEl.innerHTML = `
    <div><span class="k">O</span><span class="v ohlc-open">-</span></div>
    <div><span class="k k-high">H</span><span class="v v-high ohlc-high">-</span></div>
    <div><span class="k k-low">L</span><span class="v v-low ohlc-low">-</span></div>
    <div><span class="k k-close">C</span><span class="v v-close ohlc-close">-</span></div>
  `;
  container.appendChild(ohlcEl);
  const ohlcOpen = ohlcEl.querySelector('.ohlc-open');
  const ohlcHigh = ohlcEl.querySelector('.ohlc-high');
  const ohlcLow = ohlcEl.querySelector('.ohlc-low');
  const ohlcClose = ohlcEl.querySelector('.ohlc-close');

  let lastCandle = null;
  function paintOhlc(bar) {
    if (!bar) return;
    ohlcOpen.textContent = fmtPrice(bar.open);
    ohlcHigh.textContent = fmtPrice(bar.high);
    ohlcLow.textContent = fmtPrice(bar.low);
    ohlcClose.textContent = fmtPrice(bar.close);
  }
  function fmtPrice(p) {
    if (p == null) return '-';
    return p >= 100 ? p.toFixed(2) : p.toFixed(4);
  }

  chart.subscribeCrosshairMove((param) => {
    let bar = null;
    if (param.time) {
      const data = param.seriesData && param.seriesData.get(candleSeries);
      if (data) bar = data;
    }
    paintOhlc(bar || lastCandle);
  });

  const panel = {
    chart,
    candleSeries,
    hmaSeriesByPeriod,
    sessionSeries,

    setTitle(text) {
      labelEl.textContent = text;
    },

    /** Push a fresh full candle array to this panel (candles + HMA lines). */
    setCandles(candles) {
      candleSeries.setData(candles);
      for (const period of HMA_PERIODS) {
        hmaSeriesByPeriod[period].setData(buildHmaLineData(candles, period));
      }
      if (withSessions) {
        sessionSeries.setData(buildSessionSeriesData(candles));
      }
      lastCandle = candles.length ? candles[candles.length - 1] : null;
      paintOhlc(lastCandle);
    },

    destroy() {
      chart.remove();
    },
  };

  return panel;
}
