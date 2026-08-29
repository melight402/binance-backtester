import { createChart as createLibraryChart, ColorType, LineStyle } from 'trading-charts-with-tools';
import { buildHmaLineData } from './backtester/indicators.js';
import { buildSessionSeriesData } from './backtester/sessions.js';
import { HMA_COLORS, HMA_PERIODS } from './backtester/config.js';
import { loadChartState, saveChartState } from './backtester/chartStateStorage.js';

/**
 * Главная фабрика для создания изолированного инстанса графика
 * @param {HTMLDivElement} container - DOM-узел, переданный из SolidJS через ref
 * @param {Object} options - { symbol: 'BTCUSDT', timeframe: '1h', isMain: true }
 */
export function createChart(container, options) {
    const chart = createLibraryChart(container, {
        autoSize: true,
        localization: {
            timeFormatter: (time) => {
                // Данные времени от библиотеки могут приходить как timestamp в секундах
                // или как объект { year, month, day }
                let date;
                if (typeof time === 'object' && time !== null) {
                    date = new Date(Date.UTC(time.year, time.month - 1, time.day));
                } else {
                    date = new Date(time * 1000);
                }

                // Массивы для форматирования (можешь заменить на русские, если нужно)
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                // const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; // для русского

                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                // const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

                const dayOfWeek = days[date.getUTCDay()]; // День недели
                const day = String(date.getUTCDate()).padStart(2, '0');
                const month = months[date.getUTCMonth()];
                const year = String(date.getUTCFullYear()).slice(-2);

                // Проверяем, нужно ли показывать время (часы и минуты)
                const showTime = !['1d', '1w', '1M'].includes(options.timeframe);

                if (showTime) {
                    const hours = String(date.getUTCHours()).padStart(2, '0');
                    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                    // Выведет: "Mon, 10 Aug '26 02:00"
                    return `${dayOfWeek}, ${day} ${month} '${year} ${hours}:${minutes}`;
                }

                // Выведет: "Mon, 10 Aug '26"
                return `${dayOfWeek}, ${day} ${month} '${year}`;
            }
        },
        layout: {
            background: { type: ColorType.Solid, color: '#0a0d12' },
            textColor: '#9aa7b8',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11,
        },
        grid: {
            vertLines: { color: 'rgba(255,255,255,0.045)' },
            horzLines: { color: 'rgba(255,255,255,0.045)' },
        },
        timeScale: { timeVisible: options.timeframe !== '1d', secondsVisible: false },
        rightPriceScale: { borderColor: '#20262f' },
    });

    const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22c3a6',
        downColor: '#ef4460',
        borderVisible: false,
        wickUpColor: '#22c3a6',
        wickDownColor: '#ef4460',
    });

    const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.8, bottom: 0 },
    });

    const hmaSeriesByPeriod = Object.fromEntries(HMA_PERIODS.map((period) => [
        period,
        chart.addLineSeries({
            color: HMA_COLORS[period],
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: `HMA${period}`,
        }),
    ]));

    let indicatorSettings = {
        hma50: { visible: true, period: 50 },
        hma200: { visible: true, period: 200 },
        sessions: true,
    };
    let positionSettings = { riskUsdt: 10, rr: 2 };

    const sessionSeries = options.type === '1d' ? null : chart.addHistogramSeries({
        priceScaleId: 'sessions',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false,
    });

    if (sessionSeries) {
        chart.priceScale('sessions').applyOptions({
            scaleMargins: { top: 0, bottom: 0 },
            visible: false,
        });
    }

    let candlesData = [];
    let chartIdentity = { symbol: options.symbol, timeframe: options.timeframe, type: options.type };
    let chartStateRestored = false;
    let saveStateTimer = null;
    let lastSavedRangeKey = '';
    let activeTool = null;
    let pendingTrendPoint = null;
    let pendingTrendPointElement = null;
    let pendingTrendPreviewElement = null;
    let selectedDrawingId = null;
    const levels = [];
    const horizontalRays = [];
    const trendLines = [];
    const positions = [];
    let renderedDrawingsKey = '';
    const overlay = document.createElement('div');
    overlay.className = 'chart-drawing-overlay';
    container.appendChild(overlay);
    const ohlcLegend = document.createElement('div');
    ohlcLegend.className = 'chart-ohlc-legend';
    container.appendChild(ohlcLegend);
    const resizeObserver = new ResizeObserver(() => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width > 0 && height > 0) chart.resize(width, height);
        repositionPositions();
    });

    const formatPrice = (price) => price >= 100 ? price.toFixed(2) : price.toFixed(4);

    const timeToDrawingCoordinate = (time) => {
        const timeScale = chart.timeScale();
        const exactCoordinate = timeScale.timeToCoordinate(time);
        if (exactCoordinate != null) return exactCoordinate;
        if (!Number.isFinite(time) || candlesData.length === 0) return null;

        const firstCandle = candlesData[0];
        const lastCandle = candlesData[candlesData.length - 1];
        const intervalSeconds = candlesData.slice(1).map((candle, index) => candle.time - candlesData[index].time)
            .find((interval) => interval > 0) || 86400;
        if (time <= firstCandle.time) return 0;
        if (time >= lastCandle.time + intervalSeconds) return container.clientWidth;
        if (time >= lastCandle.time) return timeScale.timeToCoordinate(lastCandle.time);

        let previousCandle = firstCandle;
        for (const candle of candlesData) {
            if (candle.time > time) break;
            previousCandle = candle;
        }
        return timeScale.timeToCoordinate(previousCandle.time);
    };

    const setTrendLineGeometry = (element, startX, startY, endX, endY) => {
        const width = Math.hypot(endX - startX, endY - startY);
        const angle = Math.atan2(endY - startY, endX - startX);
        element.style.left = `${startX}px`;
        element.style.top = `${startY}px`;
        element.style.width = `${width}px`;
        element.style.transform = `rotate(${angle}rad)`;
        element.style.transformOrigin = '0 0';
        element.style.display = 'block';
    };

    const normalizeChartTime = (time) => {
        if (Number.isFinite(time)) return time;
        if (time && typeof time === 'object' && Number.isFinite(time.year)) {
            return Date.UTC(time.year, time.month - 1, time.day) / 1000;
        }
        return null;
    };

    const clearPendingTrendPreview = () => {
        pendingTrendPointElement?.remove();
        pendingTrendPreviewElement?.remove();
        pendingTrendPointElement = null;
        pendingTrendPreviewElement = null;
    };

    const updatePendingTrendPreview = (param) => {
        if (!pendingTrendPoint || !param?.point) return;
        const currentPrice = candlestickSeries.coordinateToPrice(param.point.y);
        const currentTime = param.time ?? candlesData[candlesData.length - 1]?.time;
        const startX = timeToDrawingCoordinate(pendingTrendPoint.time);
        const startY = candlestickSeries.priceToCoordinate(pendingTrendPoint.price);
        const endX = timeToDrawingCoordinate(currentTime);
        const endY = candlestickSeries.priceToCoordinate(currentPrice);
        if ([startX, startY, endX, endY].some((value) => value == null)) return;
        if (!pendingTrendPointElement) {
            pendingTrendPointElement = document.createElement('div');
            pendingTrendPointElement.className = 'trend-line-point';
            overlay.appendChild(pendingTrendPointElement);
        }
        pendingTrendPointElement.style.left = `${startX}px`;
        pendingTrendPointElement.style.top = `${startY}px`;
        pendingTrendPointElement.style.display = 'block';
        if (!pendingTrendPreviewElement) {
            pendingTrendPreviewElement = document.createElement('div');
            pendingTrendPreviewElement.className = 'trend-line trend-line-preview';
            overlay.appendChild(pendingTrendPreviewElement);
        }
        setTrendLineGeometry(pendingTrendPreviewElement, startX, startY, endX, endY);
    };

    function renderOhlcLegend(candle) {
        if (!candle) {
            ohlcLegend.replaceChildren();
            ohlcLegend.hidden = true;
            return;
        }
        const color = candle.close >= candle.open ? '#0f6b5c' : '#ef4460';
        const fields = [
            ['O', candle.open],
            ['H', candle.high],
            ['L', candle.low],
            ['C', candle.close],
        ];
        ohlcLegend.hidden = false;
        ohlcLegend.replaceChildren(...fields.map(([label, value]) => {
            const item = document.createElement('span');
            item.className = 'chart-ohlc-item';
            const name = document.createElement('span');
            name.className = 'chart-ohlc-label';
            name.textContent = label;
            const price = document.createElement('span');
            price.className = 'chart-ohlc-value';
            price.style.color = color;
            price.textContent = formatPrice(value);
            item.append(name, price);
            return item;
        }));
    }

    function candleFromCrosshairParam(param) {
        const seriesPoint = param.seriesData?.get?.(candlestickSeries);
        if (seriesPoint && Number.isFinite(seriesPoint.open)) return seriesPoint;
        if (param.time == null) return null;
        return candlesData.find((candle) => candle.time === param.time) || null;
    }

    const handleCrosshairMove = (param) => {
        if (!param?.point) {
            renderOhlcLegend(null);
            updatePendingTrendPreview(null);
            return;
        }
        renderOhlcLegend(candleFromCrosshairParam(param));
        updatePendingTrendPreview(param);
    };

    function placeBox(element, left, width, firstY, secondY) {
        element.style.display = 'block';
        element.style.left = `${left}px`;
        element.style.width = `${width}px`;
        element.style.top = `${Math.min(firstY, secondY)}px`;
        element.style.height = `${Math.abs(secondY - firstY)}px`;
    }

    function repositionPositions() {
        levels.forEach((level) => {
            const y = candlestickSeries.priceToCoordinate(level.price);
            if (y == null) {
                level.handle.style.display = 'none';
                return;
            }
            level.handle.style.left = '3px';
            level.handle.style.top = `${y - 7}px`;
            level.handle.style.display = 'block';
        });
        horizontalRays.forEach((ray) => {
            const y = candlestickSeries.priceToCoordinate(ray.price);
            if (y == null) {
                ray.element.style.display = 'none';
                return;
            }
            const startX = timeToDrawingCoordinate(ray.startTime);
            if (startX == null || startX >= container.clientWidth) {
                ray.element.style.display = 'none';
                return;
            }
            const left = Math.max(0, startX);
            ray.element.style.left = `${left}px`;
            ray.element.style.top = `${y - 1}px`;
            ray.element.style.width = `${Math.max(0, container.clientWidth - left)}px`;
            ray.element.style.display = 'block';
        });
        trendLines.forEach((trendLine) => {
            const startX = timeToDrawingCoordinate(trendLine.startTime);
            const endX = timeToDrawingCoordinate(trendLine.endTime);
            const startY = candlestickSeries.priceToCoordinate(trendLine.startPrice);
            const endY = candlestickSeries.priceToCoordinate(trendLine.endPrice);
            if ([startX, endX, startY, endY].some((value) => value == null)) {
                trendLine.element.style.display = 'none';
                return;
            }
            setTrendLineGeometry(trendLine.element, startX, startY, endX, endY);
            trendLine.handles.forEach((handle, index) => {
                const handleX = index === 0 ? startX : endX;
                const handleY = index === 0 ? startY : endY;
                handle.style.left = `${handleX}px`;
                handle.style.top = `${handleY}px`;
                handle.style.display = trendLine.id === selectedDrawingId ? 'block' : 'none';
            });
        });
        if (positions.length === 0) return;
        const pane = { width: container.clientWidth, height: container.clientHeight };
        const timeScale = chart.timeScale();
        positions.forEach((position) => {
            const left = timeScale.timeToCoordinate(position.entryTime);
            const entryY = candlestickSeries.priceToCoordinate(position.entryPrice);
            const stopY = candlestickSeries.priceToCoordinate(position.stopPrice);
            const targetY = candlestickSeries.priceToCoordinate(position.targetPrice);
            if ([left, entryY, stopY, targetY].some((value) => value == null)) {
                position.elements.forEach((element) => { element.style.display = 'none'; });
                return;
            }
            const boxLeft = Math.max(0, left);
            const boxWidth = Math.max(0, pane.width - boxLeft);
            placeBox(position.riskBox, boxLeft, boxWidth, entryY, stopY);
            placeBox(position.rewardBox, boxLeft, boxWidth, entryY, targetY);
            position.handles.forEach((handle, index) => {
                const handleY = [entryY, stopY, targetY][index];
                handle.style.left = `${Math.max(3, boxLeft - 7)}px`;
                handle.style.top = `${handleY - 7}px`;
                handle.style.display = 'block';
            });
            position.label.style.left = `${boxLeft + 6}px`;
            position.label.style.top = `${Math.max(2, Math.min(entryY, stopY, targetY) - 42)}px`;
            position.label.style.display = 'block';
        });
    }

    const removeAllDrawings = () => {
        levels.forEach((level) => candlestickSeries.removePriceLine(level.line));
        levels.forEach((level) => level.handle.remove());
        levels.length = 0;
        horizontalRays.forEach((ray) => ray.element.remove());
        horizontalRays.length = 0;
        trendLines.forEach((trendLine) => {
            trendLine.element.remove();
            trendLine.handles.forEach((handle) => handle.remove());
        });
        trendLines.length = 0;
        positions.forEach((position) => {
            position.lines.forEach((line) => candlestickSeries.removePriceLine(line));
            position.elements.forEach((element) => element.remove());
        });
        positions.length = 0;
    };

    const applySelectionStyles = () => {
        levels.forEach((level) => {
            level.line.applyOptions({
                color: level.id === selectedDrawingId ? '#ffffff' : '#e8b339',
                lineWidth: level.id === selectedDrawingId ? 3 : 2,
            });
        });
        horizontalRays.forEach((ray) => {
            ray.element.classList.toggle('horizontal-ray-selected', ray.id === selectedDrawingId);
        });
        trendLines.forEach((trendLine) => {
            trendLine.element.classList.toggle('trend-line-selected', trendLine.id === selectedDrawingId);
        });
        repositionPositions();
        positions.forEach((position) => {
            position.label.classList.toggle('position-label-selected', position.id === selectedDrawingId);
        });
    };

    const selectDrawing = (drawingId) => {
        if (!drawingId) return;
        selectedDrawingId = drawingId;
        applySelectionStyles();
        options.onDrawingSelected?.(drawingId);
    };

    const addLevel = (price, drawingId = null) => {
        const line = candlestickSeries.createPriceLine({
            price,
            color: '#e8b339',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Level',
        });
        const handle = document.createElement('div');
        handle.className = 'level-handle';
        handle.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            activeTool = null;
            options.onToolUsed?.();
            const move = (moveEvent) => {
                const nextPrice = candlestickSeries.coordinateToPrice(
                    moveEvent.clientY - container.getBoundingClientRect().top,
                );
                if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;
                levels.find((item) => item.handle === handle).price = nextPrice;
                line.applyOptions({ price: nextPrice });
                repositionPositions();
            };
            const stop = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', stop);
                const currentLevel = levels.find((item) => item.handle === handle);
                if (currentLevel?.id) options.onDrawingModified?.(currentLevel.id, { price: currentLevel.price });
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', stop, { once: true });
        });
        overlay.appendChild(handle);
        levels.push({ id: drawingId, price, line, handle });
        applySelectionStyles();
        repositionPositions();
    };

    const addHorizontalRay = (price, startTime, drawingId = null) => {
        const element = document.createElement('div');
        element.className = 'horizontal-ray';
        element.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (drawingId) selectDrawing(drawingId);
        });
        overlay.appendChild(element);
        horizontalRays.push({ id: drawingId, price, startTime, element });
        applySelectionStyles();
        repositionPositions();
    };

    const addTrendLine = (drawing, drawingId = null) => {
        const element = document.createElement('div');
        element.className = 'trend-line';
        element.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (drawingId) selectDrawing(drawingId);
        });
        overlay.appendChild(element);
        const trendLine = { ...drawing, id: drawingId, element, handles: [] };
        ['start', 'end'].forEach((pointName) => {
            const handle = document.createElement('div');
            handle.className = `trend-line-handle trend-line-handle-${pointName}`;
            handle.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (drawingId) selectDrawing(drawingId);
                activeTool = null;
                options.onToolUsed?.();
                const move = (moveEvent) => {
                    const rect = container.getBoundingClientRect();
                    const x = moveEvent.clientX - rect.left;
                    const y = moveEvent.clientY - rect.top;
                    const price = candlestickSeries.coordinateToPrice(y);
                    const time = normalizeChartTime(chart.timeScale().coordinateToTime(x));
                    if (!Number.isFinite(price) || !Number.isFinite(time)) return;
                    trendLine[`${pointName}Price`] = price;
                    trendLine[`${pointName}Time`] = time;
                    repositionPositions();
                };
                const stop = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', stop);
                    if (drawingId) options.onDrawingModified?.(drawingId, {
                        startPrice: trendLine.startPrice,
                        startTime: trendLine.startTime,
                        endPrice: trendLine.endPrice,
                        endTime: trendLine.endTime,
                    });
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', stop, { once: true });
            });
            overlay.appendChild(handle);
            trendLine.handles.push(handle);
        });
        trendLines.push(trendLine);
        applySelectionStyles();
        repositionPositions();
    };

    const updatePositionLabel = (position) => {
        const distance = Math.abs(position.entryPrice - position.stopPrice);
        const reward = Math.abs(position.targetPrice - position.entryPrice);
        const ratio = distance > 0 ? reward / distance : 0;
        const quantity = distance > 0 ? Number(positionSettings.riskUsdt) / distance : 0;
        const notional = quantity * position.entryPrice;
        position.label.textContent = `${position.side.toUpperCase()}  Entry ${formatPrice(position.entryPrice)}  Stop ${formatPrice(position.stopPrice)}  Target ${formatPrice(position.targetPrice)}  | ${ratio.toFixed(2)}R  | Pos: ${notional.toFixed(2)} USDT`;
    };

    const addPosition = (side, entryPrice, entryTime, providedStopPrice = null, providedTargetPrice = null, drawingId = null) => {
        const isLong = side === 'long';
        const risk = entryPrice * 0.01;
        const stopPrice = providedStopPrice ?? (isLong ? entryPrice - risk : entryPrice + risk);
        const targetPrice = providedTargetPrice ?? (isLong ? entryPrice + risk * positionSettings.rr : entryPrice - risk * positionSettings.rr);
        const lines = [
            candlestickSeries.createPriceLine({ price: entryPrice, color: '#dfe6ee', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry ${formatPrice(entryPrice)}` }),
            candlestickSeries.createPriceLine({ price: stopPrice, color: '#ef4460', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Stop ${formatPrice(stopPrice)}` }),
            candlestickSeries.createPriceLine({ price: targetPrice, color: '#22c3a6', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Target ${formatPrice(targetPrice)}` }),
        ];
        const riskBox = document.createElement('div');
        riskBox.className = 'position-zone position-zone-risk';
        const rewardBox = document.createElement('div');
        rewardBox.className = 'position-zone position-zone-reward';
        const label = document.createElement('div');
        label.className = `position-label position-label-${side}`;
        const handles = ['entry', 'stop', 'target'].map((handleType) => {
            const handle = document.createElement('div');
            handle.className = `position-handle position-handle-${handleType}`;
            handle.dataset.handle = handleType;
            handle.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (drawingId) selectDrawing(drawingId);
                activeTool = null;
                options.onToolUsed?.();
                const startPrice = candlestickSeries.coordinateToPrice(event.clientY - container.getBoundingClientRect().top);
                if (!Number.isFinite(startPrice)) return;
                const start = { entryPrice: position.entryPrice, stopPrice: position.stopPrice, targetPrice: position.targetPrice };
                const move = (moveEvent) => {
                    const price = candlestickSeries.coordinateToPrice(moveEvent.clientY - container.getBoundingClientRect().top);
                    if (!Number.isFinite(price) || price <= 0) return;
                    const delta = price - startPrice;
                    if (handleType === 'entry') {
                        position.entryPrice = start.entryPrice + delta;
                        position.stopPrice = start.stopPrice + delta;
                        position.targetPrice = start.targetPrice + delta;
                    } else {
                        position[`${handleType}Price`] = price;
                    }
                    position.lines[0].applyOptions({ price: position.entryPrice, title: `Entry ${formatPrice(position.entryPrice)}` });
                    position.lines[1].applyOptions({ price: position.stopPrice, title: `Stop ${formatPrice(position.stopPrice)}` });
                    position.lines[2].applyOptions({ price: position.targetPrice, title: `Target ${formatPrice(position.targetPrice)}` });
                    updatePositionLabel(position);
                    repositionPositions();
                };
                const stop = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', stop);
                    container.classList.remove('position-dragging');
                    if (position.id) options.onDrawingModified?.(position.id, {
                        entryPrice: position.entryPrice,
                        stopPrice: position.stopPrice,
                        targetPrice: position.targetPrice,
                    });
                };
                container.classList.add('position-dragging');
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', stop, { once: true });
            });
            overlay.appendChild(handle);
            return handle;
        });
        overlay.append(riskBox, rewardBox, label);
        [riskBox, rewardBox].forEach((zone) => {
            zone.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                if (drawingId) selectDrawing(drawingId);
            });
        });
        const position = { id: drawingId, side, entryPrice, stopPrice, targetPrice, entryTime, lines, riskBox, rewardBox, label, handles, elements: [riskBox, rewardBox, label, ...handles] };
        updatePositionLabel(position);
        label.style.cursor = 'pointer';
        label.addEventListener('click', (event) => {
            event.stopPropagation();
            if (drawingId) selectDrawing(drawingId);
        });
        positions.push(position);
        applySelectionStyles();
        repositionPositions();
        return position;
    };

    const createDrawing = (drawing) => {
        if (drawing.type === 'level') {
            addLevel(drawing.price, drawing.id);
        }
        if (drawing.type === 'horizontalRay') {
            addHorizontalRay(drawing.price, drawing.startTime, drawing.id);
        }
        if (drawing.type === 'trendLine') {
            addTrendLine(drawing, drawing.id);
        }
        if (drawing.type === 'position') {
            addPosition(drawing.side, drawing.entryPrice, drawing.entryTime, drawing.stopPrice, drawing.targetPrice, drawing.id);
        }
    };

    const findNearestLevel = (price) => {
        if (!Number.isFinite(price) || levels.length === 0) return null;
        let nearest = null;
        let nearestDistance = Infinity;
        levels.forEach((level) => {
            const distance = Math.abs(level.price - price);
            const threshold = Math.max(level.price * 0.002, level.price * 0.0001);
            if (distance <= threshold && distance < nearestDistance) {
                nearest = level;
                nearestDistance = distance;
            }
        });
        return nearest;
    };

    const handleChartClick = (param) => {
        if (!param.point || candlesData.length === 0) return;
        const price = candlestickSeries.coordinateToPrice(param.point.y);
        if (!Number.isFinite(price)) return;

        if (!activeTool) {
            const nearestLevel = findNearestLevel(price);
            if (nearestLevel?.id) {
                selectDrawing(nearestLevel.id);
            }
            return;
        }

        const entryCandle = candlesData[candlesData.length - 1];
        if (activeTool === 'trendLine') {
            const point = { price, time: param.time ?? entryCandle.time };
            if (!pendingTrendPoint) {
                pendingTrendPoint = point;
                updatePendingTrendPreview(param);
                return;
            }
            clearPendingTrendPreview();
            options.onDrawingCreated?.({
                type: 'trendLine',
                startPrice: pendingTrendPoint.price,
                startTime: pendingTrendPoint.time,
                endPrice: point.price,
                endTime: point.time,
                sourceChartId: options.type,
            });
            pendingTrendPoint = null;
            activeTool = null;
            container.style.cursor = '';
            options.onToolUsed?.();
            return;
        }
        if (activeTool === 'long' || activeTool === 'short') {
            const risk = price * 0.01;
            const drawing = { type: 'position', side: activeTool, entryPrice: price, entryTime: entryCandle.time,
                stopPrice: activeTool === 'long' ? price - risk : price + risk,
                targetPrice: activeTool === 'long' ? price + risk * positionSettings.rr : price - risk * positionSettings.rr,
                sourceChartId: options.type };
            options.onDrawingCreated?.(drawing);
        }
        if (activeTool === 'level') {
            options.onDrawingCreated?.({ type: 'level', price, sourceChartId: options.type });
        }
        if (activeTool === 'horizontalRay') {
            options.onDrawingCreated?.({ type: 'horizontalRay', price, startTime: param.time ?? entryCandle.time, sourceChartId: options.type });
            return;
        }
        activeTool = null;
        container.style.cursor = '';
        options.onToolUsed?.();
    };

    const updateIndicatorSeries = () => {
        HMA_PERIODS.forEach((defaultPeriod) => {
            const key = `hma${defaultPeriod}`;
            const setting = indicatorSettings[key] || { visible: true, period: defaultPeriod };
            const series = hmaSeriesByPeriod[defaultPeriod];
            series.applyOptions({ visible: setting.visible === true, title: `HMA${setting.period}` });
            series.setData(setting.visible === true ? buildHmaLineData(candlesData, setting.period) : []);
        });
        if (sessionSeries) {
            sessionSeries.applyOptions({ visible: indicatorSettings.sessions !== false });
            sessionSeries.setData(indicatorSettings.sessions === false ? [] : buildSessionSeriesData(candlesData));
        }
    };

    chart.subscribeClick(handleChartClick);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    const saveVisibleRange = () => {
        const range = chart.timeScale().getVisibleLogicalRange();
        if (!range) return;
        const rangeKey = `${range.from}:${range.to}`;
        if (rangeKey === lastSavedRangeKey) return;
        clearTimeout(saveStateTimer);
        saveStateTimer = setTimeout(() => {
            saveChartState(chartIdentity.symbol, chartIdentity.timeframe, chartIdentity.type, range);
            lastSavedRangeKey = rangeKey;
        }, 150);
    };
    const handleVisibleRangeChange = () => {
        repositionPositions();
        saveVisibleRange();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    resizeObserver.observe(container);

    return {
        setData(newCandles) {
            const candles = Array.isArray(newCandles) ? newCandles : [];
            candlesData = candles;
            candlestickSeries.setData(candles);
            this.setVolume(candles);
            HMA_PERIODS.forEach((period) => hmaSeriesByPeriod[period].setData([]));
            updateIndicatorSeries();
            if (!chartStateRestored && candles.length > 0) {
                const savedState = loadChartState(chartIdentity.symbol, chartIdentity.timeframe, chartIdentity.type);
                if (savedState) chart.timeScale().setVisibleLogicalRange(savedState.logicalRange);
                chartStateRestored = true;
            }
            repositionPositions();
        },
        setVolume(candles) {
            const values = Array.isArray(candles) ? candles : [];
            volumeSeries.setData(values.map((candle) => ({
                time: candle.time,
                value: candle.volume || 0,
                color: candle.close >= candle.open ? '#22c3a680' : '#ef446080',
            })));
        },
        setVisibleRange(range) {
            if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
                chart.timeScale().setVisibleLogicalRange(range);
            }
        },
        getVisibleRange() {
            return chart.timeScale().getVisibleLogicalRange();
        },
        resetChart(symbol, timeframe) {
            chartIdentity = { symbol, timeframe, type: options.type };
            renderedDrawingsKey = '';
            lastSavedRangeKey = '';
            clearTimeout(saveStateTimer);
            saveStateTimer = null;
            candlesData = [];
            removeAllDrawings();
            candlestickSeries.setData([]);
            volumeSeries.setData([]);
            Object.values(hmaSeriesByPeriod).forEach((series) => series.setData([]));
            if (sessionSeries) sessionSeries.setData([]);
            chartStateRestored = false;
            repositionPositions();
            chart.applyOptions({
                watermark: { visible: false, text: `${symbol} ${timeframe}` },
            });
        },
        setMode(mode) {
            activeTool = mode;
            if (mode !== 'trendLine') {
                pendingTrendPoint = null;
                clearPendingTrendPreview();
            }
            container.style.cursor = mode ? 'crosshair' : '';
        },
        clearDrawings() {
            removeAllDrawings();
            renderedDrawingsKey = '';
        },
        setDrawings(nextDrawings) {
            const drawings = Array.isArray(nextDrawings) ? nextDrawings : [];
            const nextKey = JSON.stringify(drawings);
            if (nextKey === renderedDrawingsKey) return;
            removeAllDrawings();
            drawings.forEach(createDrawing);
            renderedDrawingsKey = nextKey;
        },
        setSelectedDrawingId(drawingId) {
            selectedDrawingId = drawingId || null;
            applySelectionStyles();
        },
        setIndicatorSettings(nextSettings) {
            indicatorSettings = { ...indicatorSettings, ...(nextSettings || {}) };
            updateIndicatorSeries();
        },
        setPositionSettings(nextSettings) {
            positionSettings = {
                riskUsdt: Math.max(0.01, Math.min(1000000, Number(nextSettings?.riskUsdt) || 10)),
                rr: Math.max(0.1, Math.min(20, Number(nextSettings?.rr) || 2)),
            };
            positions.forEach(updatePositionLabel);
        },
        destroy() {
            clearPendingTrendPreview();
            removeAllDrawings();
            resizeObserver.disconnect();
            clearTimeout(saveStateTimer);
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
            overlay.remove();
            ohlcLegend.remove();
            chart.unsubscribeClick(handleChartClick);
            chart.unsubscribeCrosshairMove(handleCrosshairMove);
            chart.remove();
        }
    };
}
