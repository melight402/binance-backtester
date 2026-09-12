export function applyDragUpdate(drawing, mode, pointer, geometry, anchor = {}) {
  if (!drawing || !mode || !pointer || !geometry) return drawing;

  const next = { ...drawing };
  const original = anchor.original ?? drawing;

  if (mode === 'hline-price') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    return { ...next, price: nextPrice };
  }

  if (mode === 'ray-anchor') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    const nextTime = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;
    return { ...next, time: nextTime, price: nextPrice };
  }

  if (mode === 'ray-body') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    const nextTime = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;
    const anchorTime = Number.isFinite(anchor.anchorTime) ? anchor.anchorTime : original.time;
    const anchorPrice = Number.isFinite(anchor.anchorPrice) ? anchor.anchorPrice : original.price;
    const dt = Number.isFinite(nextTime) && Number.isFinite(anchorTime) ? nextTime - anchorTime : 0;
    const dp = Number.isFinite(nextPrice) && Number.isFinite(anchorPrice) ? nextPrice - anchorPrice : 0;
    return {
      ...next,
      time: Number.isFinite(original.time) ? original.time + dt : nextTime,
      price: Number.isFinite(original.price) ? original.price + dp : nextPrice,
    };
  }

  if (mode === 'position-entry') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    return { ...next, entry: nextPrice };
  }

  if (mode === 'position-stop') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    return { ...next, stop: nextPrice };
  }

  if (mode === 'position-pt') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    return { ...next, pt: nextPrice };
  }

  if (mode === 'trend-p1') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    const nextTime = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;
    return { ...next, p1: { ...next.p1, time: nextTime, price: nextPrice } };
  }

  if (mode === 'trend-p2') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    const nextTime = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;
    return { ...next, p2: { ...next.p2, time: nextTime, price: nextPrice } };
  }

  if (mode === 'trend-body') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    const nextTime = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;
    const anchorTime = Number.isFinite(anchor.anchorTime) ? anchor.anchorTime : original.p1?.time;
    const anchorPrice = Number.isFinite(anchor.anchorPrice) ? anchor.anchorPrice : original.p1?.price;
    const dt = Number.isFinite(nextTime) && Number.isFinite(anchorTime) ? nextTime - anchorTime : 0;
    const dp = Number.isFinite(nextPrice) && Number.isFinite(anchorPrice) ? nextPrice - anchorPrice : 0;
    return {
      ...next,
      p1: {
        ...next.p1,
        time: Number.isFinite(original.p1?.time) ? original.p1.time + dt : nextTime,
        price: Number.isFinite(original.p1?.price) ? original.p1.price + dp : nextPrice,
      },
      p2: {
        ...next.p2,
        time: Number.isFinite(original.p2?.time) ? original.p2.time + dt : nextTime,
        price: Number.isFinite(original.p2?.price) ? original.p2.price + dp : nextPrice,
      },
    };
  }

  if (mode === 'range-p1' || mode === 'range-p2') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    const nextTime = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;
    const point = mode === 'range-p1' ? 'p1' : 'p2';
    return { ...next, [point]: { ...next[point], time: nextTime, price: nextPrice } };
  }

  if (mode === 'range-body') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    const nextTime = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;
    const anchorTime = Number.isFinite(anchor.anchorTime) ? anchor.anchorTime : original.p1?.time;
    const anchorPrice = Number.isFinite(anchor.anchorPrice) ? anchor.anchorPrice : original.p1?.price;
    const dt = Number.isFinite(nextTime) && Number.isFinite(anchorTime) ? nextTime - anchorTime : 0;
    const dp = Number.isFinite(nextPrice) && Number.isFinite(anchorPrice) ? nextPrice - anchorPrice : 0;
    return {
      ...next,
      p1: { ...next.p1, time: original.p1.time + dt, price: original.p1.price + dp },
      p2: { ...next.p2, time: original.p2.time + dt, price: original.p2.price + dp },
    };
  }

  if (mode === 'position-body') {
    const nextPrice = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
    const nextTime = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;
    const anchorTime = Number.isFinite(anchor.anchorTime) ? anchor.anchorTime : drawing.entryTime;
    const anchorPrice = Number.isFinite(anchor.anchorPrice) ? anchor.anchorPrice : drawing.entry;
    const dt = Number.isFinite(nextTime) && Number.isFinite(anchorTime) ? nextTime - anchorTime : 0;
    const dp = Number.isFinite(nextPrice) && Number.isFinite(anchorPrice) ? nextPrice - anchorPrice : 0;
    return {
      ...next,
      entryTime: (drawing.entryTime ?? nextTime) + dt,
      endTime: (drawing.endTime ?? nextTime) + dt,
      entry: (drawing.entry ?? nextPrice) + dp,
      stop: (drawing.stop ?? nextPrice) + dp,
      pt: (drawing.pt ?? nextPrice) + dp,
    };
  }

  return next;
}
