// ---------- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ----------
let state = { columns: [], workspaces: [], activeWorkspaceId: null };
const API_BASE = '/api/v1';

// ---------- ЛОКАЛИЗАЦИЯ ----------
const translations = {
    ru: {
        settings: 'Настройки', theme: 'Тема', language: 'Язык', about: 'О приложении', workspace: 'Doe Board', cancel: 'Отмена',
        newColumn: '+ Создать колонку', newTask: '+ Новая задача',
        columnModes: { default: 'Стандартный', track_time: 'Учёт времени', completion: 'Результирующий' },
        menu: { mode: 'Режим колонки', collapse: 'Свернуть колонку', rename: 'Переименовать', delete: 'Удалить', clear: 'Очистить', open: 'Открыть', deleteCard: 'Удалить задачу', clearTimer: 'Очистить таймер'},
        modals: { themeTitle: 'Тема оформления', light: 'Светлая', dark: 'Тёмная', langTitle: 'Выберите язык', aboutTitle: 'О приложении', aboutDesc: 'эстетика, грация локального<br>Kanban-хранилища' },
        card: { timeSpent: 'Времени потрачено:' },
        prompts: { 
            taskTitle: 'Название задачи:', columnTitle: 'Название колонки:', renameColumn: 'Новое название:', 
            deleteConfirmTitle: 'Удалить колонку?',
            deleteConfirmDesc: 'Все задачи внутри будут потеряны.',
            clearConfirmTitle: 'Очистить колонку?',
            clearConfirmDesc: 'Все задачи внутри будут удалены безвозвратно.',
            newTabTitle: 'Название новой вкладки:',
            deleteTabConfirm: 'Удалить вкладку?',
            deleteTabDesc: 'Вкладка и все колонки в ней будут удалены навсегда.'
        },
        errors: { tooLong: 'Максимум 200 символов' },
        alerts: { loadError: 'Не удалось загрузить доску', error: 'Ошибка' }
    },
    en: {
        settings: 'Settings', theme: 'Theme', language: 'Language', about: 'About', workspace: 'Doe Board', cancel: 'Cancel',
        newColumn: '+ Create column', newTask: '+ New task',
        columnModes: { default: 'Standard', track_time: 'Track time', completion: 'Completed' },
        menu: { mode: 'Column mode', collapse: 'Collapse column', rename: 'Rename', delete: 'Delete', clear: 'Clear', open: 'Open', deleteCard: 'Delete task', clearTimer: 'Clear timer'},
        modals: { themeTitle: 'Theme', light: 'Light', dark: 'Dark', langTitle: 'Select language', aboutTitle: 'About', aboutDesc: 'aesthetic local-first<br>kanban sanctuary' },
        card: { timeSpent: 'Time spent:' },
        prompts: { 
            taskTitle: 'Task title:', columnTitle: 'Column title:', renameColumn: 'New name:', 
            deleteConfirmTitle: 'Delete column?',
            deleteConfirmDesc: 'All tasks inside will be lost.',
            clearConfirmTitle: 'Clear column?',
            clearConfirmDesc: 'All tasks inside will be permanently deleted.',
            newTabTitle: 'New tab name:',
            deleteTabConfirm: 'Delete tab?',
            deleteTabDesc: 'The tab and all its columns will be deleted permanently.'
        },
        errors: { tooLong: 'Maximum 200 characters' },
        alerts: { loadError: 'Failed to load board', error: 'Error' }
    }
};

let currentLang = 'ru';
let activeConfirmResolve = null; // Добавили эту строку

// --- НОВЫЕ ФУНКЦИИ ПРИМЕНЕНИЯ ТЕМЫ И ЯЗЫКА ---
function applyTheme(theme, saveToBackend = false) {
    const updateDOM = () => {
        if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');

        document.querySelectorAll('#theme-list .lang-item').forEach(el => {
            el.classList.toggle('active', el.dataset.themeValue === theme);
        });

        localStorage.setItem('doe-theme', theme);
        if (saveToBackend) updateSettings({ theme }).catch(console.error);
    };

    // Запускаем красивую анимацию "раскрывающегося круга" только при ручном клике пользователя (saveToBackend = true). 
    // При первоначальной загрузке приложения тема применяется мгновенно.
    if (saveToBackend && document.startViewTransition) {
        document.startViewTransition(updateDOM);
    } else {
        updateDOM();
    }
}

function applyLanguage(lang, saveToBackend = false) {
    currentLang = lang;
    localStorage.setItem('doe-lang', lang);
    if (saveToBackend) updateSettings({ language: lang }).catch(console.error);

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const translation = getNestedTranslation(lang, key);
        if (translation) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = translation;
            else if (key === 'modals.aboutDesc') el.innerHTML = translation;
            else el.textContent = translation;
        }
    });

    const langSpan = document.querySelector('[data-action="change-lang"] span');
    if (langSpan) langSpan.textContent = translations[lang].language;

    document.querySelectorAll('#lang-list .lang-item').forEach(el => {
        el.classList.toggle('active', el.dataset.value === lang);
    });

    if (state.columns.length > 0) renderBoard();
}

function getNestedTranslation(lang, path) { return path.split('.').reduce((obj, key) => obj?.[key], translations[lang]); }
function t(key, ...args) {
    const translation = getNestedTranslation(currentLang, key);
    if (typeof translation === 'function') return translation(...args);
    return translation || key;
}

// ---------- API-КЛИЕНТ ----------

async function saveWorkspacesOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/workspaces/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}

async function fetchWorkspaces() { 
    const res = await fetch(`${API_BASE}/workspaces/`); 
    if (!res.ok) throw new Error('Error'); return res.json(); 
}
async function createWorkspaceAPI(name) { 
    const res = await fetch(`${API_BASE}/workspaces/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!res.ok) throw new Error('Error'); return res.json();
}
async function updateWorkspaceAPI(id, name) {
    const res = await fetch(`${API_BASE}/workspaces/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Error');
    return res.json();
}
async function deleteWorkspaceAPI(id) { 
    const res = await fetch(`${API_BASE}/workspaces/${id}`, { method: 'DELETE' }); 
    if (!res.ok) throw new Error('Error'); 
}

async function fetchVault() {
    const res = await fetch(`${API_BASE}/system/vault`);
    if (!res.ok) throw new Error('Error fetch vault');
    return res.json();
}

async function switchVault() {
    const res = await fetch(`${API_BASE}/system/vault/switch`, { method: 'POST' });
    if (!res.ok) throw new Error('Canceled or error');
    return res.json();
}

function updateVaultName(name) {
    const workspaceSpan = document.querySelector('.workspace-btn span');
    if (workspaceSpan) {
        workspaceSpan.textContent = name;
        workspaceSpan.removeAttribute('data-i18n'); // Отключаем локализацию, чтобы оно не сбрасывалось на "Doe Board"
    }
}

async function saveTasksOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/tasks/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}

async function fetchColumns(workspaceId) { 
    const res = await fetch(`${API_BASE}/columns/?workspace_id=${workspaceId}`); 
    if (!res.ok) throw new Error('Error'); return res.json(); 
}

