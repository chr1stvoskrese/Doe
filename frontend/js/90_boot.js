// 🔒 МОСТ К БЭКЕНДУ ВМЕСТО HTTP-СЕРВЕРА
// Раньше фронт ходил на http://127.0.0.1:8000/api/v1/*. Теперь сетевого сервера
// нет: все запросы к /api/v1/* уходят в window.pywebview.api.api_request, где
// то же самое ASGI-приложение выполняется in-process (без сокета/порта/CORS).
// Мы перехватываем window.fetch, чтобы НЕ переписывать ~130 мест вызова.
// ============================================================================
const originalFetch = window.fetch;
window._lastLocalEdit = 0;

function _u8ToB64(u8) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
        s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(s);
}
function _b64ToU8(b64) {
    const bin = atob(b64 || '');
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
}
async function _bridgeReady() {
    for (let i = 0; i < 400; i++) {
        if (window.pywebview && window.pywebview.api && window.pywebview.api.api_request) return true;
        await new Promise(r => setTimeout(r, 25));
    }
    return false;
}

window.fetch = async function(input, init) {
    const options = init || (typeof input === 'object' && input) || {};
    let url = (typeof input === 'string') ? input : (input && input.url) || '';
    const method = String(options.method || (typeof input === 'object' && input && input.method) || 'GET').toUpperCase();

    // Через мост уходят только наши API-вызовы. Всё остальное (ассеты по file://)
    // отдаём штатному fetch.
    if (typeof url === 'string' && url.includes('/api/v1/')) {
        if (method !== 'GET') window._lastLocalEdit = Date.now();

        const path = url.slice(url.indexOf('/api/v1/'));  // отбрасываем любой origin

        // Заголовки + сериализация тела штатным Request: он корректно соберёт
        // JSON / x-www-form-urlencoded / multipart (с boundary) и т.п.
        const headers = {};
        try { new Headers(options.headers || {}).forEach((v, k) => { headers[k] = v; }); } catch (e) {}
        let bodyB64 = null;
        if (options.body != null && method !== 'GET' && method !== 'HEAD') {
            try {
                const probe = new Request('http://doe.local/x', {
                    method: 'POST', headers: options.headers || {}, body: options.body,
                });
                const ct = probe.headers.get('content-type');
                if (ct) headers['content-type'] = ct;  // важно для multipart boundary
                const buf = await probe.arrayBuffer();
                bodyB64 = _u8ToB64(new Uint8Array(buf));
            } catch (e) {
                if (typeof options.body === 'string') {
                    bodyB64 = _u8ToB64(new TextEncoder().encode(options.body));
                }
            }
        }

        if (!(await _bridgeReady())) {
            return new Response(JSON.stringify({ detail: 'bridge_not_ready' }),
                { status: 503, headers: { 'content-type': 'application/json' } });
        }

        const res = await window.pywebview.api.api_request(method, path, headers, bodyB64);
        const status = (res && res.status) || 500;
        const respHeaders = (res && res.headers) || {};
        const bytes = _b64ToU8(res && res.body_b64);
        // Response запрещает тело для null-body статусов (204/205/304).
        const noBody = (status === 204 || status === 205 || status === 304);
        return new Response(noBody ? null : bytes, { status, headers: respHeaders });
    }

    return originalFetch.call(this, input, init);
};

function initCloudSync() {
    // 🔒 Замена WebSocket: Python при внешнем изменении БД (watcher) вызывает
    // window.__doeOnDbUpdated() через evaluate_js (см. wrapper.push_db_updated).
    window.__doeOnDbUpdated = function() {
        if (Date.now() - window._lastLocalEdit < 2500) return;

        if (typeof isDragging !== 'undefined' && isDragging) return;
        if (document.querySelector('.is-renaming')) return;
        if (document.querySelector('.card-entering:not(.is-exiting)')) return;
        if (document.querySelector('.column-entering:not(.is-exiting)')) return;

        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
            return;
        }

        console.log("[Sync] Обнаружено внешнее изменение файла БД. Перерисовываем UI...");

        if (document.getElementById('vault-screen').classList.contains('hidden')) {
            refreshBoard();
        } else {
            renderVaultHistory();
        }
    };
}

