// ---------- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ----------
let state = {
    columns: []
};

const API_BASE = '/api/v1';

// ---------- ЛОКАЛИЗАЦИЯ ----------
const translations = {
    ru: {
        settings: 'Настройки',
        theme: 'Тема',
        language: 'Язык',
        about: 'О приложении',
        workspace: 'Doe Board',
        newColumn: '+ Создать колонку',
        newTask: '+ Новая задача',
        columnModes: {
            default: 'Стандартный',
            track_time: 'Учёт времени',
            completion: 'Результирующий'
        },
        menu: {
            mode: 'Режим колонки',
            collapse: 'Свернуть колонку',
            rename: 'Переименовать',
            delete: 'Удалить'
        },
        modals: {
            themeTitle: 'Тема оформления',
            light: 'Светлая',
            dark: 'Тёмная',
            langTitle: 'Выберите язык',
            aboutTitle: 'О приложении',
            aboutDesc: 'эстетика, грация локального<br>Kanban-хранилища'
        },
        card: {
            timeSpent: 'Времени потрачено:'
        },
        prompts: {
            taskTitle: 'Название задачи:',
            columnTitle: 'Название колонки:',
            renameColumn: 'Новое название:',
            deleteConfirm: (title) => `Удалить колонку «${title}» и все задачи в ней?`
        }
    },
    en: {
        settings: 'Settings',
        theme: 'Theme',
        language: 'Language',
        about: 'About',
        workspace: 'Doe Board',
        newColumn: '+ Create column',
        newTask: '+ New task',
        columnModes: {
            default: 'Standard',
            track_time: 'Track time',
            completion: 'Completed'
        },
        menu: {
            mode: 'Column mode',
            collapse: 'Collapse column',
            rename: 'Rename',
            delete: 'Delete'
        },
        modals: {
            themeTitle: 'Theme',
            light: 'Light',
            dark: 'Dark',
            langTitle: 'Select language',
            aboutTitle: 'About',
            aboutDesc: 'aesthetic local-first<br>kanban sanctuary'
        },
        card: {
            timeSpent: 'Time spent:'
        },
        prompts: {
            taskTitle: 'Task title:',
            columnTitle: 'Column title:',
            renameColumn: 'New name:',
            deleteConfirm: (title) => `Delete column «${title}» and all its tasks?`
        }
    }
};

let currentLang = 'ru';

function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('doe-lang', lang);

    // Обновляем все элементы с data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const translation = getNestedTranslation(lang, key);
        if (translation) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        }
    });

    // Обновляем пункт "Язык" в меню шапки
    const langSpan = document.querySelector('[data-action="change-lang"] span');
    if (langSpan) langSpan.textContent = translations[lang].language;

    // Обновляем модальные окна
    document.querySelector('#theme-modal .modal-title').textContent = translations[lang].modals.themeTitle;
    document.querySelector('#theme-list .lang-item[data-theme-value="light"] span').textContent = translations[lang].modals.light;
    document.querySelector('#theme-list .lang-item[data-theme-value="dark"] span').textContent = translations[lang].modals.dark;
    document.querySelector('#lang-modal .modal-title').textContent = translations[lang].modals.langTitle;
    document.querySelector('#about-modal .modal-title').textContent = translations[lang].modals.aboutTitle;
    document.querySelector('#about-modal .about-desc').innerHTML = translations[lang].modals.aboutDesc;

    // Перерисовываем доску, чтобы обновить динамические тексты (кнопки, меню)
    if (state.columns.length > 0) {
        renderBoard();
    }
}

function getNestedTranslation(lang, path) {
    return path.split('.').reduce((obj, key) => obj?.[key], translations[lang]);
}

// Удобная функция для получения перевода в коде
function t(key, ...args) {
    const translation = getNestedTranslation(currentLang, key);
    if (typeof translation === 'function') return translation(...args);
    return translation || key;
}

// ---------- API-КЛИЕНТ ----------
async function fetchColumns() {
    const res = await fetch(`${API_BASE}/columns/`);
    if (!res.ok) throw new Error('Ошибка загрузки колонок');
    return res.json();
}

