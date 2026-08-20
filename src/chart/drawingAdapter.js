function normalizeDrawing(value) {
  if (!value || typeof value !== 'object' || typeof value.type !== 'string') return null;
  if (value.type === 'level') {
    const price = Number(value.price);
    return Number.isFinite(price) && price > 0 ? { ...value, price, sourceChartId: value.sourceChartId || null } : null;
  }
  if (value.type !== 'position' || !['long', 'short'].includes(value.side)) return null;
  const entryPrice = Number(value.entryPrice);
  const stopPrice = Number(value.stopPrice);
  const targetPrice = Number(value.targetPrice);
  if ([entryPrice, stopPrice, targetPrice].some((price) => !Number.isFinite(price) || price <= 0)) return null;
  return { ...value, entryPrice, stopPrice, targetPrice, sourceChartId: value.sourceChartId || null };
}

function cloneDrawings(drawings) {
  return (Array.isArray(drawings) ? drawings : [])
    .map(normalizeDrawing)
    .filter(Boolean)
    .map((drawing) => ({ ...drawing }));
}

export class DrawingAdapter {
  constructor(drawings = []) {
    this.drawings = cloneDrawings(drawings);
    this.listeners = new Set();
    this.eventListeners = {
      created: new Set(),
      modified: new Set(),
      removed: new Set(),
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeCreated(listener) {
    this.eventListeners.created.add(listener);
    return () => this.eventListeners.created.delete(listener);
  }

  subscribeModified(listener) {
    this.eventListeners.modified.add(listener);
    return () => this.eventListeners.modified.delete(listener);
  }

  subscribeRemoved(listener) {
    this.eventListeners.removed.add(listener);
    return () => this.eventListeners.removed.delete(listener);
  }

  emitEvent(type, drawing) {
    this.eventListeners[type]?.forEach((listener) => listener({ ...drawing }));
  }

  emit() {
    const drawings = this.export();
    this.listeners.forEach((listener) => listener(drawings));
    return drawings;
  }

  createLevel(price, id) {
    return this.add({ type: 'level', price, id });
  }

  createLongShort(side, values, id) {
    return this.add({ type: 'position', side, ...values, id });
  }

  add(drawing) {
    const normalized = normalizeDrawing(drawing);
    if (!normalized) return null;
    this.drawings = [...this.drawings, normalized];
    this.emitEvent('created', normalized);
    this.emit();
    return normalized;
  }

  import(drawings) {
    this.drawings = cloneDrawings(drawings);
    this.emit();
    return this.export();
  }

  export() {
    return this.drawings.map((drawing) => ({ ...drawing }));
  }

  remove(id) {
    const removed = this.drawings.find((drawing) => drawing.id === id);
    const next = this.drawings.filter((drawing) => drawing.id !== id);
    if (next.length === this.drawings.length) return false;
    this.drawings = next;
    this.emitEvent('removed', removed || { id });
    this.emit();
    return true;
  }

  removeAll() {
    const removed = this.drawings;
    this.drawings = [];
    removed.forEach((drawing) => this.emitEvent('removed', drawing));
    this.emit();
  }

  removeByType(type) {
    const removed = this.drawings.filter((drawing) => drawing.type === type);
    if (removed.length === 0) return false;
    this.drawings = this.drawings.filter((drawing) => drawing.type !== type);
    removed.forEach((drawing) => this.emitEvent('removed', drawing));
    this.emit();
    return true;
  }

  updateOptions(id, options) {
    const index = this.drawings.findIndex((drawing) => drawing.id === id);
    if (index < 0) return false;
    const updated = normalizeDrawing({ ...this.drawings[index], ...options });
    if (!updated) return false;
    this.drawings = [...this.drawings.slice(0, index), updated, ...this.drawings.slice(index + 1)];
    this.emitEvent('modified', updated);
    this.emit();
    return true;
  }

  dispose() {
    this.listeners.clear();
    Object.values(this.eventListeners).forEach((listeners) => listeners.clear());
  }
}