async function saveColumnsOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/columns/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}
async function createColumn(title, mode = 'default', workspaceId) {
    const res = await fetch(`${API_BASE}/columns/`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ title, mode, workspace_id: workspaceId }) 
    });
    if (!res.ok) throw new Error('Error'); return res.json();
}
async function updateColumn(id, data) {
    const res = await fetch(`${API_BASE}/columns/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Error'); return res.json();
}
function formatTotalTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}
async function deleteColumn(id) { const res = await fetch(`${API_BASE}/columns/${id}`, { method: 'DELETE' }); if (!res.ok) throw new Error('Error'); }
async function clearColumn(id) { 
    const res = await fetch(`${API_BASE}/columns/${id}/tasks`, { method: 'DELETE' }); 
    if (!res.ok) throw new Error('Error'); 
}
async function createTask(title, columnId) {
    const res = await fetch(`${API_BASE}/tasks/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, column_id: columnId }) });
    if (!res.ok) throw new Error('Error'); return res.json();
}
async function updateTask(id, data) {
    const res = await fetch(`${API_BASE}/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Error'); return res.json();
}
async function deleteTask(id) { const res = await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' }); if (!res.ok) throw new Error('Error'); }
async function moveTask(taskId, targetColumnId) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_column_id: targetColumnId }) });
    if (!res.ok) throw new Error('Error'); return res.json();
}

async function fetchSettings() {
    const res = await fetch(`${API_BASE}/system/settings`);
    if (!res.ok) throw new Error('Error fetch settings');
    return res.json();
}

async function updateSettings(data) {
    const res = await fetch(`${API_BASE}/system/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error saving settings');
}



function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

function formatTime(startTime) {
    // Подстраховка: если сервер всё же прислал без Z, добавляем, чтобы браузер не применял локальный пояс
    if (typeof startTime === 'string' && !startTime.endsWith('Z')) {
        startTime += 'Z'; 
    }
    const start = new Date(startTime); 
    
    // Math.max(0, ...) гарантирует, что при микрорассинхроне таймер не покажет 00:00:-1
    const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
    
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// ---------- РЕНДЕРИНГ ДОСКИ ----------
function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    const sorted = [...state.columns].sort((a, b) => a.position - b.position);
    for (const col of sorted) board.appendChild(createColumnElement(col));

    const addColBtn = document.createElement('button');
    addColBtn.className = 'new-column-btn';
    addColBtn.textContent = t('newColumn');
    addColBtn.addEventListener('click', onCreateColumn);
    board.appendChild(addColBtn);
    // Корректируем ширину свёрнутых колонок после layout
    requestAnimationFrame(() => {
        adjustCollapsedColumnWidths();
        clampExpandedTitles();  // ← добавлено
    });
}

function updateCardAppearance(cardElement, task, columnMode) {
    if (task.completed_at) cardElement.classList.add('is-completed');
    else cardElement.classList.remove('is-completed');

    const existingTimer = cardElement.querySelector('.card-timer');
    const existingMeta = cardElement.querySelector('.subtask-meta');

    if (columnMode === 'track_time' && task.active_timer) {
        if (!existingTimer) {
            const timerDiv = document.createElement('div');
            timerDiv.className = 'card-timer'; timerDiv.dataset.taskId = task.id;
            timerDiv.textContent = formatTime(task.active_timer.start_time);
            cardElement.appendChild(timerDiv);
        } else {
            existingTimer.textContent = formatTime(task.active_timer.start_time);
        }
        if (existingMeta) existingMeta.remove();
    } else if (columnMode === 'completion' && task.total_time_spent !== undefined && task.total_time_spent !== null) {
        if (existingTimer) existingTimer.remove();
        if (!existingMeta) {
            const metaDiv = document.createElement('div');
            metaDiv.className = 'subtask-meta';
            // ИСПРАВЛЕНО: Теперь используем функцию t() вместо жесткого текста
            metaDiv.textContent = `${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}`;
            cardElement.appendChild(metaDiv);
        } else {
            // ИСПРАВЛЕНО: Здесь тоже
            existingMeta.textContent = `${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}`;
        }
    } else {
        if (existingTimer) existingTimer.remove();
        if (existingMeta) existingMeta.remove();
    }
}

function generateCardHtml(task, columnMode) {
    let timeHtml = '';
    if (task.active_timer) {
        timeHtml = `<div class="card-timer" data-task-id="${task.id}">${formatTime(task.active_timer.start_time)}</div>`;
    } else if (columnMode === 'completion' && task.total_time_spent !== undefined && task.total_time_spent !== null) {
        timeHtml = `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
    }
    return `
        <div class="card ${task.completed_at ? 'is-completed' : ''}" data-card-id="${task.id}">
            <div class="card-title-wrapper">
                <svg class="completed-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <div class="card-title">${escapeHtml(task.title)}</div>
                <!-- Теперь меню находится здесь, на одном уровне с текстом -->
                <div class="card-menu-wrapper">
                    <button class="card-menu-btn" title="Редактировать">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                </div>
            </div>
            ${timeHtml}
        </div>
    `;
}

function createColumnElement(column) {
    const colDiv = document.createElement('div');
    colDiv.className = 'column';
    colDiv.dataset.columnId = column.id;
    
    if (column.collapsed) colDiv.classList.add('collapsed');

    let pillClass = 'meta-pill default';
    let modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>';
    if (column.mode === 'track_time') {
        pillClass = 'meta-pill track-time';
        modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    } else if (column.mode === 'completion') {
        pillClass = 'meta-pill completion';
        modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    }

    const sortedTasks = [...column.tasks].sort((a, b) => a.position - b.position);
    
    // Используем новую функцию генерации HTML для карточек
    const tasksHtml = sortedTasks.map(task => generateCardHtml(task, column.mode)).join('');

    colDiv.innerHTML = `
        <div class="column-header">
            <span class="column-title" data-full-title="${escapeHtml(column.title)}">${escapeHtml(column.title)}</span>
            <div class="column-actions">
                <div class="${pillClass}">
                    <span class="card-count">${column.tasks.length}</span>
                    ${modeIcon}
                </div>
                <button class="menu-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></button>
            </div>
        </div>
        <div class="dropdown-menu">
            <div class="menu-label">${t('menu.mode')}</div>
            <div class="menu-item ${column.mode === 'default' ? 'selected' : ''}" data-action="set-mode" data-mode="default">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                <span>${t('columnModes.default')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-item ${column.mode === 'track_time' ? 'selected' : ''}" data-action="set-mode" data-mode="track_time">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${t('columnModes.track_time')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-item ${column.mode === 'completion' ? 'selected' : ''}" data-action="set-mode" data-mode="completion">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${t('columnModes.completion')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-divider"></div>
            <div class="menu-item" data-action="collapse-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg><span>${t('menu.collapse')}</span></div>
            <div class="menu-item" data-action="rename-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>${t('menu.rename')}</span></div>
            <div class="menu-item danger" data-action="clear-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M19 10l-4 4"/><path d="M15 10l4 4"/></svg><span>${t('menu.clear')}</span></div>
            <div class="menu-item danger" data-action="delete-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>${t('menu.delete')}</span></div>
        </div>
        <div class="card-list">${tasksHtml}</div>
        <button class="btn-add-card">${t('newTask')}</button>
    `;

    const addBtn = colDiv.querySelector('.btn-add-card');
    addBtn.addEventListener('click', () => onAddTask(column.id));

    const menuBtn = colDiv.querySelector('.menu-btn');
    menuBtn.addEventListener('click', (e) => toggleColumnMenu(e, colDiv));

    return colDiv;
}

async function clearTaskTimerAPI(taskId) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/clear-timer`, { method: 'POST' });
    if (!res.ok) throw new Error('Error');
    return res.json();
}

async function refreshBoard(scrollToActive = false, newTabId = null) { // <--- ДОБАВИЛ newTabId = null
    try {
        // 1. Запрашиваем вкладки
        state.workspaces = await fetchWorkspaces();
        
        // Предохранитель (если БД пустая)
        if (state.workspaces.length === 0) {
            const ws = await createWorkspaceAPI("Main");
            state.workspaces.push(ws);
        }

        // Если активная вкладка не выбрана или была удалена с другого устройства - берем первую
        if (!state.activeWorkspaceId || !state.workspaces.find(w => w.id === state.activeWorkspaceId)) {
            state.activeWorkspaceId = state.workspaces[0].id;
        }

        renderTabs(scrollToActive, newTabId);

        // 2. Запрашиваем колонки только для активной вкладки
        const columns = await fetchColumns(state.activeWorkspaceId);
        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
        renderBoard();
        
    } catch (e) { 
        console.error(e); 
    }
}

// --- НАЧАЛО ВСТАВКИ 2 ---
// Создание элемента формы задачи
function createCardFormElement() {
    const card = document.createElement('div');
    card.className = 'card card-entering';
    const placeholder = t('prompts.taskTitle').replace(/:$/, '');
    card.innerHTML = `
        <textarea 
            class="card-input" 
            placeholder="${placeholder}" 
            autocomplete="off"
            spellcheck="false"
            rows="1"
        ></textarea>
    `;
    return card;
}

// Новая анимированная функция добавления задачи
async function onAddTask(columnId) {
    const columnEl = document.querySelector(`.column[data-column-id="${columnId}"]`);
    if (!columnEl) return;

    // Игнорируем вызов, если только что закрыли пустую форму кликом по этой же кнопке
    if (columnEl.dataset.ignoreNextAdd === 'true') return;

    // Сначала удаляем форму, если она в процессе исчезновения (чтобы не было перескока курсора)
    const exitingForm = columnEl.querySelector('.card-entering.is-exiting');
    if (exitingForm) exitingForm.remove();

    // Если в этой колонке уже открыта (и не исчезает) форма ввода — просто фокусируемся на ней
    const existingForm = columnEl.querySelector('.card-entering:not(.is-exiting)');
    if (existingForm) {
        existingForm.querySelector('textarea')?.focus();
        return;
    }

    columnEl.setAttribute('draggable', 'false');

    const cardList = columnEl.querySelector('.card-list');
    const formCard = createCardFormElement();
    
    // Добавляем форму в конец списка
    cardList.appendChild(formCard);
    
    // Запускаем анимацию появления
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            formCard.classList.add('entered');
            // Прокручиваем список в самый низ, чтобы форма была видна
            cardList.scrollTop = cardList.scrollHeight;
        });
    });

    const input = formCard.querySelector('.card-input');
    
    // Автоматическое изменение высоты textarea
    const autoResize = () => {
        input.style.height = 'auto';
        const sh = input.scrollHeight;
        const maxHeight = 120; // Лимит высоты ввода
        if (sh > maxHeight) {
            input.style.height = maxHeight + 'px';
            input.style.overflowY = 'auto';
        } else {
            input.style.height = sh + 'px';
            input.style.overflowY = 'hidden';
        }
    };
    
    input.addEventListener('input', autoResize);
    autoResize();
    input.focus();

    let isResolved = false;

    // Функция отмены (скрытие с анимацией или без)
    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;

        columnEl.setAttribute('draggable', 'true');
        
        // Снимаем фокус с поля, чтобы мгновенно скрыть текстовый курсор перед анимацией
        input.blur();

        if (!animate) {
            formCard.remove();
            return;
        }

        formCard.classList.remove('entered');
        formCard.classList.add('is-exiting');

        const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity') {
                formCard.remove();
                formCard.removeEventListener('transitionend', onTransitionEnd);
            }
        };
        formCard.addEventListener('transitionend', onTransitionEnd);
        
        setTimeout(() => { if (formCard.parentNode) formCard.remove(); }, 400);
    };

    // Функция сохранения на сервер
    const submit = async () => {
        const title = input.value.trim();
        if (!title) {
            cancel(true);
            return;
        }

        // 🛡 МГНОВЕННАЯ ПРОВЕРКА НА 200 СИМВОЛОВ (Создание)
        if (title.length > 200) {
            formCard.classList.remove('is-error');
            void formCard.offsetWidth; // 🪄 Сбрасываем DOM для гарантированного перезапуска анимации
            formCard.classList.add('is-error');
            setTimeout(() => formCard.classList.remove('is-error'), 400);
            input.focus();
            return;
        }

        // Единая проверка блокировки двойного клика
        if (isResolved) return;
        isResolved = true;

        columnEl.setAttribute('draggable', 'true');

        input.disabled = true;
        formCard.classList.add('is-submitting');

        try {
            const newTask = await createTask(title, columnId);
            
            // Добавляем в стейт
            const columnState = state.columns.find(c => c.id === columnId);
            if (columnState) {
                columnState.tasks.push(newTask);
            }

            // Создаем настоящую карточку
            const realCardStr = generateCardHtml(newTask, columnState ? columnState.mode : 'default');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = realCardStr.trim();
            const realCard = tempDiv.firstChild;
            
            realCard.classList.add('card-birth');

            // Заменяем форму на готовую карточку
            formCard.replaceWith(realCard);
            updateColumnCount(columnEl);

            // Анимация окончательного проявления карточки
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    realCard.classList.add('born');
                });
            });

            const cleanup = (e) => {
                if (e.propertyName === 'transform') {
                    realCard.classList.remove('card-birth', 'born');
                    realCard.removeEventListener('transitionend', cleanup);
                }
            };
            realCard.addEventListener('transitionend', cleanup);
            setTimeout(() => realCard.classList.remove('card-birth', 'born'), 500);

        } catch (err) {
            console.error('Task creation failed:', err);
            isResolved = false;
            columnEl.setAttribute('draggable', 'false');
            input.disabled = false;
            formCard.classList.remove('is-submitting');
            formCard.classList.add('is-error'); // Тряска при ошибке
            setTimeout(() => formCard.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(true); }
    });

    // --- ДОБАВЛЕНО: Изолируем клики мыши, чтобы карточка не "захватывалась" ---
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousemove', (e) => e.stopPropagation());
    input.addEventListener('touchstart', (e) => e.stopPropagation());

    input.addEventListener('blur', () => {
        if (isResolved) return;

        requestAnimationFrame(() => {
            if (isResolved) return;

            const active = document.activeElement;
            const thisAddBtn = columnEl.querySelector('.btn-add-card');
            const isThisAddBtn = active === thisAddBtn;

            // Если кликнули на ДРУГУЮ кнопку "Добавить", закрываем без анимации
            if (active && active.closest('.btn-add-card') && !isThisAddBtn) {
                cancel(false);
                return;
            }

            if (input.value.trim()) {
                submit();
            } else {
                // Если пустая и кликнули на СВОЮ ЖЕ кнопку "Добавить" - закрываем с анимацией
                // и блокируем повторное открытие по событию click на 100мс
                if (isThisAddBtn) {
                    columnEl.dataset.ignoreNextAdd = 'true';
                    setTimeout(() => delete columnEl.dataset.ignoreNextAdd, 100);
                }
                cancel(true);
            }
        });
    });
}
// --- КОНЕЦ ВСТАВКИ 2 ---

// ==========================================
// АНИМАЦИЯ СОЗДАНИЯ КОЛОНКИ (Column Birth)
// ==========================================

// ==========================================
// АНИМАЦИЯ СОЗДАНИЯ КОЛОНКИ (исправленная)
// ==========================================

function createColumnFormElement() {
    const col = document.createElement('div');
    col.className = 'column column-entering';
    const placeholder = t('prompts.columnTitle').replace(/:$/, '');
    col.innerHTML = `
        <div class="column-form-inner">
            <textarea 
                class="column-input" 
                placeholder="${placeholder}" 
                autocomplete="off"
                spellcheck="false"
                rows="1"
            ></textarea>
        </div>
    `;
    return col;
}

function restoreAddButton() {
    const board = document.getElementById('board');
    if (board.querySelector('.new-column-btn')) return;
    
    const btn = document.createElement('button');
    btn.className = 'new-column-btn';
    btn.textContent = t('newColumn');
    btn.addEventListener('click', onCreateColumn);
    board.appendChild(btn);
    return btn;
}

