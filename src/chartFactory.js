import { createChart as createLibraryChart, ColorType, LineStyle } from 'lightweight-charts';
import { buildHmaLineData } from './backtester/indicators.js';
import { buildSessionSeriesData } from './backtester/sessions.js';
import { HMA_COLORS, HMA_PERIODS } from './backtester/config.js';
import { loadChartState, saveChartState } from './backtester/chartStateStorage.js';
import { createDrawingFromTool, hitTestDrawing } from './services/drawingInteraction.js';
import { redrawCanvas } from './services/canvasDrawing.js';
import { applyDragUpdate } from './services/drawingDrag.js';

/**
 * Главная фабрика для создания изолированного инстанса графика
 * @param {HTMLDivElement} container - DOM-узел, переданный из SolidJS через ref
 * @param {Object} options - { symbol: 'BTCUSDT', timeframe: '1h', isMain: true }
 */
export function createChart(container, options) {
    const VOLUME_PANEL_HEIGHT_RATIO = 0.2;
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
        scaleMargins: { top: 1 - VOLUME_PANEL_HEIGHT_RATIO, bottom: 0 },
    });
    volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 1 - VOLUME_PANEL_HEIGHT_RATIO, bottom: 0 },
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
    let selectedDrawingId = null;
    let dragState = null;
    let draftTrendLine = null;
    const levels = [];
    const horizontalRays = [];
    const trendLines = [];
    const positions = [];
    let renderedDrawingsKey = '';
    const overlay = document.createElement('div');
    overlay.className = 'chart-drawing-overlay';
    container.appendChild(overlay);
    const drawingCanvas = document.createElement('canvas');
    drawingCanvas.className = 'chart-drawing-canvas';
    drawingCanvas.style.position = 'absolute';
    drawingCanvas.style.inset = '0';
    drawingCanvas.style.pointerEvents = 'none';
    overlay.appendChild(drawingCanvas);
    const drawingCtx = drawingCanvas.getContext('2d');
    const syncCanvasSize = () => {
        const ratio = window.devicePixelRatio || 1;
        drawingCanvas.width = Math.max(1, Math.floor(container.clientWidth * ratio));
        drawingCanvas.height = Math.max(1, Math.floor(container.clientHeight * ratio));
        drawingCanvas.style.width = `${container.clientWidth}px`;
        drawingCanvas.style.height = `${container.clientHeight}px`;
        if (drawingCtx) drawingCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const ohlcLegend = document.createElement('div');
    ohlcLegend.className = 'chart-ohlc-legend';
    container.appendChild(ohlcLegend);
    const resizeObserver = new ResizeObserver(() => {
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

    const normalizeChartTime = (time) => {
        if (Number.isFinite(time)) return time;
        if (time && typeof time === 'object' && Number.isFinite(time.year)) {
            return Date.UTC(time.year, time.month - 1, time.day) / 1000;
        }
        return null;
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
            return;
        }
        renderOhlcLegend(candleFromCrosshairParam(param));
    };

    function placeBox(element, left, width, firstY, secondY) {
        element.style.display = 'block';
        element.style.left = `${left}px`;
        element.style.width = `${width}px`;
        element.style.top = `${Math.min(firstY, secondY)}px`;
        element.style.height = `${Math.abs(secondY - firstY)}px`;
    }

    function redrawCanvasLayer() {
        if (!drawingCtx) return;
        syncCanvasSize();
        const width = container.clientWidth;
        const height = container.clientHeight;
        drawingCtx.clearRect(0, 0, width, height);
        const geometry = {
            width,
            toX: (time) => timeToDrawingCoordinate(time),
            fromX: (x) => normalizeChartTime(chart.timeScale().coordinateToTime(x)),
            toY: (value) => candlestickSeries.priceToCoordinate(value),
            fromY: (y) => candlestickSeries.coordinateToPrice(y),
        };
        const model = [
            ...levels.map((level) => ({ id: level.id, type: 'hline', price: level.price })),
            ...horizontalRays.map((ray) => ({ id: ray.id, type: 'ray', time: ray.startTime, price: ray.price })),
            ...trendLines.map((line) => ({ id: line.id, type: 'trendline', p1: line.p1, p2: line.p2 })),
            ...(draftTrendLine ? [{ id: draftTrendLine.id, type: 'trendline', p1: draftTrendLine.p1, p2: draftTrendLine.p2 }] : []),
        ];
        redrawCanvas({
            ctx: drawingCtx,
            width,
            height,
            drawings: model,
            selectedId: selectedDrawingId,
            geometry,
            formatPrice,
            rrRatio: (entry, stop, pt) => Math.abs(pt - entry) / Math.max(Math.abs(entry - stop), Number.EPSILON),
            positionSizeUSDT: (riskUsdt, entry, stop) => (riskUsdt / Math.max(Math.abs(entry - stop), Number.EPSILON)),
            riskUsdt: 10,
        });
        if (positions.length === 0) return;
        const pane = { width, height };
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

    function repositionPositions() {
        redrawCanvasLayer();
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
        levels.forEach((level) => {
            if (level.line) candlestickSeries.removePriceLine(level.line);
        });
        levels.length = 0;
        horizontalRays.length = 0;
        trendLines.length = 0;
        draftTrendLine = null;
        positions.forEach((position) => {
            position.lines.forEach((line) => candlestickSeries.removePriceLine(line));
            position.elements.forEach((element) => element.remove());
        });
        positions.length = 0;
        redrawCanvasLayer();
    };

    const applySelectionStyles = () => {
        levels.forEach((level) => {
            if (!level.line) return;
            level.line.applyOptions({
                color: level.id === selectedDrawingId ? '#ffffff' : '#e8b339',
                lineWidth: level.id === selectedDrawingId ? 3 : 2,
            });
        });
        redrawCanvasLayer();
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
        levels.push({ id: drawingId, price, line: null, handle: null });
        applySelectionStyles();
        repositionPositions();
    };

    const addHorizontalRay = (price, startTime, drawingId = null) => {
        horizontalRays.push({ id: drawingId, price, startTime, element: null });
        applySelectionStyles();
        repositionPositions();
    };

    const addTrendLine = (p1, p2, drawingId = null) => {
        trendLines.push({ id: drawingId, p1: { ...p1 }, p2: { ...p2 } });
        applySelectionStyles();
        redrawCanvasLayer();
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
        const type = drawing?.type === 'level' ? 'hline' : drawing?.type === 'horizontalRay' ? 'ray' : drawing?.type;
        if (type === 'hline') {
            addLevel(drawing.price, drawing.id);
        }
        if (type === 'ray') {
            addHorizontalRay(drawing.price, drawing.startTime, drawing.id);
        }
        if (type === 'trendline') {
            addTrendLine(drawing.p1 ?? { time: drawing.time, price: drawing.price }, drawing.p2 ?? { time: drawing.time, price: drawing.price }, drawing.id);
        }
        if (type === 'position') {
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

    const normalizeTool = (tool) => {
        if (!tool) return null;
        const value = String(tool).trim();
        if (!value) return null;
        const lower = value.toLowerCase();
        if (lower === 'level' || lower === 'hline') return 'hline';
        if (lower === 'horizontalray' || lower === 'horizontal_ray' || lower === 'horizontal-ray' || lower === 'ray') return 'ray';
        if (lower === 'trendline' || lower === 'trend-line' || lower === 'trend_line') return 'trendline';
        return lower;
    };

    const getPointerPoint = (event) => {
        const rect = container.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    };

    const findDrawingById = (drawingId) => {
        if (!drawingId) return null;
        return [
            ...levels.map((level) => ({ ...level, type: 'hline', price: level.price })),
            ...horizontalRays.map((ray) => ({ ...ray, type: 'ray', price: ray.price, time: ray.startTime })),
            ...trendLines.map((line) => ({ ...line, type: 'trendline' })),
            ...positions.map((position) => ({
                ...position,
                type: position.side,
                entry: position.entryPrice,
                stop: position.stopPrice,
                pt: position.targetPrice,
                entryTime: position.entryTime,
            })),
        ].find((drawing) => drawing.id === drawingId) || null;
    };

    const updateDraggedDrawing = (pointer) => {
        if (!dragState) return;
        const { id, mode, original } = dragState;
        const target = findDrawingById(id);
        if (!target) return;

        const next = applyDragUpdate(original || target, mode, pointer, {
            width: container.clientWidth,
            toX: (time) => timeToDrawingCoordinate(time),
            fromX: (x) => normalizeChartTime(chart.timeScale().coordinateToTime(x)),
            toY: (value) => candlestickSeries.priceToCoordinate(value),
            fromY: (y) => candlestickSeries.coordinateToPrice(y),
        }, {
            original: original || target,
            anchorTime: dragState.anchorTime ?? null,
            anchorPrice: dragState.anchorPrice ?? null,
        });

        if (target.type === 'hline' || target.type === 'ray') {
            const match = horizontalRays.find((ray) => ray.id === id) || levels.find((level) => level.id === id);
            if (match) {
                if ('price' in next) match.price = next.price;
                if ('time' in next) match.startTime = next.time;
                if (mode === 'ray-anchor' || mode === 'ray-body') queryRayState(match, next);
            }
        }

        if (target.type === 'trendline') {
            const match = trendLines.find((line) => line.id === id);
            if (match) {
                if ('p1' in next) match.p1 = next.p1;
                if ('p2' in next) match.p2 = next.p2;
            }
        }

        if (target.type === 'long' || target.type === 'short') {
            const match = positions.find((position) => position.id === id);
            if (match) {
                if ('entry' in next) match.entryPrice = next.entry;
                if ('stop' in next) match.stopPrice = next.stop;
                if ('pt' in next) match.pt = next.pt;
                if ('entryTime' in next) match.entryTime = next.entryTime;
                if ('endTime' in next) match.endTime = next.endTime;
                updatePositionLabel(match);
            }
        }

        repositionPositions();
        options.onDrawingModified?.(id, next);
    };

    const queryRayState = (ray, next) => {
        if (!ray) return;
        if ('time' in next) ray.startTime = next.time;
        if ('price' in next) ray.price = next.price;
    };

    const handleChartClick = (param, fromPointerDown = false) => {
        if (!param.point || candlesData.length === 0) return;
        const price = candlestickSeries.coordinateToPrice(param.point.y);
        if (!Number.isFinite(price)) return;

        const geometry = {
            width: container.clientWidth,
            toX: (time) => timeToDrawingCoordinate(time),
            fromX: (x) => normalizeChartTime(chart.timeScale().coordinateToTime(x)),
            toY: (value) => candlestickSeries.priceToCoordinate(value),
            fromY: (y) => candlestickSeries.coordinateToPrice(y),
        };

        const normalizedTool = normalizeTool(activeTool);
        if (!normalizedTool) {
            const hit = hitTestDrawing({ x: param.point.x, y: param.point.y }, [
                ...levels.map((level) => ({ id: level.id, type: 'hline', price: level.price })),
                ...horizontalRays.map((ray) => ({ id: ray.id, type: 'ray', time: ray.startTime, price: ray.price })),
                ...trendLines.map((line) => ({ id: line.id, type: 'trendline', p1: line.p1, p2: line.p2 })),
                ...positions.map((position) => ({ id: position.id, type: position.side, entry: position.entryPrice, stop: position.stopPrice, pt: position.targetPrice, entryTime: position.entryTime })),
            ], geometry);
            if (hit?.id) {
                const original = findDrawingById(hit.id);
                selectDrawing(hit.id);
                dragState = {
                    id: hit.id,
                    mode: hit.mode,
                    original,
                    anchorTime: hit.anchorTime ?? (original?.time ?? original?.entryTime ?? original?.p1?.time ?? null),
                    anchorPrice: hit.anchorPrice ?? (original?.price ?? original?.entry ?? original?.p1?.price ?? null),
                };
                return;
            }
            const nearestLevel = findNearestLevel(price);
            if (nearestLevel?.id) {
                selectDrawing(nearestLevel.id);
            }
            return;
        }

        if (normalizedTool === 'trendline') {
            const time = param.time ?? candlesData[candlesData.length - 1]?.time;
            if (!draftTrendLine) {
                draftTrendLine = {
                    id: `draft-${Date.now()}`,
                    type: 'trendline',
                    p1: { time, price },
                    p2: { time, price },
                };
                redrawCanvasLayer();
                return;
            }
            const finalized = {
                ...draftTrendLine,
                p2: { time, price },
            };
            draftTrendLine = null;
            options.onDrawingCreated?.({
                ...finalized,
                type: 'trendline',
                sourceChartId: options.type,
            });
            activeTool = null;
            container.style.cursor = '';
            options.onToolUsed?.();
            return;
        }

        const entryCandle = candlesData[candlesData.length - 1];
        const base = { time: param.time ?? entryCandle.time, step: 3000 };
        const drawing = createDrawingFromTool(normalizedTool, { x: param.point.x, y: param.point.y }, geometry, base);
        if (drawing) {
            if (normalizedTool === 'long' || normalizedTool === 'short') {
                options.onDrawingCreated?.({
                    ...drawing,
                    type: 'position',
                    side: normalizedTool,
                    entryPrice: drawing.entry,
                    stopPrice: drawing.stop,
                    targetPrice: drawing.pt,
                    sourceChartId: options.type,
                });
            } else {
                options.onDrawingCreated?.({
                    ...drawing,
                    type: normalizedTool === 'hline' ? 'hline' : normalizedTool === 'ray' ? 'ray' : drawing.type,
                    price: drawing.price ?? price,
                    startTime: drawing.time ?? base.time,
                    sourceChartId: options.type,
                });
            }
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

    container.addEventListener('pointerdown', (event) => {
        if (activeTool || !event.isPrimary) return;
        const point = getPointerPoint(event);
        const hit = hitTestDrawing(point, [
            ...levels.map((level) => ({ id: level.id, type: 'hline', price: level.price })),
            ...horizontalRays.map((ray) => ({ id: ray.id, type: 'ray', time: ray.startTime, price: ray.price })),
            ...trendLines.map((line) => ({ id: line.id, type: 'trendline', p1: line.p1, p2: line.p2 })),
            ...positions.map((position) => ({ id: position.id, type: position.side, entry: position.entryPrice, stop: position.stopPrice, pt: position.targetPrice, entryTime: position.entryTime })),
        ], {
            width: container.clientWidth,
            toX: (time) => timeToDrawingCoordinate(time),
            fromX: (x) => normalizeChartTime(chart.timeScale().coordinateToTime(x)),
            toY: (value) => candlestickSeries.priceToCoordinate(value),
            fromY: (y) => candlestickSeries.coordinateToPrice(y),
        });
        if (!hit) return;
        event.preventDefault();
        event.stopPropagation();
        const original = findDrawingById(hit.id);
        selectDrawing(hit.id);
        dragState = {
            id: hit.id,
            mode: hit.mode,
            original,
            anchorTime: hit.anchorTime ?? (original?.time ?? original?.entryTime ?? original?.p1?.time ?? null),
            anchorPrice: hit.anchorPrice ?? (original?.price ?? original?.entry ?? original?.p1?.price ?? null),
        };
    }, { capture: true });

    container.addEventListener('pointermove', (event) => {
        if (activeTool === 'trendline' && draftTrendLine) {
            const point = getPointerPoint(event);
            const time = normalizeChartTime(chart.timeScale().coordinateToTime(point.x));
            const price = candlestickSeries.coordinateToPrice(point.y);
            if (Number.isFinite(time) && Number.isFinite(price)) {
                draftTrendLine.p2 = { time, price };
                redrawCanvasLayer();
            }
            return;
        }
        if (!dragState || activeTool) return;
        const point = getPointerPoint(event);
        event.preventDefault();
        event.stopPropagation();
        updateDraggedDrawing(point);
    }, { capture: true });

    window.addEventListener('pointerup', () => {
        dragState = null;
    });

    window.addEventListener('keydown', (event) => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;

        if (event.key === 'Escape') {
            dragState = null;
            draftTrendLine = null;
            selectedDrawingId = null;
            activeTool = null;
            container.style.cursor = '';
            options.onToolUsed?.();
            applySelectionStyles();
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            if (!selectedDrawingId) return;
            const idToRemove = selectedDrawingId;
            const removeMatch = (list) => {
                const idx = list.findIndex((item) => item.id === idToRemove);
                if (idx >= 0) list.splice(idx, 1);
            };
            removeMatch(levels);
            removeMatch(horizontalRays);
            removeMatch(trendLines);
            removeMatch(positions);
            selectedDrawingId = null;
            applySelectionStyles();
            options.onDrawingSelected?.(null);
        }
    });

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
            activeTool = normalizeTool(mode);
            if (activeTool !== 'trendline') {
                draftTrendLine = null;
            }
            container.style.cursor = activeTool ? 'crosshair' : '';
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