(async () => {
    initTooltip();
    initTabsScrollbar();
    initBoardScrollbar();
    initTaskModalDragAndResize();
    initGlobalSearch();
    initCloudSync();
    // 🔒 Абсолютные корни вложений для file://-URL картинок (до рендера доски).
    await doeLoadAssetRoots();

    // ============================================================
    // ↩️ Стек отмены и повтора действий на доске (Undo / Redo)
    // ============================================================
    window.boardUndoStack = [];
    window.boardRedoStack = [];

    function pushBoardAction(action) {
        window.boardUndoStack.push(action);
        if (window.boardUndoStack.length > 30) window.boardUndoStack.shift();
        window.boardRedoStack = []; // Сбрасываем повтор при новом действии
    }

    async function undoBoardAction() {
        if (!window.boardUndoStack.length) return;
        const action = window.boardUndoStack.pop();
        window.boardRedoStack.push(action);

        try {
            if (action.type === 'DELETE_CARD') {
                const res = await fetch(`${API_BASE}/tasks/restore`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(action.taskData)
                });
                if (res.ok) {
                    const restored = await res.json();
                    action.restoredTaskId = restored.id;
                    await refreshBoard();

                    // Если в момент отмены открыта модалка карточки — подтягиваем свежее состояние
                    const modal = document.getElementById('task-modal');
                    if (modal && modal.classList.contains('show')) {
                        const openTaskId = parseInt(modal.dataset.taskId);
                        if (openTaskId) {
                            loadTaskIntoModal(openTaskId, false);
                        }
                    }

                    showToast(currentLang === 'ru' ? 'Отмена' : 'Undo', `${currentLang === 'ru' ? 'Восстановлена карточка' : 'Restored card'} «${stripMarkdownToPlain(restored.title)}»`);
                }
            } else if (action.type === 'CREATE_CARD') {
                const targetId = action.restoredTaskId || action.taskId;
                await fetch(`${API_BASE}/tasks/${targetId}`, { method: 'DELETE' });
                await refreshBoard();
                showToast(currentLang === 'ru' ? 'Отмена' : 'Undo', currentLang === 'ru' ? 'Создание карточки отменено' : 'Card creation undone');
            }
        } catch (e) {
            console.error('Undo error:', e);
            showToast(t('alerts.error'), 'Не удалось отменить действие', true);
        }
    }

    async function redoBoardAction() {
        if (!window.boardRedoStack.length) return;
        const action = window.boardRedoStack.pop();
        window.boardUndoStack.push(action);

        try {
            if (action.type === 'DELETE_CARD') {
                const targetId = action.restoredTaskId || action.taskData.id;
                if (targetId) {
                    await fetch(`${API_BASE}/tasks/${targetId}`, { method: 'DELETE' });
                    await refreshBoard();
                    showToast(currentLang === 'ru' ? 'Повтор' : 'Redo', currentLang === 'ru' ? 'Карточка снова удалена' : 'Card deleted again');
                }
            } else if (action.type === 'CREATE_CARD') {
                const res = await fetch(`${API_BASE}/tasks/restore`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(action.taskData)
                });
                if (res.ok) {
                    const restored = await res.json();
                    action.restoredTaskId = restored.id;
                    await refreshBoard();
                    showToast(currentLang === 'ru' ? 'Повтор' : 'Redo', `${currentLang === 'ru' ? 'Восстановлена карточка' : 'Restored card'} «${stripMarkdownToPlain(restored.title)}»`);
                }
            }
        } catch (e) {
            console.error('Redo error:', e);
            showToast(t('alerts.error'), 'Не удалось повторить действие', true);
        }
    }

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
            e.preventDefault();
            const hbBtn = document.querySelector('.hb-separator');
            if (hbBtn) hbBtn.click();
        }

        // Перехват Cmd+Z / Ctrl+Z и Cmd+Y / Ctrl+Y / Shift+Cmd+Z (с поддержкой русской раскладки Я/Н)
        const keyLower = (e.key || '').toLowerCase();
        const isZ = keyLower === 'z' || keyLower === 'я' || e.code === 'KeyZ';
        const isY = keyLower === 'y' || keyLower === 'н' || e.code === 'KeyY';
        const mod = e.metaKey || e.ctrlKey;

        if (mod && (isZ || isY)) {
            const active = document.activeElement;
            const isEditingText = active && (
                active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.isContentEditable ||
                active.closest('.CodeMirror') ||
                active.closest('.is-renaming') ||
                active.closest('.card-entering') ||
                active.closest('.column-entering') ||
                active.closest('.ai-msg-edit')
            );

            // Если фокус не находится в текстовом поле ввода — выполняем отмену карточки
            if (!isEditingText) {
                if (isZ && !e.shiftKey) {
                    e.preventDefault();
                    undoBoardAction();
                } else if (isY || (isZ && e.shiftKey)) {
                    e.preventDefault();
                    redoBoardAction();
                }
            }
        }
    });

    // ============================================================