async function onCreateColumn() {
    const board = document.getElementById('board');
    const addBtn = board.querySelector('.new-column-btn');
    if (!addBtn) return;

    const formCol = createColumnFormElement();
    
    // Мгновенная замена кнопки на форму — ширина доски не меняется ни на пиксель
    addBtn.replaceWith(formCol);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            formCol.classList.add('entered');
        });
    });

    const input = formCol.querySelector('.column-input');
    input.focus();

    let isResolved = false;

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;
        
        input.blur();

        if (!animate) {
            formCol.remove();
            restoreAddButton();
            return;
        }

        // --- ИДЕАЛЬНО ПЛАВНЫЙ КРОСС-ФЕЙД ---
        formCol.classList.remove('entered');
        formCol.classList.add('is-exiting');

        setTimeout(() => {
            if (formCol.parentNode) {
                const btn = restoreAddButton();
                if (btn && formCol.parentNode) {
                    formCol.replaceWith(btn);
                }
            }
        }, 120);
    };

    // Авто-resize со скроллом при превышении высоты экрана
    const autoResize = () => {
        input.style.height = 'auto';
        const sh = input.scrollHeight;
        const boardHeight = document.getElementById('board').clientHeight;
        
        const maxAllowedHeight = Math.max(60, boardHeight - 60);
        
        if (sh > maxAllowedHeight) {
            input.style.height = maxAllowedHeight + 'px';
            input.style.overflowY = 'auto'; 
        } else {
            input.style.height = sh + 'px';
            input.style.overflowY = 'hidden'; 
        }
    };

    input.addEventListener('input', autoResize);
    autoResize();

    const submit = async () => {
        const title = input.value.trim();
        if (!title) {
            cancel(true);
            return;
        }

        if (isResolved) return;
        isResolved = true;

        input.disabled = true;
        formCol.classList.add('is-submitting');

        try {
            const newColumn = await createColumn(title, 'default', state.activeWorkspaceId);

            state.columns.push({
                ...newColumn,
                collapsed: false,
                tasks: newColumn.tasks || []
            });

            const realCol = createColumnElement({
                ...newColumn,
                collapsed: false,
                tasks: newColumn.tasks || []
            });
            realCol.classList.add('column-birth');

            formCol.replaceWith(realCol);

            requestAnimationFrame(() => {
                const newTitle = realCol.querySelector('.column-title');
                clampSingleTitle(newTitle);
            });

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    realCol.classList.add('born');
                });
            });

            const cleanup = (e) => {
                if (e.propertyName === 'transform') {
                    realCol.classList.remove('column-birth', 'born');
                    realCol.removeEventListener('transitionend', cleanup);
                }
            };
            realCol.addEventListener('transitionend', cleanup);
            setTimeout(() => realCol.classList.remove('column-birth', 'born'), 500);

            restoreAddButton();

        } catch (err) {
            console.error('Column creation failed:', err);
            isResolved = false;
            input.disabled = false;
            formCol.classList.remove('is-submitting');
            formCol.classList.add('is-error');
            setTimeout(() => formCol.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            cancel(true);
        }
    });

    input.addEventListener('blur', () => {
        if (isResolved) return;

        requestAnimationFrame(() => {
            if (isResolved) return;

            const active = document.activeElement;
            if (active && active.closest('.new-column-btn')) {
                cancel(false);
                return;
            }

            if (input.value.trim()) {
                submit();
            } else {
                cancel(true);
            }
        });
    });
}

