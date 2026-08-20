import { createChart } from '../chartFactory.js';

export function createChartAdapter(container, options) {
  const chart = createChart(container, options);
  if (!chart) return null;

  return {
    setCandles(candles) {
      chart.setData(candles);
    },
    setVolume(candles) {
      chart.setVolume(candles);
    },
    setIndicators(settings) {
      chart.setIndicatorSettings(settings);
    },
    setDrawings(drawings) {
      chart.setDrawings(drawings);
    },
    setDrawingMode(mode) {
      chart.setMode(mode);
    },
    setSelectedDrawing(id) {
      chart.setSelectedDrawingId(id);
    },
    setVisibleRange(range) {
      chart.setVisibleRange(range);
    },
    getVisibleRange() {
      return chart.getVisibleRange();
    },
    reset(pair, timeframe) {
      chart.resetChart(pair, timeframe);
    },
    clearDrawings() {
      chart.clearDrawings();
    },
    setPositionSettings(settings) {
      chart.setPositionSettings(settings);
    },
    destroy() {
      chart.destroy();
    },
  };
}