// ⌨️ Быстрое удаление карточки по Delete / Backspace при наведении
// ============================================================
document.addEventListener('keydown', async (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;

    // 1. Игнорируем, если открыто любое модальное окно или Space (бесконечный холст)
    if (document.querySelector('.modal-overlay.show, .space-view.show')) return;

    // 2. Игнорируем, если происходит перетаскивание элементов
    if (typeof isDragging !== 'undefined' && isDragging) return;

    // 3. Игнорируем, если фокус находится в любом текстовом поле ввода
    const active = document.activeElement;
    const isEditing = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable ||
        active.closest('.CodeMirror') ||
        active.closest('.is-renaming') ||
        active.closest('.card-entering') ||
        active.closest('.column-entering')
    );
    if (isEditing) return;

    // 4. Мгновенное удаление карточки под курсором (нативный :hover)
    const targetCard = document.querySelector('.card:hover:not(.card-drag-clone):not(.card-entering)');
    if (targetCard && document.body.contains(targetCard)) {
        const taskId = parseInt(targetCard.dataset.cardId);
        if (!taskId || isNaN(taskId)) return;

        e.preventDefault();
        const cardToDelete = targetCard;

            closeAllDropdowns();

            // Запускаем плавное анимационное исчезновение
            animateCardDeletion(cardToDelete);

            for (let col of state.columns) {
                col.tasks = col.tasks.filter(t => t.id !== taskId);
                col.tasks.forEach(parentTask => {
                    if (parentTask.subtasks) {
                        const originalLength = parentTask.subtasks.length;
                        parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== taskId);
                        if (parentTask.subtasks.length !== originalLength) {
                            const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                            if (parentCardEl) updateCardAppearance(parentCardEl, parentTask, col.mode);
                        }
                    }
                });
            }

            deleteTask(taskId).then(data => {
                const deletedIds = data.deleted_ids || [];
                const snapshot = data.snapshot;
                if (snapshot) pushBoardAction({ type: 'DELETE_CARD', taskData: snapshot });

                deletedIds.forEach(id => {
                    if (id === taskId) return;
                    const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                    if (boardCard) animateCardDeletion(boardCard);

                    for (let col of state.columns) {
                        col.tasks = col.tasks.filter(t => t.id !== id);
                        col.tasks.forEach(parentTask => {
                            if (parentTask.subtasks) {
                                const originalLength = parentTask.subtasks.length;
                                parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== id);
                                if (parentTask.subtasks.length !== originalLength) {
                                    const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                                    if (parentCardEl) updateCardAppearance(parentCardEl, parentTask, col.mode);
                                }
                            }
                        });
                    }
                });
            }).catch(err => {
                console.error("Ошибка при удалении карточки:", err);
                refreshBoard();
            });
        }
    });

    try {
        if (!localStorage.getItem('doe-notif-requested')) {
            localStorage.setItem('doe-notif-requested', 'true');
            if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                Notification.requestPermission();
            }
        }

        const urlParams = new URLSearchParams(window.location.search);
        const isVaultMode = urlParams.get('mode') === 'vault' || window.__doeLaunchMode === 'vault';

        // ⚡️ Холодный старт: сервер отвечает мгновенно, а инициализация БД
        // (миграции большого хранилища) идёт в фоне. Окно уже видно —
        // показываем оверлей «Открытие хранилища...» и ждём готовности.
        try {
            const stRes = await fetch(`${API_BASE}/system/startup-status`).catch(() => null);
            let st = stRes && stRes.ok ? await stRes.json() : { state: 'ready' };
            if (st.state === 'starting') {
                if (!isVaultMode) window.showVaultOpeningOverlay();
                while (st.state === 'starting') {
                    await new Promise(r => setTimeout(r, 150));
                    const r2 = await fetch(`${API_BASE}/system/startup-status`).catch(() => null);
                    st = r2 && r2.ok ? await r2.json() : { state: 'ready' };
                }
                // Оверлей не прячем: ветка доски продолжит его этапами загрузки,
                // ветка экрана выбора скроет его сама.
            }
        } catch (e) { /* сервер старой версии без эндпоинта — работаем как раньше */ }

        const [settingsData, vaultData] = await Promise.all([
            fetchSettings().catch(() => ({})),
            fetchVault().catch(() => ({ name: null, path: null }))
        ]);

        window.appSettings = settingsData;

        if (!vaultData.path || isVaultMode) {
            window.hideVaultOverlay(); // на экране выбора оверлей открытия не нужен
            document.getElementById('vault-screen').classList.remove('hidden', 'content-hidden');
            const lights = document.getElementById('mac-traffic-lights');
            if (lights) lights.classList.add('vault-mode');

            document.body.classList.remove('preload');
            setTimeout(triggerReveal, 50);

            try {
                if (settingsData.theme) applyTheme(settingsData.theme, false);
                if (settingsData.language) applyLanguage(settingsData.language, false);
                window.applyExtensionsUI(settingsData.extensions);
                updateAppFont(settingsData.ui_font, settingsData.custom_font);
            } catch (e) {}

            renderVaultHistory();
            return;
        }

        window.currentVaultPath = vaultData.path;

        // 🎨 Применяем тему и язык из сохранённых настроек ДО отрисовки доски.
        // Раньше ветка доски этого не делала (в отличие от экрана выбора),
        // поэтому тема/язык, выставленные на экране выбора хранилищ,
        // не подхватывались: currentLang оставался дефолтным 'ru'.
        try {
            if (settingsData.theme) applyTheme(settingsData.theme, false);
            if (settingsData.language) applyLanguage(settingsData.language, false);
        } catch (e) {}

        // 📊 Этап «Загрузка хранилища...»: окно доски показывается сразу,
        // но при большом количестве заметок доска долго оставалась пустой.
        // Оверлей со ступенчатым прогрессом закрывает эту паузу и визуально
        // продолжает этапы расшифровки/открытия с экрана выбора.
        const setLoadStage = window.showVaultLoadingOverlay();
        setLoadStage(25, 'security.loadStageSettings');

        const mainVaultScreen = document.getElementById('vault-screen');
        if (mainVaultScreen) {
            mainVaultScreen.classList.add('hidden', 'content-hidden');
        }

        setLoadStage(35, 'security.loadStageWorkspaces');
        const workspacesData = await fetchWorkspaces().catch(() => []);
        setLoadStage(55, 'security.loadStageCards');

        const isTabsHidden = settingsData.tabs_hidden === true;
        if (isTabsHidden) document.body.classList.add('tabs-hidden');
        else document.body.classList.remove('tabs-hidden');

        window.applyExtensionsUI(settingsData.extensions);

        if (settingsData.priority_settings) applyPriorityStyles(settingsData.priority_settings);
        else applyPriorityStyles(window.prioritySettings);

        updateAppFont(settingsData.ui_font, settingsData.custom_font);
        const uiFontInput = document.getElementById('ui-font-input');
        if (uiFontInput) uiFontInput.value = settingsData.ui_font ? settingsData.ui_font : `Inter (${t('modals.fontSystemDefault')})`;

        updateVaultName(vaultData.name);
        state.workspaces = workspacesData;

        let targetWorkspaceId = settingsData.active_workspace_id;
        if (!targetWorkspaceId || !state.workspaces.find(w => w.id === targetWorkspaceId)) {
            if (state.workspaces.length > 0) targetWorkspaceId = state.workspaces[0].id;
        }

        state.activeWorkspaceId = targetWorkspaceId;
        renderTabs(true);

        if (state.activeWorkspaceId) {
            const columnsData = await fetchColumns(state.activeWorkspaceId);
            setLoadStage(85, 'security.loadStageRender');
            state.columns = columnsData.map(col => ({ ...col, collapsed: col.collapsed || false }));

            renderBoard();
            adjustCollapsedColumnWidths();
            clampExpandedTitles();
            triggerGarbageCollector();
        } else {
            setLoadStage(85, 'security.loadStageRender');
            renderBoard();
        }

        // Доска отрисована — доводим полосу и плавно убираем оверлей
        setLoadStage(100, null);
        setTimeout(() => window.hideVaultOverlay(), 180);

        initTimerCulling();
        setInterval(updateTimers, 250);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                updateTimers();
                updateBellBadge();
            }
        });

        setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/system/pending-highlights`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.task_id) {
                    const ctxRes = await fetch(`${API_BASE}/tasks/${data.task_id}/context`);
                    if (!ctxRes.ok) return;

                    const context = await ctxRes.json();
                    const taskModal = document.getElementById('task-modal');
                    if (taskModal && taskModal.classList.contains('show')) taskModal.classList.remove('show');

                    window.navigateToEntityGlobal(context.workspace_id, context.column_id, data.task_id, null, true, true);
                    updateBellBadge();
                }
            } catch (e) {}
        }, 1000);

        await updateBellBadge().catch(console.error);

        document.body.classList.remove('preload');
        setTimeout(triggerReveal, 50);

    } catch (e) {
        console.error("Fatal initialization error:", e);
        try { window.hideVaultOverlay(); } catch (_) {}
        document.body.classList.remove('preload');
        setTimeout(triggerReveal, 50);
    }
})();