// ---------- РЕНДЕРИНГ ВКЛАДОК ----------
function renderTabs(scrollToActive = false, newTabId = null) {
    const container = document.getElementById('tabs-container');
    const savedScroll = container.scrollLeft; 
    container.innerHTML = '';

    state.workspaces.sort((a, b) => a.position - b.position);

    state.workspaces.forEach(ws => {
        const tab = document.createElement('div');
        tab.className = `board-tab ${ws.id === state.activeWorkspaceId ? 'active' : ''}`;
        
        // Добавляем класс анимации, если это свежесозданная вкладка
        if (ws.id === newTabId) {
            tab.classList.add('tab-birth');
        }
        
        tab.dataset.workspaceId = ws.id;
        
        const canDelete = state.workspaces.length > 1;
        tab.innerHTML = `
            <span class="tab-name" data-full-title="${escapeHtml(ws.name)}">${escapeHtml(ws.name)}</span>
            <button class="tab-close-btn ${!canDelete ? 'hidden' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        tab.addEventListener('click', async (e) => {
            if (e.target.closest('.tab-close-btn')) return;
            
            // Если вкладка не активна - переключаемся на неё
            if (ws.id !== state.activeWorkspaceId) {
                e.stopPropagation();
                closeAllDropdowns();
                
                // 1. Оптимистичное обновление UI (мгновенно, без перерисовки всего DOM)
                document.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // 2. Обновляем стейт
                state.activeWorkspaceId = ws.id;
                updateSettings({ active_workspace_id: ws.id }).catch(console.error);
                
                // 3. Загружаем и рендерим ТОЛЬКО колонки для новой вкладки
                try {
                    const columns = await fetchColumns(state.activeWorkspaceId);
                    state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
                    renderBoard();
                } catch (err) {
                    console.error('Ошибка загрузки колонок:', err);
                    // Фолбэк: если что-то пошло не так, перезагружаем всё полностью
                    refreshBoard(); 
                }
            }
        });

        if (canDelete) {
            tab.querySelector('.tab-close-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // Подтверждение оставляем, но само удаление после него будет мгновенным
                const isConfirmed = await showConfirmModal(t('prompts.deleteTabConfirm'), t('prompts.deleteTabDesc'));
                if (!isConfirmed) return;

                const currentIndex = state.workspaces.findIndex(w => w.id === ws.id);
                const isActive = (ws.id === state.activeWorkspaceId);

                // --- OPTIMISTIC UI: Мгновенное обновление стейта ---
                state.workspaces.splice(currentIndex, 1);

                if (isActive) {
                    // Умный фокус: берем следующую (на то же место), если удалили последнюю — берем предыдущую
                    const nextIndex = Math.min(currentIndex, state.workspaces.length - 1);
                    state.activeWorkspaceId = state.workspaces[nextIndex].id;
                    
                    // Синхронно перерисовываем только вкладки, чтобы UI не моргал
                    renderTabs(true); 
                    
                    // Сразу запрашиваем и рисуем новую доску (без ожидания удаления старой)
                    try {
                        const columns = await fetchColumns(state.activeWorkspaceId);
                        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
                        renderBoard();
                        // Фоновое сохранение настроек
                        updateSettings({ active_workspace_id: state.activeWorkspaceId }).catch(() => {});
                    } catch (err) { console.error(err); }
                } else {
                    // Если удалили неактивную — просто перерисовываем ряд вкладок
                    renderTabs(false);
                }

                // --- ФОНОВЫЙ ЗАПРОС: Удаляем в базе без блокировки UI ---
                deleteWorkspaceAPI(ws.id).catch(err => {
                    console.error("API Error:", err);
                    // В случае жесткой ошибки API можно вызвать refreshBoard() для синхронизации, 
                    // но для пользователя всё уже произошло.
                });
            });
        }
        container.appendChild(tab);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    
    // ПРИВЯЗЫВАЕМ НОВУЮ КРАСИВУЮ ФУНКЦИЮ
    addBtn.addEventListener('click', onAddTabClick);
    
    container.appendChild(addBtn);

    if (scrollToActive) {
        requestAnimationFrame(() => {
            const activeTab = container.querySelector('.board-tab.active');
            if (activeTab) {
                activeTab.scrollIntoView({ 
                    behavior: newTabId ? 'smooth' : 'auto', 
                    block: 'nearest', 
                    inline: 'center' 
                });
            }
            if (window.updateTabsScrollbar) window.updateTabsScrollbar();
        });
    } else {
        container.scrollLeft = savedScroll; 
        requestAnimationFrame(() => {
            if (window.updateTabsScrollbar) window.updateTabsScrollbar();
        });
    }

    // Если была создана новая вкладка — триггерим анимацию её появления
    if (newTabId) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newTabEl = container.querySelector('.tab-birth');
                if (newTabEl) {
                    newTabEl.classList.add('born');
                    setTimeout(() => newTabEl.classList.remove('tab-birth', 'born'), 500);
                }
            });
        });
    }
}

// Вспомогательная функция для мгновенного и плавного восстановления кнопки "+" во вкладках
function restoreTabAddButton(container, replaceElement = null) {
    if (container.querySelector('.add-tab-btn')) return;

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    addBtn.addEventListener('click', onAddTabClick);

    if (replaceElement && replaceElement.parentNode === container) {
        replaceElement.replaceWith(addBtn);
    } else {
        container.appendChild(addBtn);
    }
    
    if (window.updateTabsScrollbar) window.updateTabsScrollbar();
    return addBtn;
}

function onAddTabClick(e) {
    const container = document.getElementById('tabs-container');
    const addBtn = container.querySelector('.add-tab-btn');
    if (!addBtn) return;

    if (container.querySelector('.tab-entering:not(.is-exiting)')) return;

    // 1. Создаем форму
    const formTab = document.createElement('div');
    formTab.className = 'board-tab tab-entering';
    const placeholder = t('prompts.newTabTitle').replace(/:$/, '');
    formTab.innerHTML = `<input type="text" class="tab-input" placeholder="${placeholder}" autocomplete="off" spellcheck="false" />`;

    // ЗАМЕНА: Кнопка уходит, форма встает на её место.
    addBtn.replaceWith(formTab);

    const input = formTab.querySelector('.tab-input');
    const autoResize = () => {
        const span = document.createElement('span');
        span.style.font = window.getComputedStyle(input).font;
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.textContent = input.value || input.placeholder;
        document.body.appendChild(span);
        input.style.width = Math.max(100, span.getBoundingClientRect().width + 8) + 'px';
        document.body.removeChild(span);
    };
    
    input.addEventListener('input', autoResize);
    autoResize();
    input.focus({ preventScroll: true });

    requestAnimationFrame(() => {
        formTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        requestAnimationFrame(() => formTab.classList.add('entered'));
    });

    let isResolved = false;

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;
        input.blur();

        if (!animate) {
            formTab.remove();
            if (!container.querySelector('.add-tab-btn')) container.appendChild(addBtn);
            return;
        }

        // --- ТЕХНИКА "WIDTH LOCK" ---
        
        // 1. Замеряем текущую ширину формы (широкая)
        const currentWidth = formTab.offsetWidth;
        
        // 2. Создаем обертку-распорку с той же шириной
        const wrapper = document.createElement('div');
        wrapper.className = 'tab-spacer-wrapper';
        wrapper.style.width = `${currentWidth}px`;

        // 3. Создаем новую кнопку плюса
        const newBtn = document.createElement('button');
        newBtn.className = 'add-tab-btn tab-btn-fade-in';
        newBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        newBtn.addEventListener('click', onAddTabClick);

        // 4. Кладем кнопку в распорку и подменяем форму распоркой
        wrapper.appendChild(newBtn);
        formTab.replaceWith(wrapper);

        // 5. На следующем кадре "схлопываем" ширину распорки до размера кнопки (32px)
        requestAnimationFrame(() => {
            wrapper.style.width = '32px';
        });

        // 6. Когда анимация закончилась, вынимаем кнопку и удаляем распорку
        const onEnd = (e) => {
            if (e.propertyName === 'width') {
                newBtn.classList.remove('tab-btn-fade-in');
                wrapper.replaceWith(newBtn);
                wrapper.removeEventListener('transitionend', onEnd);
                if (window.updateTabsScrollbar) window.updateTabsScrollbar();
            }
        };
        wrapper.addEventListener('transitionend', onEnd);
    };

    const submit = async () => {
        const name = input.value.trim();
        if (!name) { cancel(true); return; }
        if (isResolved) return;
        isResolved = true;
        input.disabled = true;
        formTab.classList.add('is-submitting');

        try {
            const newWs = await createWorkspaceAPI(name);
            state.workspaces.push(newWs);
            state.activeWorkspaceId = newWs.id;
            updateSettings({ active_workspace_id: newWs.id }).catch(console.error);
            await refreshBoard(true, newWs.id);
        } catch (err) {
            console.error(err);
            isResolved = false;
            input.disabled = false;
            formTab.classList.remove('is-submitting');
            formTab.classList.add('is-error');
            setTimeout(() => formTab.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
        if (ev.key === 'Escape') { ev.preventDefault(); cancel(true); }
    });

    input.addEventListener('blur', () => {
        if (isResolved) return;
        requestAnimationFrame(() => {
            if (isResolved) return;
            const active = document.activeElement;
            if (active && active.closest('.add-tab-btn')) { cancel(false); return; }
            if (input.value.trim()) submit(); else cancel(true);
        });
    });
}

function closeAllDropdowns() {
    // Закрываем все стандартные меню
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.menu-btn.active').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-trigger.active').forEach(b => b.classList.remove('active'));
    
    // Специфичное для карточек
    document.querySelectorAll('.card-menu-btn.active').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.card.has-open-menu').forEach(c => {
        c.classList.remove('has-open-menu');
    });
}

function toggleColumnMenu(e, columnEl) {
    e.stopPropagation();
    const menu = columnEl.querySelector('.dropdown-menu');
    const btn = columnEl.querySelector('.menu-btn');
    const isShowing = menu.classList.contains('show');
    
    closeAllDropdowns();
    
    if (!isShowing) {
        menu.classList.add('show');
        btn.classList.add('active');
    }
}

// --- ФУНКЦИЯ КАСТОМНОГО ПОДТВЕРЖДЕНИЯ (Идеальная плавность) ---
function showConfirmModal(title, message, confirmBtnText = t('menu.delete')) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        modal.querySelector('.confirm-title').textContent = title;
        modal.querySelector('.confirm-text').textContent = message;
        
        // Переводим кнопки на текущий язык
        modal.querySelector('.cancel-btn').textContent = t('cancel');
        modal.querySelector('.danger-btn').textContent = confirmBtnText;
        
        activeConfirmResolve = resolve; // Запоминаем функцию завершения
        modal.classList.add('show');    // Мгновенный показ
    });
}

// Функция разворачивания колонки
async function onExpandColumn(columnEl) {
    const columnId = parseInt(columnEl.dataset.columnId);
    const column = state.columns.find(c => c.id === columnId);
    if (!column) return;

    // 1. Убираем класс и обновляем состояние
    columnEl.classList.remove('collapsed');
    column.collapsed = false;

    // 2. КРИТИЧНО: Сбрасываем инлайновые стили ширины, 
    // чтобы колонка вернулась к своим CSS-ным 320px
    columnEl.style.width = '';
    columnEl.style.minWidth = '';

    // 3. Восстанавливаем текст заголовка из dataset
    const titleEl = columnEl.querySelector('.column-title');
    if (titleEl) {
        titleEl.textContent = titleEl.dataset.fullTitle || titleEl.textContent;
        // Убираем флаг обрезки для свернутого состояния
        titleEl.dataset.clamped = "false";
        
        // Даем браузеру обновить layout и применяем стандартный clamping для развернутого вида
        requestAnimationFrame(() => clampSingleTitle(titleEl));
    }
    
    // Показываем меню, если оно было скрыто инлайново при сворачивании
    const menu = columnEl.querySelector('.dropdown-menu');
    if (menu) menu.style.display = '';

    // 4. Отправляем в базу
    try {
        await updateColumn(columnId, { collapsed: false });
    } catch (err) {
        console.error('Failed to save expanded state', err);
    }
}

// --- ОБНОВЛЁННАЯ ФУНКЦИЯ МЕНЮ КОЛОНКИ ---
async function handleColumnMenu(action, columnEl, menuItem) {
    const columnId = parseInt(columnEl.dataset.columnId);
    const column = state.columns.find(c => c.id === columnId);
    if (!column) return;

    if (action === 'set-mode') {
        const mode = menuItem.dataset.mode;
        try { await updateColumn(columnId, { mode }); await refreshBoard(); } catch (e) { }
    } else if (action === 'rename-column') {
        closeAllDropdowns();
        setTimeout(() => startColumnRename(columnEl, column), 50);
    } else if (action === 'collapse-column') {
        closeAllDropdowns();
        
        // МГНОВЕННО прячем меню, чтобы оно не "улетало" за сужающейся колонкой
        const menu = columnEl.querySelector('.dropdown-menu');
        if (menu) menu.style.display = 'none';

        // 🛑 ОТКЛЮЧАЕМ МЫШКУ И ХОВЕР НА 0.35 СЕК
        columnEl.style.pointerEvents = 'none';
        columnEl.classList.add('is-collapsing'); // <--- ДОБАВИЛИ КЛАСС
        
        setTimeout(() => {
            columnEl.style.pointerEvents = '';
            columnEl.classList.remove('is-collapsing'); // <--- УБРАЛИ КЛАСС
        }, 350);
        
        column.collapsed = true;
        columnEl.classList.add('collapsed');

        // Очищаем инлайновые стили от развернутого состояния
        const titleEl = columnEl.querySelector('.column-title');
        if (titleEl) {
            titleEl.style.display = '';
            titleEl.style.webkitLineClamp = '';
        }
        
        // УБРАН setTimeout.
        // Вызываем расчет мгновенно! Браузер зафиксирует размеры и обрежет 
        // текст ДО того, как отрисует следующий кадр на экране.
        adjustCollapsedColumnWidths();

        updateColumn(columnId, { collapsed: true }).catch(err => {
            console.error('Failed to save collapsed state', err);
        });
    } else if (action === 'clear-column') {
        closeAllDropdowns();
        
        // 1. Показываем окно с текстом об очистке
        const isConfirmed = await showConfirmModal(
            t('prompts.clearConfirmTitle'), 
            t('prompts.clearConfirmDesc'),
            t('menu.clear')
        );
        if (!isConfirmed) return;

        const cardList = columnEl.querySelector('.card-list');
        const cards = cardList.querySelectorAll('.card');
        
        // 2. Локальное удаление с плавной анимацией
        cards.forEach(card => {
            card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
        });

        // Обновляем локальный стейт (очищаем массив задач)
        column.tasks = [];
        
        // Обновляем счетчик задач в шапке колонки (ставим 0)
        updateColumnCount(columnEl, 0);

        // 3. Отправляем запрос на сервер асинхронно
        clearColumn(columnId).catch(async e => {
            console.error("Очистка колонки не удалась:", e);
            await refreshBoard(); // Если ошибка - откатываем UI
            alert(t('alerts.error'));
        });

        // 4. Удаляем карточки из DOM после завершения анимации растворения
        setTimeout(() => {
            if (cardList) cardList.innerHTML = '';
        }, 250);

    } else if (action === 'delete-column') {
        
        closeAllDropdowns(); // Обязательно закрываем меню до клонирования
        
        const isConfirmed = await showConfirmModal(
            t('prompts.deleteConfirmTitle'), 
            t('prompts.deleteConfirmDesc')
        );
        
        if (!isConfirmed) return;

        // 1. Снимаем точные координаты и размеры удаляемой колонки
        const rect = columnEl.getBoundingClientRect();

        // 2. Создаем визуального клона для красивого растворения
        const clone = columnEl.cloneNode(true);
        clone.classList.add('column-deleting-clone');
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        document.body.appendChild(clone);

        // 3. Создаем невидимую пустую распорку для плавного сдвига соседей
        const spacer = document.createElement('div');
        spacer.className = 'column-spacer';
        spacer.style.width = `${rect.width}px`;
        spacer.style.minWidth = `${rect.width}px`;
        
        // Моментально меняем настоящую колонку на пустую распорку
        columnEl.replaceWith(spacer);

        // 4. Обновляем стейт и отправляем запрос на сервер
        state.columns = state.columns.filter(c => c.id !== columnId);
        deleteColumn(columnId).catch(async e => {
            console.error("Delete column failed:", e);
            await refreshBoard();
            alert(t('alerts.error'));
        });

        // 5. Запускаем анимации на следующем кадре (чтобы браузер успел отрисовать DOM)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                clone.classList.add('is-animating'); // Клон улетает в прозрачность
                spacer.classList.add('is-shrinking'); // Соседи плавно смыкаются
            });
        });

        // 6. Убираем мусор из DOM после завершения анимации
        setTimeout(() => {
            if (clone.parentNode) clone.remove();
            if (spacer.parentNode) spacer.remove();
        }, 450);
    }
}

// ==========================================
// ПЕРЕИМЕНОВАНИЕ ВКЛАДКИ
// ==========================================
function startTabRename(tabEl, ws) {
    const titleSpan = tabEl.querySelector('.tab-name');
    if (!titleSpan || tabEl.classList.contains('is-renaming')) return;

    // 1. ЗАПОМИНАЕМ ТОЧНУЮ ШИРИНУ ИСХОДНОГО ТЕКСТА ДО МИКРОПИКСЕЛЯ
    const initialTextWidth = titleSpan.getBoundingClientRect().width;

    // Создаем инпут для переименования
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-name-input';
    input.value = ws.name;
    input.spellcheck = false;
    input.autocomplete = "off";

    // Меняем текст на поле ввода
    titleSpan.replaceWith(input);
    tabEl.setAttribute('draggable', 'false'); // Запрещаем драг во время ввода
    tabEl.classList.add('is-renaming');

    // Функция авто-подстройки ширины инпута под текст
    const autoResize = () => {
        // 2. ИДЕАЛЬНАЯ ГЛАДКОСТЬ ПРИ ОТКРЫТИИ: 
        // Если текст еще не меняли, жестко задаем исходную ширину + 8px (компенсация padding: 0 4px)
        // Это гарантирует, что крестик не сдвинется ни на долю пикселя.
        if (input.value === ws.name) {
            input.style.width = `${initialTextWidth + 8}px`;
            return;
        }

        const span = document.createElement('span');
        span.style.font = window.getComputedStyle(input).font;
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.textContent = input.value || ' ';
        document.body.appendChild(span);
        
        // 3. ПРАВИЛЬНАЯ МАТЕМАТИКА ПРИ ВВОДЕ:
        // ширина текста + 8px (padding слева и справа) + 1px запаса для каретки (курсора)
        input.style.width = Math.max(20, span.getBoundingClientRect().width + 9) + 'px';
        document.body.removeChild(span);
        
        if (window.updateTabsScrollbar) window.updateTabsScrollbar();
    };

    input.addEventListener('input', autoResize);
    autoResize(); // Подгоняем размер сразу при открытии
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length); // Курсор в конец

    let committed = false;

    // Восстановление нормального вида вкладки
    const restore = (title) => {
        const span = document.createElement('span');
        span.className = 'tab-name';
        span.textContent = title;
        span.dataset.fullTitle = title;
        
        if (input.parentNode) input.replaceWith(span);
        
        tabEl.setAttribute('draggable', 'true');
        tabEl.classList.remove('is-renaming');
        
        if (window.updateTabsScrollbar) window.updateTabsScrollbar();
    };

    // Сохранение изменений
    const commit = async () => {
        if (committed) return;
        committed = true;
        
        const newName = input.value.trim();
        const finalName = newName || ws.name; // Если пусто, возвращаем старое имя
        
        restore(finalName);

        if (newName && newName !== ws.name) {
            try {
                // Отправляем на бэкенд
                await updateWorkspaceAPI(ws.id, newName);
                ws.name = newName; // Обновляем локальный стейт
            } catch (err) {
                console.error("Ошибка при переименовании вкладки:", err);
                // Откат UI при ошибке сервера
                const span = tabEl.querySelector('.tab-name');
                if (span) {
                    span.textContent = ws.name;
                    span.dataset.fullTitle = ws.name;
                }
            }
        }
    };

    // Отмена переименования (Escape)
    const cancel = () => {
        if (committed) return;
        committed = true;
        restore(ws.name);
    };

    // Защита от перехвата драг-н-дропом и кликом
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());

    // Обработка клавиш
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter')  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    // Сохранение при клике мимо
    input.addEventListener('blur', () => {
        setTimeout(() => { if (!committed) commit(); }, 120);
    });
}

function startColumnRename(columnEl, column) {
    const titleSpan = columnEl.querySelector('.column-title');
    if (!titleSpan || columnEl.classList.contains('is-renaming')) return;

    const input = document.createElement('textarea');
    input.className = 'column-title-input';
    input.value = column.title;
    input.rows = 1;
    input.spellcheck = false;

    titleSpan.replaceWith(input);
    columnEl.setAttribute('draggable', 'false');
    columnEl.classList.add('is-renaming');

    // Авто-resize по содержимому
    let lastValidValue = input.value;
    const autoResize = () => {
        input.style.height = 'auto';
        const sh = input.scrollHeight;
        const boardHeight = document.getElementById('board').clientHeight;
        
        // Здесь есть список и кнопка, вычитаем 140px, чтобы их не выдавило
        const maxAllowedHeight = Math.max(60, boardHeight - 250);
        
        if (sh > maxAllowedHeight) {
            input.style.height = maxAllowedHeight + 'px';
            input.style.overflowY = 'auto';
        } else {
            input.style.height = sh + 'px';
            input.style.overflowY = 'hidden';
        }
    };
    input.addEventListener('input', autoResize);

    // --- ИСПРАВЛЕНО: Считаем высоту моментально до отрисовки кадра ---
    autoResize(); 
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let committed = false;

    const restore = (title) => {
        const span = document.createElement('span');
        span.className = 'column-title';
        span.textContent = title;
        span.dataset.fullTitle = title;
        if (input.parentNode) input.replaceWith(span);
        columnEl.setAttribute('draggable', 'true');
        columnEl.classList.remove('is-renaming');
        // Пересчитываем clamping после восстановления
        requestAnimationFrame(clampExpandedTitles);
    };

    const commit = async () => {
        if (committed) return;
        committed = true;
        const newTitle = input.value.trim();
        const finalTitle = newTitle || column.title;
        restore(finalTitle);
        if (newTitle && newTitle !== column.title) {
            try {
                await updateColumn(column.id, { title: newTitle });
                column.title = newTitle;
            } catch (_) {
                const span = columnEl.querySelector('.column-title');
                if (span) span.textContent = column.title;
            }
        }
        requestAnimationFrame(() => {
            const titleEl = columnEl.querySelector('.column-title');
            clampSingleTitle(titleEl);
        });
    };

    const cancel = () => {
        if (committed) return;
        committed = true;
        restore(column.title);
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click',     (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter')  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { if (!committed) commit(); }, 120);
    });
}

function startCardRename(cardEl, task) {
    const titleDiv = cardEl.querySelector('.card-title');
    if (!titleDiv || cardEl.classList.contains('is-renaming')) return;

    const input = document.createElement('textarea');
    input.className = 'card-title-input';
    input.value = task.title;
    input.rows = 1;
    input.spellcheck = false;

    titleDiv.replaceWith(input);
    cardEl.classList.add('is-renaming');

    const autoResize = () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
        
        // Скрываем ошибку, как только пользователь начал удалять лишнее
        if (input.value.trim().length <= 200) {
            cardEl.classList.remove('is-error');
        }
    };
    
    input.addEventListener('input', autoResize);
    autoResize();
    
    input.focus();
    input.select();

    let committed = false;

    // ВАЛИДАЦИЯ С КРАСИВЫМ ТЕКСТОМ
    const validateAndShake = () => {
        const val = input.value.trim();
        if (val.length > 200) {
            // Ищем или создаем элемент подсказки
            let hint = cardEl.querySelector('.card-error-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');
                // Вставляем после инпута
                input.after(hint);
            }

            cardEl.classList.remove('is-error');
            void cardEl.offsetWidth; // Force Reflow
            cardEl.classList.add('is-error');
            
            return false;
        }
        return true;
    };

    const restore = (title) => {
        const div = document.createElement('div');
        div.className = 'card-title';
        div.textContent = title;
        
        // Удаляем все следы редактирования
        const hint = cardEl.querySelector('.card-error-hint');
        if (hint) hint.remove();
        
        if (input.parentNode) input.replaceWith(div);
        cardEl.classList.remove('is-renaming', 'is-error');
    };

    const commit = async () => {
        if (committed) return;

        if (!validateAndShake()) {
            input.focus();
            return; 
        }

        committed = true;
        const newTitle = input.value.trim();
        const finalTitle = newTitle || task.title;
        
        restore(finalTitle);

        if (newTitle && newTitle !== task.title) {
            try {
                await updateTask(task.id, { title: newTitle });
                task.title = newTitle;
            } catch (_) {
                cardEl.classList.add('is-error');
                const div = cardEl.querySelector('.card-title');
                if (div) div.textContent = task.title;
            }
        }
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (validateAndShake()) commit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            committed = true;
            restore(task.title);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { 
            if (!committed) commit(); 
        }, 120);
    });
}

function adjustCollapsedColumnWidths() {
    const CHAR_HEIGHT = 18.2;  // 13px * 1.4 line-height
    const MAX_LINES = 5;
    const PADDING = 32;        // 16px с каждой стороны
    const CHAR_WIDTH = 22;     // ширина одного вертикального столбца

    document.querySelectorAll('#board .column.collapsed').forEach(colEl => {
        const titleEl = colEl.querySelector('.column-title');
        if (!titleEl) return;

        const fullTitle = titleEl.dataset.fullTitle || titleEl.textContent;
        const colHeight = colEl.getBoundingClientRect().height - 24; // минус padding колонки
        if (colHeight < 10) return;

        titleEl.style.maxHeight = colHeight + 'px';

        // Сколько символов влезает в одну вертикальную линию
        const charsPerLine = Math.max(1, Math.floor(colHeight / CHAR_HEIGHT));
        // Всего символов на 5 линий
        const maxChars = charsPerLine * MAX_LINES;

        // Сохраняем оригинал
        if (!titleEl.dataset.fullTitle) {
            titleEl.dataset.fullTitle = fullTitle;
        }

        const isClamped = fullTitle.length > maxChars;

        if (isClamped) {
            // Обрезаем и добавляем троеточие в конец последней строки
            const visibleChars = maxChars - 1; // место для …
            titleEl.textContent = fullTitle.substring(0, visibleChars) + '…';
            titleEl.dataset.clamped = 'true';
        } else {
            titleEl.textContent = fullTitle;
            titleEl.dataset.clamped = 'false';
        }

        // Вычисляем ширину колонки по фактическому числу линий
        const actualLines = Math.min(MAX_LINES, Math.ceil(fullTitle.length / charsPerLine));
        const colWidth = Math.max(60, PADDING + actualLines * CHAR_WIDTH);

        colEl.style.width = colWidth + 'px';
        colEl.style.minWidth = colWidth + 'px';
    });
}

// ---------- ПРОДВИНУТЫЙ DRAG & DROP (Pointer Events) ----------
let isDragging = false;
let dragType = null;
let draggedElement = null;
let dragClone = null;
let mouseX = 0, mouseY = 0, lastMouseX = 0;
let currentRotation = 0, targetRotation = 0;
let rafId = null;

let startX = 0, startY = 0;
let isPointerDown = false;
let potentialDragTarget = null;
let potentialDragType = null;

// ==========================================
// ГЛОБАЛЬНАЯ БЛОКИРОВКА БРАУЗЕРНОГО DND
// ==========================================
// Запрещаем браузеру перехватывать элементы как "картинки" или "текст"
document.addEventListener('dragstart', (e) => {
    // Разрешаем нативный drag только внутри инпутов (хотя они обычно и так не перетаскиваются)
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // Только левый клик мыши

    // 1. Игнорируем клики по интерактивным элементам (чтобы кнопки и инпуты работали штатно)
    if (e.target.closest('button, input, textarea, .menu-btn, .card-menu-btn, .tab-close-btn, .column.is-renaming, .board-tab.is-renaming, .card.is-renaming, .card-entering')) return;

    // 2. Ищем, на чем именно кликнули
    const card = e.target.closest('.card');
    const column = e.target.closest('.column'); // 🔥 ФИКС: Теперь захватывать можно любые колонки
    const tab = e.target.closest('.board-tab');

    // 3. ЖЕСТКАЯ ИЕРАРХИЯ ЗАХВАТА (Решает Баги 1 и 2)
    if (card) {
        // Кликнули в карточку -> тащим карточку
        potentialDragType = 'card';
        potentialDragTarget = card;
    } else if (column) {
        // Кликнули НЕ в карточку, но в пределы колонки (пустое место, шапка и т.д.) -> тащим колонку
        potentialDragType = 'column';
        potentialDragTarget = column;
    } else if (tab) {
        // Кликнули во вкладку -> тащим вкладку
        potentialDragType = 'tab';
        potentialDragTarget = tab;
    } else {
        return; // Клик в "молоко" (фон доски)
    }

    isPointerDown = true;
    startX = e.clientX;
    startY = e.clientY;
});

document.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;

    // Мертвая зона 5px (отличаем случайное дрожание мыши от реального намерения тащить)
    if (!isDragging) {
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
            startDrag(potentialDragTarget, potentialDragType, e);
        } else {
            return;
        }
    }

    e.preventDefault(); // Защита от системного выделения текста
    mouseX = e.clientX;
    mouseY = e.clientY;

    performHitTest();
});

document.addEventListener('pointerup', async (e) => {
    isPointerDown = false;
    potentialDragTarget = null;
    
    if (isDragging) {
        // 🔥 ФИКС: Блокируем случайные клики на 50мс после броска
        window._isAfterDrag = true;
        setTimeout(() => window._isAfterDrag = false, 50);
        await endDrag();
    }
});

function startDrag(element, type, e) {
    isDragging = true;
    dragType = type;
    draggedElement = element;
    
    // Сразу фиксируем текущие координаты мыши для корректного старта физики
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMouseX = mouseX;

    // Если тащим карточку, запоминаем ID исходной колонки (нужно для API при дропе)
    if (dragType === 'card') {
        draggedElement.dataset.sourceColumnId = draggedElement.closest('.column').dataset.columnId;
    }

    // Глобально отключаем выделение текста и вешаем класс на body для стилизации курсоров
    document.body.style.userSelect = 'none';
    document.body.classList.add(`is-dragging-${dragType}`);

    const rect = draggedElement.getBoundingClientRect();
    dragClone = draggedElement.cloneNode(true);

    // Жестко фиксируем размеры клона, чтобы его верстка не поплыла после position: fixed
    dragClone.style.width = `${rect.width}px`;
    dragClone.style.height = `${rect.height}px`;
    dragClone.style.margin = '0';
    dragClone.classList.remove('is-ghost');
    dragClone.classList.add(`${dragType}-drag-clone`);

    // Вычисляем смещение курсора относительно верхнего левого угла элемента
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    // Сохраняем офсеты в dataset, чтобы renderPhysics мог их использовать
    dragClone.dataset.offsetX = offsetX;
    dragClone.dataset.offsetY = offsetY;

    // --- ФИКС ПРЫЖКА ИЗ КООРДИНАТЫ 0,0 ---
    // Мгновенно вычисляем начальную позицию для отрисовки
    const initialX = e.clientX - offsetX;
    const initialY = e.clientY - offsetY;
    
    // Коэффициент увеличения (колонки увеличиваем чуть меньше, чем карточки)
    const scale = dragType === 'column' ? 1.02 : 1.04;
    
    // Применяем transform СРАЗУ. Теперь при appendChild элемент появится 
    // ровно в том месте, где находится мышь, не дожидаясь следующего кадра.
    dragClone.style.transform = `translate3d(${initialX}px, ${initialY}px, 0) scale(${scale})`;
    // -------------------------------------

    document.body.appendChild(dragClone);
    
    // Оригинал становится полупрозрачным "призраком" на своем месте
    draggedElement.classList.add('is-ghost');

    // Запускаем цикл анимации инерции и наклона
    renderPhysics();
}

function performHitTest() {
    // Стреляем "лазером" от курсора вглубь экрана
    // (Летающие клоны игнорируются, так как у них в CSS прописан pointer-events: none)
    const elemUnderMouse = document.elementFromPoint(mouseX, mouseY);
    if (!elemUnderMouse) return;

    // 1. ВКЛАДКИ
    if (dragType === 'tab') {
        // Ищем настоящую вкладку под курсором (игнорируем оригинал-призрак)
        const hoverTab = elemUnderMouse.closest('.board-tab:not(.is-ghost)');
        
        if (hoverTab && hoverTab !== draggedElement && hoverTab.closest('#tabs-container')) {
            const rect = hoverTab.getBoundingClientRect();
            // Строгая проверка левой/правой половины с предохранителем от дребезга
            if (mouseX > rect.left + rect.width / 2) {
                if (hoverTab.nextElementSibling !== draggedElement) hoverTab.after(draggedElement);
            } else {
                if (hoverTab.previousElementSibling !== draggedElement) hoverTab.before(draggedElement);
            }
        }
    }
    // 2. КОЛОНКИ
    else if (dragType === 'column') {
        const hoverCol = elemUnderMouse.closest('.column:not(.is-ghost)');
        
        if (hoverCol && hoverCol !== draggedElement && hoverCol.closest('#board')) {
            const rect = hoverCol.getBoundingClientRect();
            if (mouseX > rect.left + rect.width / 2) {
                if (hoverCol.nextElementSibling !== draggedElement) hoverCol.after(draggedElement);
            } else {
                if (hoverCol.previousElementSibling !== draggedElement) hoverCol.before(draggedElement);
            }
        }
    }
    // 3. КАРТОЧКИ
    else if (dragType === 'card') {
        const hoverCard = elemUnderMouse.closest('.card:not(.is-ghost)');
        
        // Сценарий А: Навели ровно на другую карточку
        if (hoverCard && hoverCard !== draggedElement) {
            const rect = hoverCard.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverCard.nextElementSibling !== draggedElement) hoverCard.after(draggedElement);
            } else {
                if (hoverCard.previousElementSibling !== draggedElement) hoverCard.before(draggedElement);
            }
        } 
        // Сценарий Б: Навели на пустое место в колонке (в начало списка, в конец или в пустую колонку)
        else {
            const hoverCol = elemUnderMouse.closest('.column:not(.is-ghost)');
            if (hoverCol) {
                const cardList = hoverCol.querySelector('.card-list');
                if (cardList && !cardList.contains(draggedElement)) {
                    // Если мышь выше первой карточки — кидаем в самый верх
                    const firstCard = cardList.firstElementChild;
                    if (firstCard && mouseY < firstCard.getBoundingClientRect().top) {
                        cardList.prepend(draggedElement);
                    } else {
                        // Иначе кидаем в самый низ
                        cardList.appendChild(draggedElement);
                    }
                }
            }
        }
    }
}

function handleEdgePanning() {
    if (!isDragging) return false;

    let container = null;
    // Зона активации (в пикселях от края). На маленьких экранах 100px — оптимально.
    let scrollZone = 100;  
    // Максимальная скорость (пикселей за один кадр при 60fps)
    let maxSpeed = 22;    
    let speedX = 0;

    // Определяем целевой контейнер
    if (dragType === 'tab') {
        container = document.getElementById('tabs-container');
        scrollZone = 60; // Для вкладок зона чуть меньше
    } else {
        container = document.querySelector('.board-container');
    }

    if (!container) return false;

    const rect = container.getBoundingClientRect();

    // ПРАВЫЙ КРАЙ
    if (mouseX > rect.right - scrollZone) {
        // Рассчитываем интенсивность: 0 у границы зоны, 1 у самого края экрана
        const intensity = (mouseX - (rect.right - scrollZone)) / scrollZone;
        const safeIntensity = Math.max(0, Math.min(intensity, 1));
        
        // Квадратичное ускорение: дает очень мягкий старт и быстрый полет в конце
        speedX = Math.pow(safeIntensity, 2) * maxSpeed;
    } 
    // ЛЕВЫЙ КРАЙ
    else if (mouseX < rect.left + scrollZone) {
        const intensity = (rect.left + scrollZone - mouseX) / scrollZone;
        const safeIntensity = Math.max(0, Math.min(intensity, 1));
        
        speedX = -(Math.pow(safeIntensity, 2) * maxSpeed);
    }

    if (speedX !== 0) {
        const prevScroll = container.scrollLeft;
        container.scrollLeft += speedX;

        // Если скролл реально изменился (не уперлись в край)
        if (container.scrollLeft !== prevScroll) {
            // Синхронизируем кастомный скроллбар вкладок, если нужно
            if (dragType === 'tab' && window.updateTabsScrollbar) {
                window.updateTabsScrollbar();
            }
            return true;
        }
    }
    
    return false;
}

function renderPhysics() {
    if (!isDragging || !dragClone) return;

    // 1. Сначала двигаем экран
    const didScroll = handleEdgePanning();
    
    // 2. Рассчитываем инерцию и наклон (твой существующий код)
    const deltaX = mouseX - lastMouseX;
    lastMouseX = mouseX;
    
    const maxRotation = dragType === 'tab' ? 3 : (dragType === 'column' ? 3 : 12); 
    targetRotation = Math.max(-maxRotation, Math.min(maxRotation, deltaX * 0.4));
    currentRotation += (targetRotation - currentRotation) * 0.15;

    // 3. Обновляем позицию клона
    const x = mouseX - parseFloat(dragClone.dataset.offsetX);
    const y = mouseY - parseFloat(dragClone.dataset.offsetY);
    const scale = dragType === 'column' ? 1.02 : 1.04;
    
    dragClone.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${currentRotation}deg) scale(${scale})`;
    
    // 4. Если экран едет, пересчитываем, куда должна упасть карточка прямо сейчас
    if (didScroll) {
        performHitTest();
    }
    
    rafId = requestAnimationFrame(renderPhysics);
}

async function endDrag() {
    isDragging = false;
    cancelAnimationFrame(rafId);
    
    document.body.classList.remove(`is-dragging-${dragType}`);
    document.body.style.userSelect = '';
    
    if (dragClone) {
        dragClone.remove();
        dragClone = null;
    }
    
    if (draggedElement) {
        // 🔥 ФИКС: Мгновенное возвращение цвета без дерганий и фейдов
        // 1. Временно убиваем все анимации на элементе
        draggedElement.style.transition = 'none';
        // 2. Снимаем класс призрака (цвет меняется на нормальный)
        draggedElement.classList.remove('is-ghost');
        // 3. Запрашиваем offsetWidth. Это заставляет браузер СИНХРОННО перерисовать
        // элемент прямо сейчас, применив новые цвета без анимации (Force Reflow)
        void draggedElement.offsetWidth;
        // 4. Возвращаем стили к дефолтным CSS-настройкам
        draggedElement.style.transition = '';

        const droppedEl = draggedElement;
        const rect = droppedEl.getBoundingClientRect();
        
        // Проверяем: если мышь РЕАЛЬНО находится над вкладкой в момент отпускания
        if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
            droppedEl.classList.add('is-dropped-hover'); // Вешаем фейковый ховер
            
            const cleanupHover = () => {
                droppedEl.classList.remove('is-dropped-hover');
                document.removeEventListener('pointermove', cleanupHover);
            };
            
            // Даем браузеру 50мс на применение настоящего CSS :hover,
            // а затем по первому же движению мыши снимаем наш "костыль".
            setTimeout(() => {
                document.addEventListener('pointermove', cleanupHover);
            }, 50);
        }
        
        // --- Логика сохранения порядка ВКЛАДОК ---
        if (dragType === 'tab') {
            const currentTabs = Array.from(document.querySelectorAll('#tabs-container .board-tab'));
            const orderedIds = currentTabs.map(tab => parseInt(tab.dataset.workspaceId));
            state.workspaces.forEach(ws => { ws.position = orderedIds.indexOf(ws.id); });
            state.workspaces.sort((a, b) => a.position - b.position);
            if (window.updateTabsScrollbar) window.updateTabsScrollbar();
            try { await saveWorkspacesOrder(orderedIds); } 
            catch (error) { console.error("Ошибка сохранения", error); }
        }

        // --- Логика сохранения порядка КОЛОНОК ---
        if (dragType === 'column') {
            const currentColumns = Array.from(document.querySelectorAll('#board .column'));
            const orderedIds = currentColumns.map(col => parseInt(col.dataset.columnId));
            state.columns.forEach(col => { col.position = orderedIds.indexOf(col.id); });
            state.columns.sort((a, b) => a.position - b.position);
            try { await saveColumnsOrder(orderedIds); } 
            catch (error) { console.error("Ошибка сохранения", error); }
        }

        // --- Логика сохранения порядка КАРТОЧЕК ---
        if (dragType === 'card') {
            const newColumnEl = draggedElement.closest('.column');
            if (newColumnEl) {
                const newColumnId = parseInt(newColumnEl.dataset.columnId);
                const sourceColumnId = parseInt(draggedElement.dataset.sourceColumnId);
                const taskId = parseInt(draggedElement.dataset.cardId);
                
                const currentCards = Array.from(newColumnEl.querySelectorAll('.card:not(.card-drag-clone)'));
                const orderedIds = currentCards.map(c => parseInt(c.dataset.cardId));

                const sourceColumnEl = document.querySelector(`.column[data-column-id="${sourceColumnId}"]`);
                if (sourceColumnEl) updateColumnCount(sourceColumnEl);
                updateColumnCount(newColumnEl);

                try {
                    const targetCol = state.columns.find(c => c.id === newColumnId);
                    const sourceCol = state.columns.find(c => c.id === sourceColumnId);

                    if (newColumnId !== sourceColumnId) {
                        if (targetCol.mode === 'track_time') {
                            draggedElement.classList.remove('is-completed');
                            let timerEl = draggedElement.querySelector('.card-timer');
                            if (!timerEl) {
                                timerEl = document.createElement('div');
                                timerEl.className = 'card-timer';
                                timerEl.dataset.taskId = taskId;
                                draggedElement.appendChild(timerEl);
                            }
                            timerEl.textContent = '00:00:00';
                            const metaEl = draggedElement.querySelector('.subtask-meta');
                            if (metaEl) metaEl.remove();
                        } else if (targetCol.mode === 'completion') {
                            draggedElement.classList.add('is-completed');
                            const timerEl = draggedElement.querySelector('.card-timer');
                            if (timerEl) timerEl.remove();
                        } else {
                            draggedElement.classList.remove('is-completed');
                            const timerEl = draggedElement.querySelector('.card-timer');
                            if (timerEl) timerEl.remove();
                        }

                        const updatedTask = await moveTask(taskId, newColumnId);
                        
                        if (sourceCol && targetCol) {
                            const taskIndex = sourceCol.tasks.findIndex(t => t.id == taskId);
                            if (taskIndex !== -1) {
                                const[movedTask] = sourceCol.tasks.splice(taskIndex, 1);
                                movedTask.column_id = newColumnId; 
                                movedTask.completed_at = updatedTask.completed_at;
                                movedTask.active_timer = updatedTask.active_timer; 
                                movedTask.total_time_spent = updatedTask.total_time_spent;
                                targetCol.tasks.push(movedTask);
                            }
                        }
                        
                        updateCardAppearance(draggedElement, updatedTask, targetCol.mode);
                        draggedElement.dataset.sourceColumnId = newColumnId;
                    }

                    await saveTasksOrder(orderedIds);
                    
                    if (targetCol) {
                        targetCol.tasks.forEach(t => { t.position = orderedIds.indexOf(t.id); });
                    }
                    updateTimers();

                } catch (error) {
                    console.error("Ошибка при перемещении", error);
                    await refreshBoard(); 
                }
            }
        }
    }

    dragType = null;
    draggedElement = null;
    currentRotation = targetRotation = 0;
}

document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.card-menu-btn')) {
        e.preventDefault(); 
    }
});

