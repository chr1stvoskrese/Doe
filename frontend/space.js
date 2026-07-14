/* ============================================================
   🌌 DoeSpace — бесконечный векторный холст (High-Performance Edition)
   ============================================================ */
(function () {
    'use strict';

    // ---------- i18n ----------
    try {
        translations.ru.space = {
            extName: 'Space — холст', fit: 'Показать всё',
            toolSelect: 'Выбор и перемещение (V)', toolPen: 'Перо (P)', toolEraser: 'Ластик (E)',
            toolText: 'Текст (T)', toolConnector: 'Соединитель (C)', toolImage: 'Изображение',
            title: 'Пространство', toolShape: 'Фигуры (S)', toolFill: 'Заливка (G)', stroke: 'Контур', fill: 'Заливка', noFill: 'Убрать заливку',
            toolAttach: 'Прикрепить карточку', penColor: 'Цвет', penSize: 'Толщина',
            colorTitle: 'Выбор цвета', dropHint: 'Бросьте изображение сюда',
            attachPlaceholder: 'Найти карточку...',
            secCards: 'Карточки', secColumns: 'Колонки', secTabs: 'Вкладки',
            nothing: 'Ничего не найдено', textPlaceholder: 'Текст (поддерживается Markdown)…',
            missing: 'недоступно',
            addTab: 'Новое пространство', newTabBase: 'Пространство',
            toVector: 'Превратить в статичный вектор', openInSpace: 'Открыть в Пространстве',
            pickCard: 'В какую карточку поместить?', vectorLabel: 'Векторный фрагмент',
            vectorPlaced: 'Вектор добавлен в карточку', vectorFail: 'Не удалось создать вектор'
        };
        translations.en.space = {
            extName: 'Space — canvas', fit: 'Fit to content',
            toolSelect: 'Select & move (V)', toolPen: 'Pen (P)', toolEraser: 'Eraser (E)',
            toolText: 'Text (T)', toolConnector: 'Connector (C)', toolImage: 'Image',
            title: 'Space', toolShape: 'Shapes (S)', toolFill: 'Fill (G)', stroke: 'Stroke', fill: 'Fill', noFill: 'Remove fill',
            toolAttach: 'Attach a card', penColor: 'Color', penSize: 'Thickness',
            colorTitle: 'Pick color', dropHint: 'Drop image here',
            attachPlaceholder: 'Find a card...',
            secCards: 'Cards', secColumns: 'Columns', secTabs: 'Tabs',
            nothing: 'Nothing found', textPlaceholder: 'Text (Markdown supported)…',
            missing: 'unavailable',
            addTab: 'New space', newTabBase: 'Space',
            toVector: 'Convert to static vector', openInSpace: 'Open in Space',
            pickCard: 'Which card to place it in?', vectorLabel: 'Vector snippet',
            vectorPlaced: 'Vector added to the card', vectorFail: 'Failed to create vector'
        };
    } catch (e) {}

    const $ = (id) => document.getElementById(id);
    const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

    const GRID = 26;

    const S = {
        items: [], view: { x: 0, y: 0, scale: 1 },
        tool: 'select', penColor: '#7C5CB7', penSize: 3,
        shapeKind: 'rect',
        selectedId: null, selectedIds: [], loaded: false, dirty: false,
        saveTimer: null, open: false, connFrom: null,
        undoStack: [], redoStack: [],
        // Мультиспейс: вкладки-Пространства.
        spaces: [], activeSpaceId: null
    };
    const newSpaceId = () => 'sp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let lastSavedState = "[]";

    // DOM Кэш (для отказа от innerHTML = '')
    let viewport, world, svg, gridEl, connLayer, shapeLayer, strokeLayer, uiLayer, overlay;
    let selBoxPool = [], selRh = null, marqueeEl = null;
    const boardCache = {};

    function commitSpaceState() {
        const currentState = JSON.stringify(serializeItems());
        if (currentState !== lastSavedState) {
            S.undoStack.push(JSON.parse(lastSavedState));
            if (S.undoStack.length > 50) S.undoStack.shift(); 
            S.redoStack = [];
            lastSavedState = currentState;
            markDirty();
        }
    }

    function undoSpace() {
        if (S.undoStack.length === 0) return;
        if (drag) drag = null;
        const currentState = JSON.stringify(serializeItems());
        S.redoStack.push(JSON.parse(currentState));
        S.items = S.undoStack.pop();
        lastSavedState = JSON.stringify(serializeItems());
        S.selectedId = null; S.selectedIds = [];
        renderAll();
        markDirty();
    }

    function redoSpace() {
        if (S.redoStack.length === 0) return;
        if (drag) drag = null;
        const currentState = JSON.stringify(serializeItems());
        S.undoStack.push(JSON.parse(currentState));
        S.items = S.redoStack.pop();
        lastSavedState = JSON.stringify(serializeItems());
        S.selectedId = null; S.selectedIds = [];
        renderAll();
        markDirty();
    }

    const toWorld = (cx, cy) => {
        const r = viewport.getBoundingClientRect();
        return {
            x: (cx - r.left - S.view.x) / S.view.scale,
            y: (cy - r.top - S.view.y) / S.view.scale,
        };
    };

    // Сетку держим ровно на размер вьюпорта (+запас) и снапим к шагу сетки.
    // Маленький слой внутри world → нет ни дрожания, ни GPU-глитчей при сильном зуме.
    function updateGrid() {
        if (!gridEl) return;
        const sc = S.view.scale || 1, m = GRID * 4;
        const vwW = viewport.clientWidth / sc, vhW = viewport.clientHeight / sc;
        const wx0 = -S.view.x / sc, wy0 = -S.view.y / sc;
        const gx = Math.floor((wx0 - m) / GRID) * GRID, gy = Math.floor((wy0 - m) / GRID) * GRID;
        gridEl.style.left = gx + 'px'; gridEl.style.top = gy + 'px';
        gridEl.style.width = (vwW + m * 2) + 'px'; gridEl.style.height = (vhW + m * 2) + 'px';
    }

    function applyView() {
        // Всегда рендерим вектор на реальном разрешении: без bitmap-кэша (will-change),
        // поэтому нет ни дрожания точек при зуме, ни отложенного "повышения резкости".
        world.style.transform = `translate(${S.view.x}px, ${S.view.y}px) scale(${S.view.scale})`;
        updateGrid();

        const zl = $('space-zoom-label');
        if (zl) zl.textContent = Math.round(S.view.scale * 100) + '%';
        renderSelectionUI();
    }

    function zoomAt(cx, cy, factor) {
        const r = viewport.getBoundingClientRect();
        const px = cx - r.left, py = cy - r.top;
        const ns = clamp(S.view.scale * factor, 0.08, 6);
        S.view.x = px - (px - S.view.x) * (ns / S.view.scale);
        S.view.y = py - (py - S.view.y) * (ns / S.view.scale);
        S.view.scale = ns;
        applyView();
        markDirty();
    }

    function markDirty() {
        S.dirty = true;
        clearTimeout(S.saveTimer);
        S.saveTimer = setTimeout(saveNow, 700);
    }

    function serializeItems() {
        return S.items.map(it => {
            const o = {};
            for (const k in it) if (k[0] !== '_') o[k] = it[k];
            return o;
        });
    }

    // Синхронизируем текущий холст (S.items/S.view) в активную вкладку-Пространство.
    function syncActiveIntoSpaces() {
        const sp = S.spaces.find(s => s.id === S.activeSpaceId);
        if (sp) { sp.items = serializeItems(); sp.view = S.view; }
    }

    async function saveNow() {
        if (!S.dirty) return;
        S.dirty = false;
        syncActiveIntoSpaces();
        try {
            await fetch(`/api/v1/system/space`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    spaces: S.spaces.map(sp => ({
                        id: sp.id,
                        name: sp.name || '',
                        items: Array.isArray(sp.items) ? sp.items : [],
                        view: sp.view || null
                    })),
                    activeSpaceId: S.activeSpaceId
                }),
            });
        } catch (e) { S.dirty = true; }
    }

    function spaceDefaultName(n) {
        const base = (t('space.newTabBase') || 'Пространство');
        return `${base} ${n}`;
    }

    // Загружаем активную вкладку в рабочий холст.
    function loadActiveSpaceIntoCanvas() {
        const sp = S.spaces.find(s => s.id === S.activeSpaceId) || S.spaces[0];
        S.items = sp && Array.isArray(sp.items) ? JSON.parse(JSON.stringify(sp.items)) : [];
        S.view = (sp && sp.view) ? sp.view : { x: 0, y: 0, scale: 1 };
        S.selectedId = null; S.selectedIds = [];
        S.undoStack = []; S.redoStack = [];
        lastSavedState = JSON.stringify(serializeItems());
    }

    async function loadSpace() {
        try {
            const res = await fetch(`/api/v1/system/space?t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                S.spaces = Array.isArray(data.spaces) ? data.spaces : [];
                S.activeSpaceId = data.activeSpaceId || null;
            }
        } catch (e) { S.spaces = []; }
        if (!S.spaces.length) {
            S.spaces = [{ id: newSpaceId(), name: spaceDefaultName(1), items: [], view: null }];
            S.activeSpaceId = S.spaces[0].id;
        }
        if (!S.spaces.find(s => s.id === S.activeSpaceId)) S.activeSpaceId = S.spaces[0].id;
        loadActiveSpaceIntoCanvas();
        S.loaded = true;
    }

    // ---------- Вкладки-Пространства ----------
    function switchSpace(id) {
        if (id === S.activeSpaceId) return;
        syncActiveIntoSpaces();
        S.activeSpaceId = id;
        loadActiveSpaceIntoCanvas();
        renderAll(); renderSpaceTabs(); fitToContent(); setTool('select');
        markDirty();
    }

    function addSpace() {
        syncActiveIntoSpaces();
        // Номер по умолчанию — на 1 больше текущего количества (без коллизий с именами).
        const sp = { id: newSpaceId(), name: spaceDefaultName(S.spaces.length + 1), items: [], view: null };
        S.spaces.push(sp);
        S.activeSpaceId = sp.id;
        loadActiveSpaceIntoCanvas();
        renderAll(); renderSpaceTabs(); fitToContent(); setTool('select');
        markDirty();
    }

    function deleteSpace(id) {
        if (S.spaces.length <= 1) return; // всегда оставляем хотя бы одно Пространство
        const idx = S.spaces.findIndex(s => s.id === id);
        if (idx === -1) return;
        S.spaces.splice(idx, 1);
        if (S.activeSpaceId === id) {
            S.activeSpaceId = S.spaces[Math.max(0, idx - 1)].id;
            loadActiveSpaceIntoCanvas();
            renderAll(); fitToContent(); setTool('select');
        }
        renderSpaceTabs(); markDirty();
    }

    // Переименование вкладки — механика идентична вкладкам доски (inline input, Enter/Escape).
    function startRenameTab(tabEl, sp) {
        const titleSpan = tabEl.querySelector('.tab-name');
        if (!titleSpan || tabEl.classList.contains('is-renaming')) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tab-name-input';
        input.value = sp.name || '';
        input.spellcheck = false;
        input.autocomplete = 'off';

        titleSpan.replaceWith(input);
        tabEl.classList.add('is-renaming');
        setTimeout(() => { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); }, 10);

        let committed = false;
        const restore = (title) => {
            const span = document.createElement('span');
            span.className = 'tab-name';
            span.textContent = title;
            span.dataset.fullTitle = title;
            if (input.parentNode) input.replaceWith(span);
            tabEl.classList.remove('is-renaming');
            span.addEventListener('dblclick', (e) => { e.stopPropagation(); startRenameTab(tabEl, sp); });
        };
        const commit = () => {
            if (committed) return; committed = true;
            const v = input.value.trim();
            const finalName = v || sp.name || '';
            restore(finalName);
            if (v && v !== sp.name) { sp.name = v; markDirty(); }
        };
        const cancel = () => { if (committed) return; committed = true; restore(sp.name || ''); };

        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', () => setTimeout(() => { if (!committed) commit(); }, 120));
    }

    function renderSpaceTabs() {
        const bar = $('space-tabs'); if (!bar) return;
        bar.innerHTML = '';
        S.spaces.forEach(sp => {
            const tab = document.createElement('div');
            tab.className = 'board-tab' + (sp.id === S.activeSpaceId ? ' active' : '');
            tab.dataset.spaceId = sp.id;
            const canDelete = S.spaces.length > 1;
            const name = sp.name || '—';
            tab.innerHTML = `
                <span class="tab-name" data-full-title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                <button class="tab-close-btn ${!canDelete ? 'hidden' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>`;
            tab.addEventListener('click', (e) => {
                if (e.target.closest('.tab-close-btn')) return;
                switchSpace(sp.id);
            });
            tab.querySelector('.tab-name').addEventListener('dblclick', (e) => { e.stopPropagation(); startRenameTab(tab, sp); });
            if (canDelete) {
                tab.querySelector('.tab-close-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteSpace(sp.id); });
            }
            bar.appendChild(tab);
        });
        const add = document.createElement('button');
        add.className = 'add-tab-btn';
        add.title = t('space.addTab') || 'Новое пространство';
        add.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        add.addEventListener('click', addSpace);
        bar.appendChild(add);
    }

    // Перенос выделенных элементов в другое Пространство (перетаскиванием на вкладку).
    function moveSelectionToSpace(targetId) {
        if (!targetId || targetId === S.activeSpaceId) return false;
        const target = S.spaces.find(s => s.id === targetId);
        if (!target) return false;
        const ids = new Set(S.selectedIds);
        if (!ids.size) return false;

        const moving = S.items.filter(it => ids.has(it.id) && it.type !== 'connector');
        // Коннекторы переносим только если оба конца тоже переносятся.
        const movingConns = S.items.filter(it => it.type === 'connector' && ids.has(it.from) && ids.has(it.to));
        const all = [...moving, ...movingConns];
        if (!all.length) return false;

        const moveSet = new Set(all.map(i => i.id));
        const nodeSet = new Set(moving.map(i => i.id));
        // Убираем перенесённые элементы и любые коннекторы, ведущие к ним.
        S.items = S.items.filter(it => !moveSet.has(it.id) && !(it.type === 'connector' && (nodeSet.has(it.from) || nodeSet.has(it.to))));

        if (!Array.isArray(target.items)) target.items = [];
        const serialized = all.map(it => { const o = {}; for (const k in it) if (k[0] !== '_') o[k] = it[k]; return o; });
        target.items.push(...serialized);

        S.selectedId = null; S.selectedIds = [];
        renderAll(); renderSelectionUI();
        // Перенос между Пространствами затрагивает два холста, а undo хранит только текущий.
        // Чтобы Ctrl+Z не «продублировал» перенесённые элементы (вернув их в источник, оставив в цели),
        // делаем перенос чистым чекпойнтом и сбрасываем историю отмен.
        S.undoStack = []; S.redoStack = [];
        lastSavedState = JSON.stringify(serializeItems());
        markDirty();
        if (window.showToast) {
            const nm = target.name || '';
            window.showToast(t('space.title') || 'Пространство', nm, false);
        }
        return true;
    }

    // Пока идёт перетаскивание — подсвечиваем вкладку под курсором как цель дропа.
    function highlightTabDropTarget(clientX, clientY) {
        const bar = $('space-tabs'); if (!bar) return null;
        let target = null;
        const tabs = bar.querySelectorAll('.board-tab');
        for (let i = 0; i < tabs.length; i++) {
            const rect = tabs[i].getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
                if (tabs[i].dataset.spaceId && tabs[i].dataset.spaceId !== S.activeSpaceId) target = tabs[i];
                break;
            }
        }
        bar.querySelectorAll('.board-tab.space-tab-drop-target').forEach(tt => { if (tt !== target) tt.classList.remove('space-tab-drop-target'); });
        if (target) target.classList.add('space-tab-drop-target');
        return target;
    }
    function clearTabDropTarget() {
        const bar = $('space-tabs'); if (bar) bar.querySelectorAll('.board-tab.space-tab-drop-target').forEach(tt => tt.classList.remove('space-tab-drop-target'));
    }

    const SVGNS = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs) {
        const el = document.createElementNS(SVGNS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }

    // Квадратичные кривые Безье вместо Catmull-Rom (выглядит так же, работает в 2 раза быстрее)
    function smoothPathFast(pts) {
        if (!pts || !pts.length) return '';
        if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[0][0] + 0.1} ${pts[0][1] + 0.1}`;
        let d = `M ${pts[0][0]} ${pts[0][1]}`;
        for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i][0] + pts[i + 1][0]) / 2;
            const yc = (pts[i][1] + pts[i + 1][1]) / 2;
            d += ` Q ${pts[i][0]} ${pts[i][1]}, ${xc} ${yc}`;
        }
        d += ` L ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
        return d;
    }

    // ===== Контур заливки штриха =====
    // Пользователь редко замыкает контур идеально: обычно линия пересекает сама
    // себя чуть раньше конца, и за точкой пересечения торчат "хвосты". Заливать
    // нужно ТОЛЬКО замкнутую петлю (от самопересечения до самопересечения),
    // а не путь, тупо замкнутый Z от последней точки к первой — иначе хвосты
    // становятся частью контура и заливаются лишние области.

    function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
        const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
        const den = d1x * d2y - d1y * d2x;
        if (!den) return null;
        const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den;
        const u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) return null;
        return [ax + t * d1x, ay + t * d1y];
    }

    function polyArea(p) {
        let s = 0;
        for (let i = 0; i < p.length; i++) {
            const a = p[i], b = p[(i + 1) % p.length];
            s += a[0] * b[1] - b[0] * a[1];
        }
        return s / 2;
    }

    function pointInPoly(x, y, p) {
        let inside = false;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
            const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    // Извлекает замкнутую петлю штриха: ищет самопересечения ломаной и возвращает
    // точки петли между ними (хвосты до/после отбрасываются). Из всех петель
    // берётся самая большая по площади. Нет самопересечений — вся ломаная
    // (неявное замыкание последняя→первая, как раньше).
    function strokeLoopPoints(pts) {
        const n = pts.length;
        if (n < 4) return pts;
        let best = null, bestArea = 0;
        for (let i = 0; i < n - 2; i++) {
            for (let j = i + 2; j < n - 1; j++) {
                const X = segIntersect(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1],
                                       pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]);
                if (!X) continue;
                const loop = [X, ...pts.slice(i + 1, j + 1)];
                if (loop.length < 3) continue;
                const area = Math.abs(polyArea(loop));
                if (area > bestArea) { bestArea = area; best = loop; }
            }
        }
        return best || pts;
    }

    // Кэш петель: точки штриха заменяются целиком при перемещении/масштабе
    // (новый массив) и дополняются push'ем при рисовании (меняется length) —
    // обе ситуации инвалидируют кэш.
    const _strokeLoopCache = new WeakMap();
    function getStrokeLoop(it) {
        const pts = it.points;
        const c = _strokeLoopCache.get(pts);
        if (c && c.n === pts.length) return c.loop;
        const loop = strokeLoopPoints(pts);
        _strokeLoopCache.set(pts, { n: pts.length, loop });
        return loop;
    }

    function renderMd(text) {
        const raw = text || '';
        try {
            if (window.marked) {
                var html = marked.parse(raw, { breaks: true });
                // 🔐 БЕЗОПАСНОСТЬ: marked отдаёт HTML как есть (raw HTML в заметке
                // проходит насквозь). Без очистки текст элемента «Пространства»
                // с `<img src=x onerror=...>`/`<script>` выполнил бы код в WebView,
                // а через мост window.pywebview — нативные операции. Прогоняем
                // через тот же DOM-санитайзер, что и описания карточек (app.js).
                if (typeof sanitizeRenderedHtml === 'function') return sanitizeRenderedHtml(html);
                return escapeHtml(raw).replace(/\n/g, '<br>');
            }
        } catch (e) {}
        return escapeHtml(raw).replace(/\n/g, '<br>');
    }

    function strokeBBox(it) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of it.points) {
            if (x < minX) minX = x; if (y < minY) minY = y;
            if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        }
        const pad = (it.width || 3) / 2 + 2;
        return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
    }

    function rectOf(it) {
        if (it.type === 'stroke') return strokeBBox(it);
        if (it.type === 'shape') {
            // w/h у линий/стрелок могут быть отрицательными — нормализуем в положительную рамку
            const x = Math.min(it.x, it.x + it.w), y = Math.min(it.y, it.y + it.h);
            return { x, y, w: Math.max(1, Math.abs(it.w)), h: Math.max(1, Math.abs(it.h)) };
        }
        const w = it.w || it._w || 200, h = it.h || it._h || 60;
        return { x: it.x, y: it.y, w, h };
    }

    function renderItem(it) {
        if (it.type === 'stroke') return renderStroke(it);
        if (it.type === 'shape') return renderShape(it);
        if (it.type === 'connector') return;
        return renderNode(it);
    }

    const CLOSED_SHAPES = ['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star'];
    const isClosedShape = (it) => it.type === 'shape' && CLOSED_SHAPES.includes(it.shape || 'rect');

    function shapePathD(it) {
        const x = it.x, y = it.y, w = it.w, h = it.h, k = it.shape || 'rect';
        if (k === 'ellipse') {
            const rx = w / 2, ry = h / 2, cy = y + ry;
            return `M ${x} ${cy} a ${rx} ${ry} 0 1 0 ${w} 0 a ${rx} ${ry} 0 1 0 ${-w} 0 Z`;
        }
        if (k === 'triangle') return `M ${x + w / 2} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
        if (k === 'diamond') return `M ${x + w / 2} ${y} L ${x + w} ${y + h / 2} L ${x + w / 2} ${y + h} L ${x} ${y + h / 2} Z`;
        if (k === 'line' || k === 'arrow') return `M ${x} ${y} L ${x + w} ${y + h}`; // открытые (w,h могут быть отрицательными)
        if (k === 'hexagon' || k === 'star') {
            const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
            const pts = [];
            if (k === 'hexagon') {
                for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); pts.push(`${cx + rx * Math.cos(a)} ${cy + ry * Math.sin(a)}`); }
            } else {
                for (let i = 0; i < 10; i++) { const a = Math.PI / 180 * (36 * i - 90), rr = (i % 2 ? 0.42 : 1); pts.push(`${cx + rx * rr * Math.cos(a)} ${cy + ry * rr * Math.sin(a)}`); }
            }
            return 'M ' + pts.join(' L ') + ' Z';
        }
        return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`; // rect
    }

    function renderShape(it) {
        let p = shapeLayer.querySelector(`path[data-id="${it.id}"]`);
        if (!p) {
            p = svgEl('path', { 'data-id': it.id });
            p.classList.add('space-shape');
            shapeLayer.appendChild(p);
        }
        p.setAttribute('d', shapePathD(it));
        p.setAttribute('stroke', it.color || S.penColor);
        p.setAttribute('stroke-width', it.width || S.penSize || 3);
        // Заливка — только у замкнутых фигур
        p.style.fill = isClosedShape(it) ? (it.fill || 'none') : 'none';
        if (it.shape === 'arrow') p.setAttribute('marker-end', 'url(#space-arrowhead)'); else p.removeAttribute('marker-end');
        p.classList.toggle('selected', S.selectedIds.includes(it.id));
    }

    function renderStroke(it) {
        let p = strokeLayer.querySelector(`path[data-id="${it.id}"]`);
        if (!p) {
            p = svgEl('path', { 'data-id': it.id, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
            p.classList.add('space-stroke');
            strokeLayer.appendChild(p);
        }
        // Линия штриха рисуется целиком (с хвостами), но НЕ заливается сама:
        // заливка — отдельный path по замкнутой петле (см. strokeLoopPoints),
        // подложенный под линию. Так хвосты за точкой самопересечения видны,
        // но в контур заливки не входят.
        p.setAttribute('d', smoothPathFast(it.points));
        p.setAttribute('stroke', it.color || S.penColor);
        p.setAttribute('stroke-width', it.width || 3);
        p.style.fill = 'none';
        p.classList.toggle('selected', S.selectedIds.includes(it.id));

        let f = strokeLayer.querySelector(`path[data-fill-id="${it.id}"]`);
        if (it.fill) {
            if (!f) {
                f = svgEl('path', { 'data-fill-id': it.id, stroke: 'none' });
                strokeLayer.insertBefore(f, p);
            }
            f.setAttribute('d', smoothPathFast(getStrokeLoop(it)) + ' Z');
            f.style.fill = it.fill;
        } else if (f) {
            f.remove();
        }
    }

    function renderNode(it) {
        let el = world.querySelector(`.space-item[data-id="${it.id}"]`);
        if (!el) {
            el = document.createElement('div');
            el.className = `space-item space-item-${it.type}`;
            el.dataset.id = it.id; el.dataset.type = it.type;
            world.appendChild(el);
            buildNodeContent(el, it);
        }
        el.style.left = it.x + 'px';
        el.style.top = it.y + 'px';
        if (it.type === 'text') { el.style.width = (it.w || 260) + 'px'; }
        else if (it.type === 'image') { el.style.width = it.w + 'px'; el.style.height = it.h + 'px'; }

        el.classList.toggle('selected', S.selectedIds.includes(it.id));
        measureNode(it, el);
    }

    function measureNode(it, el) {
        el = el || world.querySelector(`.space-item[data-id="${it.id}"]`);
        if (!el) return;
        // Эмбеды масштабируются через transform на holder — layout-размер его не учитывает,
        // поэтому домножаем на it.scale, чтобы рамка выделения совпадала с видимым размером.
        const sc = (['card', 'column', 'tab'].includes(it.type) && it.scale) ? it.scale : 1;
        it._w = el.offsetWidth * sc; it._h = el.offsetHeight * sc;
    }

    function buildNodeContent(el, it) {
        if (it.type === 'text') {
            const body = document.createElement('div');
            body.className = 'space-text-body md-content';
            body.innerHTML = renderMd(it.text);
            if (it.color) body.style.color = it.color;
            el.appendChild(body);
        } else if (it.type === 'image') {
            const img = document.createElement('img');
            img.src = '/' + String(it.src).split('/').map(encodeURIComponent).join('/');
            img.draggable = false;
            el.appendChild(img);
            // Ресайз изображения — через единую угловую ручку выделения (как у остальных элементов)
        } else if (['card', 'column', 'tab'].includes(it.type)) {
            const holder = document.createElement('div');
            holder.className = 'space-embed-holder';
            el.appendChild(holder);
            const loading = document.createElement('div');
            loading.className = 'space-embed-loading'; loading.textContent = '…';
            holder.appendChild(loading);
            buildEmbed(it, holder);
        }
    }

    function addResizeHandle(el, cls) {
        const h = document.createElement('div');
        h.className = cls ? ('space-resize-handle ' + cls) : 'space-resize-handle';
        h.dataset.role = 'resize';
        el.appendChild(h);
    }

    async function getBoardColumns(wsId) {
        if (boardCache[wsId]) return boardCache[wsId];
        try {
            const res = await fetch(`/api/v1/columns/?workspace_id=${wsId}`);
            if (res.ok) {
                boardCache[wsId] = await res.json();
                return boardCache[wsId];
            }
        } catch (e) {}
        return [];
    }

    function embedMissing(it) {
        // Показываем сохранённый заголовок и пометку, а не безликое «—»
        const label = escapeHtml(it.title || '') || '—';
        return `<div class="space-embed-missing"><span class="space-embed-missing-title">${label}</span><span class="space-embed-missing-note">${t('space.missing') || 'недоступно'}</span></div>`;
    }

    async function buildEmbed(it, holder) {
        holder.style.transform = (it.scale && it.scale !== 1) ? `scale(${it.scale})` : '';
        try {
            const cols = it.workspaceId != null ? await getBoardColumns(it.workspaceId) : [];
            holder.innerHTML = '';
            if (it.type === 'card') {
                let task = null, mode = 'default';
                // Ищем карточку и среди подзадач (чек-листа), а не только среди верхнеуровневых
                outer: for (const c of cols) {
                    for (const tk of (c.tasks || [])) {
                        if (String(tk.id) === String(it.taskId)) { task = tk; mode = c.mode; break outer; }
                        const sub = (tk.subtasks || []).find(s => String(s.id) === String(it.taskId));
                        if (sub) { task = sub; mode = c.mode; break outer; }
                    }
                }
                if (!task) { holder.innerHTML = embedMissing(it); }
                else if (typeof generateCardHtml === 'function') {
                    const list = document.createElement('div');
                    list.className = 'card-list space-embed-cardlist';
                    list.innerHTML = generateCardHtml(task, mode);
                    holder.appendChild(list);
                } else holder.textContent = task.title || '';
            } else if (it.type === 'column') {
                const col = cols.find(c => String(c.id) === String(it.columnId));
                if (!col) { holder.innerHTML = embedMissing(it); }
                else { appendColumn(holder, col); }
            } else if (it.type === 'tab') {
                if (!cols.length && it.workspaceId != null) { holder.innerHTML = embedMissing(it); }
                else {
                    const board = document.createElement('div');
                    board.className = 'space-embed-board';
                    cols.forEach(col => appendColumn(board, col));
                    holder.appendChild(board);
                }
            }
        } catch (e) { holder.innerHTML = embedMissing(it); }

        const el = world.querySelector(`.space-item[data-id="${it.id}"]`);
        if (el) measureNode(it, el);
        // Центрируем новый эмбед по вьюпорту уже после того, как узнали его реальный размер.
        // Коммитим состояние только при первичной вставке (а не при каждом обновлении доски).
        if (it._centerPending && el) {
            it.x = it._centerPending.cx - (it._w || 0) / 2;
            it.y = it._centerPending.cy - (it._h || 0) / 2;
            delete it._centerPending;
            el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
            commitSpaceState(); markDirty();
        }
        renderConnectors(); renderSelectionUI();
    }

    function appendColumn(parent, col) {
        try {
            if (typeof createColumnElement === 'function') {
                const clone = Object.assign({}, col, { collapsed: false });
                const colEl = createColumnElement(clone);
                colEl.classList.remove('collapsed');
                parent.appendChild(colEl);
            }
        } catch (e) {
            const d = document.createElement('div');
            d.className = 'space-embed-missing'; d.textContent = col.title || '—';
            parent.appendChild(d);
        }
    }

    window.__spaceRefreshEmbeds = function () {
        if (!S.open) return;
        for (const k in boardCache) delete boardCache[k];
        S.items.forEach(it => {
            if (['card', 'column', 'tab'].includes(it.type)) {
                const el = world.querySelector(`.space-item[data-id="${it.id}"]`);
                const holder = el?.querySelector('.space-embed-holder');
                if (holder) buildEmbed(it, holder);
            }
        });
    };

    function anchor(rect, side) {
        switch (side) {
            case 't': return { x: rect.x + rect.w / 2, y: rect.y, nx: 0, ny: -1 };
            case 'b': return { x: rect.x + rect.w / 2, y: rect.y + rect.h, nx: 0, ny: 1 };
            case 'l': return { x: rect.x, y: rect.y + rect.h / 2, nx: -1, ny: 0 };
            case 'r': return { x: rect.x + rect.w, y: rect.y + rect.h / 2, nx: 1, ny: 0 };
        }
        return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, nx: 0, ny: 0 };
    }

    function autoSides(ra, rb) {
        const dx = (rb.x + rb.w / 2) - (ra.x + ra.w / 2), dy = (rb.y + rb.h / 2) - (ra.y + ra.h / 2);
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ['r', 'l'] : ['l', 'r']) : (dy > 0 ? ['b', 't'] : ['t', 'b']);
    }

    function connectorPathD(a, b) {
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const off = clamp(dist * 0.4, 30, 160);
        return `M ${a.x} ${a.y} C ${a.x + a.nx * off} ${a.y + a.ny * off} ${b.x + b.nx * off} ${b.y + b.ny * off} ${b.x} ${b.y}`;
    }

    function renderConnectors() {
        const alive = new Set(S.items.map(i => i.id));
        const neededIds = new Set();
        let pruned = false;
        
        for (const it of S.items) {
            if (it.type !== 'connector') continue;
            const A = S.items.find(i => i.id === it.from), B = S.items.find(i => i.id === it.to);
            if (!A || !B) { pruned = true; continue; }
            neededIds.add(it.id);
            
            const ra = rectOf(A), rb = rectOf(B);
            let [sa, sb] = autoSides(ra, rb);
            const a = anchor(ra, it.fromPort || sa), b = anchor(rb, it.toPort || sb);
            
            let p = connLayer.querySelector(`path[data-id="${it.id}"]`);
            if (!p) {
                p = svgEl('path', { 'data-id': it.id, fill: 'none', 'marker-end': 'url(#space-arrow)' });
                p.classList.add('space-conn');
                connLayer.appendChild(p);
            }
            p.setAttribute('d', connectorPathD(a, b));
            p.style.stroke = it.color || 'var(--text-secondary)';
            p.classList.toggle('selected', it.id === S.selectedId);
        }
        
        // Удаляем старые
        Array.from(connLayer.children).forEach(p => {
            if (p.dataset.id && !neededIds.has(p.dataset.id) && !p.classList.contains('space-conn-temp')) p.remove();
        });
        
        if (pruned) S.items = S.items.filter(i => !(i.type === 'connector' && (!alive.has(i.from) || !alive.has(i.to))));
    }

    function drawTempConnector(a, bx, by) {
        let p = connLayer.querySelector('.space-conn-temp');
        if (!p) {
            p = svgEl('path', { fill: 'none', 'marker-end': 'url(#space-arrow)' });
            p.classList.add('space-conn', 'space-conn-temp');
            connLayer.appendChild(p);
        }
        p.setAttribute('d', connectorPathD(a, { x: bx, y: by, nx: 0, ny: 0 }));
    }
    function clearTempConnector() { connLayer.querySelector('.space-conn-temp')?.remove(); }

    function renderAll() {
        strokeLayer.innerHTML = '';
        shapeLayer.innerHTML = '';
        world.querySelectorAll('.space-item').forEach(n => n.remove());
        S.items.forEach(renderItem);
        renderConnectors();
        renderSelectionUI();
    }

    function getItem(id) { return S.items.find(i => i.id === id); }

    function applySelectionClasses() {
        const set = new Set(S.selectedIds);
        world.querySelectorAll('.space-item').forEach(n => n.classList.toggle('selected', set.has(n.dataset.id)));
        strokeLayer.querySelectorAll('path').forEach(p => p.classList.toggle('selected', set.has(p.dataset.id)));
        shapeLayer.querySelectorAll('path').forEach(p => p.classList.toggle('selected', set.has(p.dataset.id)));
    }

    function select(id) {
        S.selectedId = id;
        S.selectedIds = id ? [id] : [];
        applySelectionClasses();
        renderConnectors();
        renderSelectionUI();
        reflectPickerForItem(getItem(id));
    }

    // Множественное выделение (результат рамки-marquee)
    function selectMany(ids) {
        S.selectedIds = ids.slice();
        S.selectedId = ids.length === 1 ? ids[0] : null;
        applySelectionClasses();
        renderConnectors();
        renderSelectionUI();
        if (S.selectedId) reflectPickerForItem(getItem(S.selectedId));
    }

    function rectsIntersect(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }
    function itemsInRect(rect) {
        const ids = [];
        for (const it of S.items) {
            if (it.type === 'connector') continue;
            if (rectsIntersect(rect, rectOf(it))) ids.push(it.id);
        }
        return ids;
    }

    function renderSelectionUI() {
        // Только выделяемые элементы (не коннекторы, не в режиме редактирования текста)
        const ids = S.selectedIds.filter(id => {
            const it = getItem(id);
            if (!it || it.type === 'connector') return false;
            const el = world.querySelector(`.space-item[data-id="${id}"]`);
            return !(el && el.classList.contains('editing'));
        });

        const bw = 1.5 / S.view.scale;
        // Пул рамок под каждый выделенный элемент
        while (selBoxPool.length < ids.length) {
            const b = document.createElement('div'); b.className = 'space-sel-box';
            uiLayer.appendChild(b); selBoxPool.push(b);
        }
        for (let i = 0; i < selBoxPool.length; i++) {
            const b = selBoxPool[i];
            if (i >= ids.length) { b.style.display = 'none'; continue; }
            const r = rectOf(getItem(ids[i]));
            b.style.display = 'block';
            b.style.left = `${r.x}px`; b.style.top = `${r.y}px`;
            b.style.width = `${r.w}px`; b.style.height = `${r.h}px`;
            b.style.borderWidth = `${bw}px`;
        }

        // Ручка ресайза — только при одиночном выделении
        if (!selRh) {
            selRh = document.createElement('div'); selRh.className = 'space-ui-resize'; selRh.dataset.role = 'resize';
            uiLayer.appendChild(selRh);
        }
        // Единая ручка ресайза в правом-нижнем углу для любого одиночного объекта
        if (ids.length === 1) {
            const it = getItem(ids[0]), r = rectOf(it);
            const s = 12 / S.view.scale, bwHandle = 2 / S.view.scale;
            selRh.style.display = 'block';
            selRh.style.width = selRh.style.height = `${s}px`;
            selRh.style.borderWidth = `${bwHandle}px`;
            selRh.style.left = `${r.x + r.w - s / 2}px`; selRh.style.top = `${r.y + r.h - s / 2}px`;
            // Курсор соответствует характеру ресайза: текст — только ширина
            selRh.style.cursor = (it.type === 'text') ? 'ew-resize' : 'nwse-resize';
        } else {
            selRh.style.display = 'none';
        }
    }

    function deleteItem(id) {
        const it = getItem(id);
        if (!it) return;
        
        // Визуальный фидбек удаления (затухание)
        const el = world.querySelector(`.space-item[data-id="${id}"]`);
        if (el) { el.style.transition = 'opacity 0.2s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }
        
        S.items = S.items.filter(i => i.id !== id);
        S.items = S.items.filter(i => !(i.type === 'connector' && (i.from === id || i.to === id)));
        strokeLayer.querySelector(`path[data-id="${id}"]`)?.remove();
        strokeLayer.querySelector(`path[data-fill-id="${id}"]`)?.remove();
        shapeLayer.querySelector(`path[data-id="${id}"]`)?.remove();

        if (S.selectedId === id) S.selectedId = null;
        S.selectedIds = S.selectedIds.filter(x => x !== id);
        renderConnectors(); renderSelectionUI(); markDirty();
    }

    function contentBBox() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, has = false;
        for (const it of S.items) {
            if (it.type === 'connector') continue;
            has = true; const r = rectOf(it);
            minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
            maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
        }
        return has ? { minX, minY, maxX, maxY } : null;
    }

    function fitToContent() {
        const bb = contentBBox();
        const vw = viewport.clientWidth, vh = viewport.clientHeight;
        if (!bb) { S.view = { x: vw / 2, y: vh / 2, scale: 1 }; applyView(); return; }
        const bw = Math.max(60, bb.maxX - bb.minX), bh = Math.max(60, bb.maxY - bb.minY);
        const scale = clamp(Math.min(vw / bw, vh / bh) * 0.82, 0.08, 1.5);
        S.view.scale = scale;
        S.view.x = vw / 2 - (bb.minX + bw / 2) * scale;
        S.view.y = vh / 2 - (bb.minY + bh / 2) * scale;
        applyView();
    }

    function setTool(tool) {
        S.tool = tool; S.connFrom = null; clearTempConnector();
        document.querySelectorAll('.space-tool[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
        $('space-shape-trigger')?.classList.toggle('active', tool === 'shape');
        viewport.dataset.tool = tool;
        if (tool !== 'select') select(null);
    }

    let drag = null;
    let moveRaf = null;
    let spaceHeld = false;

    function ensureMarqueeEl() {
        if (!marqueeEl) {
            marqueeEl = document.createElement('div');
            marqueeEl.className = 'space-marquee';
            uiLayer.appendChild(marqueeEl);
        }
        return marqueeEl;
    }

    // Интерактивные контролы внутри встроенных карточек/колонок (меню, кнопки, чекбоксы и т.п.)
    const EMBED_CONTROL_SEL = 'button, a, input, textarea, select, label, [role="button"], [data-action], .card-menu-btn, .card-copy-btn, .card-inline-trigger';
    function isEmbedControl(target) {
        return !!(target && target.closest && target.closest('.space-item') && target.closest(EMBED_CONTROL_SEL));
    }

    function onPointerDown(e) {
        if (e.button === 1 || (e.button === 0 && (e.altKey || spaceHeld))) {
            drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y };
            viewport.setPointerCapture(e.pointerId); return;
        }
        if (e.button !== 0) return;

        if (S.tool === 'pen') {
            const w = toWorld(e.clientX, e.clientY);
            const it = { id: uid(), type: 'stroke', points: [[w.x, w.y]], color: S.penColor, width: S.penSize };
            S.items.push(it);
            drag = { kind: 'draw', item: it };
            renderStroke(it);
            viewport.setPointerCapture(e.pointerId); return;
        }

        if (S.tool === 'eraser') {
            drag = { kind: 'erase' };
            viewport.setPointerCapture(e.pointerId); eraseAt(e.clientX, e.clientY); return;
        }

        if (S.tool === 'text') {
            if (!e.target.closest('.space-item')) {
                const w = toWorld(e.clientX, e.clientY);
                const it = { id: uid(), type: 'text', x: w.x, y: w.y, w: 260, text: '', color: null };
                S.items.push(it); renderNode(it); select(it.id); setTool('select'); startTextEdit(it.id); markDirty(); return;
            }
        }

        if (S.tool === 'fill') {
            fillAt(e.clientX, e.clientY, e.altKey);
            return;
        }

        if (S.tool === 'shape') {
            const w = toWorld(e.clientX, e.clientY);
            const it = { id: uid(), type: 'shape', shape: S.shapeKind, x: w.x, y: w.y, w: 1, h: 1, color: S.penColor, width: S.penSize, fill: null };
            S.items.push(it);
            drag = { kind: 'draw-shape', item: it, ax: w.x, ay: w.y };
            renderShape(it);
            viewport.setPointerCapture(e.pointerId); return;
        }

        const resizeEl = e.target.closest('[data-role="resize"]');
        const itemEl = e.target.closest('.space-item');
        const strokeEl = e.target.closest('path.space-stroke');
        const shapeEl = e.target.closest('path.space-shape');
        const connEl = e.target.closest('path.space-conn');

        if (S.tool === 'connector') {
            const target = itemEl || strokeEl || shapeEl;
            const tid = target && (target.dataset ? target.dataset.id : target.getAttribute('data-id'));
            if (tid) {
                if (!S.connFrom) { S.connFrom = tid; select(tid); } 
                else if (S.connFrom !== tid) { addConnector(S.connFrom, tid); S.connFrom = null; setTool('select'); }
            } else S.connFrom = null;
            return;
        }

        if (resizeEl && S.selectedId) {
            const it = getItem(S.selectedId), r = rectOf(it);
            drag = { kind: 'resize', item: it, sx: e.clientX, sy: e.clientY, w0: r.w, h0: r.h, x0: r.x, y0: r.y };
            if (it.type === 'shape') { drag.w0 = it.w; drag.h0 = it.h; } // сырые (со знаком) размеры фигуры
            if (['card', 'column', 'tab'].includes(it.type)) drag.scale0 = it.scale || 1; // текущий масштаб эмбеда
            if (it.type === 'stroke') {
                drag.pts0 = it.points.map(p => [p[0], p[1]]);
                let minX = Infinity, minY = Infinity;
                for (const [px, py] of it.points) { if (px < minX) minX = px; if (py < minY) minY = py; }
                drag.ptsMinX = minX === Infinity ? r.x : minX; drag.ptsMinY = minY === Infinity ? r.y : minY;
            }
            viewport.setPointerCapture(e.pointerId); return;
        }

        // Контрол встроенной карточки (меню, кнопки, чекбоксы) — не двигаем/не выделяем эмбед,
        // отдаём событие штатным обработчикам приложения.
        if (itemEl && isEmbedControl(e.target)) return;

        if (itemEl && !itemEl.classList.contains('editing')) {
            const it = getItem(itemEl.dataset.id);
            const inGroup = S.selectedIds.length > 1 && S.selectedIds.includes(it.id);
            if (inGroup) {
                // Групповое перемещение всех выделенных элементов
                const members = S.selectedIds.map(getItem).filter(Boolean).map(g => ({
                    it: g, x0: g.x, y0: g.y,
                    pts0: g.type === 'stroke' ? g.points.map(p => [p[0], p[1]]) : null
                }));
                drag = { kind: 'move-group', sx: e.clientX, sy: e.clientY, moved: false, members };
            } else {
                const wasSel = (S.selectedId === it.id);
                select(it.id);
                drag = { kind: 'move', item: it, sx: e.clientX, sy: e.clientY, x0: it.x, y0: it.y, moved: false, wasSelected: wasSel };
            }
            viewport.setPointerCapture(e.pointerId); e.stopPropagation(); return;
        }

        if (strokeEl) {
            const it = getItem(strokeEl.dataset.id);
            select(it.id);
            drag = { kind: 'move-stroke', item: it, sx: e.clientX, sy: e.clientY, pts0: it.points.map(p => [p[0], p[1]]), moved: false };
            viewport.setPointerCapture(e.pointerId); return;
        }

        if (shapeEl) {
            const it = getItem(shapeEl.dataset.id);
            const inGroup = S.selectedIds.length > 1 && S.selectedIds.includes(it.id);
            if (inGroup) {
                const members = S.selectedIds.map(getItem).filter(Boolean).map(g => ({
                    it: g, x0: g.x, y0: g.y,
                    pts0: g.type === 'stroke' ? g.points.map(p => [p[0], p[1]]) : null
                }));
                drag = { kind: 'move-group', sx: e.clientX, sy: e.clientY, moved: false, members };
            } else {
                select(it.id);
                drag = { kind: 'move', item: it, sx: e.clientX, sy: e.clientY, x0: it.x, y0: it.y, moved: false, wasSelected: false };
            }
            viewport.setPointerCapture(e.pointerId); return;
        }

        if (connEl) { select(connEl.dataset.id); return; }

        // Пустой холст: инструмент "Выбор" рисует рамку выделения (как в Windows),
        // остальные случаи — панорамирование. Панорамирование всегда доступно
        // через Alt+ЛКМ, среднюю кнопку и колесо/тачпад.
        if (S.tool === 'select') {
            const w = toWorld(e.clientX, e.clientY);
            drag = { kind: 'marquee', sx: e.clientX, sy: e.clientY, wx0: w.x, wy0: w.y, rect: null };
            viewport.setPointerCapture(e.pointerId);
            return;
        }

        select(null);
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y };
        viewport.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e) {
        if (!drag) return;
        const k = drag.kind;
        if (k === 'pan') {
            S.view.x = drag.vx + (e.clientX - drag.sx); S.view.y = drag.vy + (e.clientY - drag.sy); applyView();
        } else if (k === 'draw') {
            const w = toWorld(e.clientX, e.clientY);
            const pts = drag.item.points, last = pts[pts.length - 1];
            if (Math.hypot(w.x - last[0], w.y - last[1]) > 1.1 / S.view.scale) {
                pts.push([w.x, w.y]); renderStroke(drag.item);
            }
        } else if (k === 'erase') {
            eraseAt(e.clientX, e.clientY);
        } else if (k === 'draw-shape') {
            const w = toWorld(e.clientX, e.clientY), it = drag.item;
            let ex = w.x, ey = w.y;
            const open = (it.shape === 'line' || it.shape === 'arrow');
            if (e.shiftKey) {
                if (open) { // фиксируем угол по шагу 45°
                    const ddx = ex - drag.ax, ddy = ey - drag.ay, len = Math.hypot(ddx, ddy);
                    const snap = Math.round(Math.atan2(ddy, ddx) / (Math.PI / 4)) * (Math.PI / 4);
                    ex = drag.ax + Math.cos(snap) * len; ey = drag.ay + Math.sin(snap) * len;
                } else { // ровный квадрат/круг
                    const s = Math.max(Math.abs(ex - drag.ax), Math.abs(ey - drag.ay));
                    ex = drag.ax + (ex < drag.ax ? -s : s); ey = drag.ay + (ey < drag.ay ? -s : s);
                }
            }
            if (open) { it.x = drag.ax; it.y = drag.ay; it.w = ex - drag.ax; it.h = ey - drag.ay; }
            else { it.x = Math.min(drag.ax, ex); it.y = Math.min(drag.ay, ey); it.w = Math.max(1, Math.abs(ex - drag.ax)); it.h = Math.max(1, Math.abs(ey - drag.ay)); }
            renderShape(it);
        } else if (k === 'move') {
            const dx = (e.clientX - drag.sx) / S.view.scale, dy = (e.clientY - drag.sy) / S.view.scale;
            if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
            drag.item.x = drag.x0 + dx; drag.item.y = drag.y0 + dy;
            renderItem(drag.item); renderConnectors(); renderSelectionUI();
        } else if (k === 'move-stroke') {
            const dx = (e.clientX - drag.sx) / S.view.scale, dy = (e.clientY - drag.sy) / S.view.scale;
            if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
            drag.item.points = drag.pts0.map(p => [p[0] + dx, p[1] + dy]);
            renderStroke(drag.item); renderConnectors(); renderSelectionUI();
        } else if (k === 'move-group') {
            const dx = (e.clientX - drag.sx) / S.view.scale, dy = (e.clientY - drag.sy) / S.view.scale;
            if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
            for (const m of drag.members) {
                if (m.it.type === 'stroke') { m.it.points = m.pts0.map(p => [p[0] + dx, p[1] + dy]); renderStroke(m.it); }
                else { m.it.x = m.x0 + dx; m.it.y = m.y0 + dy; renderItem(m.it); }
            }
            renderConnectors(); renderSelectionUI();
        } else if (k === 'marquee') {
            const w = toWorld(e.clientX, e.clientY);
            const x = Math.min(w.x, drag.wx0), y = Math.min(w.y, drag.wy0);
            const mw = Math.abs(w.x - drag.wx0), mh = Math.abs(w.y - drag.wy0);
            drag.rect = { x, y, w: mw, h: mh };
            const el = ensureMarqueeEl();
            el.style.display = 'block';
            el.style.left = `${x}px`; el.style.top = `${y}px`;
            el.style.width = `${mw}px`; el.style.height = `${mh}px`;
            el.style.borderWidth = `${1 / S.view.scale}px`;
            // Живая подсветка попавших в рамку элементов
            S.selectedIds = itemsInRect(drag.rect);
            S.selectedId = S.selectedIds.length === 1 ? S.selectedIds[0] : null;
            applySelectionClasses(); renderSelectionUI();
        } else if (k === 'resize') {
            const dx = (e.clientX - drag.sx) / S.view.scale, dy = (e.clientY - drag.sy) / S.view.scale;
            const it = drag.item;
            if (it.type === 'stroke') {
                const pad = (it.width || 3) + 4, baseW = Math.max(1, drag.w0 - pad), baseH = Math.max(1, drag.h0 - pad);
                const fx = Math.max(0.05, (baseW + dx) / baseW), fy = Math.max(0.05, (baseH + dy) / baseH);
                it.points = drag.pts0.map(p => [drag.ptsMinX + (p[0] - drag.ptsMinX) * fx, drag.ptsMinY + (p[1] - drag.ptsMinY) * fy]);
                renderStroke(it);
            } else if (it.type === 'image') {
                const ratio = drag.h0 / drag.w0; it.w = Math.max(40, drag.w0 + dx); it.h = it.w * ratio; renderNode(it);
            } else if (it.type === 'shape') {
                if (it.shape === 'line' || it.shape === 'arrow') {
                    it.w = drag.w0 + dx; it.h = drag.h0 + dy; // тянем конец (со знаком)
                } else {
                    let nw = Math.max(6, drag.w0 + dx), nh = Math.max(6, drag.h0 + dy);
                    if (e.shiftKey) { const s = Math.max(nw, nh); nw = nh = s; } // ровная фигура
                    it.w = nw; it.h = nh;
                }
                renderShape(it);
            } else if (it.type === 'text') {
                it.w = Math.max(80, drag.w0 + dx); renderNode(it);
            } else {
                // Эмбед: масштаб относительно текущего (а не сброс к 1×), пропорционально
                const f = clamp((drag.scale0 || 1) * (drag.w0 + dx) / drag.w0, 0.4, 3); it.scale = f;
                const el = world.querySelector(`.space-item[data-id="${it.id}"]`);
                const holder = el?.querySelector('.space-embed-holder');
                if (holder) holder.style.transform = `scale(${f})`;
                measureNode(it, el);
            }
            renderConnectors(); renderSelectionUI();
        } else if (k === 'connect') {
            drawTempConnector(anchor(rectOf(getItem(drag.fromId)), drag.fromPort), toWorld(e.clientX, e.clientY).x, toWorld(e.clientX, e.clientY).y);
        }
        // Перетаскивание выделения на вкладку-Пространство: подсвечиваем цель.
        if (k === 'move' || k === 'move-group' || k === 'move-stroke') highlightTabDropTarget(e.clientX, e.clientY);
    }

    function onPointerMove(e) {
        if (!drag) return;
        if (moveRaf) cancelAnimationFrame(moveRaf);
        moveRaf = requestAnimationFrame(() => handlePointerMove(e));
    }

    function onPointerUp(e) {
        if (moveRaf) cancelAnimationFrame(moveRaf);
        if (!drag) return;
        const d = drag; drag = null;

        // Дроп выделения на вкладку-Пространство → перенос элементов в неё (как карточки на доске).
        if (d.kind === 'move' || d.kind === 'move-group' || d.kind === 'move-stroke') {
            // Перенос только при реальном перетаскивании (d.moved). Иначе обычный клик по объекту
            // под панелью вкладок случайно «телепортировал» бы его в другое Пространство.
            const overTab = d.moved ? highlightTabDropTarget(e.clientX, e.clientY) : null;
            clearTabDropTarget();
            if (overTab && overTab.dataset.spaceId && overTab.dataset.spaceId !== S.activeSpaceId) {
                // Если тянули одиночный невыделенный элемент — считаем его выделением.
                if (d.item && !S.selectedIds.includes(d.item.id)) { S.selectedIds = [d.item.id]; S.selectedId = d.item.id; }
                moveSelectionToSpace(overTab.dataset.spaceId);
                return;
            }
        }

        if (d.kind === 'pan' && !spaceHeld) viewport.style.cursor = '';
        if (d.kind === 'draw') {
            if (d.item.points.length < 2) {
                S.items = S.items.filter(i => i.id !== d.item.id);
                strokeLayer.querySelector(`path[data-id="${d.item.id}"]`)?.remove();
            } else { commitSpaceState(); markDirty(); }
        } else if (d.kind === 'draw-shape') {
            const it = d.item;
            if (Math.abs(it.w) < 4 && Math.abs(it.h) < 4) { // клик без протяжки — не создаём фигуру
                S.items = S.items.filter(i => i.id !== it.id);
                shapeLayer.querySelector(`path[data-id="${it.id}"]`)?.remove();
            } else {
                select(it.id); setTool('select'); commitSpaceState(); markDirty();
            }
        } else if (d.kind === 'move' || d.kind === 'move-stroke' || d.kind === 'resize' || d.kind === 'move-group') {
            if (d.kind === 'move' && d.item.type === 'text' && !d.moved && d.wasSelected && S.tool === 'select') startTextEdit(d.item.id);
            else if (d.moved || d.kind === 'resize') commitSpaceState();
            markDirty();
        } else if (d.kind === 'marquee') {
            if (marqueeEl) marqueeEl.style.display = 'none';
            const ids = d.rect ? itemsInRect(d.rect) : [];
            selectMany(ids);
        } else if (d.kind === 'erase') { markDirty(); }
        else if (d.kind === 'connect') {
            clearTempConnector();
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);
            const node = targetEl?.closest('.space-item, path.space-stroke');
            const toId = node && (node.dataset ? node.dataset.id : node.getAttribute('data-id'));
            if (toId && toId !== d.fromId) addConnector(d.fromId, toId, d.fromPort);
        }
        commitSpaceState();
    }

    function addConnector(fromId, toId, fromPort) {
        if (!getItem(fromId) || !getItem(toId) || S.items.some(i => i.type === 'connector' && i.from === fromId && i.to === toId)) return;
        S.items.push({ id: uid(), type: 'connector', from: fromId, to: toId, fromPort: fromPort || null, color: null });
        renderConnectors(); markDirty();
    }

    function distToSeg(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
        let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0; t = clamp(t, 0, 1);
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function eraseHitShape(it, wx, wy, rad) {
        const thr = rad + (it.width || 3) / 2;
        if (it.shape === 'line' || it.shape === 'arrow') {
            return distToSeg(wx, wy, it.x, it.y, it.x + it.w, it.y + it.h) <= thr;
        }
        const r = rectOf(it);
        // Залитую фигуру стираем при попадании внутрь, любую — при касании контура (по рамке)
        if (it.fill && isClosedShape(it) && wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return true;
        const edges = [[r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x + r.w, r.y + r.h, r.x, r.y + r.h], [r.x, r.y + r.h, r.x, r.y]];
        for (const [x1, y1, x2, y2] of edges) if (distToSeg(wx, wy, x1, y1, x2, y2) <= thr) return true;
        return false;
    }

    function eraseAt(cx, cy) {
        const w = toWorld(cx, cy), rad = 10 / S.view.scale;
        let removed = false;
        const kill = (it, layer) => {
            const el = layer.querySelector(`path[data-id="${it.id}"]`);
            if (el) { el.style.transition = 'opacity 0.15s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 150); }
            const fl = layer.querySelector(`path[data-fill-id="${it.id}"]`);
            if (fl) { fl.style.transition = 'opacity 0.15s'; fl.style.opacity = '0'; setTimeout(() => fl.remove(), 150); }
            S.items = S.items.filter(x => x.id !== it.id && !(x.type === 'connector' && (x.from === it.id || x.to === it.id)));
            removed = true;
        };
        for (const it of [...S.items]) {
            if (it.type === 'stroke') {
                const thr = rad + (it.width || 3) / 2; let hit = false, p = it.points;
                for (let i = 0; i < p.length - 1 && !hit; i++) if (distToSeg(w.x, w.y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) <= thr) hit = true;
                if (p.length === 1 && Math.hypot(w.x - p[0][0], w.y - p[0][1]) <= thr) hit = true;
                if (hit) kill(it, strokeLayer);
            } else if (it.type === 'shape') {
                if (eraseHitShape(it, w.x, w.y, rad)) kill(it, shapeLayer);
            }
        }
        if (removed) { renderConnectors(); renderSelectionUI(); }
    }

    // Markdown-форматирование в textarea (те же шорткаты, что в описаниях карточек)
    function taToggleFormat(ta, before, after) {
        const s = ta.selectionStart, e = ta.selectionEnd, val = ta.value, sel = val.slice(s, e);
        let newStart, newEnd;
        if (sel) {
            if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
                const inner = sel.slice(before.length, sel.length - after.length);
                ta.value = val.slice(0, s) + inner + val.slice(e);
                newStart = s; newEnd = s + inner.length;
            } else {
                ta.value = val.slice(0, s) + before + sel + after + val.slice(e);
                newStart = s + before.length; newEnd = newStart + sel.length;
            }
        } else {
            ta.value = val.slice(0, s) + before + after + val.slice(e);
            newStart = newEnd = s + before.length;
        }
        ta.setSelectionRange(newStart, newEnd);
        ta.dispatchEvent(new Event('input'));
    }

    function taInsertLink(ta) {
        const s = ta.selectionStart, e = ta.selectionEnd, val = ta.value, sel = val.slice(s, e);
        if (sel) {
            ta.value = val.slice(0, s) + `[${sel}](url)` + val.slice(e);
            const urlStart = s + sel.length + 3;
            ta.setSelectionRange(urlStart, urlStart + 3);
        } else {
            ta.value = val.slice(0, s) + `[](url)` + val.slice(e);
            ta.setSelectionRange(s + 1, s + 1);
        }
        ta.dispatchEvent(new Event('input'));
    }

    function handleTextEditShortcut(ev, ta) {
        if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) { ev.preventDefault(); ta.blur(); return; }
        const mod = ev.metaKey || ev.ctrlKey;
        if (!mod) return;
        const k = ev.key.toLowerCase();
        if (ev.shiftKey) { if (k === 'x') { ev.preventDefault(); taToggleFormat(ta, '~~', '~~'); } return; }
        if (k === 'b') { ev.preventDefault(); taToggleFormat(ta, '**', '**'); }
        else if (k === 'i') { ev.preventDefault(); taToggleFormat(ta, '*', '*'); }
        else if (k === 'u') { ev.preventDefault(); taToggleFormat(ta, '<u>', '</u>'); }
        else if (k === 'e') { ev.preventDefault(); taToggleFormat(ta, '`', '`'); }
        else if (k === 'k') { ev.preventDefault(); taInsertLink(ta); }
    }

    function startTextEdit(id) {
        const el = world.querySelector(`.space-item[data-id="${id}"]`);
        if (!el || el.classList.contains('editing')) return;
        const it = getItem(id), body = el.querySelector('.space-text-body');
        if (!it || !body) return;
        
        el.classList.add('editing'); renderSelectionUI();
        
        const ta = document.createElement('textarea');
        ta.className = 'space-text-input'; ta.value = it.text || ''; ta.placeholder = t('space.textPlaceholder'); ta.spellcheck = false;
        if (it.color) ta.style.color = it.color; // цвет виден и во время редактирования
        body.style.display = 'none'; el.insertBefore(ta, body);
        el._ta = ta;
        
        const autoGrow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; measureNode(it, el); };
        ta.addEventListener('input', () => { it.text = ta.value; autoGrow(); });
        setTimeout(() => { ta.focus(); autoGrow(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 20);

        const finish = () => {
            ta.removeEventListener('blur', finish);
            el._ta = null;
            it.text = ta.value; ta.remove(); body.style.display = ''; el.classList.remove('editing');
            if (!it.text.trim()) { deleteItem(id); commitSpaceState(); return; }
            body.innerHTML = renderMd(it.text);
            measureNode(it, el); renderConnectors(); renderSelectionUI(); commitSpaceState(); markDirty();
        };
        
        ta.addEventListener('blur', finish);
        ta.addEventListener('keydown', (ev) => handleTextEditShortcut(ev, ta));
    }

    async function uploadAndPlace(file, wx, wy) {
        const fd = new FormData(); fd.append('file', file);
        try {
            const res = await fetch(`${API_BASE}/system/upload`, { method: 'POST', body: fd });
            if (!res.ok) throw new Error('upload failed');
            const data = await res.json(), img = new Image();
            img.onload = () => {
                const w = Math.min(420, img.naturalWidth || 420), h = w * ((img.naturalHeight || w) / (img.naturalWidth || w));
                const it = { id: uid(), type: 'image', x: wx - w / 2, y: wy - h / 2, w, h, src: data.path };
                S.items.push(it); renderNode(it); select(it.id); commitSpaceState(); markDirty();
            };
            img.src = '/' + String(data.path).split('/').map(encodeURIComponent).join('/');
        } catch (e) { if (window.showToast) window.showToast(t('alerts.error'), String(file.name), true); }
    }

    let attachTimer = null;
    async function runAttachSearch(q) {
        const box = $('space-attach-results'); box.innerHTML = '';
        if (!q || q.length < 2) return;
        // В Space можно прикреплять только карточки — импорт колонок и вкладок отключён.
        let tasks = [];
        try {
            const res = await fetch(`/api/v1/system/search?q=${encodeURIComponent(q)}`);
            if (res.ok) { const data = await res.json(); tasks = (data.tasks || []).slice(0, 12); }
        } catch (e) {}

        const addSection = (label) => { const s = document.createElement('div'); s.className = 'space-attach-sec'; s.textContent = label; box.appendChild(s); };
        const addRow = (title, onPick) => { const r = document.createElement('div'); r.className = 'space-attach-row'; r.innerHTML = svgEscape(stripPlain(title)); r.onclick = onPick; box.appendChild(r); };

        if (tasks.length) {
            addSection(t('space.secCards'));
            tasks.forEach(tk => {
                const id = tk.id || tk.task_id;
                if (!id) return;
                addRow(tk.title || '', () => {
                    if (attachPickMode) { const cb = attachPickMode; closeAttachPop(); cb({ id, title: stripPlain(tk.title || ''), workspace_id: tk.workspace_id }); }
                    else placeChip({ type: 'card', taskId: id, workspaceId: tk.workspace_id, title: stripPlain(tk.title || '') });
                });
            });
        }
        if (!tasks.length) { const empty = document.createElement('div'); empty.className = 'space-attach-empty'; empty.textContent = t('space.nothing'); box.appendChild(empty); }
    }

    function stripPlain(title) { try { if (typeof stripMarkdownToPlain === 'function') return stripMarkdownToPlain(title) || title || ''; } catch (e) {} return title || ''; }
    function placeChip(base) {
        const r = viewport.getBoundingClientRect();
        const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
        // Ставим примерно по центру, а точное центрирование сделает buildEmbed,
        // когда станет известен реальный размер эмбеда (_centerPending не сериализуется).
        const it = { id: uid(), ...base, x: c.x - 160, y: c.y - 60, _centerPending: { cx: c.x, cy: c.y } };
        S.items.push(it); renderNode(it); select(it.id); closeAttachPop(); markDirty();
    }
    // Режим выбора карточки (для «превратить в вектор»): если задан колбэк — клик по карточке вызывает его.
    let attachPickMode = null;
    function openAttachPop() { attachPickMode = null; $('space-attach-pop').classList.add('show'); $('space-attach-input').value = ''; $('space-attach-results').innerHTML = ''; setTimeout(() => $('space-attach-input').focus(), 40); }
    function closeAttachPop() { attachPickMode = null; $('space-attach-pop').classList.remove('show'); }
    function openCardPicker(cb) {
        $('space-attach-pop').classList.add('show');
        $('space-attach-input').value = '';
        $('space-attach-results').innerHTML = '';
        attachPickMode = cb;
        setTimeout(() => $('space-attach-input').focus(), 40);
    }

    // ---------- Статичный вектор из выделения ----------
    function svgEscape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function selectionBBox(ids) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, has = false;
        ids.forEach(id => {
            const it = getItem(id);
            if (!it || it.type === 'connector') return;
            const r = rectOf(it); has = true;
            minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
            maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
        });
        return has ? { minX, minY, maxX, maxY } : null;
    }

    // Собираем самодостаточный SVG из выделенных элементов. viewBox = мировые координаты фрагмента,
    // data-space-id — чтобы кнопка в карточке знала, какое Пространство открыть.
    function exportSelectionSVG(ids) {
        const idset = new Set(ids);
        const bb = selectionBBox(ids);
        if (!bb) return null;
        const pad = 16;
        const minX = bb.minX - pad, minY = bb.minY - pad;
        const w = (bb.maxX - bb.minX) + pad * 2, h = (bb.maxY - bb.minY) + pad * 2;
        const parts = [];
        parts.push('<defs><marker id="sv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"></path></marker><marker id="sv-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" markerUnits="strokeWidth" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"></path></marker></defs>');

        // Коннекторы (оба конца в выделении) — под элементами.
        S.items.forEach(it => {
            if (it.type !== 'connector') return;
            if (!idset.has(it.from) || !idset.has(it.to)) return;
            const A = getItem(it.from), B = getItem(it.to);
            if (!A || !B) return;
            const ra = rectOf(A), rb = rectOf(B);
            const [sa, sb] = autoSides(ra, rb);
            const a = anchor(ra, it.fromPort || sa), b = anchor(rb, it.toPort || sb);
            parts.push(`<path d="${connectorPathD(a, b)}" fill="none" stroke="${svgEscape(it.color || '#9aa0a6')}" stroke-width="2" marker-end="url(#sv-arrow)"/>`);
        });

        ids.forEach(id => {
            const it = getItem(id);
            if (!it) return;
            if (it.type === 'stroke') {
                // Заливка — отдельным путём по замкнутой петле (как в renderStroke)
                if (it.fill) parts.push(`<path d="${smoothPathFast(getStrokeLoop(it))} Z" fill="${svgEscape(it.fill)}" stroke="none"/>`);
                parts.push(`<path d="${smoothPathFast(it.points)}" fill="none" stroke="${svgEscape(it.color || S.penColor)}" stroke-width="${it.width || 3}" stroke-linecap="round" stroke-linejoin="round"/>`);
            } else if (it.type === 'shape') {
                const closed = isClosedShape(it);
                const marker = it.shape === 'arrow' ? ' marker-end="url(#sv-arrowhead)"' : '';
                parts.push(`<path d="${shapePathD(it)}" fill="${closed ? (it.fill || 'none') : 'none'}" stroke="${svgEscape(it.color || S.penColor)}" stroke-width="${it.width || 3}" stroke-linecap="round" stroke-linejoin="round"${marker}/>`);
            } else if (it.type === 'image') {
                const src = '/' + String(it.src).split('/').map(encodeURIComponent).join('/');
                parts.push(`<image href="${svgEscape(src)}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" preserveAspectRatio="none"/>`);
            } else if (it.type === 'text') {
                const color = it.color || '#333333';
                const lines = String(it.text || '').split('\n');
                const fs = 15, lh = 22, ty = it.y + 16;
                const tspans = lines.map((ln, i) => `<tspan x="${it.x}" y="${ty + i * lh}">${svgEscape(stripPlain(ln)) || ' '}</tspan>`).join('');
                parts.push(`<text font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fs}" fill="${svgEscape(color)}">${tspans}</text>`);
            } else if (['card', 'column', 'tab'].includes(it.type)) {
                const r = rectOf(it);
                parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10" fill="none" stroke="#c9ccd1" stroke-width="1.5" stroke-dasharray="4 4"/>`);
                parts.push(`<text x="${r.x + 12}" y="${r.y + 24}" font-family="-apple-system, sans-serif" font-size="13" fill="#7a7f87">${svgEscape(stripPlain(it.title || ''))}</text>`);
            }
        });

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}" data-doe-vector="1" data-space-id="${svgEscape(S.activeSpaceId || '')}">${parts.join('')}</svg>`;
        return { svg, bbox: { minX, minY, w, h } };
    }

    async function convertSelectionToVector() {
        const ids = S.selectedIds.slice();
        if (!ids.length) return;
        const out = exportSelectionSVG(ids);
        if (!out) { if (window.showToast) window.showToast(t('alerts.error'), t('space.vectorFail'), true); return; }
        const blob = new Blob([out.svg], { type: 'image/svg+xml' });
        const fname = 'space-vec-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.svg';
        const fd = new FormData(); fd.append('file', blob, fname);
        let path = null;
        try {
            const res = await fetch(`/api/v1/system/upload`, { method: 'POST', body: fd });
            if (res.ok) { const d = await res.json(); path = d.path; }
        } catch (e) {}
        if (!path) { if (window.showToast) window.showToast(t('alerts.error'), t('space.vectorFail'), true); return; }
        // Выбираем карточку через поиск и вставляем в её описание.
        openCardPicker(card => placeVectorInCard(path, card.id));
    }

    async function placeVectorInCard(path, taskId) {
        try {
            const res = await fetch(`/api/v1/tasks/${taskId}`);
            if (!res.ok) throw new Error('load');
            const task = await res.json();
            const label = t('space.vectorLabel') || 'Векторный фрагмент';
            const md = `\n\n![${label}](${path})\n`;
            const newDesc = (task.description || '') + md;
            const put = await fetch(`/api/v1/tasks/${taskId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: newDesc })
            });
            if (!put.ok) throw new Error('save');
            // Если эта карточка сейчас открыта/на доске — подтягиваем свежее описание.
            try {
                if (typeof state !== 'undefined' && state && Array.isArray(state.columns)) {
                    for (const c of state.columns) {
                        const tk = (c.tasks || []).find(x => String(x.id) === String(taskId));
                        if (tk) { tk.description = newDesc; break; }
                    }
                }
                if (typeof window.refreshOpenTaskModal === 'function') window.refreshOpenTaskModal(taskId);
            } catch (e) {}
            if (window.showToast) window.showToast(t('space.title') || 'Пространство', t('space.vectorPlaced'), false);
        } catch (e) {
            if (window.showToast) window.showToast(t('alerts.error'), t('space.vectorFail'), true);
        }
    }

    // ---------- Контекстное меню (ПКМ по выделению) ----------
    function showSpaceContextMenu(x, y) {
        const menu = $('space-context-menu'); if (!menu) return;
        menu.innerHTML = '';
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'space-context-item';
        item.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><path d="M10 6h4a2 2 0 0 1 2 2v6"></path></svg><span>${svgEscape(t('space.toVector') || 'Превратить в статичный вектор')}</span>`;
        item.addEventListener('click', () => { hideSpaceContextMenu(); convertSelectionToVector(); });
        menu.appendChild(item);
        menu.classList.add('show');
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        let px = x, py = y;
        if (px + mw > window.innerWidth - 8) px = window.innerWidth - mw - 8;
        if (py + mh > window.innerHeight - 8) py = window.innerHeight - mh - 8;
        menu.style.left = Math.max(8, px) + 'px'; menu.style.top = Math.max(8, py) + 'px';
    }
    function hideSpaceContextMenu() { const m = $('space-context-menu'); if (m) m.classList.remove('show'); }

    // ---------- Открытие Пространства на конкретном фрагменте (из карточки) ----------
    function fitToBBox(bb) {
        if (!bb) return;
        const vw = viewport.clientWidth, vh = viewport.clientHeight;
        const bw = Math.max(60, bb.w), bh = Math.max(60, bb.h);
        const scale = clamp(Math.min(vw / bw, vh / bh) * 0.82, 0.08, 2);
        S.view.scale = scale;
        S.view.x = vw / 2 - (bb.minX + bb.w / 2) * scale;
        S.view.y = vh / 2 - (bb.minY + bb.h / 2) * scale;
        applyView(); markDirty();
    }
    async function openToVector(spaceId, bbox) {
        await openSpace();
        if (spaceId && S.spaces.find(s => s.id === spaceId) && spaceId !== S.activeSpaceId) {
            switchSpace(spaceId);
        }
        if (bbox) fitToBBox(bbox);
    }

    const PICK = { h: 265, s: 60, v: 70 };
    let svCanvas, hueCanvas, svCtx, hueCtx;

    function hsvToRgb(h, s, v) { s /= 100; v /= 100; const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let r = 0, g = 0, b = 0; if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; } return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]; }
    function hsvToHex(h, s, v) { return '#' + hsvToRgb(h, s, v).map(n => n.toString(16).padStart(2, '0')).join(''); }
    function hexToHsv(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const int = parseInt(m[1], 16); let r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return { h, s: mx ? (d / mx) * 100 : 0, v: mx * 100 }; }

    function drawPicker() {
        if (!svCtx) return; const W = svCanvas.width, H = svCanvas.height;
        svCtx.fillStyle = hsvToHex(PICK.h, 100, 100); svCtx.fillRect(0, 0, W, H);
        const gx = svCtx.createLinearGradient(0, 0, W, 0); gx.addColorStop(0, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)'); svCtx.fillStyle = gx; svCtx.fillRect(0, 0, W, H);
        const gy = svCtx.createLinearGradient(0, 0, 0, H); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(1, 'rgba(0,0,0,1)'); svCtx.fillStyle = gy; svCtx.fillRect(0, 0, W, H);
        const mx = (PICK.s / 100) * W, my = (1 - PICK.v / 100) * H;
        svCtx.strokeStyle = '#fff'; svCtx.lineWidth = 2; svCtx.beginPath(); svCtx.arc(mx, my, 6, 0, Math.PI * 2); svCtx.stroke();
        svCtx.strokeStyle = 'rgba(0,0,0,0.4)'; svCtx.beginPath(); svCtx.arc(mx, my, 7.5, 0, Math.PI * 2); svCtx.stroke();
        const HW = hueCanvas.width, HH = hueCanvas.height, hg = hueCtx.createLinearGradient(0, 0, HW, 0);
        for (let i = 0; i <= 360; i += 60) hg.addColorStop(i / 360, `hsl(${i},100%,50%)`);
        hueCtx.fillStyle = hg; hueCtx.fillRect(0, 0, HW, HH);
        const hx = (PICK.h / 360) * HW; hueCtx.strokeStyle = '#fff'; hueCtx.lineWidth = 2; hueCtx.strokeRect(hx - 2, 0, 4, HH);
        hueCtx.strokeStyle = 'rgba(0,0,0,0.4)'; hueCtx.strokeRect(hx - 3, 0, 6, HH);
    }

    function applyColorToItem(it, hex) {
        if (!it) return false;
        if (it.type === 'shape') { it.color = hex; renderShape(it); return true; }
        if (it.type === 'stroke') { it.color = hex; renderStroke(it); return true; }
        if (it.type === 'connector') { it.color = hex; renderConnectors(); return true; }
        if (it.type === 'text') {
            it.color = hex;
            const el = world.querySelector(`.space-item[data-id="${it.id}"]`);
            const body = el?.querySelector('.space-text-body');
            if (body) body.style.color = hex;
            if (el && el._ta) el._ta.style.color = hex; // превью прямо во время редактирования
            return true;
        }
        return false;
    }

    function applyPickerColor() {
        const hex = hsvToHex(PICK.h, PICK.s, PICK.v); S.penColor = hex;
        const sw = $('space-color-swatch'); if (sw) sw.style.background = hex;
        const hi = $('space-color-hex'); if (hi && document.activeElement !== hi) hi.value = hex;
        // Применяем цвет ко всему выделению (заливка — отдельный инструмент «Заливка»)
        let changed = false;
        for (const id of S.selectedIds) if (applyColorToItem(getItem(id), hex)) changed = true;
        if (changed) markDirty();
        drawPicker();
    }
    function setPickerColor(hex, apply) { const hsv = hexToHsv(hex); if (!hsv) return; PICK.h = hsv.h; PICK.s = hsv.s; PICK.v = hsv.v; const sw = $('space-color-swatch'); if (sw) sw.style.background = hex; const hi = $('space-color-hex'); if (hi) hi.value = hex.toLowerCase(); drawPicker(); if (apply) applyPickerColor(); }

    function reflectPickerForItem(it) {
        if (it && it.color) setPickerColor(it.color, false);
    }

    function initPicker() {
        svCanvas = $('space-sv'); hueCanvas = $('space-hue'); if (!svCanvas) return; svCtx = svCanvas.getContext('2d'); hueCtx = hueCanvas.getContext('2d');
        const svMove = (e) => { const r = svCanvas.getBoundingClientRect(); PICK.s = clamp((e.clientX - r.left) / r.width, 0, 1) * 100; PICK.v = (1 - clamp((e.clientY - r.top) / r.height, 0, 1)) * 100; applyPickerColor(); };
        svCanvas.addEventListener('pointerdown', (e) => { svCanvas.setPointerCapture(e.pointerId); svMove(e); const mv = (ev) => svMove(ev), up = () => { svCanvas.removeEventListener('pointermove', mv); svCanvas.removeEventListener('pointerup', up); commitSpaceState(); }; svCanvas.addEventListener('pointermove', mv); svCanvas.addEventListener('pointerup', up); });
        const hueMove = (e) => { const r = hueCanvas.getBoundingClientRect(); PICK.h = clamp((e.clientX - r.left) / r.width, 0, 1) * 360; applyPickerColor(); };
        hueCanvas.addEventListener('pointerdown', (e) => { hueCanvas.setPointerCapture(e.pointerId); hueMove(e); const mv = (ev) => hueMove(ev), up = () => { hueCanvas.removeEventListener('pointermove', mv); hueCanvas.removeEventListener('pointerup', up); commitSpaceState(); }; hueCanvas.addEventListener('pointermove', mv); hueCanvas.addEventListener('pointerup', up); });
        const hexInput = $('space-color-hex'); if (hexInput) { hexInput.addEventListener('input', () => { let v = hexInput.value.trim(); if (v && v[0] !== '#') v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) setPickerColor(v, true); }); hexInput.addEventListener('blur', () => commitSpaceState()); hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitSpaceState(); hexInput.blur(); } }); }
        document.querySelectorAll('.space-swatch').forEach(sw => { sw.addEventListener('click', () => { setPickerColor(sw.dataset.color, true); commitSpaceState(); }); });

        setPickerColor(S.penColor, false);
    }

    // Инструмент «Заливка» (как ведро в Paint): клик по замкнутой области заливает её текущим цветом,
    // Alt+клик — убирает заливку.
    // Для штрихов попадание проверяется по ЗАМКНУТОЙ ПЕТЛЕ (см. strokeLoopPoints),
    // а не по неявно замкнутому пути — хвосты за самопересечением ни в контур,
    // ни в область попадания не входят. Из всех контуров, содержащих точку клика,
    // выбирается самый маленький по площади (клик внутри маленького контура поверх
    // большого заливает маленький, а не большой).
    function fillAt(cx, cy, clear) {
        const w = toWorld(cx, cy), pt = (typeof DOMPoint !== 'undefined') ? new DOMPoint(w.x, w.y) : null;
        let inside = null, insideArea = Infinity;   // точка внутри замкнутого контура
        let onEdge = null, onEdgeArea = Infinity;   // точка на самой линии (запасной вариант)
        for (let i = S.items.length - 1; i >= 0; i--) {
            const it = S.items[i];
            if (it.type === 'stroke') {
                const loop = getStrokeLoop(it);
                if (loop.length < 3) continue;
                const area = Math.max(1, Math.abs(polyArea(loop)));
                if (pointInPoly(w.x, w.y, loop)) {
                    if (area < insideArea) { inside = it; insideArea = area; }
                } else {
                    // клик точно по линии петли (с допуском на толщину штриха)
                    const thr = Math.max((it.width || 3) / 2 + 2, 3);
                    for (let k = 0; k < loop.length && !(onEdge === it); k++) {
                        const a = loop[k], b = loop[(k + 1) % loop.length];
                        if (distToSeg(w.x, w.y, a[0], a[1], b[0], b[1]) <= thr && area < onEdgeArea) {
                            onEdge = it; onEdgeArea = area;
                        }
                    }
                }
            } else if (it.type === 'shape' && isClosedShape(it) && pt) {
                const el = shapeLayer.querySelector(`path[data-id="${it.id}"]`);
                if (!el) continue;
                let area = Infinity;
                try { const b = el.getBBox(); area = Math.max(1, b.width * b.height); } catch (e) {}
                let inFill = false;
                try { inFill = el.isPointInFill ? el.isPointInFill(pt) : false; } catch (e) {}
                if (inFill) {
                    if (area < insideArea) { inside = it; insideArea = area; }
                } else if (el.isPointInStroke) {
                    let onStroke = false;
                    try { onStroke = el.isPointInStroke(pt); } catch (e) {}
                    if (onStroke && area < onEdgeArea) { onEdge = it; onEdgeArea = area; }
                }
            }
        }
        const target = inside || onEdge;
        if (target) {
            target.fill = clear ? null : S.penColor;
            (target.type === 'shape' ? renderShape : renderStroke)(target);
            commitSpaceState(); markDirty();
            return true;
        }
        return false;
    }

    function toggleColorPop() { const pop = $('space-color-pop'), show = !pop.classList.contains('show'); pop.classList.toggle('show', show); if (show) drawPicker(); }
    function closeColorPop() { $('space-color-pop')?.classList.remove('show'); }

    function setTrafficLights(visible) {
        const htmlLights = document.getElementById('mac-traffic-lights');
        if (htmlLights) { if (visible) htmlLights.classList.remove('force-hide'); else htmlLights.classList.add('force-hide'); }
    }

    async function openSpace() {
        const view = $('space-view'); S.open = true; view.classList.add('show'); setTrafficLights(true);
        const titleEl = document.querySelector('.space-title span'); if (titleEl) titleEl.textContent = t('space.title') || titleEl.textContent;
        if (!S.loaded) await loadSpace(); for (const k in boardCache) delete boardCache[k];
        renderSpaceTabs();
        renderAll(); fitToContent(); setTool('select');
    }

    function closeSpace() {
        if (!S.open) return; S.open = false; $('space-view').classList.remove('show'); setTrafficLights(true); closeAttachPop(); closeColorPop(); $('space-shape-pop')?.classList.remove('show'); saveNow();
    }

    function init() {
        viewport = $('space-viewport'); world = $('space-world'); svg = $('space-svg'); if (!viewport || !world || !svg) return;
        gridEl = $('space-grid'); connLayer = $('space-conn-layer'); shapeLayer = $('space-shape-layer'); strokeLayer = $('space-stroke-layer'); uiLayer = $('space-ui-layer'); overlay = $('space-overlay');

        $('space-trigger')?.addEventListener('click', openSpace); $('space-close').addEventListener('click', closeSpace); $('space-fit').addEventListener('click', fitToContent);
        $('space-zoom-in').addEventListener('click', () => { const r = viewport.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); });
        $('space-zoom-out').addEventListener('click', () => { const r = viewport.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); });

        document.querySelectorAll('.space-tool[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
        $('space-color-trigger')?.addEventListener('click', (e) => { e.stopPropagation(); toggleColorPop(); });
        // Выбор фигуры
        $('space-shape-trigger')?.addEventListener('click', (e) => { e.stopPropagation(); const pop = $('space-shape-pop'); pop.classList.toggle('show'); });
        document.querySelectorAll('.space-shape-opt').forEach(b => b.addEventListener('click', () => {
            S.shapeKind = b.dataset.shape;
            document.querySelectorAll('.space-shape-opt').forEach(x => x.classList.toggle('active', x === b));
            setTool('shape');
            $('space-shape-pop')?.classList.remove('show');
        }));
        const sizeInput = $('space-pen-size'); if (sizeInput) { sizeInput.value = S.penSize; sizeInput.addEventListener('input', () => { S.penSize = parseFloat(sizeInput.value) || 3; let ch = false; for (const id of S.selectedIds) { const it = getItem(id); if (it && it.type === 'stroke') { it.width = S.penSize; renderStroke(it); ch = true; } else if (it && it.type === 'shape') { it.width = S.penSize; renderShape(it); ch = true; } } if (ch) markDirty(); }); sizeInput.addEventListener('change', () => commitSpaceState()); }
        initPicker();

        $('space-add-image').addEventListener('click', () => $('space-image-input').click());
        $('space-image-input').addEventListener('change', (e) => { const r = viewport.getBoundingClientRect(); let off = 0; for (const f of e.target.files) { uploadAndPlace(f, toWorld(r.left + r.width / 2 + off, r.top + r.height / 2 + off).x, toWorld(r.left + r.width / 2 + off, r.top + r.height / 2 + off).y); off += 36; } e.target.value = ''; });
        viewport.addEventListener('dragover', (e) => { e.preventDefault(); viewport.classList.add('drop-hover'); }); viewport.addEventListener('dragleave', () => viewport.classList.remove('drop-hover'));
        viewport.addEventListener('drop', (e) => { e.preventDefault(); viewport.classList.remove('drop-hover'); const w = toWorld(e.clientX, e.clientY); let off = 0; for (const f of (e.dataTransfer.files || [])) { if (f.type.startsWith('image/')) { uploadAndPlace(f, w.x + off, w.y + off); off += 36; } } });

        $('space-add-attach').addEventListener('click', (e) => { e.stopPropagation(); $('space-attach-pop').classList.contains('show') ? closeAttachPop() : openAttachPop(); });
        $('space-attach-input').addEventListener('input', (e) => { clearTimeout(attachTimer); attachTimer = setTimeout(() => runAttachSearch(e.target.value.trim()), 220); });

        document.addEventListener('pointerdown', (e) => { if (!S.open) return; if (!e.target.closest('#space-color-pop') && !e.target.closest('#space-color-trigger')) closeColorPop(); if (!e.target.closest('#space-attach-pop') && !e.target.closest('#space-add-attach')) closeAttachPop(); if (!e.target.closest('#space-shape-pop') && !e.target.closest('#space-shape-trigger')) $('space-shape-pop')?.classList.remove('show'); if (!e.target.closest('#space-context-menu')) hideSpaceContextMenu(); }, true);

        // ПКМ по выделяемому объекту → контекстное меню «превратить в статичный вектор».
        viewport.addEventListener('contextmenu', (e) => {
            if (!S.open) return;
            e.preventDefault();
            const itemEl = e.target.closest('.space-item');
            const strokeEl = e.target.closest('path.space-stroke');
            const shapeEl = e.target.closest('path.space-shape');
            const targetId = (itemEl && itemEl.dataset.id) || (strokeEl && strokeEl.dataset.id) || (shapeEl && shapeEl.dataset.id);
            if (targetId && !S.selectedIds.includes(targetId)) select(targetId);
            if (!S.selectedIds.length) { hideSpaceContextMenu(); return; }
            showSpaceContextMenu(e.clientX, e.clientY);
        });

        viewport.addEventListener('pointerdown', onPointerDown);
        viewport.addEventListener('pointermove', onPointerMove);
        viewport.addEventListener('pointerup', onPointerUp);
        viewport.addEventListener('pointercancel', onPointerUp);

        viewport.addEventListener('dblclick', (e) => {
            const textEl = e.target.closest('.space-item-text');
            if (textEl) { startTextEdit(textEl.dataset.id); return; }
            // Двойной клик по встроенной карточке открывает её задачу
            const cardEl = e.target.closest('.space-item-card');
            if (cardEl) {
                const it = getItem(cardEl.dataset.id);
                if (it && it.taskId != null && typeof loadTaskIntoModal === 'function') {
                    try { loadTaskIntoModal(parseInt(it.taskId), true); document.getElementById('task-modal')?.classList.add('show'); } catch (err) {}
                }
            }
        });
        viewport.addEventListener('click', (e) => { const embed = e.target.closest('.space-item-card, .space-item-column, .space-item-tab'); if (!embed || e.target.closest('[data-role="resize"]') || isEmbedControl(e.target) || !e.target.closest('.card')?.dataset.cardId) return; e.stopPropagation(); try { if (typeof loadTaskIntoModal === 'function') { loadTaskIntoModal(parseInt(e.target.closest('.card').dataset.cardId), true); document.getElementById('task-modal')?.classList.add('show'); } } catch (err) {} });

        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            hideSpaceContextMenu();
            if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
            else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; applyView(); markDirty(); }
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (!S.open || (document.activeElement && (document.activeElement.isContentEditable || /INPUT|TEXTAREA/.test(document.activeElement.tagName)))) return;
            // Пробел (удерживать) — панорамирование ЛКМ, как в редакторах
            if (e.code === 'Space') { e.preventDefault(); if (!spaceHeld) { spaceHeld = true; viewport.style.cursor = 'grab'; } return; }
            const mod = (navigator.userAgent.toLowerCase().includes('mac')) ? e.metaKey : e.ctrlKey;
            if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoSpace(); return; }
            if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redoSpace(); return; }
            if (e.key === 'Escape') { if ($('space-context-menu')?.classList.contains('show')) hideSpaceContextMenu(); else if ($('space-color-pop').classList.contains('show')) closeColorPop(); else if ($('space-shape-pop')?.classList.contains('show')) $('space-shape-pop').classList.remove('show'); else if ($('space-attach-pop').classList.contains('show')) closeAttachPop(); else if (S.tool === 'connector' && S.connFrom) { S.connFrom = null; } else if (S.selectedIds.length) select(null); else closeSpace(); }
            else if (e.key === 'Delete' || e.key === 'Backspace') { if (S.selectedIds.length) { e.preventDefault(); [...S.selectedIds].forEach(deleteItem); S.selectedId = null; S.selectedIds = []; renderSelectionUI(); commitSpaceState(); } }
            else if (e.key === 'v' || e.key === 'м') setTool('select'); else if (e.key === 'p' || e.key === 'з') setTool('pen'); else if (e.key === 'e' || e.key === 'у') setTool('eraser'); else if (e.key === 't' || e.key === 'е') setTool('text'); else if (e.key === 'c' || e.key === 'с') setTool('connector'); else if (e.key === 's' || e.key === 'ы') setTool('shape'); else if (e.key === 'g' || e.key === 'п') setTool('fill');
        });

        document.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceHeld = false; if (!drag || drag.kind !== 'pan') viewport.style.cursor = ''; } });
        window.addEventListener('blur', () => { spaceHeld = false; viewport.style.cursor = ''; });

        window.addEventListener('beforeunload', saveNow); document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

    window.DoeSpace = { open: openSpace, close: closeSpace, save: saveNow, refreshEmbeds: () => window.__spaceRefreshEmbeds(), openToVector: openToVector };
})();
