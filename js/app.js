import {
  INTERVAL_SECONDS, TOP_TIMEFRAME_OPTIONS, WARMUP_BARS, MIN_BARS_AHEAD, SPEED_MS,
} from './config.js';
import { TimeframeSeries } from './dataManager.js';
import { createChartPanel } from './chartFactory.js';
import { DrawingManager } from './positions.js';
import { initSidebar } from './sidebar.js';
import { createDateTimeControl } from './datetimePicker.js';

function alignToInterval(seconds, intervalSeconds) {
  return Math.floor(seconds / intervalSeconds) * intervalSeconds;
}

const el = (id) => document.getElementById(id);

const dom = {
  dtContainer: el('dtControl'),
  btnLong: el('btnLong'),
  btnShort: el('btnShort'),
  btnHLine: el('btnHLine'),
  btnClear: el('btnClear'),
  timeframeSelect: el('timeframeSelect'),
  symbolName: el('symbolName'),
  speedSlider: el('speedSlider'),
  btnPlay: el('btnPlay'),
  btnSidebar: el('btnSidebar'),
  appBody: el('appBody'),
  chartTop: el('chartTop'),
  chart1h: el('chart1h'),
  chart1d: el('chart1d'),
  sidebarList: el('pairList'),
  sidebarSearch: el('pairSearch'),
  status: el('statusBar'),
};

const state = {
  symbol: 'BTCUSDT',
  topInterval: '5m',
  simTime: 0,
  playing: false,
  speedIndex: 4,
  seriesMap: new Map(), // interval -> TimeframeSeries
  timer: null,
  loadToken: 0,
};

function showStatus(msg) {
  dom.status.textContent = msg;
  dom.status.classList.remove('hidden');
}
function hideStatus() {
  dom.status.classList.add('hidden');
}

// ---- Chart panels ----
const panelTop = createChartPanel(dom.chartTop, { withSessions: true, dailyMode: false });
const panel1h = createChartPanel(dom.chart1h, { withSessions: true, dailyMode: false });
const panel1d = createChartPanel(dom.chart1d, { withSessions: false, dailyMode: true });
const drawing = new DrawingManager(panelTop, dom.chartTop);

function updateTitles() {
  panelTop.setTitle(`${state.symbol} · ${state.topInterval}`);
  panel1h.setTitle(`${state.symbol} · 1h`);
  panel1d.setTitle(`${state.symbol} · 1D`);
}

function renderAll() {
  const topSeries = state.seriesMap.get(state.topInterval);
  const h1Series = state.seriesMap.get('1h');
  const d1Series = state.seriesMap.get('1d');
  if (topSeries) panelTop.setCandles(topSeries.visibleUpTo(state.simTime));
  if (h1Series) panel1h.setCandles(h1Series.visibleUpTo(state.simTime));
  if (d1Series) panel1d.setCandles(d1Series.visibleUpTo(state.simTime));
  drawing.notifyChartUpdated();
}

async function ensureIntervalLoaded(interval) {
  if (!state.seriesMap.has(interval)) {
    state.seriesMap.set(interval, new TimeframeSeries(state.symbol, interval));
  }
  const series = state.seriesMap.get(interval);
  await series.ensureWarmup(state.simTime, WARMUP_BARS);
  await series.ensureAhead(state.simTime, MIN_BARS_AHEAD);
}

/** Full (re)load for the current symbol/time anchor: builds fresh series for
 * the top interval + the two fixed context intervals, in parallel. */
async function loadSymbolData() {
  const myToken = ++state.loadToken;
  showStatus(`Загрузка ${state.symbol}...`);
  state.seriesMap = new Map();
  const intervals = new Set([state.topInterval, '1h', '1d']);
  try {
    await Promise.all(Array.from(intervals).map((iv) => ensureIntervalLoaded(iv)));
  } catch (err) {
    console.error(err);
    if (myToken === state.loadToken) {
      showStatus('Ошибка загрузки данных с Binance API. Проверьте подключение / регион.');
      return;
    }
  }
  if (myToken !== state.loadToken) return; // a newer load superseded this one
  hideStatus();
  updateTitles();
  renderAll();
}

// ---- Playback ----
function setPlayIcon() {
  dom.btnPlay.textContent = state.playing ? '⏸' : '▶';
}