// ---------- ГЛОБАЛЬНЫЕ КЛИКИ (меню, модалки) ----------
document.addEventListener('click', async (e) => {
    // 🔥 ФИКС: Игнорируем клик, если он был концом перетаскивания
    if (window._isAfterDrag) {
        e.stopPropagation();
        e.preventDefault();
        return;
    }

    const target = e.target;

    // --- ДОБАВИТЬ СЮДА: Разворачивание колонки ---
    const collapsedCol = target.closest('.column.collapsed');
    if (collapsedCol) {
        // Если кликнули не по кнопке меню (хотя в свернутой её нет, но на будущее)
        if (!target.closest('.menu-btn')) {
            onExpandColumn(collapsedCol);
            return;
        }
    }

    // 1. ПЕРЕИМЕНОВАНИЕ КОЛОНКИ (по клику в заголовок)
    const titleEl = target.closest('.column:not(.collapsed) .column-title');
    if (titleEl) {
        const columnEl = titleEl.closest('.column');
        if (columnEl && !columnEl.classList.contains('is-renaming')) {
            const columnId = parseInt(columnEl.dataset.columnId);
            const column = state.columns.find(c => c.id === columnId);
            if (column) {
                startColumnRename(columnEl, column);
                return;
            }
        }
    }

    // 2. ПЕРЕИМЕНОВАНИЕ ВКЛАДКИ
    const tabNameEl = target.closest('.board-tab .tab-name');
    if (tabNameEl) {
        const tabEl = tabNameEl.closest('.board-tab');
        if (tabEl && !tabEl.classList.contains('is-renaming')) {
            const wsId = parseInt(tabEl.dataset.workspaceId);
            if (wsId === state.activeWorkspaceId) {
                const ws = state.workspaces.find(w => w.id === wsId);
                if (ws) {
                    startTabRename(tabEl, ws);
                    return;
                }
            }
        }
    }

    // 3. ОБРАБОТКА КНОПОК ПОДТВЕРЖДЕНИЯ (Confirm Modal)
    if (target.closest('[data-action="confirm-cancel"]')) {
        if (activeConfirmResolve) { activeConfirmResolve(false); activeConfirmResolve = null; }
        document.getElementById('confirm-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="confirm-delete"]')) {
        if (activeConfirmResolve) { activeConfirmResolve(true); activeConfirmResolve = null; }
        document.getElementById('confirm-modal').classList.remove('show');
        return;
    }

    // 4. ОТКРЫТИЕ МЕНЮ НАСТРОЕК (Header)
    const settingsTrigger = target.closest('.settings-trigger');
    if (settingsTrigger) {
        const menu = document.querySelector('.settings-wrapper .dropdown-menu');
        const isShowing = menu.classList.contains('show');
        closeAllDropdowns(); 
        if (!isShowing) { 
            menu.classList.add('show');
            settingsTrigger.classList.add('active');
        }
        return; 
    }

    // 5. ЛОГИКА ВЫПАДАЮЩЕГО МЕНЮ КАРТОЧКИ (Pencil Button)
    const cardMenuBtn = target.closest('.card-menu-btn');
    if (cardMenuBtn) {
        e.stopPropagation();
        const globalMenu = document.getElementById('global-card-menu');
        const cardEl = cardMenuBtn.closest('.card');
        
        const isAlreadyOpen = globalMenu.classList.contains('show') && globalMenu.dataset.activeCardId == cardEl.dataset.cardId;

        closeAllDropdowns();

        if (!isAlreadyOpen) {
            globalMenu.dataset.activeCardId = cardEl.dataset.cardId;
            
            const cardRect = cardEl.getBoundingClientRect();
            let menuTop = cardRect.top;
            let menuLeft = cardRect.right + 12;
            const menuWidth = 220;

            if (menuLeft + menuWidth > window.innerWidth - 16) {
                menuLeft = cardRect.left - menuWidth - 12;
                globalMenu.style.transformOrigin = 'top right';
            } else {
                globalMenu.style.transformOrigin = 'top left';
            }

            globalMenu.classList.add('show');
            globalMenu.style.top = `${menuTop}px`;
            globalMenu.style.left = `${menuLeft}px`;

            cardMenuBtn.classList.add('active');
            cardEl.classList.add('has-open-menu');
        }

        // ФИКС: ВСЕГДА включаем переименование параллельно при клике на карандаш.
        // Вынесено из блока if (!isAlreadyOpen)
        const taskId = parseInt(cardEl.dataset.cardId);
        const colId = parseInt(cardEl.closest('.column').dataset.columnId);
        const col = state.columns.find(c => c.id === colId);
        const task = col?.tasks.find(t => t.id === taskId);
        if (task) startCardRename(cardEl, task);

        return;
    }

    // 6. ОБРАБОТКА ДЕЙСТВИЙ (Меню, Колонки, Карточки, Системные)
    const menuItem = target.closest('.menu-item');
    const actionElement = target.closest('[data-action]');
    const action = actionElement?.dataset.action;

    if (menuItem && action) {
        // ОПРЕДЕЛЯЕМ КОНТЕКСТ МЕНЮ
        const globalCardMenu = document.getElementById('global-card-menu');
        const isCardMenu = menuItem.closest('#global-card-menu');
        const columnEl = menuItem.closest('.column');

        // А) Если это меню карточки
        if (isCardMenu) {
            const activeCardId = globalCardMenu.dataset.activeCardId;
            const cardEl = document.querySelector(`.card[data-card-id="${activeCardId}"]`);
            if (cardEl) {
                const taskId = parseInt(activeCardId);
                const colEl = cardEl.closest('.column');

                if (action === 'open-card') {
                    const title = cardEl.querySelector('.card-title')?.textContent || 
                                  cardEl.querySelector('.card-title-input')?.value;
                    document.getElementById('task-modal-title').textContent = title;
                    document.getElementById('task-modal').classList.add('show');
                } 
                else if (action === 'delete-card') {
                    cardEl.style.opacity = '0';
                    cardEl.style.transform = 'scale(0.9)';
                    setTimeout(() => { if (cardEl.parentNode) cardEl.remove(); updateColumnCount(colEl); }, 200);
                    const col = state.columns.find(c => c.id === parseInt(colEl.dataset.columnId));
                    if (col) col.tasks = col.tasks.filter(t => t.id !== taskId);
                    deleteTask(taskId).catch(err => { console.error(err); refreshBoard(); });
                } 
                else if (action === 'clear-card-timer') {
                    clearTaskTimerAPI(taskId).then(updatedTask => {
                        const col = state.columns.find(c => c.id === parseInt(colEl.dataset.columnId));
                        if (col) {
                            const idx = col.tasks.findIndex(t => t.id === taskId);
                            if (idx !== -1) col.tasks[idx] = updatedTask;
                        }
                        updateCardAppearance(cardEl, updatedTask, col.mode);
                    });
                }
            }
            closeAllDropdowns();
            return; // Выходим только если это было меню карточки
        }

        // Б) Если это меню колонки
        if (columnEl) {
            handleColumnMenu(action, columnEl, menuItem);
            closeAllDropdowns();
            return; // Выходим только если это было меню колонки
        }
    }

    // 7. СИСТЕМНЫЕ ДЕЙСТВИЯ (Воркспейс, Темы, Язык, О программе)
    // Сюда код попадет, если это был клик по кнопке воркспейса или пункту настроек
    if (action) {
        if (action === 'switch-workspace') {
            const btn = target.closest('.workspace-btn');
            btn.style.pointerEvents = 'none'; btn.style.opacity = '0.5'; 
            switchVault().then(async vault => {
                if (vault.canceled) { btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; return; }
                updateVaultName(vault.name);
                const settings = await fetchSettings().catch(() => ({}));
                state.activeWorkspaceId = settings.active_workspace_id || null;
                await refreshBoard(true);
                btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
            }).catch(() => { btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; });
        }
        else if (action === 'theme') {
            const currentTheme = document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light';
            document.querySelectorAll('#theme-list .lang-item').forEach(el => {
                el.classList.toggle('active', el.dataset.themeValue === currentTheme);
            });
            document.getElementById('theme-modal').classList.add('show');
            closeAllDropdowns();
        }
        else if (action === 'change-lang') {
            document.getElementById('lang-modal').classList.add('show');
            closeAllDropdowns();
        }
        else if (action === 'about') {
            document.getElementById('about-modal').classList.add('show');
            closeAllDropdowns();
        }
    }

    // ==========================================
    // 🔥 ТОТ САМЫЙ ПРОПАВШИЙ БЛОК (КЛИКИ ВНУТРИ МОДАЛОК)
    // ==========================================
    const themeItem = target.closest('#theme-list .lang-item');
    if (themeItem) {
        const theme = themeItem.dataset.themeValue;
        applyTheme(theme, true);
        setTimeout(() => document.getElementById('theme-modal').classList.remove('show'), 150);
        return;
    }

    const langItem = target.closest('#lang-list .lang-item');
    if (langItem) {
        const lang = langItem.dataset.value;
        applyLanguage(lang, true);
        setTimeout(() => document.getElementById('lang-modal').classList.remove('show'), 150);
        return;
    }
    // ==========================================

    // 8. ЗАКРЫТИЕ МОДАЛОК
    if (target.closest('.modal-close') || target.classList.contains('modal-overlay')) {
        if (activeConfirmResolve && (target.id === 'confirm-modal' || target.closest('#confirm-modal'))) {
            activeConfirmResolve(false);
            activeConfirmResolve = null;
        }
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
    }

    // 9. ЗАКРЫТИЕ ВСЕХ МЕНЮ ПРИ КЛИКЕ ВНЕ
    if (
        !target.closest('.dropdown-menu') && 
        !target.closest('.menu-btn') && 
        !target.closest('.card-menu-btn') &&
        !target.closest('.card.has-open-menu') // 🔥 ФИКС: Игнорируем клики внутри карточки с активным меню
    ) {
        closeAllDropdowns();
    }
});

