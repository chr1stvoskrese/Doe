// ---------- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ----------
let state = { columns: [] };
const API_BASE = '/api/v1';

// ---------- ЛОКАЛИЗАЦИЯ ----------
const translations = {
    ru: {
        settings: 'Настройки', theme: 'Тема', language: 'Язык', about: 'О приложении', workspace: 'Doe Board', cancel: 'Отмена',
        newColumn: '+ Создать колонку', newTask: '+ Новая задача',
        columnModes: { default: 'Стандартный', track_time: 'Учёт времени', completion: 'Результирующий' },
        menu: { mode: 'Режим колонки', collapse: 'Свернуть колонку', rename: 'Переименовать', delete: 'Удалить', clear: 'Очистить' },
        modals: { themeTitle: 'Тема оформления', light: 'Светлая', dark: 'Тёмная', langTitle: 'Выберите язык', aboutTitle: 'О приложении', aboutDesc: 'эстетика, грация локального<br>Kanban-хранилища' },
        card: { timeSpent: 'Времени потрачено:' },
        prompts: { 
            taskTitle: 'Название задачи:', columnTitle: 'Название колонки:', renameColumn: 'Новое название:', 
            deleteConfirmTitle: 'Удалить колонку?',
            deleteConfirmDesc: 'Все задачи внутри будут потеряны.',
            clearConfirmTitle: 'Очистить колонку?',
            clearConfirmDesc: 'Все задачи внутри будут удалены безвозвратно.'
        },
        alerts: { loadError: 'Не удалось загрузить доску', error: 'Ошибка' }
    },
    en: {
        settings: 'Settings', theme: 'Theme', language: 'Language', about: 'About', workspace: 'Doe Board', cancel: 'Cancel',
        newColumn: '+ Create column', newTask: '+ New task',
        columnModes: { default: 'Standard', track_time: 'Track time', completion: 'Completed' },
        menu: { mode: 'Column mode', collapse: 'Collapse column', rename: 'Rename', delete: 'Delete', clear: 'Clear' },
        modals: { themeTitle: 'Theme', light: 'Light', dark: 'Dark', langTitle: 'Select language', aboutTitle: 'About', aboutDesc: 'aesthetic local-first<br>kanban sanctuary' },
        card: { timeSpent: 'Time spent:' },
        prompts: { 
            taskTitle: 'Task title:', columnTitle: 'Column title:', renameColumn: 'New name:', 
            deleteConfirmTitle: 'Delete column?',
            deleteConfirmDesc: 'All tasks inside will be lost.',
            clearConfirmTitle: 'Clear column?',
            clearConfirmDesc: 'All tasks inside will be permanently deleted.'
        },
        alerts: { loadError: 'Failed to load board', error: 'Error' }
    }
};

let currentLang = 'ru';
let activeConfirmResolve = null; // Добавили эту строку

function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('doe-lang', lang);

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

    // Вот это ставит правильную галочку в меню выбора языка:
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


async function saveTasksOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/tasks/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}

async function fetchColumns() { const res = await fetch(`${API_BASE}/columns/`); if (!res.ok) throw new Error('Error'); return res.json(); }
async function saveColumnsOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/columns/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}
async function createColumn(title, mode = 'default') {
    const res = await fetch(`${API_BASE}/columns/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, mode }) });
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

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function formatTime(startTime) {
    const start = new Date(startTime); const diff = Math.floor((Date.now() - start) / 1000);
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
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

function createColumnElement(column) {
    const colDiv = document.createElement('div');
    colDiv.className = 'column';
    colDiv.dataset.columnId = column.id;
    colDiv.setAttribute('draggable', 'true');
    
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
    
    const tasksHtml = sortedTasks.map(task => {
        let timeHtml = '';
        if (task.active_timer) {
            timeHtml = `<div class="card-timer" data-task-id="${task.id}">${formatTime(task.active_timer.start_time)}</div>`;
        } else if (column.mode === 'completion' && task.total_time_spent !== undefined && task.total_time_spent !== null) {
            timeHtml = `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
        }
        return `
            <div class="card ${task.completed_at ? 'is-completed' : ''}" data-card-id="${task.id}" draggable="true">
                <div class="card-title-wrapper">
                    <svg class="completed-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    <div class="card-title">${escapeHtml(task.title)}</div>
                </div>
                ${timeHtml}
            </div>
        `;
    }).join('');

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

    colDiv.addEventListener('dragover', e => e.preventDefault());

    return colDiv;
}