async function createColumn(title, mode = 'default') {
    const res = await fetch(`${API_BASE}/columns/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, mode })
    });
    if (!res.ok) throw new Error('Ошибка создания колонки');
    return res.json();
}

async function updateColumn(id, data) {
    const res = await fetch(`${API_BASE}/columns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Ошибка обновления колонки');
    return res.json();
}

function formatTotalTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

async function deleteColumn(id) {
    const res = await fetch(`${API_BASE}/columns/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Ошибка удаления колонки');
}

async function createTask(title, columnId) {
    const res = await fetch(`${API_BASE}/tasks/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, column_id: columnId })
    });
    if (!res.ok) throw new Error('Ошибка создания задачи');
    return res.json();
}

async function updateTask(id, data) {
    const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Ошибка обновления задачи');
    return res.json();
}

async function deleteTask(id) {
    const res = await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Ошибка удаления задачи');
}

async function moveTask(taskId, targetColumnId) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_column_id: targetColumnId })
    });
    if (!res.ok) throw new Error('Ошибка перемещения задачи');
    return res.json();
}

// ---------- УТИЛИТЫ ----------
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(startTime) {
    const start = new Date(startTime);
    const diff = Math.floor((Date.now() - start) / 1000);
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

    for (const col of sorted) {
        board.appendChild(createColumnElement(col));
    }

    const addColBtn = document.createElement('button');
    addColBtn.className = 'new-column-btn';
    addColBtn.textContent = t('newColumn');
    addColBtn.addEventListener('click', onCreateColumn);
    board.appendChild(addColBtn);
}