// ---------- ОБНОВЛЕНИЕ ТАЙМЕРОВ ----------
function updateTimers() {
    document.querySelectorAll('.card-timer').forEach(el => {
        const taskId = el.dataset.taskId;
        for (const col of state.columns) {
            const task = col.tasks.find(t => t.id == taskId);
            if (task?.active_timer) {
                el.textContent = formatTime(task.active_timer.start_time);
                break;
            }
        }
    });
}

function updateColumnCount(columnEl, count = null) {
    const pill = columnEl.querySelector('.meta-pill .card-count');
    if (pill) {
        const tasks = columnEl.querySelectorAll('.card').length;
        pill.textContent = count !== null ? count : tasks;
    }
}


function clampSingleTitle(titleEl) {
    if (!titleEl) return;
    
    // Ограничиваем заголовок 25% высоты экрана
    const MAX_ALLOWED_HEIGHT = window.innerHeight * 0.25; 

    const fullTitle = titleEl.dataset.fullTitle || titleEl.textContent;

    // 1. Сбрасываем стили для честного замера
    titleEl.style.webkitLineClamp = 'unset';
    titleEl.style.maxHeight = 'none';

    // 2. Считаем реальную высоту одной строки
    const computedStyle = window.getComputedStyle(titleEl);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 21.75;

    // 3. Если контент превышает лимит
    if (titleEl.scrollHeight > MAX_ALLOWED_HEIGHT) {
        // Вычисляем сколько ПОЛНЫХ строк влезет
        // Вычитаем 2px из лимита для безопасности (запас на границы)
        const maxLines = Math.max(2, Math.floor((MAX_ALLOWED_HEIGHT - 2) / lineHeight));

        // 4. Применяем зажим строк
        titleEl.style.webkitLineClamp = String(maxLines);
        
        // 🔥 ГЛАВНЫЙ ФИКС: Принудительно устанавливаем высоту элемента 
        // кратно количеству строк + наш padding из CSS.
        // Это не даст контейнеру "обрезать" нижнюю строку на середине.
        titleEl.style.maxHeight = (maxLines * lineHeight) + "px";

        titleEl.dataset.fullTitle = fullTitle;
        titleEl.dataset.clamped = 'true';
    } else {
        // Если текст короткий - снимаем все ограничения
        titleEl.style.webkitLineClamp = 'unset';
        titleEl.style.maxHeight = 'none';
        titleEl.dataset.clamped = 'false';
    }
}