function pausePlayback() {
  state.playing = false;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  setPlayIcon();
}

function startPlayback() {
  if (state.playing) return;
  state.playing = true;
  setPlayIcon();
  scheduleTick();
}

function scheduleTick() {
  if (state.timer) return;
  state.timer = setTimeout(tick, SPEED_MS[state.speedIndex]);
}

async function tick() {
  state.timer = null;
  if (!state.playing) return;

  const stepSeconds = INTERVAL_SECONDS[state.topInterval];
  const nextSimTime = state.simTime + stepSeconds;

  await Promise.all(Array.from(state.seriesMap.values()).map((s) => s.ensureAhead(nextSimTime, MIN_BARS_AHEAD)));

  const topSeries = state.seriesMap.get(state.topInterval);
  const reachedEnd = !topSeries.candles.length
    || topSeries.candles[topSeries.candles.length - 1].time < nextSimTime;

  if (reachedEnd) {
    pausePlayback();
    showStatus('Достигнут конец доступных исторических данных для этого таймфрейма.');
    return;
  }

  state.simTime = nextSimTime;
  dateTimeControl.setUnixSeconds(state.simTime);
  renderAll();

  if (state.playing) scheduleTick();
}

// ---- Header wiring ----
for (const iv of TOP_TIMEFRAME_OPTIONS) {
  const opt = document.createElement('option');
  opt.value = iv;
  opt.textContent = iv;
  if (iv === state.topInterval) opt.selected = true;
  dom.timeframeSelect.appendChild(opt);
}

dom.timeframeSelect.addEventListener('change', async () => {
  pausePlayback();
  state.topInterval = dom.timeframeSelect.value;
  state.simTime = alignToInterval(state.simTime, INTERVAL_SECONDS[state.topInterval]);
  drawing.clearAll();
  showStatus(`Загрузка ${state.topInterval}...`);
  await ensureIntervalLoaded(state.topInterval);
  hideStatus();
  updateTitles();
  renderAll();
});

dom.btnLong.addEventListener('click', () => placePosition('long'));
dom.btnShort.addEventListener('click', () => placePosition('short'));
function placePosition(side) {
  const topSeries = state.seriesMap.get(state.topInterval);
  if (!topSeries) return;
  const candles = topSeries.visibleUpTo(state.simTime);
  if (!candles.length) return;
  const last = candles[candles.length - 1];
  drawing.addPosition(side, last.close, last.time);
}

dom.btnHLine.addEventListener('click', () => drawing.armLevelTool());
dom.btnClear.addEventListener('click', () => drawing.clearAll());

dom.speedSlider.addEventListener('input', () => {
  state.speedIndex = Number(dom.speedSlider.value) - 1;
});

dom.btnPlay.addEventListener('click', () => {
  if (state.playing) pausePlayback();
  else startPlayback();
});

dom.btnSidebar.addEventListener('click', () => {
  dom.appBody.classList.toggle('sidebar-collapsed');
});

// ---- Date/time control ----
const nowSec = Math.floor(Date.now() / 1000);
const defaultStart = alignToInterval(nowSec - 30 * 86400, INTERVAL_SECONDS[state.topInterval]);
state.simTime = defaultStart;

const dateTimeControl = createDateTimeControl(dom.dtContainer, {
  initial: defaultStart,
  onApply: async (seconds) => {
    pausePlayback();
    state.simTime = alignToInterval(seconds, INTERVAL_SECONDS[state.topInterval]);
    dateTimeControl.setUnixSeconds(state.simTime);
    drawing.clearAll();
    await loadSymbolData();
  },
});

// ---- Sidebar ----
async function handleSymbolSelect(symbol) {
  if (symbol === state.symbol) return;
  pausePlayback();
  state.symbol = symbol;
  dom.symbolName.textContent = symbol;
  drawing.clearAll();
  sidebarApi.setActiveSymbol(symbol);
  await loadSymbolData();
}

dom.symbolName.textContent = state.symbol;
const [sidebarApi] = await Promise.all([
  initSidebar({
    listEl: dom.sidebarList,
    searchEl: dom.sidebarSearch,
    onSelect: handleSymbolSelect,
  }),
  loadSymbolData(),
]);
sidebarApi.setActiveSymbol(state.symbol);