async function refreshBoard() {
    try {
        const columns = await fetchColumns();
        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
        renderBoard();
    } catch (e) { console.error(e); alert(t('alerts.loadError')); }
}

async function onAddTask(columnId) { const title = prompt(t('prompts.taskTitle')); if (!title) return; try { await createTask(title, columnId); await refreshBoard(); } catch (e) { alert(t('alerts.error')); } }

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
}

async function onCreateColumn() {
    // Если форма уже открыта — просто фокусируем
    const existingForm = document.querySelector('.column-entering');
    if (existingForm) {
        existingForm.querySelector('input')?.focus();
        return;
    }

    const board = document.getElementById('board');
    const addBtn = board.querySelector('.new-column-btn');
    if (!addBtn) return;

    const formCol = createColumnFormElement();
    
    // Заменяем кнопку на форму 1-к-1. Никакого сдвига соседей.
    addBtn.replaceWith(formCol);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            formCol.classList.add('entered');
        });
    });

    const input = formCol.querySelector('.column-input');
    
    // Авто-resize со скроллом при превышении высоты экрана
    const autoResize = () => {
        input.style.height = 'auto';
        const sh = input.scrollHeight;
        const boardHeight = document.getElementById('board').clientHeight;
        
        // Здесь только форма, вычитаем 60px
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

    input.focus();

    let isResolved = false;

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;

        if (!animate) {
            formCol.remove();
            restoreAddButton();
            return;
        }

        formCol.classList.remove('entered');
        formCol.classList.add('is-exiting');

        const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity') {
                formCol.remove();
                formCol.removeEventListener('transitionend', onTransitionEnd);
                restoreAddButton();
            }
        };
        formCol.addEventListener('transitionend', onTransitionEnd);
        
        setTimeout(() => {
            if (formCol.parentNode) {
                formCol.remove();
                restoreAddButton();
            }
        }, 400);
    };

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
            const newColumn = await createColumn(title, 'default');

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

            // Заменяем форму на реальную колонку на том же месте
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

            // Возвращаем кнопку «+ Создать колонку» в конец доски
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

// ---------- МЕНЮ КОЛОНКИ ----------
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.menu-btn.active').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-trigger.active').forEach(b => b.classList.remove('active'));
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
        column.collapsed = !column.collapsed; renderBoard();
        
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

// ---------- ФИЗИЧЕСКИЙ DRAG & DROP ----------
let dragClone = null;
let isDragging = false;
let dragType = null;
let draggedElement = null;
let mouseX = 0, mouseY = 0, lastMouseX = 0;
let currentRotation = 0, targetRotation = 0;
let rafId = null;
const emptyImg = new Image();
emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