// Оригинальная функция теперь просто вызывает clampSingleTitle для всех колонок (нужно при ресайзе окна)
function clampExpandedTitles() {
    document.querySelectorAll('.column:not(.collapsed) .column-title').forEach(clampSingleTitle);
}


function initTabsScrollbar() {
    const wrapper = document.getElementById('tabs-wrapper');
    const container = document.getElementById('tabs-container');
    const scrollbar = document.getElementById('tabs-scrollbar');
    const thumb = document.getElementById('tabs-thumb');
    
    if (!wrapper || !container || !scrollbar || !thumb) return;

    let hideTimeout;
    let isDraggingThumb = false;
    let startX = 0;
    let startScrollLeft = 0;

    function updateThumb() {
        const scrollRatio = container.clientWidth / container.scrollWidth;
        if (scrollRatio >= 1) {
            scrollbar.classList.remove('visible');
            return;
        }
        
        // Вычисляем ширину ползунка
        const thumbWidth = Math.max(container.clientWidth * scrollRatio, 40); // минимум 40px
        thumb.style.width = `${thumbWidth}px`;
        
        // Вычисляем позицию
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        const scrollPercent = container.scrollLeft / maxScrollLeft;
        const maxThumbLeft = container.clientWidth - thumbWidth;
        
        thumb.style.transform = `translateX(${scrollPercent * maxThumbLeft}px)`;
    }

    function showScrollbar() {
        const scrollRatio = container.clientWidth / container.scrollWidth;
        if (scrollRatio < 1) {
            scrollbar.classList.add('visible');
        }
        
        clearTimeout(hideTimeout);
        if (!wrapper.matches(':hover') && !isDraggingThumb) {
            hideTimeout = setTimeout(() => {
                scrollbar.classList.remove('visible');
            }, 1200); // Скроллбар исчезает через 1.2с покоя
        }
    }

    container.addEventListener('scroll', () => {
        updateThumb();
        showScrollbar();
        
        // Логика затемнения края (маски)
        if (container.scrollLeft > 2) {
            container.classList.add('is-scrolled');
        } else {
            container.classList.remove('is-scrolled');
        }
    });

    wrapper.addEventListener('mouseenter', showScrollbar);
    wrapper.addEventListener('mouseleave', () => {
        if (!isDraggingThumb) {
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                scrollbar.classList.remove('visible');
            }, 400); // Ускоренное затухание, если мышь ушла с шапки
        }
    });

    window.addEventListener('resize', updateThumb);
    window.updateTabsScrollbar = updateThumb; // Экспортируем для ручного вызова

    // --- Логика перетаскивания (Drag) самого ползунка мышкой ---
    thumb.addEventListener('mousedown', (e) => {
        isDraggingThumb = true;
        startX = e.clientX;
        startScrollLeft = container.scrollLeft;
        thumb.classList.add('is-dragging');
        document.body.style.userSelect = 'none'; // Блокируем выделение текста
        e.preventDefault();
        e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDraggingThumb) return;
        const deltaX = e.clientX - startX;
        
        const scrollRatio = container.clientWidth / container.scrollWidth;
        const thumbWidth = Math.max(container.clientWidth * scrollRatio, 40);
        const maxThumbLeft = container.clientWidth - thumbWidth;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        
        if (maxThumbLeft > 0) {
            const scrollPerPixel = maxScrollLeft / maxThumbLeft;
            container.scrollLeft = startScrollLeft + deltaX * scrollPerPixel;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingThumb) {
            isDraggingThumb = false;
            thumb.classList.remove('is-dragging');
            document.body.style.userSelect = '';
            
            if (!wrapper.matches(':hover')) {
                hideTimeout = setTimeout(() => {
                    scrollbar.classList.remove('visible');
                }, 1200);
            }
        }
    });
}


