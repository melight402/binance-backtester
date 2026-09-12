const COLORS = {
  hline: '#5b7fd6',
  ray: '#c98bf0',
  trend: '#f5b45a',
  range: '#26a69a',
  accent: '#4c8cff',
  long: '#2fd6a7',
  short: '#ff5d72',
  longGlow: 'rgba(47, 214, 167, 0.16)',
  shortGlow: 'rgba(255, 93, 114, 0.16)',
};

export function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function label(ctx, x, y, text, color, align = 'left') {
  ctx.font = "600 11px 'JetBrains Mono', monospace";
  const paddingX = 6;
  const textWidth = ctx.measureText(text).width;
  const boxX = align === 'left' ? x : align === 'center' ? x - (textWidth + paddingX * 2) / 2 : x - textWidth - paddingX * 2;
  ctx.fillStyle = color;
  roundRect(ctx, boxX, y - 9, textWidth + paddingX * 2, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#0a0e14';
  ctx.fillText(text, boxX + paddingX, y + 4);
}

export function toX(time, timeScale) {
  if (!timeScale || typeof timeScale.timeToCoordinate !== 'function') return null;
  return timeScale.timeToCoordinate(time);
}

export function toY(price, priceScale) {
  if (!priceScale || typeof priceScale.priceToCoordinate !== 'function') return null;
  return priceScale.priceToCoordinate(price);
}

export function fromX(x, timeScale) {
  if (!timeScale || typeof timeScale.coordinateToTime !== 'function') return null;
  return timeScale.coordinateToTime(x);
}

export function fromY(y, priceScale) {
  if (!priceScale || typeof priceScale.coordinateToPrice !== 'function') return null;
  return priceScale.coordinateToPrice(y);
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return dist(p, a);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const cx = a.x + clamped * dx;
  const cy = a.y + clamped * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

export function hitTest(x, y, drawing, geometry) {
  if (!drawing || !geometry) return false;
  const { type } = drawing;

  if (type === 'hline') {
    const py = geometry.toY?.(drawing.price);
    return py != null && Math.abs(y - py) <= 6;
  }

  if (type === 'ray') {
    const py = geometry.toY?.(drawing.price);
    const px = geometry.toX?.(drawing.time);
    return py != null && Math.abs(y - py) <= 6 && (px == null || Math.abs(x - px) <= 8 || x >= (px ?? 0));
  }

  if ((type === 'long' || type === 'short') && drawing.entryTime) {
    const entryX = geometry.toX?.(drawing.entryTime);
    const entryY = geometry.toY?.(drawing.entry);
    const stopY = geometry.toY?.(drawing.stop);
    const ptY = geometry.toY?.(drawing.pt);
    if (entryX == null || entryY == null || stopY == null || ptY == null) return false;
    const boxMinX = entryX;
    const boxMaxX = geometry.width ?? entryX + 120;
    const minY = Math.min(entryY, stopY, ptY);
    const maxY = Math.max(entryY, stopY, ptY);
    return x >= boxMinX && x <= boxMaxX && y >= minY && y <= maxY;
  }

  return false;
}

export function drawHLine(ctx, drawing, width, selectedId, formatPrice) {
  const y = drawing?.price == null ? null : drawing.price;
  const py = y == null ? null : drawing.geo?.toY?.(y);
  if (py == null) return;
  const isSelected = drawing.id === selectedId;
  ctx.strokeStyle = isSelected ? COLORS.accent : COLORS.hline;
  ctx.lineWidth = isSelected ? 2 : 1.25;
  ctx.beginPath();
  ctx.moveTo(0, py);
  ctx.lineTo(width, py);
  ctx.stroke();
  label(ctx, width - 4, py, formatPrice(y), isSelected ? COLORS.accent : COLORS.hline, 'right');
}

export function drawRay(ctx, drawing, width, selectedId, formatPrice) {
  const priceY = drawing?.price == null ? null : drawing.geo?.toY?.(drawing.price);
  const timeX = drawing?.time == null ? null : drawing.geo?.toX?.(drawing.time);
  if (priceY == null) return;
  const startX = timeX == null ? 0 : Math.max(0, timeX);
  const isSelected = drawing.id === selectedId;
  ctx.strokeStyle = isSelected ? COLORS.accent : COLORS.ray;
  ctx.lineWidth = isSelected ? 2 : 1.25;
  ctx.beginPath();
  ctx.moveTo(startX, priceY);
  ctx.lineTo(width, priceY);
  ctx.stroke();
  if (timeX != null) {
    ctx.fillStyle = isSelected ? COLORS.accent : COLORS.ray;
    ctx.beginPath();
    ctx.arc(timeX, priceY, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  label(ctx, width - 4, priceY, formatPrice(drawing.price), isSelected ? COLORS.accent : COLORS.ray, 'right');
}

export function drawTrend(ctx, drawing, selectedId) {
  const p1 = drawing?.p1 ?? {};
  const p2 = drawing?.p2 ?? {};
  const x1 = drawing.geo?.toX?.(p1.time);
  const y1 = drawing.geo?.toY?.(p1.price);
  const x2 = drawing.geo?.toX?.(p2.time);
  const y2 = drawing.geo?.toY?.(p2.price);
  if (x1 == null || y1 == null || x2 == null || y2 == null) return;
  const isSelected = drawing.id === selectedId;
  ctx.strokeStyle = isSelected ? COLORS.accent : COLORS.trend;
  ctx.lineWidth = isSelected ? 2.25 : 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (isSelected) {
    ctx.fillStyle = COLORS.accent;
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawRange(ctx, drawing, selectedId, formatPrice) {
  const p1 = drawing?.p1 ?? {};
  const p2 = drawing?.p2 ?? {};
  const x1 = drawing.geo?.toX?.(p1.time);
  const y1 = drawing.geo?.toY?.(p1.price);
  const x2 = drawing.geo?.toX?.(p2.time);
  const y2 = drawing.geo?.toY?.(p2.price);
  if ([x1, y1, x2, y2].some((value) => value == null)) return;
  const isSelected = drawing.id === selectedId;
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.max(1, Math.abs(x2 - x1));
  const height = Math.max(1, Math.abs(y2 - y1));
  const priceDelta = p2.price - p1.price;
  const percent = p1.price ? (priceDelta / p1.price) * 100 : 0;
  const durationMinutes = Math.abs(p2.time - p1.time) / 60;
  const duration = durationMinutes >= 1440
    ? `${(durationMinutes / 1440).toFixed(1)}d`
    : durationMinutes >= 60
      ? `${(durationMinutes / 60).toFixed(1)}h`
      : `${Math.round(durationMinutes)}m`;
  const text = `${priceDelta >= 0 ? '+' : ''}${formatPrice(priceDelta)} (${percent.toFixed(2)}%) · ${duration}`;

  ctx.fillStyle = isSelected ? 'rgba(38, 166, 154, 0.22)' : 'rgba(38, 166, 154, 0.12)';
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = isSelected ? COLORS.accent : COLORS.range;
  ctx.lineWidth = isSelected ? 2 : 1.25;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(left, top, width, height);
  ctx.setLineDash([]);
  if (isSelected) {
    ctx.fillStyle = COLORS.accent;
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  label(ctx, left + width / 2, top - 10, text, isSelected ? COLORS.accent : COLORS.range, 'center');
}

export function drawPosition(ctx, drawing, width, selectedId, formatPrice, rrRatio, positionSizeUSDT, riskUsdt) {
  const entryTime = drawing?.entryTime;
  const endTime = drawing?.endTime ?? width;
  const entryY = drawing.geo?.toY?.(drawing.entry);
  const stopY = drawing.geo?.toY?.(drawing.stop);
  const ptY = drawing.geo?.toY?.(drawing.pt);
  if (entryY == null || stopY == null || ptY == null) return;
  const startX = drawing.geo?.toX?.(entryTime) ?? 0;
  const endX = drawing.geo?.toX?.(endTime) ?? width;
  const isLong = drawing.type === 'long';
  const isSelected = drawing.id === selectedId;

  const profitTop = isLong ? ptY : entryY;
  const profitBottom = isLong ? entryY : ptY;
  const lossTop = isLong ? entryY : stopY;
  const lossBottom = isLong ? stopY : entryY;

  ctx.fillStyle = COLORS.longGlow;
  ctx.fillRect(startX, profitTop, Math.max(1, endX - startX), Math.max(1, profitBottom - profitTop));
  ctx.fillStyle = COLORS.shortGlow;
  ctx.fillRect(startX, lossTop, Math.max(1, endX - startX), Math.max(1, lossBottom - lossTop));

  const topY = Math.min(ptY, stopY);
  const botY = Math.max(ptY, stopY);
  ctx.strokeStyle = isSelected ? COLORS.accent : 'rgba(255,255,255,0.22)';
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.strokeRect(startX, topY, Math.max(1, endX - startX), botY - topY);

  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  for (const [y, color] of [[entryY, COLORS.accent], [ptY, COLORS.long], [stopY, COLORS.short]]) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  label(ctx, endX + 4, ptY, `PT ${formatPrice(drawing.pt)}`, COLORS.long);
  label(ctx, endX + 4, entryY, `Вход ${formatPrice(drawing.entry)}`, COLORS.accent);
  label(ctx, endX + 4, stopY, `Стоп ${formatPrice(drawing.stop)}`, COLORS.short);

  const ratio = rrRatio(drawing.entry, drawing.stop, drawing.pt);
  const size = positionSizeUSDT(riskUsdt, drawing.entry, drawing.stop);
  const centerY = (entryY + (isLong ? ptY : stopY)) / 2;
  ctx.font = "700 12px 'JetBrains Mono', monospace";
  ctx.fillStyle = '#e7edf5';
  const txt = `${ratio.toFixed(2)}:1  •  ${size.toFixed(2)} USDT`;
  const tw = ctx.measureText(txt).width;
  const cx = Math.min(Math.max(startX + (endX - startX) / 2 - tw / 2, startX + 4), endX - tw - 4);
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  roundRect(ctx, cx - 6, centerY - 11, tw + 12, 22, 5);
  ctx.fill();
  ctx.fillStyle = '#e7edf5';
  ctx.fillText(txt, cx, centerY + 4);
}

export function redrawCanvas({ ctx, width, height, drawings, selectedId, draft, geometry, formatPrice, rrRatio, positionSizeUSDT, riskUsdt }) {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  for (const drawing of drawings || []) {
    if (drawing.type === 'hline') drawHLine(ctx, { ...drawing, geo: geometry }, width, selectedId, formatPrice);
    else if (drawing.type === 'ray') drawRay(ctx, { ...drawing, geo: geometry }, width, selectedId, formatPrice);
    else if (drawing.type === 'trendline') drawTrend(ctx, { ...drawing, geo: geometry }, selectedId);
    else if (drawing.type === 'range') drawRange(ctx, { ...drawing, geo: geometry }, selectedId, formatPrice);
    else if (drawing.type === 'long' || drawing.type === 'short') {
      drawPosition(ctx, { ...drawing, geo: geometry }, width, selectedId, formatPrice, rrRatio, positionSizeUSDT, riskUsdt);
    }
  }
}