document.addEventListener('dragstart', (e) => {
    if (e.target.closest('.column.is-renaming')) { e.preventDefault(); return; }
    if (e.target.closest('.menu-btn') || e.target.closest('.btn-add-card')) {
        e.preventDefault(); return;
    }

    const card = e.target.closest('.card');
    const column = e.target.closest('.column');

    if (card) {
        dragType = 'card';
        draggedElement = card;
        e.dataTransfer.setData('text/plain', card.dataset.cardId);
        // Запоминаем из какой колонки мы достали карточку
        draggedElement.dataset.sourceColumnId = column.dataset.columnId;
    } else if (column) {
        dragType = 'column';
        draggedElement = column;
        e.dataTransfer.setData('text/column', column.dataset.columnId); 
    } else {
        return;
    }

    e.dataTransfer.setDragImage(emptyImg, 0, 0);
    e.dataTransfer.effectAllowed = 'move';

    const rect = draggedElement.getBoundingClientRect();
    dragClone = draggedElement.cloneNode(true);
    
    dragClone.style.width = `${rect.width}px`;
    dragClone.style.height = `${rect.height}px`;
    dragClone.style.minWidth = `${rect.width}px`;
    dragClone.style.minHeight = `${rect.height}px`;
    dragClone.style.margin = '0';
    
    dragClone.classList.remove('is-ghost');

    if (dragType === 'card') dragClone.classList.add('card-drag-clone');
    if (dragType === 'column') dragClone.classList.add('column-drag-clone');

    document.body.appendChild(dragClone);
    document.body.classList.add(`is-dragging-${dragType}`);
    
    dragClone.dataset.offsetX = e.clientX - rect.left;
    dragClone.dataset.offsetY = e.clientY - rect.top;

    setTimeout(() => draggedElement.classList.add('is-ghost'), 0);

    isDragging = true;
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMouseX = mouseX;

    renderPhysics();
});

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isDragging) return;
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (dragType === 'column') {
        const hoverColumn = e.target.closest('.column');
        if (hoverColumn && hoverColumn !== draggedElement && !hoverColumn.classList.contains('is-ghost') && hoverColumn.closest('#board')) {
            const rect = hoverColumn.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            
            if (mouseX > midX) {
                if (hoverColumn.nextElementSibling !== draggedElement) hoverColumn.after(draggedElement);
            } else {
                if (hoverColumn.previousElementSibling !== draggedElement) hoverColumn.before(draggedElement);
            }
        }
    }

    if (dragType === 'card') {
        const hoverColumn = e.target.closest('.column');
        if (!hoverColumn || hoverColumn.classList.contains('is-ghost')) return;

        const cardList = hoverColumn.querySelector('.card-list');
        if (!cardList) return;

        const hoverCard = e.target.closest('.card:not(.is-ghost):not(.card-drag-clone)');

        // Логика сортировки по Y-оси внутри колонки
        if (hoverCard && hoverCard !== draggedElement) {
            const rect = hoverCard.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            
            if (mouseY > midY) {
                if (hoverCard.nextElementSibling !== draggedElement) hoverCard.after(draggedElement);
            } else {
                if (hoverCard.previousElementSibling !== draggedElement) hoverCard.before(draggedElement);
            }
        } else if (!hoverCard) {
            // Если мышка над пустой областью списка карточек или пустой колонкой
            if (!cardList.contains(draggedElement)) {
                cardList.appendChild(draggedElement);
            }
        }
    }
});

