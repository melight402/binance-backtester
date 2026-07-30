const { LineStyle } = window.LightweightCharts;

const DEFAULT_RISK_PCT = 0.01; // 1% stop distance
const DEFAULT_RR = 2; // reward:risk

/**
 * Manages horizontal price levels and long/short position sketches drawn on
 * top of a single chart panel. Price lines come from the lightweight-charts
 * series API; the risk/reward shading is done with absolutely-positioned
 * DOM boxes kept in sync with the chart's coordinate space, since that kind
 * of free-floating rectangle isn't something a price-line/series can draw.
 */
export class DrawingManager {
  constructor(panel, container) {
    this.panel = panel;
    this.container = container;
    this.levels = []; // IPriceLine[]
    this.positions = []; // { lines, els }
    this.levelPlacementActive = false;

    this.overlay = document.createElement('div');
    this.overlay.className = 'chart-overlay';
    container.appendChild(this.overlay);

    this._onClick = this._onClick.bind(this);
    this._reposition = this._reposition.bind(this);
    panel.chart.subscribeClick(this._onClick);
    panel.chart.timeScale().subscribeVisibleLogicalRangeChange(this._reposition);

    this._resizeObserver = new ResizeObserver(this._reposition);
    this._resizeObserver.observe(container);
  }

  armLevelTool() {
    this.levelPlacementActive = true;
    this.container.style.cursor = 'crosshair';
  }

  _onClick(param) {
    if (!this.levelPlacementActive || !param.point) return;
    const price = this.panel.candleSeries.coordinateToPrice(param.point.y);
    this.levelPlacementActive = false;
    this.container.style.cursor = '';
    if (price == null) return;
    this._addLevel(price);
  }

  _addLevel(price) {
    const line = this.panel.candleSeries.createPriceLine({
      price,
      color: '#e8b339',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Level',
    });
    this.levels.push(line);
  }

  addPosition(side, entryPrice, entryTime) {
    const isLong = side === 'long';
    const stopPrice = isLong ? entryPrice * (1 - DEFAULT_RISK_PCT) : entryPrice * (1 + DEFAULT_RISK_PCT);
    const targetPrice = isLong
      ? entryPrice * (1 + DEFAULT_RISK_PCT * DEFAULT_RR)
      : entryPrice * (1 - DEFAULT_RISK_PCT * DEFAULT_RR);

    const fmt = (p) => (p >= 100 ? p.toFixed(2) : p.toFixed(4));
    const entryLine = this.panel.candleSeries.createPriceLine({
      price: entryPrice, color: '#dfe6ee', lineWidth: 1, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: `Entry ${fmt(entryPrice)}`,
    });
    const stopLine = this.panel.candleSeries.createPriceLine({
      price: stopPrice, color: '#ef4460', lineWidth: 1, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: `Stop ${fmt(stopPrice)}`,
    });
    const targetLine = this.panel.candleSeries.createPriceLine({
      price: targetPrice, color: '#22c3a6', lineWidth: 1, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: `Target ${fmt(targetPrice)}`,
    });

    const riskBox = document.createElement('div');
    riskBox.className = 'pos-box pos-box-risk';
    const rewardBox = document.createElement('div');
    rewardBox.className = 'pos-box pos-box-reward';
    const label = document.createElement('div');
    label.className = `pos-label pos-label-${side}`;
    label.innerHTML = `<b>${isLong ? 'LONG' : 'SHORT'}</b> Entry: ${fmt(entryPrice)}<br>Stop: ${fmt(stopPrice)} &nbsp;·&nbsp; Target: ${fmt(targetPrice)}`;
    this.overlay.append(riskBox, rewardBox, label);

    const pos = {
      side, entryPrice, stopPrice, targetPrice, entryTime,
      lines: [entryLine, stopLine, targetLine],
      els: { riskBox, rewardBox, label },
    };
    this.positions.push(pos);
    this._reposition();
    return pos;
  }

  clearAll() {
    for (const line of this.levels) this.panel.candleSeries.removePriceLine(line);
    this.levels = [];
    for (const pos of this.positions) {
      for (const line of pos.lines) this.panel.candleSeries.removePriceLine(line);
      pos.els.riskBox.remove();
      pos.els.rewardBox.remove();
      pos.els.label.remove();
    }
    this.positions = [];
  }

  /** Call after setCandles()/resize so boxes track the chart's current view. */
  notifyChartUpdated() {
    this._reposition();
  }

  _reposition() {
    if (!this.positions.length) return;
    const ts = this.panel.chart.timeScale();
    const pane = this.panel.chart.paneSize();
    for (const pos of this.positions) {
      const x1 = ts.timeToCoordinate(pos.entryTime);
      const yEntry = this.panel.candleSeries.priceToCoordinate(pos.entryPrice);
      const yStop = this.panel.candleSeries.priceToCoordinate(pos.stopPrice);
      const yTarget = this.panel.candleSeries.priceToCoordinate(pos.targetPrice);
      if (x1 == null || yEntry == null || yStop == null || yTarget == null) {
        pos.els.riskBox.style.display = 'none';
        pos.els.rewardBox.style.display = 'none';
        pos.els.label.style.display = 'none';
        continue;
      }
      const left = Math.max(0, x1);
      const width = Math.max(0, pane.width - left);

      this._placeBox(pos.els.riskBox, left, width, yEntry, yStop);
      this._placeBox(pos.els.rewardBox, left, width, yEntry, yTarget);

      const top = Math.min(yEntry, yStop, yTarget) - 42;
      pos.els.label.style.display = '';
      pos.els.label.style.left = `${left + 6}px`;
      pos.els.label.style.top = `${Math.max(2, top)}px`;
    }
  }

  _placeBox(el, left, width, yA, yB) {
    const top = Math.min(yA, yB);
    const height = Math.abs(yB - yA);
    el.style.display = '';
    el.style.left = `${left}px`;
    el.style.width = `${width}px`;
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
  }
}