function initTooltip() {
    const tooltip = document.createElement('div');
    tooltip.id = 'tooltip';
    tooltip.className = 'custom-tooltip';
    
    // ДОБАВЛЕНО: Внутренний контейнер для чистого среза текста
    const tooltipInner = document.createElement('div');
    tooltipInner.className = 'tooltip-inner';
    tooltip.appendChild(tooltipInner);
    
    document.body.appendChild(tooltip);

    let activeTitle = null;

    function updateTooltipPosition(e) {
        if (!activeTitle) return;

        const tooltipRect = tooltip.getBoundingClientRect();
        
        let left = e.clientX + 14; 
        let top = e.clientY + 14;

        if (left + tooltipRect.width > window.innerWidth - 8) {
            left = e.clientX - tooltipRect.width - 14;
        }
        if (left < 8) left = 8;

        const fitsBelow = (e.clientY + 14 + tooltipRect.height) <= (window.innerHeight - 8);
        const fitsAbove = (e.clientY - 14 - tooltipRect.height) >= 8;

        if (!fitsBelow && fitsAbove) {
            top = e.clientY - tooltipRect.height - 14;
        } else if (!fitsBelow && !fitsAbove) {
            top = 8;
        }
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    document.addEventListener('mouseover', (e) => {
        if (typeof isDragging !== 'undefined' && isDragging) return;

        // Теперь ловим и заголовки колонок, и имена вкладок
        const titleEl = e.target.closest('.column-title, .tab-name');
        if (!titleEl) return;

        let isActuallyClamped = false;
        
        if (titleEl.classList.contains('tab-name')) {
            // Для вкладок обрезка идет через CSS (ellipsis)
            // Текст обрезан, если его физическая ширина (scrollWidth) больше видимой
            isActuallyClamped = titleEl.scrollWidth > titleEl.clientWidth;
        } else if (titleEl.closest('.column.collapsed')) {
            isActuallyClamped = titleEl.dataset.clamped === 'true';
        } else {
            isActuallyClamped = titleEl.scrollHeight > (titleEl.clientHeight + 2);
        }

        if (!isActuallyClamped) return;
        // -----------------------------------------------------

        activeTitle = titleEl;
        
        // Сбрасываем лимит у внутреннего контейнера
        tooltipInner.style.webkitLineClamp = 'unset';
        tooltipInner.textContent = titleEl.dataset.fullTitle || titleEl.textContent;
        
        const paddingY = 16; 
        const safeMarginY = 32; 
        const maxAvailableHeight = window.innerHeight - paddingY - safeMarginY;
        
        const computedStyle = window.getComputedStyle(tooltipInner);
        const lineHeight = parseFloat(computedStyle.lineHeight) || 19.5;
        
        const maxLines = Math.max(1, Math.floor(maxAvailableHeight / lineHeight));
        
        // Применяем лимит к tooltipInner
        tooltipInner.style.webkitLineClamp = maxLines.toString();

        tooltip.classList.add('visible');
        updateTooltipPosition(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (activeTitle) {
            if (!document.body.contains(activeTitle)) {
                activeTitle = null;
                tooltip.classList.remove('visible');
                return;
            }
            updateTooltipPosition(e);
        }
    });

    document.addEventListener('mouseout', (e) => {
        const titleEl = e.target.closest('.column-title, .tab-name');
        if (titleEl && titleEl === activeTitle) {
            activeTitle = null;
            tooltip.classList.remove('visible');
        }
    });

    document.addEventListener('mousedown', () => {
        if (activeTitle) {
            activeTitle = null;
            tooltip.classList.remove('visible');
        }
    });
}

// Выносим показ окна на самый верхний уровень, ДО любых await!
let isRevealed = false;
const triggerReveal = () => {
    if (isRevealed) return;
    if (window.pywebview && window.pywebview.api) {
        isRevealed = true;
        document.body.classList.remove('preload');
        try {
            // Вызываем Python-функцию для показа окна
            const call = window.pywebview.api.reveal_window();
            if (call && call.catch) call.catch(() => {});
        } catch (e) {}
    }
};

// 1. Ловим событие сразу же при старте скрипта!
window.addEventListener('pywebviewready', triggerReveal);

// 2. Страховка: используем setTimeout вместо requestAnimationFrame, 
// так как macOS замораживает rAF для скрытых окон!
const checkApi = () => {
    if (isRevealed) return;
    if (window.pywebview && window.pywebview.api) {
        triggerReveal();
    } else {
        setTimeout(checkApi, 50);
    }
};

(async () => {
    initTooltip();
    initTabsScrollbar();

    // 1. Первичная настройка темы/языка из кэша (чтобы не моргало)
    try {
        applyLanguage(localStorage.getItem('doe-lang') || 'ru', false);
        applyTheme(localStorage.getItem('doe-theme') || 'light', false);
    } catch (e) {}

    try {
        // 2. Загружаем системные данные и ВКЛАДКИ в первую очередь
        const [settingsData, vaultData, workspacesData] = await Promise.all([
            fetchSettings().catch(() => ({})),
            fetchVault().catch(() => ({ name: "Doe Board" })),
            fetchWorkspaces().catch(() => [])
        ]);

        // Обновляем имя хранилища в UI
        updateVaultName(vaultData.name);

        // Сохраняем воркспейсы в стейт
        state.workspaces = workspacesData;

        // 3. ВЫБОР АКТИВНОЙ ВКЛАДКИ (Логика-предохранитель)
        let targetWorkspaceId = settingsData.active_workspace_id;

        // Если в настройках пусто или такая вкладка была удалена, берем ID первой из списка
        if (!targetWorkspaceId || !state.workspaces.find(w => w.id === targetWorkspaceId)) {
            if (state.workspaces.length > 0) {
                targetWorkspaceId = state.workspaces[0].id;
            }
        }

        // Фиксируем ID в глобальном стейте ПЕРЕД запросом колонок
        state.activeWorkspaceId = targetWorkspaceId;

        // Рендерим вкладки (теперь они точно есть в state.workspaces)
        renderTabs(true);

        // 4. ЗАГРУЗКА КОЛОНОК (только если ID определен)
        if (state.activeWorkspaceId) {
            const columnsData = await fetchColumns(state.activeWorkspaceId);
            state.columns = columnsData.map(col => ({ ...col, collapsed: col.collapsed || false }));
            
            renderBoard(); // Рисуем доску
            
            // Выполняем замеры высот и схлопывание (фикс вспышки макета)
            adjustCollapsedColumnWidths();
            clampExpandedTitles();
        } else {
            // Если воркспейсов вообще нет (критическая ситуация)
            console.error("No workspaces found even after initialization");
            renderBoard(); // Отрисует пустую доску с кнопкой "+"
        }

        // 5. ПОКАЗЫВАЕМ ОКНО (убираем preload)
        document.body.classList.remove('preload');
        setTimeout(triggerReveal, 50);

    } catch (e) {
        console.error("Fatal initialization error:", e);
        document.body.classList.remove('preload');
        triggerReveal(); 
    }
    
    // Запуск таймеров
    setInterval(updateTimers, 250);
    
    // Обработка ресайза
    window.addEventListener('resize', () => {
        requestAnimationFrame(() => {
            clampExpandedTitles();
            adjustCollapsedColumnWidths();
        });
    });
})();