function renderPhysics() {
    if (!isDragging || !dragClone) return;
    const deltaX = mouseX - lastMouseX;
    lastMouseX = mouseX;
    
    const maxRotation = dragType === 'column' ? 3 : 12; 
    targetRotation = Math.max(-maxRotation, Math.min(maxRotation, deltaX * 0.4));
    currentRotation += (targetRotation - currentRotation) * 0.15;
    targetRotation *= 0.8;

    const x = mouseX - parseFloat(dragClone.dataset.offsetX);
    const y = mouseY - parseFloat(dragClone.dataset.offsetY);
    const scale = dragType === 'column' ? 1.02 : 1.04;
    
    dragClone.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${currentRotation}deg) scale(${scale})`;
    
    rafId = requestAnimationFrame(renderPhysics);
}

document.addEventListener('dragend', async () => {
    if (!isDragging) return;
    isDragging = false;
    cancelAnimationFrame(rafId);
    
    document.body.classList.remove('is-dragging-column', 'is-dragging-card');
    
    if (dragClone) {
        dragClone.remove();
        dragClone = null;
    }
    
    if (draggedElement) {
        draggedElement.classList.remove('is-ghost');
        
        // --- ЗАВЕРШЕНИЕ ПЕРЕТАСКИВАНИЯ КОЛОНКИ ---
        if (dragType === 'column') {
            const currentColumns = Array.from(document.querySelectorAll('#board .column'));
            const orderedIds = currentColumns.map(col => parseInt(col.dataset.columnId));
            
            state.columns.forEach(col => { col.position = orderedIds.indexOf(col.id); });
            renderBoard();
            
            try { await saveColumnsOrder(orderedIds); } 
            catch (error) { console.error("Ошибка сохранения порядка колонок", error); }
        }

        // --- ЗАВЕРШЕНИЕ ПЕРЕТАСКИВАНИЯ КАРТОЧКИ ---
        if (dragType === 'card') {
            const newColumnEl = draggedElement.closest('.column');
            if (newColumnEl) {
                const newColumnId = parseInt(newColumnEl.dataset.columnId);
                const sourceColumnId = parseInt(draggedElement.dataset.sourceColumnId);
                const taskId = parseInt(draggedElement.dataset.cardId);
                
                // Читаем физический порядок DOM
                const currentCards = Array.from(newColumnEl.querySelectorAll('.card:not(.card-drag-clone)'));
                const orderedIds = currentCards.map(c => parseInt(c.dataset.cardId));

                // Визуально обновляем счетчики
                const sourceColumnEl = document.querySelector(`.column[data-column-id="${sourceColumnId}"]`);
                if (sourceColumnEl) updateColumnCount(sourceColumnEl);
                updateColumnCount(newColumnEl);

                try {
                    const targetCol = state.columns.find(c => c.id === newColumnId);
                    const sourceCol = state.columns.find(c => c.id === sourceColumnId);

                    // 1. Если колонка изменилась - дергаем API перемещения (там таймеры и статусы)
                    if (newColumnId !== sourceColumnId) {
                        const updatedTask = await moveTask(taskId, newColumnId);
                        
                        // Обновляем локальный стейт (перекладываем объект задачи в другую колонку)
                        const taskIndex = sourceCol.tasks.findIndex(t => t.id == taskId);
                        if (taskIndex !== -1) {
                            const [movedTask] = sourceCol.tasks.splice(taskIndex, 1);
                            movedTask.column_id = newColumnId; 
                            movedTask.completed_at = updatedTask.completed_at;
                            movedTask.active_timer = updatedTask.active_timer; 
                            movedTask.total_time_spent = updatedTask.total_time_spent;
                            targetCol.tasks.push(movedTask);
                        }
                        // Обновляем UI карточки (таймеры, чекбокс завершения)
                        updateCardAppearance(draggedElement, updatedTask, targetCol.mode);
                    }

                    // 2. ВСЕГДА отправляем новый порядок карточек для целевой колонки
                    await saveTasksOrder(orderedIds);
                    
                    // Обновляем position в стейте, чтобы при ререндере ничего не прыгало
                    targetCol.tasks.forEach(t => {
                        t.position = orderedIds.indexOf(t.id);
                    });
                    
                    updateTimers();

                } catch (error) {
                    console.error("Ошибка при перемещении карточки", error);
                    await refreshBoard(); // Откат при ошибке
                }
            }
        }
    }

    dragType = null;
    draggedElement = null;
    currentRotation = targetRotation = 0;
});

// ---------- ГЛОБАЛЬНЫЕ КЛИКИ (меню, модалки) ----------
document.addEventListener('click', (e) => {

    // --- ДОБАВЛЕНО: Быстрое переименование по клику на заголовок ---
    const titleEl = e.target.closest('.column:not(.collapsed) .column-title');
    if (titleEl) {
        const columnEl = titleEl.closest('.column');
        // Проверяем, что колонка еще не в процессе переименования
        if (columnEl && !columnEl.classList.contains('is-renaming')) {
            const columnId = parseInt(columnEl.dataset.columnId);
            const column = state.columns.find(c => c.id === columnId);
            if (column) {
                startColumnRename(columnEl, column);
                return; // Прерываем обработку других кликов
            }
        }
    }

    // --- ОБРАБОТКА КНОПОК АЛЕРТА ---
    if (e.target.closest('[data-action="confirm-cancel"]')) {
        if (activeConfirmResolve) { activeConfirmResolve(false); activeConfirmResolve = null; }
        document.getElementById('confirm-modal').classList.remove('show');
        return;
    }
    if (e.target.closest('[data-action="confirm-delete"]')) {
        if (activeConfirmResolve) { activeConfirmResolve(true); activeConfirmResolve = null; }
        document.getElementById('confirm-modal').classList.remove('show');
        return;
    }
    
    const settingsTrigger = e.target.closest('.settings-trigger');
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

    const menuItem = e.target.closest('.menu-item');
    if (menuItem) {
        const columnEl = menuItem.closest('.column');
        if (columnEl) {
            handleColumnMenu(menuItem.dataset.action, columnEl, menuItem);
        }
    }

    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'theme') {
        const currentTheme = document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light';
        document.querySelectorAll('#theme-list .lang-item').forEach(el => {
            el.classList.toggle('active', el.dataset.themeValue === currentTheme);
        });
        document.getElementById('theme-modal').classList.add('show');
    }
    if (action === 'change-lang') document.getElementById('lang-modal').classList.add('show');
    if (action === 'about') document.getElementById('about-modal').classList.add('show');

    if (e.target.closest('.modal-close') || e.target.classList.contains('modal-overlay')) {
        // Если кликнули мимо окна подтверждения - это приравнивается к отмене
        if (activeConfirmResolve && (e.target.id === 'confirm-modal' || e.target.closest('#confirm-modal'))) {
            activeConfirmResolve(false);
            activeConfirmResolve = null;
        }
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
    }

    const themeItem = e.target.closest('#theme-list .lang-item');
    if (themeItem) {
        document.querySelectorAll('#theme-list .lang-item').forEach(el => el.classList.remove('active'));
        themeItem.classList.add('active');
        const theme = themeItem.dataset.themeValue;
        if (document.startViewTransition) {
            document.startViewTransition(() => {
                if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
                else document.documentElement.removeAttribute('data-theme');
            });
        } else {
            if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            else document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('doe-theme', theme);
        document.getElementById('theme-modal').classList.remove('show');
    }

    const langItem = e.target.closest('#lang-list .lang-item');
    if (langItem) {
        document.querySelectorAll('#lang-list .lang-item').forEach(el => el.classList.remove('active'));
        langItem.classList.add('active');
        const lang = langItem.dataset.value;
        applyLanguage(lang);
        document.getElementById('lang-modal').classList.remove('show');
    }

    const collapsed = e.target.closest('.column.collapsed');
    if (collapsed) {
        const columnId = parseInt(collapsed.dataset.columnId);
        const column = state.columns.find(c => c.id === columnId);
        if (column) {
            column.collapsed = false;
            renderBoard();
        }
    }

    if (!e.target.closest('.dropdown-menu')) {
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

function initLanguage() {
    const savedLang = localStorage.getItem('doe-lang') || 'ru';
    applyLanguage(savedLang);
}

function initTheme() {
    const savedTheme = localStorage.getItem('doe-theme') || 'light';
    
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    // Вот это ставит правильную галочку в меню выбора темы:
    document.querySelectorAll('#theme-list .lang-item').forEach(el => {
        el.classList.toggle('active', el.dataset.themeValue === savedTheme);
    });
}


// Выносим логику обрезки в отдельную функцию для конкретного элемента
function clampSingleTitle(titleEl) {
    if (!titleEl) return;
    const MAX_HEIGHT_PX = window.innerHeight * 0.2; // 20% экрана

    const fullTitle = titleEl.dataset.fullTitle || titleEl.textContent;

    // Сначала сбрасываем, чтобы измерить реальную высоту
    titleEl.style.webkitLineClamp = 'unset';
    titleEl.style.display = 'block';
    const naturalHeight = titleEl.scrollHeight;

    // Восстанавливаем flex-контейнер
    titleEl.style.display = '-webkit-box';

    if (naturalHeight > MAX_HEIGHT_PX) {
        // Находим сколько строк влезает
        const lineHeight = parseFloat(getComputedStyle(titleEl).lineHeight) || 21.75;
        const maxLines = Math.max(2, Math.floor(MAX_HEIGHT_PX / lineHeight));

        titleEl.style.webkitLineClamp = String(maxLines);
        titleEl.dataset.fullTitle = fullTitle;
        titleEl.dataset.clamped = 'true';
    } else {
        titleEl.style.webkitLineClamp = 'unset';
        titleEl.dataset.clamped = 'false';
        if (titleEl.textContent === fullTitle) {
            delete titleEl.dataset.fullTitle;
        }
    }
}

// Оригинальная функция теперь просто вызывает clampSingleTitle для всех колонок (нужно при ресайзе окна)
function clampExpandedTitles() {
    document.querySelectorAll('.column:not(.collapsed) .column-title').forEach(clampSingleTitle);
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

        const titleEl = e.target.closest('.column-title');
        if (!titleEl || titleEl.dataset.clamped !== 'true') return;

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
        const titleEl = e.target.closest('.column-title');
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

(async () => {
    initTooltip();
    initLanguage();
    initTheme();
    await refreshBoard();
    setInterval(updateTimers, 1000);
    
    // Пересчитываем clamping при ресайзе
    let isResizing = false;
    window.addEventListener('resize', () => {
        if (!isResizing) {
            isResizing = true;
            requestAnimationFrame(() => {
                clampExpandedTitles();
                adjustCollapsedColumnWidths();
                isResizing = false;
            });
        }
    });
})();