function updateCardAppearance(cardElement, task, columnMode) {
    // Обновляем класс is-completed
    if (task.completed_at) {
        cardElement.classList.add('is-completed');
    } else {
        cardElement.classList.remove('is-completed');
    }

    // Управляем таймером и отображением времени
    const existingTimer = cardElement.querySelector('.card-timer');
    const existingMeta = cardElement.querySelector('.subtask-meta');

    if (columnMode === 'track_time' && task.active_timer) {
        if (!existingTimer) {
            const timerDiv = document.createElement('div');
            timerDiv.className = 'card-timer';
            timerDiv.dataset.taskId = task.id;
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
            metaDiv.textContent = `Времени потрачено: ${formatTotalTime(task.total_time_spent)}`;
            cardElement.appendChild(metaDiv);
        } else {
            existingMeta.textContent = `Времени потрачено: ${formatTotalTime(task.total_time_spent)}`;
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
    if (column.collapsed) {
        colDiv.classList.add('collapsed');
    }
    colDiv.dataset.columnId = column.id;

    let pillClass = 'meta-pill default';
    let modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>';
    if (column.mode === 'track_time') {
        pillClass = 'meta-pill track-time';
        modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    } else if (column.mode === 'completion') {
        pillClass = 'meta-pill completion';
        modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    }

    const tasksHtml = column.tasks.map(task => {
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
            <span class="column-title">${escapeHtml(column.title)}</span>
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
            <div class="menu-item danger" data-action="delete-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>${t('menu.delete')}</span></div>
        </div>
        <div class="card-list">${tasksHtml}</div>
        <button class="btn-add-card">${t('newTask')}</button>
    `;

    // Обработчики
    const addBtn = colDiv.querySelector('.btn-add-card');
    addBtn.addEventListener('click', () => onAddTask(column.id));

    const menuBtn = colDiv.querySelector('.menu-btn');
    menuBtn.addEventListener('click', (e) => toggleColumnMenu(e, colDiv));

    // Drag & drop приём
    colDiv.addEventListener('dragover', e => e.preventDefault());
    colDiv.addEventListener('drop', e => onDropToColumn(e, column.id));

    return colDiv;
}

// ---------- ДЕЙСТВИЯ С КОЛОНКАМИ И ЗАДАЧАМИ ----------
async function refreshBoard() {
    try {
        const columns = await fetchColumns();
        // Добавляем флаг collapsed, если его нет
        state.columns = columns.map(col => ({
            ...col,
            collapsed: col.collapsed || false
        }));
        renderBoard();
    } catch (e) {
        console.error(e);
        alert('Не удалось загрузить доску');
    }
}

async function onAddTask(columnId) {
    const title = prompt(t('prompts.taskTitle'));
    if (!title) return;
    try {
        await createTask(title, columnId);
        await refreshBoard();
    } catch (e) {
        alert('Ошибка создания задачи');
    }
}

async function onCreateColumn() {
    const title = prompt(t('prompts.columnTitle'));
    if (!title) return;
    try {
        await createColumn(title, 'default');
        await refreshBoard();
    } catch (e) {
        alert('Ошибка создания колонки');
    }
}

async function onDropToColumn(e, columnId) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const card = document.querySelector(`.card[data-card-id="${taskId}"]`);
    const sourceColumn = card.closest('.column');
    const targetColumn = document.querySelector(`.column[data-column-id="${columnId}"]`);

    if (!card || !sourceColumn || !targetColumn) return;
    if (sourceColumn === targetColumn) return;

    // Оптимистичное перемещение с анимацией
    card.style.transition = 'opacity 0.15s ease, transform 0.2s ease';
    card.style.opacity = '0.6';
    card.style.transform = 'scale(0.98)';

    const targetCardList = targetColumn.querySelector('.card-list');
    targetCardList.appendChild(card);

    requestAnimationFrame(() => {
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
    });

    updateColumnCount(sourceColumn);
    updateColumnCount(targetColumn);

    try {
        const updatedTask = await moveTask(parseInt(taskId), columnId);

        // Обновляем состояние
        const sourceCol = state.columns.find(c => c.id === parseInt(sourceColumn.dataset.columnId));
        const targetCol = state.columns.find(c => c.id === columnId);
        const taskIndex = sourceCol.tasks.findIndex(t => t.id == taskId);
        if (taskIndex !== -1) {
            const [movedTask] = sourceCol.tasks.splice(taskIndex, 1);
            movedTask.column_id = columnId;
            movedTask.completed_at = updatedTask.completed_at;
            movedTask.active_timer = updatedTask.active_timer;
            movedTask.total_time_spent = updatedTask.total_time_spent;
            targetCol.tasks.push(movedTask);
        }

        // Обновляем внешний вид карточки
        updateCardAppearance(card, updatedTask, targetCol.mode);

        // Обновляем счётчики
        updateColumnCount(sourceColumn, sourceCol.tasks.length);
        updateColumnCount(targetColumn, targetCol.tasks.length);

        card.style.transition = '';
        card.style.opacity = '';
        card.style.transform = '';

        // Обновляем все таймеры
        updateTimers();
    } catch (error) {
        // Возврат при ошибке
        const sourceCardList = sourceColumn.querySelector('.card-list');
        sourceCardList.appendChild(card);
        updateColumnCount(sourceColumn);
        updateColumnCount(targetColumn);
        card.style.transition = '';
        card.style.opacity = '';
        card.style.transform = '';
        alert('Ошибка перемещения');
    }
}

// ---------- МЕНЮ КОЛОНКИ ----------
function toggleColumnMenu(e, columnEl) {
    e.stopPropagation();
    const menu = columnEl.querySelector('.dropdown-menu');
    const btn = columnEl.querySelector('.menu-btn');
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.menu-btn.active').forEach(b => b.classList.remove('active'));
    menu.classList.add('show');
    btn.classList.add('active');
}

async function handleColumnMenu(action, columnEl, menuItem) {
    const columnId = parseInt(columnEl.dataset.columnId);
    const column = state.columns.find(c => c.id === columnId);
    if (!column) return;

    if (action === 'set-mode') {
        const mode = menuItem.dataset.mode;
        try {
            await updateColumn(columnId, { mode });
            await refreshBoard();
        } catch (e) {
            alert('Ошибка смены режима');
        }
    } else if (action === 'rename-column') {
        const newTitle = prompt(t('prompts.renameColumn'), column.title);
        if (newTitle && newTitle !== column.title) {
            try {
                await updateColumn(columnId, { title: newTitle });
                await refreshBoard();
            } catch (e) {
                alert('Ошибка переименования');
            }
        }
    } else if (action === 'delete-column') {
        if (!confirm(t('prompts.deleteConfirm', column.title))) return;
        try {
            await deleteColumn(columnId);
            await refreshBoard();
        } catch (e) {
            alert('Ошибка удаления');
        }
    } else if (action === 'collapse-column') {
        column.collapsed = !column.collapsed; // переключаем
        renderBoard(); // перерисовываем доску
    }
}

// ---------- ФИЗИЧЕСКИЙ DRAG & DROP (КАК В СТАРОМ СКРИПТЕ) ----------
let dragClone = null;
let isDragging = false;
let mouseX = 0, mouseY = 0, lastMouseX = 0;
let currentRotation = 0, targetRotation = 0;
let rafId = null;
const emptyImg = new Image();
emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;

    e.dataTransfer.setDragImage(emptyImg, 0, 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.cardId);

    const rect = card.getBoundingClientRect();
    dragClone = card.cloneNode(true);
    dragClone.classList.add('card-drag-clone');
    document.body.appendChild(dragClone);
    dragClone.dataset.offsetX = e.clientX - rect.left;
    dragClone.dataset.offsetY = e.clientY - rect.top;

    setTimeout(() => card.classList.add('is-ghost'), 0);

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
});

function renderPhysics() {
    if (!isDragging) return;
    const deltaX = mouseX - lastMouseX;
    lastMouseX = mouseX;
    targetRotation = Math.max(-12, Math.min(12, deltaX * 0.8));
    currentRotation += (targetRotation - currentRotation) * 0.15;
    targetRotation *= 0.8;

    if (dragClone) {
        const x = mouseX - parseFloat(dragClone.dataset.offsetX);
        const y = mouseY - parseFloat(dragClone.dataset.offsetY);
        dragClone.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${currentRotation}deg) scale(1.04)`;
    }
    rafId = requestAnimationFrame(renderPhysics);
}

document.addEventListener('dragend', () => {
    isDragging = false;
    cancelAnimationFrame(rafId);
    if (dragClone) {
        dragClone.remove();
        dragClone = null;
    }
    document.querySelectorAll('.card.is-ghost').forEach(c => c.classList.remove('is-ghost'));
    currentRotation = targetRotation = 0;
});

// ---------- ГЛОБАЛЬНЫЕ КЛИКИ (меню, модалки) ----------
document.addEventListener('click', (e) => {
    // Закрытие меню при клике вне
    if (!e.target.closest('.dropdown-menu') && !e.target.closest('.menu-btn')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.menu-btn.active').forEach(b => b.classList.remove('active'));
    }

    // Меню настроек шапки
    if (e.target.closest('.settings-trigger')) {
        const menu = document.querySelector('.settings-wrapper .dropdown-menu');
        menu.classList.toggle('show');
        e.target.closest('.settings-trigger').classList.toggle('active');
    }

    // Пункты меню колонки
    const menuItem = e.target.closest('.menu-item');
    if (menuItem) {
        const columnEl = menuItem.closest('.column');
        if (columnEl) {
            handleColumnMenu(menuItem.dataset.action, columnEl, menuItem);
            columnEl.querySelector('.dropdown-menu')?.classList.remove('show');
            columnEl.querySelector('.menu-btn')?.classList.remove('active');
        }
    }

    // Модалки из шапки
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

    // Закрытие модалок
    if (e.target.closest('.modal-close') || e.target.classList.contains('modal-overlay')) {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
    }

    // Выбор темы
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
        localStorage.setItem('doe-theme', theme);   // ← ВОТ ЭТА СТРОКА ДОБАВЛЕНА
        document.getElementById('theme-modal').classList.remove('show');
    }

    // Выбор языка
    const langItem = e.target.closest('#lang-list .lang-item');
    if (langItem) {
        document.querySelectorAll('#lang-list .lang-item').forEach(el => el.classList.remove('active'));
        langItem.classList.add('active');
        const lang = langItem.dataset.value;
        applyLanguage(lang);
        document.getElementById('lang-modal').classList.remove('show');
    }

    // Свёрнутая колонка
    const collapsed = e.target.closest('.column.collapsed');
    if (collapsed) {
        const columnId = parseInt(collapsed.dataset.columnId);
        const column = state.columns.find(c => c.id === columnId);
        if (column) {
            column.collapsed = false;
            renderBoard();
        }
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

// ---------- ИНИЦИАЛИЗАЦИЯ ЯЗЫКА ----------

function initLanguage() {
    const savedLang = localStorage.getItem('doe-lang') || 'ru';
    applyLanguage(savedLang);
}

// ---------- ИНИЦИАЛИЗАЦИЯ ТЕМЫ ----------
function initTheme() {
    const savedTheme = localStorage.getItem('doe-theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (savedTheme === 'light') {
        document.documentElement.removeAttribute('data-theme');
    }
}

// ---------- ЗАПУСК ----------
(async () => {
    initLanguage();
    initTheme();
    await refreshBoard();
    setInterval(updateTimers, 1000);
})();