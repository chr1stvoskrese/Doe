// ---------- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ----------
let state = { columns: [], workspaces: [], activeWorkspaceId: null };
let modalNavigationStack = [];
const API_BASE = '/api/v1';

const translations = {
    ru: {
        searchPlaceholder: 'Поиск...',
        settings: 'Настройки', theme: 'Тема', language: 'Язык', about: 'О приложении', workspace: 'Doe Board', cancel: 'Отмена',
        newColumn: '+ Создать колонку', newTask: '+ Новая карточка', subtasks: 'Чек-лист',
        menu: { 
            mode: 'Режим колонки', collapse: 'Свернуть колонку', rename: 'Переименовать', 
            delete: 'Удалить', clear: 'Очистить', open: 'Открыть', 
            deleteCard: 'Удалить карточку', clearTimer: 'Очистить таймер',
            exportCard: 'Экспорт в Markdown', attachmentsSettings: 'Хранилище вложений',
            copyCardLink: 'Скопировать ссылку'
        },
        copied: 'Скопировано!',
        modals: { 
            themeTitle: 'Тема оформления', light: 'Светлая', dark: 'Тёмная', 
            langTitle: 'Выберите язык', aboutTitle: 'О приложении', 
            aboutDesc: 'Aesthetic. Local-first. Kanban sanctuary.',
            attTitle: 'Хранилище вложений', 
            attLocalTitle: 'Внутри хранилища',
            attLocalDesc: 'Файлы переносятся вместе с доской (По умолчанию)',
            attExternalTitle: 'Внешняя папка',
            attSelectBtn: 'Выбрать папку...',
            attWarning: 'При использовании внешней папки файлы не будут копироваться на флешку автоматически при переносе хранилища.',
            exportTitle: 'Экспорт карточки', exportIncludeAtt: 'Экспортировать с вложениями', btnExport: 'Экспортировать'
        },
        copyLink: 'Копировать ссылку',
        detachSubtask: 'Отвязать от чек-листа (сделать независимой)',
        cyclicError: 'Нельзя привязать! Возникнет бесконечный цикл.',
        columnModes: { default: 'Стандартный', track_time: 'Учёт времени', completion: 'Результирующий' },
        defaultWorkspace: 'Начальная вкладка',
        attachments: 'Вложения', addAttachment: '+ Добавить вложение...',
        vault: {
            subtitle: 'Aesthetic. Local-first. Kanban sanctuary.',
            createTitle: 'Создать хранилище',
            createDesc: 'Начните новое локальное хранилище на вашем устройстве',
            openTitle: 'Открыть хранилище',
            openDesc: 'Выберите существующее хранилище из вашего устройства',
            privacy: 'Все данные хранятся только на вашем устройстве.<br>Конфиденциальность. Без облака. Без компромиссов.',
            createPrompt: 'Введите название и выберите папку, где оно будет сохранено',
            namePlaceholder: 'Название нового хранилища...',
            selectFolder: 'Выбрать местоположение',
            errorInvalid: 'Папка не содержит данных Doe',
            recent: 'История хранилищ',
            recentEmpty: 'Ранее открытые хранилища появятся здесь'
        },
        card: { timeSpent: 'Времени потрачено:', unknownTime: 'неизвестно' },
        taskModal: {
            descPlaceholder: 'Кликните, чтобы добавить описание...',
            inputPlaceholder: 'Описание карточки...',
            subtasksPlaceholder: '+ Добавить пункт...',
            timerPlaceholder: '1ч 30м',
            created: 'Создано',
            updated: 'Изменено',
            uploading: (name) => `[⏳ Сохраняем ${name} in Vault...]`,
            uploadError: (name) => `[❌ Ошибка сохранения: ${name}]`,
            uploadNetworkError: (name) => `[❌ Ошибка сети: ${name}]`
        },
        timeUnits: { y: 'л', w: 'н', d: 'д', h: 'ч', m: 'м', s: 'с' },
        prompts: { 
            taskTitle: 'Название карточки:', columnTitle: 'Название колонки:', renameColumn: 'Новое название:', 
            deleteConfirmTitle: 'Удалить колонку?', deleteConfirmDesc: 'Все карточки внутри будут потеряны.',
            clearConfirmTitle: 'Очистить колонку?', clearConfirmDesc: 'Все карточки внутри будут удалены безвозвратно.',
            newTabTitle: 'Название новой вкладки:', deleteTabConfirm: 'Удалить вкладку?',
            deleteTabDesc: 'Вкладка и все колонки в ней будут удалены навсегда.'
        },
        errors: { tooLong: 'Максимум 200 символов' },
        alerts: { loadError: 'Не удалось загрузить доску', error: 'Ошибка' }
    },
    en: {
        searchPlaceholder: 'Search...',
        settings: 'Settings', theme: 'Theme', language: 'Language', about: 'About', workspace: 'Doe Board', cancel: 'Cancel',
        newColumn: '+ Create column', newTask: '+ New card', subtasks: 'Checklist',
        menu: { 
            mode: 'Column mode', collapse: 'Collapse column', rename: 'Rename', 
            delete: 'Delete', clear: 'Clear', open: 'Open', 
            deleteCard: 'Delete card', clearTimer: 'Clear timer',
            exportCard: 'Export to Markdown', attachmentsSettings: 'Attachments Storage',
            copyCardLink: 'Copy link'
        },
        copied: 'Copied!',
        modals: { 
            themeTitle: 'Theme', light: 'Light', dark: 'Dark', 
            langTitle: 'Select language', aboutTitle: 'About', 
            aboutDesc: 'Aesthetic. Local-first. Kanban sanctuary.',
            attTitle: 'Attachments Storage', 
            attLocalTitle: 'Inside vault',
            attLocalDesc: 'Files move together with the board (Default)',
            attExternalTitle: 'External folder',
            attSelectBtn: 'Choose folder...',
            attWarning: 'When using an external folder, files will not copy automatically if you move the vault to a USB drive.',
            exportTitle: 'Export Card', exportIncludeAtt: 'Export with attachments', btnExport: 'Export'
        },
        columnModes: { default: 'Standard', track_time: 'Track time', completion: 'Completed' },
        defaultWorkspace: 'Main Board',
        attachments: 'Attachments', addAttachment: '+ Add attachment...',
        vault: {
            subtitle: 'Aesthetic. Local-first. Kanban sanctuary.',
            createTitle: 'Create Vault',
            createDesc: 'Start a new local vault on your device',
            openTitle: 'Open Vault',
            openDesc: 'Select an existing vault from your device',
            privacy: 'All data is stored locally on your device.<br>Privacy. No cloud. No compromises.',
            createPrompt: 'Enter a name and choose where to save your new vault',
            namePlaceholder: 'New vault name...',
            selectFolder: 'Browse location',
            errorInvalid: 'Folder is not a valid Doe Vault',
            recent: 'Recent Vaults',
            recentEmpty: 'Previously opened vaults will appear here'
        },
        card: { timeSpent: 'Time spent:', unknownTime: 'unknown' },
        taskModal: {
            descPlaceholder: 'Click to add description...',
            inputPlaceholder: 'Card description...',
            subtasksPlaceholder: '+ Add item...',
            timerPlaceholder: '1h 30m',
            created: 'Created',
            updated: 'Updated',
            uploading: (name) => `[⏳ Saving ${name} to Vault...]`,
            uploadError: (name) => `[❌ Error saving: ${name}]`,
            uploadNetworkError: (name) => `[❌ Network error: ${name}]`
        },
        timeUnits: { y: 'y', w: 'w', d: 'd', h: 'h', m: 'm', s: 's' },
        prompts: { 
            taskTitle: 'Card title:', columnTitle: 'Column title:', renameColumn: 'New name:', 
            deleteConfirmTitle: 'Delete column?', deleteConfirmDesc: 'All cards inside will be lost.',
            clearConfirmTitle: 'Clear column?', clearConfirmDesc: 'All cards inside will be permanently deleted.',
            newTabTitle: 'New tab name:', deleteTabConfirm: 'Delete tab?',
            deleteTabDesc: 'The tab and all its columns will be deleted permanently.'
        },
        errors: { tooLong: 'Maximum 200 characters' },
        alerts: { loadError: 'Failed to load board', error: 'Error' }
    }
};

// Глобальная защита: запрещаем браузеру открывать файлы при случайном перетаскивании мимо зоны
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

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

function formatExactTime(seconds) {
    if (!seconds) return "00:00:00";
    
    const MAX_SECONDS = 31536000000; // 1000 лет
    if (seconds >= MAX_SECONDS) {
        return currentLang === 'ru' ? '1000+ лет' : '1000+ y';
    }
    
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    
    if (d === 0) {
        return `${h}:${m}:${s}`;
    }
    
    const units = t('timeUnits');
    return `${d}${units.d} ${h}:${m}:${s}`;
}

function parseTimeToSeconds(input) {
    input = input.trim().toLowerCase();
    if (!input) return null;

    let seconds = 0;
    let matchedAny = false;

    // СНЯТО ОГРАНИЧЕНИЕ: теперь \d+ позволяет вводить хоть миллион часов/дней (например "999999:30:00")
    const timeMatch = input.match(/(?:^|\s)(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\s|$)/);
    if (timeMatch) {
        seconds += parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60;
        if (timeMatch[3]) seconds += parseInt(timeMatch[3]);
        matchedAny = true;
    }

    // Вспомогательная функция для поиска текстовых единиц измерения
    const matchUnit = (regex, multiplier) => {
        const match = input.match(regex);
        if (match) {
            seconds += parseFloat(match[1]) * multiplier;
            matchedAny = true;
        }
    };

    // Парсим без лимитов: 100000y, 999999d и т.д.
    matchUnit(/(\d+(?:\.\d+)?)\s*(y|л|год|лет|года)/, 31536000);
    matchUnit(/(\d+(?:\.\d+)?)\s*(mo|мес)/, 2592000);
    matchUnit(/(\d+(?:\.\d+)?)\s*(w|н|нед)/, 604800);
    matchUnit(/(\d+(?:\.\d+)?)\s*(d|д|день|дней|дня)/, 86400);
    matchUnit(/(\d+(?:\.\d+)?)\s*(h|ч|hour|час|часов|часа)/, 3600);
    matchUnit(/(\d+(?:\.\d+)?)\s*(m(?!o)|м|min|мин)/, 60);
    matchUnit(/(\d+(?:\.\d+)?)\s*(s|с|sec|сек)/, 1);

    const MAX_SECONDS = 31536000000; // Ровно 1000 лет

    if (matchedAny) return Math.min(Math.floor(seconds), MAX_SECONDS);

    // Если ввели просто число без букв (например "99999") - считаем это минутами
    if (/^\d+(?:\.\d+)?$/.test(input)) {
        return Math.min(Math.floor(parseFloat(input) * 60), MAX_SECONDS);
    }

    return null;
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
            else if (key === 'modals.aboutDesc' || key === 'vault.privacy') el.innerHTML = translation;
            else el.textContent = translation;
        }
    });

    const langSpan = document.querySelector('[data-action="change-lang"] span');
    if (langSpan) langSpan.textContent = translations[lang].language;

    document.querySelectorAll('#lang-list .lang-item').forEach(el => {
        el.classList.toggle('active', el.dataset.value === lang);
    });

    // Мгновенно обновляем даты в истории хранилищ
    document.querySelectorAll('.vault-history-date').forEach(el => {
        const ts = el.dataset.timestamp;
        if (ts) {
            el.textContent = formatDateTime(ts);
        } else {
            el.textContent = lang === 'ru' ? 'Ранее' : 'Earlier';
        }
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

async function triggerGarbageCollector() {
    try {
        // Фоновый запрос, мы даже не ждем его ответа (fire-and-forget)
        fetch(`${API_BASE}/system/cleanup-attachments`, { method: 'POST' }).catch(() => {});
    } catch (e) {
        console.error("Garbage Collector trigger failed:", e);
    }
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
    // 1. Проверяем, доступен ли нативный API
    if (!window.pywebview || !window.pywebview.api) {
        throw new Error("Native API not ready");
    }

    // 2. Вызываем нативный macOS/Windows диалог выбора папки
    const selectedPath = await window.pywebview.api.choose_directory();
    
    // 3. Если пользователь нажал "Отмена" или просто закрыл окно
    if (!selectedPath) {
        return { canceled: true };
    }

    // 4. Отправляем выбранный путь на бэкенд
    const res = await fetch(`${API_BASE}/system/vault/switch`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_path: selectedPath })
    });
    
    if (!res.ok) throw new Error('Error switching vault');
    return res.json();
}

function updateVaultName(name) {
    const span = document.querySelector('.vault-name-text');
    if (span) {
        // Сохраняем полный оригинал для тултипа
        span.dataset.fullTitle = name;
        
        // Логика троеточия (если > 30 символов)
        if (name.length > 30) {
            span.textContent = name.substring(0, 29) + '…';
        } else {
            span.textContent = name;
        }
        
        span.removeAttribute('data-i18n');
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
    if (seconds === 0) return t('card.unknownTime');

    const MAX_SECONDS = 31536000000; // 1000 лет
    if (seconds >= MAX_SECONDS) {
        return currentLang === 'ru' ? '1000+ лет' : '1000+ y';
    }

    // Константы времени в секундах
    const YEAR = 31536000; // 365 дней
    const WEEK = 604800;   // 7 дней
    const DAY = 86400;     // 24 часа
    const HOUR = 3600;     // 60 минут

    // Вычисляем все величины сверху вниз
    const y = Math.floor(seconds / YEAR);
    const w = Math.floor((seconds % YEAR) / WEEK);
    const d = Math.floor((seconds % WEEK) / DAY);
    const h = Math.floor((seconds % DAY) / HOUR);
    const m = Math.floor((seconds % HOUR) / 60);
    const s = Math.floor(seconds % 60);

    const units = t('timeUnits');
    const parts = [];

    // Собираем массив существующих значений
    if (y > 0) parts.push(`${y}${units.y}`);
    if (w > 0) parts.push(`${w}${units.w}`);
    if (d > 0) parts.push(`${d}${units.d}`);
    if (h > 0) parts.push(`${h}${units.h}`);
    if (m > 0) parts.push(`${m}${units.m}`);
    
    // Секунды оставляем для очень быстрых задач
    if (s > 0 || parts.length === 0) {
        parts.push(`${s}${units.s}`);
    }

    // Возвращаем строго 2 самых крупных значения
    return parts.slice(0, 2).join(' ');
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

async function deleteTask(id) { 
    const res = await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' }); 
    if (!res.ok) throw new Error('Error'); 
    return res.json(); 
}

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

function formatTime(task) {
    let startStr = task.active_timer.start_time;
    if (!startStr.endsWith('Z')) startStr += 'Z'; 
    const start = new Date(startStr); 
    
    // Считаем сколько натикало с момента последнего запуска (или снятия с паузы)
    const activeSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    // Берем "замороженное" время из прошлых сессий
    const closedSeconds = task.total_time_spent || 0;
    
    // Складываем всё вместе! 
    const diff = activeSeconds + closedSeconds;
    
    const MAX_SECONDS = 31536000000; // 1000 лет
    if (diff >= MAX_SECONDS) {
        return currentLang === 'ru' ? '1000+ лет' : '1000+ y';
    }
    
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(diff % 60).toString().padStart(2, '0');
    
    if (d === 0) {
        return `${h}:${m}:${s}`;
    }
    
    const units = t('timeUnits');
    return `${d}${units.d} ${h}:${m}:${s}`;
}

function bumpModalUpdatedDate() {
    const span = document.getElementById('task-updated-text');
    if (span) {
        const nowStr = formatDateTime(new Date().toISOString());
        span.innerHTML = `${t('taskModal.updated')}: ${nowStr}`;
    }
}

// ---------- РЕНДЕРИНГ ДОСКИ ----------

function formatDateTime(isoString) {
    if (!isoString) return '';
    
    // Бэкенд отдает время в UTC (datetime.utcnow()), 
    // поэтому гарантируем, что JS распарсит его как UTC и переведет в локальное время пользователя.
    let dateStr = isoString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        dateStr += 'Z';
    }
    
    const date = new Date(dateStr);
    
    // Настройки форматирования (например: 7 мая 2026 г., 15:40)
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    };
    
    return date.toLocaleDateString(currentLang, options);
}

function renderBoard() {
    const board = document.getElementById('board');
    const savedScroll = board.scrollLeft;

    board.innerHTML = '';
    const sorted = [...state.columns].sort((a, b) => a.position - b.position);
    for (const col of sorted) board.appendChild(createColumnElement(col));

    const addColBtn = document.createElement('button');
    addColBtn.className = 'new-column-btn';
    addColBtn.textContent = t('newColumn');
    addColBtn.addEventListener('click', onCreateColumn);
    board.appendChild(addColBtn);
    
    board.scrollLeft = savedScroll;

    // 🔥 ФИКС: Межвкладочный Drag & Drop (Восстановление призрака)
    // Если мы переключили вкладку туда-сюда во время драга,
    // заново находим нашу карточку в свежем DOM и делаем её призраком.
    if (isDragging && draggedElement) {
        if (dragType === 'card') {
            const id = draggedElement.dataset.cardId;
            const newEl = board.querySelector(`.card[data-card-id="${id}"]`);
            if (newEl) {
                draggedElement = newEl; // Подменяем сироту на новый узел
                draggedElement.classList.add('is-ghost');
            }
        } else if (dragType === 'column') {
            const id = draggedElement.dataset.columnId;
            const newEl = board.querySelector(`.column[data-column-id="${id}"]`);
            if (newEl) {
                draggedElement = newEl;
                draggedElement.classList.add('is-ghost');
            }
        }
    }

    // Корректируем ширину свёрнутых колонок после layout
    requestAnimationFrame(() => {
        adjustCollapsedColumnWidths();
        clampExpandedTitles();
    });
}

function updateCardAppearance(cardElement, task, columnMode) {
    // 1. Статус завершения
    if (task.completed_at) cardElement.classList.add('is-completed');
    else cardElement.classList.remove('is-completed');

    // 2. Подготовка данных
    const subtasks = task.subtasks || [];
    const hasChecklist = subtasks.length > 0;
    const isTimerColumn = (columnMode === 'track_time');
    const isCompletionTime = (columnMode === 'completion' && task.total_time_spent !== undefined);
    
    cardElement.classList.toggle('has-unknown-time', isCompletionTime && task.total_time_spent === 0);

    // 3. Работа с футером
    let footer = cardElement.querySelector('.card-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'card-footer';
        cardElement.appendChild(footer);
    }

    // Собираем новый контент в строку
    let newContent = '';

    if (hasChecklist) {
        const total = subtasks.length;
        const done = subtasks.filter(s => s.completed_at).length;
        const allDone = done === total ? 'all-done' : '';
        newContent += `<div class="checklist-meta ${allDone}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg><span>${done}/${total}</span></div>`;
    }

    if (isTimerColumn) {
        const displayTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        newContent += `<div class="card-timer" data-task-id="${task.id}">${displayTime}</div>`;
    }

    if (isCompletionTime) {
        newContent += `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
    }

    // Если контент реально изменился — обновляем мгновенно (Senior UX: без лишних задержек)
    if (footer.innerHTML !== newContent) {
        footer.innerHTML = newContent;
    }
}

function generateCardHtml(task, columnMode) {
    let extraClasses = [];
    if (task.completed_at) extraClasses.push('is-completed');

    // 1. Чек-лист
    let checklistHtml = '';
    const subtasks = task.subtasks || [];
    if (subtasks.length > 0) {
        const total = subtasks.length;
        const done = subtasks.filter(s => s.completed_at).length;
        checklistHtml = `<div class="checklist-meta ${done === total ? 'all-done' : ''}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg><span>${done}/${total}</span></div>`;
    }

    // 2. Таймер (активный или остановленный)
    let timerHtml = '';
    if (columnMode === 'track_time') {
        const displayTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        timerHtml = `<div class="card-timer" data-task-id="${task.id}">${displayTime}</div>`;
    }

    // 3. Затраченное время (Completion)
    let spentTimeHtml = '';
    if (columnMode === 'completion' && task.total_time_spent !== undefined) {
        spentTimeHtml = `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
        if (task.total_time_spent === 0) extraClasses.push('has-unknown-time');
    } 

    let footerHtml = '';
    if (checklistHtml || timerHtml || spentTimeHtml) {
        footerHtml = `<div class="card-footer">${checklistHtml}${timerHtml}${spentTimeHtml}</div>`;
    }
    
    return `
        <div class="card ${extraClasses.join(' ')}" data-card-id="${task.id}">
            <div class="card-title-wrapper">
                <svg class="completed-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <div class="card-title">${escapeHtml(task.title)}</div>
                <div class="card-menu-wrapper">
                    <button class="card-menu-btn" title="Редактировать">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                </div>
            </div>
            ${footerHtml}
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
            // Было: const ws = await createWorkspaceAPI("Main");
            // Стало: берем перевод из словаря
            const ws = await createWorkspaceAPI(t('defaultWorkspace'));
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
    
    // Автоматическое изменение высоты textarea (Фикс вылетающего курсора и скролла)
    const autoResize = () => {
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        const sh = input.scrollHeight + offset;
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

    // Авто-resize со скроллом при превышении высоты экрана (Фикс вылетающего курсора)
    const autoResize = () => {
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        const sh = input.scrollHeight + offset;
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
    
    // Фокусируемся, но запрещаем браузеру мгновенно прыгать к полю
    input.focus({ preventScroll: true }); 
    input.setSelectionRange(input.value.length, input.value.length);

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

    // Авто-resize по содержимому (Фикс сломанного скролла и курсора)
    let lastValidValue = input.value;
    const autoResize = () => {
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        const sh = input.scrollHeight + offset;
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
        const scrollParent = cardEl.closest('.card-list');
        const currentScroll = scrollParent ? scrollParent.scrollTop : 0;

        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        input.style.height = (input.scrollHeight + offset) + 'px';
        
        if (scrollParent) scrollParent.scrollTop = currentScroll;
        
        if (input.value.trim().length <= 200) {
            cardEl.classList.remove('is-error');
        }
    };
    
    input.addEventListener('input', () => {
        autoResize(); // Меняем высоту при вводе
        
        // Закрываем меню ТОЛЬКО при реальном вводе с клавиатуры
        const globalMenu = document.getElementById('global-card-menu');
        if (globalMenu.classList.contains('show') && globalMenu.dataset.activeCardId == task.id) {
            closeAllDropdowns();
        }
    });
    autoResize();
    
    input.focus();
    // Ставим курсор строго в самый конец строки
    input.setSelectionRange(input.value.length, input.value.length); 

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
                
                // Вставляем ПОСЛЕ обертки заголовка, чтобы текст упал строго вниз
                const wrapper = input.closest('.card-title-wrapper');
                if (wrapper) {
                    wrapper.after(hint);
                } else {
                    input.after(hint);
                }
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
        
        // 🌟 ГАРАНТИРОВАННОЕ ЗАКРЫТИЕ МЕНЮ при сохранении (Enter или клик мимо)
        closeAllDropdowns();

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
            
            // 🌟 ГАРАНТИРОВАННОЕ ЗАКРЫТИЕ МЕНЮ при отмене (Escape)
            closeAllDropdowns();
            
            restore(task.title);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { 
            if (!committed) commit(); 
        }, 120);
    });
}

// ==========================================
// ПЕРЕИМЕНОВАНИЕ ЗАГОЛОВКА ОТКРЫТОЙ КАРТОЧКИ
// ==========================================
function startModalTaskRename(titleEl) {
    const modal = document.getElementById('task-modal');
    if (modal.classList.contains('is-renaming')) return;

    const taskId = parseInt(modal.dataset.taskId);
    const originalTitle = titleEl.textContent;

    const input = document.createElement('textarea');
    input.className = 'task-modal-title-input';
    input.value = originalTitle;
    input.rows = 1;
    input.spellcheck = false;

    titleEl.replaceWith(input);
    modal.classList.add('is-renaming');

    // Авто-ресайз по высоте (Фикс вылетающего курсора)
    const autoResize = () => {
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        input.style.height = (input.scrollHeight + offset) + 'px';
    };
    input.addEventListener('input', () => {
        autoResize();
        // Убираем ошибку, если текст стал допустимой длины
        if (input.value.trim().length <= 200) {
            const header = input.closest('.modal-header');
            if (header) header.classList.remove('is-error');
        }
    });
    autoResize();
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let committed = false;

    const restore = (title) => {
        const span = document.createElement('span');
        span.className = 'modal-title';
        span.id = 'task-modal-title';
        span.textContent = title;
        
        // Удаляем следы ошибки при выходе из режима редактирования
        const header = input.closest('.modal-header');
        if (header) {
            header.classList.remove('is-error');
            const hint = header.querySelector('.card-error-hint');
            if (hint) hint.remove();
        }

        if (input.parentNode) input.replaceWith(span);
        modal.classList.remove('is-renaming');
    };

    const commit = async () => {
        if (committed) return;
        
        const newTitle = input.value.trim();
        // Защита от переполнения с текстом-подсказкой и анимацией тряски
        if (newTitle.length > 200) {
            const header = input.closest('.modal-header');
            if (header) {
                if (!header.querySelector('.card-error-hint')) {
                    const hint = document.createElement('div');
                    hint.className = 'card-error-hint';
                    hint.textContent = t('errors.tooLong');
                    header.appendChild(hint);
                }
                header.classList.remove('is-error');
                void header.offsetWidth; // Force Reflow для перезапуска анимации
                header.classList.add('is-error');
            }
            input.focus();
            return;
        }

        committed = true;
        const finalTitle = newTitle || originalTitle;
        restore(finalTitle);

        if (newTitle && newTitle !== originalTitle) {
            try {
                await updateTask(taskId, { title: newTitle });
                
                bumpModalUpdatedDate();
                
                // Обновляем задачу в локальном стейте (если она на главной доске)
                for (let col of state.columns) {
                    let t = col.tasks.find(t => t.id === taskId);
                    if (t) {
                        t.title = newTitle;
                        break;
                    }
                }
                refreshBoard(); // Чтобы название карточки обновилось и на фоне
                
                // Обновляем хлебные крошки внутри модалки
                if (modalNavigationStack.length > 0) {
                    modalNavigationStack[modalNavigationStack.length - 1].title = newTitle;
                    renderBreadcrumbs();
                }
            } catch (e) {
                console.error("Ошибка при переименовании задачи", e);
                restore(originalTitle);
            }
        }
    };

    // Защита от перехвата драг-н-дропом модалки
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); committed = true; restore(originalTitle); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!committed) commit(); }, 120));
}

// ==========================================
// ПЕРЕИМЕНОВАНИЕ ПОДЗАДАЧИ
// ==========================================
function startSubtaskRename(subtaskEl) {
    const titleDiv = subtaskEl.querySelector('.subtask-title');
    if (!titleDiv || subtaskEl.classList.contains('is-renaming')) return;

    const subtaskId = parseInt(subtaskEl.dataset.subtaskId);
    const originalTitle = titleDiv.textContent;

    const input = document.createElement('textarea');
    input.className = 'subtask-title-input';
    input.value = originalTitle;
    input.rows = 1;
    input.spellcheck = false;

    titleDiv.replaceWith(input);
    subtaskEl.classList.add('is-renaming');

    const autoResize = () => {
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        input.style.height = (input.scrollHeight + offset) + 'px';
    };
    input.addEventListener('input', () => {
        if (input.value.trim().length <= 200) {
            subtaskEl.classList.remove('is-error');
            const hint = subtaskEl.querySelector('.card-error-hint');
            if (hint) hint.remove();
        }
        autoResize();
    });
    autoResize();
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let committed = false;

    const restore = (title) => {
        const div = document.createElement('div');
        div.className = 'subtask-title';
        div.textContent = title;
        
        const hint = subtaskEl.querySelector('.card-error-hint');
        if (hint) hint.remove();

        if (input.parentNode) input.replaceWith(div);
        subtaskEl.classList.remove('is-renaming', 'is-error');
    };

    const commit = async () => {
        if (committed) return;
        
        const newTitle = input.value.trim();
        
        // Валидация на 200 символов с тряской
        if (newTitle.length > 200) {
            if (!subtaskEl.querySelector('.card-error-hint')) {
                const hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');
                subtaskEl.appendChild(hint);
            }
            subtaskEl.classList.remove('is-error');
            void subtaskEl.offsetWidth; // Force Reflow
            subtaskEl.classList.add('is-error');
            input.focus();
            return;
        }

        committed = true;
        const finalTitle = newTitle || originalTitle;
        restore(finalTitle);

        if (newTitle && newTitle !== originalTitle) {
            try {
                await updateTask(subtaskId, { title: newTitle });
            } catch (e) {
                console.error("Ошибка при переименовании подзадачи", e);
                restore(originalTitle);
            }
        }
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); committed = true; restore(originalTitle); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!committed) commit(); }, 120));
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

// --- НОВЫЕ ПЕРЕМЕННЫЕ ДЛЯ КРОСС-ВКЛАДОЧНОГО DRAG&DROP ---
let originalWorkspaceId = null;
let isHoveringTabs = false;
let draggedTaskObject = null; 
let currentDragScale = 1;
let dragCloneWidth = 0;
let dragCloneHeight = 0;
let pendingSwitchTabId = null;
let tabSwitchTimeout = null;

// Переменные для идеальной математики точки хвата
let originalOffsetX = 0;
let originalOffsetY = 0;
let currentOriginX = 0;
let currentOriginY = 0;

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
    // 🚀 SENIOR FIX: Добавили .description-wrapper, чтобы кастомный DND не ломал нативный ресайзер
    if (e.target.closest('button, input, textarea, .menu-btn, .card-menu-btn, .tab-close-btn, .column.is-renaming, .board-tab.is-renaming, .card.is-renaming, .card-entering, .description-wrapper')) return;
    // 2. Ищем, на чем именно кликнули
    const vaultHistory = e.target.closest('.vault-history-item');
    const subtask = e.target.closest('.subtask-item');
    const attachment = e.target.closest('.attachment-item'); // <--- ВОТ ЭТО НАДО ДОБАВИТЬ
    const card = e.target.closest('.card');
    const column = e.target.closest('.column');
    const tab = e.target.closest('.board-tab');

    if (vaultHistory) { // <--- ВСТАВИТЬ НА ПЕРВОЕ МЕСТО!
        potentialDragType = 'vault-history';
        potentialDragTarget = vaultHistory;
    }
    else if (attachment) { // <--- ВОТ ЭТО НАДО ДОБАВИТЬ
        potentialDragType = 'attachment';
        potentialDragTarget = attachment;
    }
    else if (subtask) { 
        potentialDragType = 'subtask';
        potentialDragTarget = subtask;
    }
    else if (card) {
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

    // 🔥 ФИКС ТАЙМЕРА: Находим объект задачи в текущем стейте, чтобы таймер не замирал
    if (dragType === 'card') {
        const taskId = parseInt(element.dataset.cardId);
        for (const col of state.columns) {
            const task = col.tasks.find(t => t.id === taskId);
            if (task) {
                draggedTaskObject = task;
                break;
            }
        }
    } else {
        draggedTaskObject = null;
    }
    
    // Сброс и захват данных для межвкладочного переноса
    originalWorkspaceId = state.activeWorkspaceId;
    isHoveringTabs = false;
    currentDragScale = 1;
    pendingSwitchTabId = null;
    clearTimeout(tabSwitchTimeout);
    
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMouseX = mouseX;

    if (dragType === 'card') {
        draggedElement.dataset.sourceColumnId = draggedElement.closest('.column').dataset.columnId;
    }

    document.body.style.userSelect = 'none';
    document.body.classList.add(`is-dragging-${dragType}`);

    // Фиксируем оригинальные размеры ЕДИНОЖДЫ
    const rect = draggedElement.getBoundingClientRect();
    dragCloneWidth = rect.width;
    dragCloneHeight = rect.height;

    // 🔥 СОХРАНЯЕМ ИСХОДНУЮ ТОЧКУ ХВАТА
    originalOffsetX = e.clientX - rect.left;
    originalOffsetY = e.clientY - rect.top;
    currentOriginX = originalOffsetX;
    currentOriginY = originalOffsetY;
    
    const sourceFooter = draggedElement.querySelector('.card-footer');
    if (sourceFooter) {
        const computedFooterHeight = window.getComputedStyle(sourceFooter).height;
        sourceFooter.style.maxHeight = computedFooterHeight;
    }

    dragClone = draggedElement.cloneNode(true);
    dragClone.classList.remove('is-ghost', 'is-calculating', 'is-expanding');
    dragClone.style.position = 'fixed';
    dragClone.style.width = `${rect.width}px`;
    dragClone.style.height = `${rect.height}px`;
    dragClone.style.top = '0';
    dragClone.style.left = '0';
    dragClone.style.margin = '0';
    dragClone.classList.add(`${dragType}-drag-clone`);

    // 🔥 Сбрасываем origin в 0, чтобы полностью контролировать матрицу через translate3d
    dragClone.style.transformOrigin = '0 0'; 
    dragClone.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) scale(1) translate3d(${-currentOriginX}px, ${-currentOriginY}px, 0)`;

    document.body.appendChild(dragClone);
    draggedElement.classList.add('is-ghost');

    renderPhysics();
}

function performHitTest() {
    const elemUnderMouse = document.elementFromPoint(mouseX, mouseY);
    if (!elemUnderMouse) return;

    // --- ЛОГИКА МИНИАТЮР И МОРГАНИЯ ВКЛАДОК ---
    const tabsWrapper = elemUnderMouse.closest('#tabs-wrapper');
    if (tabsWrapper && (dragType === 'card' || dragType === 'column')) {
        isHoveringTabs = true;
        const hoverTab = elemUnderMouse.closest('.board-tab:not(.active)');

        if (hoverTab) {
            const tabId = parseInt(hoverTab.dataset.workspaceId);
            if (pendingSwitchTabId !== tabId) {
                clearTimeout(tabSwitchTimeout);
                pendingSwitchTabId = tabId;

                document.querySelectorAll('.board-tab.is-blinking').forEach(el => el.classList.remove('is-blinking'));
                hoverTab.classList.add('is-blinking');

                tabSwitchTimeout = setTimeout(async () => {
                    hoverTab.classList.remove('is-blinking');
                    await switchToWorkspaceDuringDrag(tabId);
                }, 600); 
            }
        } else {
            clearTimeout(tabSwitchTimeout);
            pendingSwitchTabId = null;
            document.querySelectorAll('.board-tab.is-blinking').forEach(el => el.classList.remove('is-blinking'));
        }
        return; 
    } else {
        isHoveringTabs = false;
        clearTimeout(tabSwitchTimeout);
        pendingSwitchTabId = null;
        document.querySelectorAll('.board-tab.is-blinking').forEach(el => el.classList.remove('is-blinking'));
    }

    // 1. ВКЛАДКИ
    if (dragType === 'tab') {
        const hoverTab = elemUnderMouse.closest('.board-tab:not(.is-ghost)');
        if (hoverTab && hoverTab !== draggedElement && hoverTab.closest('#tabs-container')) {
            const rect = hoverTab.getBoundingClientRect();
            if (mouseX > rect.left + rect.width / 2) {
                if (hoverTab.nextElementSibling !== draggedElement) hoverTab.after(draggedElement);
            } else {
                if (hoverTab.previousElementSibling !== draggedElement) hoverTab.before(draggedElement);
            }
        }
    }
    // 2. КОЛОНКИ (С поддержкой пустой доски)
    else if (dragType === 'column') {
        const hoverCol = elemUnderMouse.closest('.column:not(.is-ghost)');
        const board = document.getElementById('board');
        const boardContainer = elemUnderMouse.closest('.board-container');
        
        if (hoverCol && hoverCol !== draggedElement) {
            const rect = hoverCol.getBoundingClientRect();
            if (mouseX > rect.left + rect.width / 2) {
                if (hoverCol.nextElementSibling !== draggedElement) hoverCol.after(draggedElement);
            } else {
                if (hoverCol.previousElementSibling !== draggedElement) hoverCol.before(draggedElement);
            }
        } 
        // 🔥 ФИКС: Если мы над контейнером доски, но не над колонкой (доска пустая или навели мимо)
        else if (boardContainer && board && !board.contains(draggedElement)) {
            const addBtn = board.querySelector('.new-column-btn');
            if (addBtn) {
                board.insertBefore(draggedElement, addBtn);
            } else {
                board.appendChild(draggedElement);
            }
        }
    }
    // 3. КАРТОЧКИ
    else if (dragType === 'card') {
        const hoverCard = elemUnderMouse.closest('.card:not(.is-ghost)');
        if (hoverCard && hoverCard !== draggedElement) {
            const rect = hoverCard.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverCard.nextElementSibling !== draggedElement) hoverCard.after(draggedElement);
            } else {
                if (hoverCard.previousElementSibling !== draggedElement) hoverCard.before(draggedElement);
            }
        } 
        else {
            const hoverCol = elemUnderMouse.closest('.column:not(.is-ghost)');
            if (hoverCol) {
                const cardList = hoverCol.querySelector('.card-list');
                if (cardList && !cardList.contains(draggedElement)) {
                    const firstCard = cardList.firstElementChild;
                    if (firstCard && mouseY < firstCard.getBoundingClientRect().top) {
                        cardList.prepend(draggedElement);
                    } else {
                        cardList.appendChild(draggedElement);
                    }
                }
            }
        }
    }
    // 4. ПОДЗАДАЧИ
    else if (dragType === 'subtask') {
        const hoverSub = elemUnderMouse.closest('.subtask-item:not(.is-ghost)');
        if (hoverSub && hoverSub !== draggedElement && hoverSub.closest('#subtasks-list')) {
            const rect = hoverSub.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverSub.nextElementSibling !== draggedElement) hoverSub.after(draggedElement);
            } else {
                if (hoverSub.previousElementSibling !== draggedElement) hoverSub.before(draggedElement);
            }
        }
    }
    // 5. ВЛОЖЕНИЯ
    else if (dragType === 'attachment') {
        const hoverAtt = elemUnderMouse.closest('.attachment-item:not(.is-ghost)');
        if (hoverAtt && hoverAtt !== draggedElement && hoverAtt.closest('#attachments-list')) {
            const rect = hoverAtt.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverAtt.nextElementSibling !== draggedElement) hoverAtt.after(draggedElement);
            } else {
                if (hoverAtt.previousElementSibling !== draggedElement) hoverAtt.before(draggedElement);
            }
        }
    }
    // 6. ИСТОРИЯ ХРАНИЛИЩ
    else if (dragType === 'vault-history') {
        const hoverHist = elemUnderMouse.closest('.vault-history-item:not(.is-ghost)');
        if (hoverHist && hoverHist !== draggedElement && hoverHist.closest('#vault-history-list')) {
            const rect = hoverHist.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverHist.nextElementSibling !== draggedElement) hoverHist.after(draggedElement);
            } else {
                if (hoverHist.previousElementSibling !== draggedElement) hoverHist.before(draggedElement);
            }
        }
    }
}

// Фоновая смена вкладки без убийства текущего DND
async function switchToWorkspaceDuringDrag(wsId) {
    document.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.querySelector(`.board-tab[data-workspace-id="${wsId}"]`);
    if (targetTab) {
        targetTab.classList.add('active');
        targetTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    state.activeWorkspaceId = wsId;
    updateSettings({ active_workspace_id: wsId }).catch(() => {});

    try {
        const columns = await fetchColumns(wsId);
        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
        renderBoard(); 
        // ВНИМАНИЕ: draggedElement сейчас "вырван" из DOM из-за очистки доски.
        // Он безопасно лежит в памяти. Как только мышь опустится с вкладок на новую доску, 
        // performHitTest() подхватит его и автоматически "вживит" (appendChild) в новый DOM!
    } catch (err) {
        console.error('Ошибка смены вкладки при драге:', err);
    }
}

function handleEdgePanning() {
    if (!isDragging) return false;

    let container = null;
    let axis = 'x'; 
    let scrollZone = 80; 
    let maxSpeed = 20;

    // --- ПРИОРИТЕТ 1: СКРОЛЛ ВКЛАДОК ПРИ НАВЕДЕНИИ МИНИАТЮРЫ ---
    if (isHoveringTabs && (dragType === 'card' || dragType === 'column')) {
        container = document.getElementById('tabs-container');
        axis = 'x';
        scrollZone = 60;
        maxSpeed = 15;
    }
    // --- ПРИОРИТЕТ 2: СКРОЛЛ ВКЛАДОК ПРИ ПЕРЕТАСКИВАНИИ САМОЙ ВКЛАДКИ ---
    else if (dragType === 'tab') {
        container = document.getElementById('tabs-container');
        axis = 'x';
    } 
    // --- ПРИОРИТЕТ 3: СКРОЛЛ ДОСКИ ПРИ ТАСКАНИИ КОЛОНКИ ---
    else if (dragType === 'column') {
        container = document.querySelector('.board-container');
        axis = 'x';
        scrollZone = 120; // Большая зона для больших объектов
        maxSpeed = 25;
    } 
    // --- ПРИОРИТЕТ 4: УМНЫЙ СКРОЛЛ КАРТОЧКИ (ДОСКА ИЛИ КОЛОНКА) ---
    else if (dragType === 'card') {
        const hoverCol = document.elementFromPoint(mouseX, mouseY)?.closest('.column:not(.is-ghost)');
        // Если мы внутри колонки - скроллим её по вертикали
        if (hoverCol) {
            container = hoverCol.querySelector('.card-list');
            axis = 'y';
            scrollZone = 60;
        } else {
            // Если между колонками - скроллим всю доску по горизонтали
            container = document.querySelector('.board-container');
            axis = 'x';
            scrollZone = 120;
            maxSpeed = 25;
        }
    }
    else if (dragType === 'vault-history') {
        container = document.getElementById('vault-history-list');
        axis = 'y';
    } else if (dragType === 'subtask' || dragType === 'attachment') {
        container = document.querySelector('.task-detail-body');
        axis = 'y';
    }

    if (!container) return false;

    const rect = container.getBoundingClientRect();
    let speed = 0;

    if (axis === 'x') {
        if (mouseX > rect.right - scrollZone) {
            const intensity = Math.max(0, Math.min((mouseX - (rect.right - scrollZone)) / scrollZone, 1));
            speed = Math.pow(intensity, 2) * maxSpeed;
        } else if (mouseX < rect.left + scrollZone) {
            const intensity = Math.max(0, Math.min((rect.left + scrollZone - mouseX) / scrollZone, 1));
            speed = -(Math.pow(intensity, 2) * maxSpeed);
        }

        if (speed !== 0) {
            const prevScroll = container.scrollLeft;
            container.scrollLeft += speed;
            if (container.scrollLeft !== prevScroll) {
                // Обновляем кастомный скроллбар вкладок, если скроллили их
                if (container.id === 'tabs-container' && window.updateTabsScrollbar) {
                    window.updateTabsScrollbar();
                }
                return true;
            }
        }
    } else if (axis === 'y') {
        if (mouseY > rect.bottom - scrollZone) {
            const intensity = Math.max(0, Math.min((mouseY - (rect.bottom - scrollZone)) / scrollZone, 1));
            speed = Math.pow(intensity, 2) * maxSpeed;
        } else if (mouseY < rect.top + scrollZone) {
            const intensity = Math.max(0, Math.min((rect.top + scrollZone - mouseY) / scrollZone, 1));
            speed = -(Math.pow(intensity, 2) * maxSpeed);
        }

        if (speed !== 0) {
            const prevScroll = container.scrollTop;
            container.scrollTop += speed;
            return container.scrollTop !== prevScroll;
        }
    }

    return false;
}

function renderPhysics() {
    if (!isDragging || !dragClone) return;

    const didScroll = handleEdgePanning();
    
    const deltaX = mouseX - lastMouseX;
    lastMouseX = mouseX;
    
    const maxRotation = (dragType === 'tab' || dragType === 'column') ? 3 : (dragType === 'vault-history' ? 5 : 12); 
    targetRotation = Math.max(-maxRotation, Math.min(maxRotation, deltaX * 0.4));
    currentRotation += (targetRotation - currentRotation) * 0.15;

    let targetScale = (dragType === 'column' || dragType === 'tab') ? 1.02 : 1.04;
    
    // По умолчанию цель - вернуть элемент точно в место, где мы его схватили
    let targetOriginX = originalOffsetX;
    let targetOriginY = originalOffsetY;

    if (isHoveringTabs) {
        targetScale = 0.20; 
        dragClone.style.opacity = '0.7'; 
        // 🔥 СТРОГО ПРАВЫЙ ВЕРХНИЙ УГОЛ: Меняем цель сжатия на правый верхний край элемента
        targetOriginX = dragCloneWidth;
        targetOriginY = 0;
    } else {
        dragClone.style.opacity = '1';
    }

    // Плавно интерполируем масштаб и смещение оси координат
    currentDragScale += (targetScale - currentDragScale) * 0.15;
    currentOriginX += (targetOriginX - currentOriginX) * 0.15;
    currentOriginY += (targetOriginY - currentOriginY) * 0.15;

    // 🔥 МАТРИЧНАЯ МАГИЯ (Double Translate):
    // 1. Двигаем 0,0 элемента к курсору мыши.
    // 2. Вращаем и масштабируем.
    // 3. Откатываем назад на вычисленное смещение.
    // Итог: курсор ВСЕГДА приклеен к нужной точке с точностью до пикселя при любом масштабе.
    dragClone.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) rotate(${currentRotation}deg) scale(${currentDragScale}) translate3d(${-currentOriginX}px, ${-currentOriginY}px, 0)`;
    
    if (didScroll || isHoveringTabs) performHitTest(); 
    rafId = requestAnimationFrame(renderPhysics);
}

async function endDrag() {
    isDragging = false;
    cancelAnimationFrame(rafId);
    clearTimeout(tabSwitchTimeout);
    document.querySelectorAll('.board-tab.is-blinking').forEach(el => el.classList.remove('is-blinking'));
    
    document.body.classList.remove(`is-dragging-${dragType}`);
    document.body.style.userSelect = '';

    // --- ЛОГИКА ОТМЕНЫ (Если бросили мимо доски или на вкладках) ---
    let isInvalidDrop = false;
    if (dragType === 'card' && !draggedElement.closest('.column')) isInvalidDrop = true;
    if (dragType === 'column' && !draggedElement.closest('.board')) isInvalidDrop = true;

    if (isInvalidDrop && (dragType === 'card' || dragType === 'column')) {
        (async () => {
            // 1. Если вкладка была изменена, мгновенно переключаем интерфейс обратно
            if (state.activeWorkspaceId !== originalWorkspaceId) {
                state.activeWorkspaceId = originalWorkspaceId;
                document.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
                const tTab = document.querySelector(`.board-tab[data-workspace-id="${originalWorkspaceId}"]`);
                if (tTab) {
                    tTab.classList.add('active');
                    tTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
                updateSettings({ active_workspace_id: originalWorkspaceId }).catch(() => {});
                
                try {
                    const columns = await fetchColumns(originalWorkspaceId);
                    state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
                    renderBoard(); // Перерисовываем родную доску со старыми колонками
                    
                    // Заново находим DOM-узел нашей карточки/колонки после перерисовки
                    if (dragType === 'card') {
                        draggedElement = document.querySelector(`.card[data-card-id="${draggedElement.dataset.cardId}"]`);
                    } if (dragType === 'column') {
                        const currentColumns = Array.from(document.querySelectorAll('#board .column:not(.column-drag-clone)'));
                        const orderedIds = currentColumns.map(col => parseInt(col.dataset.columnId));
                        const colId = parseInt(draggedElement.dataset.columnId);
                        
                        // 🔥 ГЛАВНЫЙ МОМЕНТ: Если ID активного воркспейса изменился, сохраняем привязку колонки
                        if (state.activeWorkspaceId !== originalWorkspaceId) {
                            try { 
                                // Отправляем на бэкенд новый workspace_id. 
                                // Схема ColumnUpdate уже поддерживает это поле.
                                await updateColumn(colId, { workspace_id: state.activeWorkspaceId }); 
                            } 
                            catch (e) { console.error("Не удалось сменить вкладку для колонки:", e); }
                        }

                        state.columns.forEach(c => {
                            const pos = orderedIds.indexOf(c.id);
                            if (pos !== -1) c.position = pos;
                        });
                        state.columns.sort((a, b) => a.position - b.position);

                        try { await saveColumnsOrder(orderedIds); } catch (e) {}
                    }
                    if (draggedElement) draggedElement.classList.add('is-ghost');
                } catch (e) {}
            }

            // 2. Ищем целевые координаты (куда лететь клону)
            let targetRect = null;
            if (draggedElement && document.body.contains(draggedElement)) {
                targetRect = draggedElement.getBoundingClientRect();
            }

            // 3. Анимируем возвращение клона на родное место
            if (dragClone) {
                dragClone.style.transition = 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
                if (targetRect) {
                    // Раскручиваем Double Translate обратно в плоские координаты
                    dragClone.style.transform = `translate3d(${targetRect.left}px, ${targetRect.top}px, 0) rotate(0deg) scale(1) translate3d(0px, 0px, 0)`;
                    dragClone.style.opacity = '1';
                } else {
                    // Фолбэк: если место почему-то не найдено, просто улетаем вверх
                    dragClone.style.transform = `translate3d(${mouseX}px, -100px, 0) scale(0) translate3d(0px, 0px, 0)`;
                    dragClone.style.opacity = '0';
                }
            }

            // 4. Очистка после приземления
            setTimeout(() => {
                if (dragClone) dragClone.remove();
                dragClone = null;
                if (draggedElement) draggedElement.classList.remove('is-ghost');
                dragType = null;
                draggedElement = null;
            }, 350);
        })();
        return; // Завершаем функцию: в базу ничего не сохраняем
    }

    if (dragType === 'subtask') {
        const currentSubtasks = Array.from(document.querySelectorAll('#subtasks-list .subtask-item:not(.subtask-drag-clone)'));
        const orderedIds = currentSubtasks.map(s => parseInt(s.dataset.subtaskId));
        try { await saveTasksOrder(orderedIds); } catch (e) { console.error(e); }
    }

    if (dragType === 'attachment') {
        const currentAttachments = Array.from(document.querySelectorAll('#attachments-list .attachment-item:not(.attachment-drag-clone)'));
        const orderedPaths = currentAttachments.map(el => el.dataset.path);
        const taskId = document.getElementById('task-modal').dataset.taskId;
        try {
            await updateTask(taskId, { attachments_order: orderedPaths });
            for (let col of state.columns) {
                let task = col.tasks.find(t => t.id == parseInt(taskId));
                if (task) { task.attachments_order = orderedPaths; break; }
            }
        } catch (e) { console.error(e); }
    }

    if (dragType === 'vault-history') {
        const currentItems = Array.from(document.querySelectorAll('#vault-history-list .vault-history-item:not(.vault-history-drag-clone)'));
        const orderedPaths = currentItems.map(el => el.dataset.path);
        try {
            await fetch(`${API_BASE}/system/vault/history/reorder`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ordered_paths: orderedPaths })
            });
        } catch (e) { console.error(e); }
    }
    
    if (dragClone) {
        dragClone.remove();
        dragClone = null;
    }
    
    if (draggedElement) {
        if (dragType === 'card') {
            const newColumnEl = draggedElement.closest('.column');
            if (newColumnEl) {
                const newColumnId = parseInt(newColumnEl.dataset.columnId);
                const sourceColumnId = parseInt(draggedElement.dataset.sourceColumnId);
                const taskId = parseInt(draggedElement.dataset.cardId);
                const targetCol = state.columns.find(c => c.id === newColumnId);
                const sourceCol = state.columns.find(c => c.id === sourceColumnId);

                if (targetCol && newColumnId !== sourceColumnId) {
                    let optimisticTask = null;
                    if (sourceCol) {
                        const foundTask = sourceCol.tasks.find(t => t.id === taskId);
                        if (foundTask) optimisticTask = JSON.parse(JSON.stringify(foundTask));
                    }
                    if (!optimisticTask) optimisticTask = { id: taskId, title: draggedElement.querySelector('.card-title').textContent };

                    if (targetCol.mode === 'track_time') {
                        optimisticTask.completed_at = null;
                        optimisticTask.active_timer = { start_time: new Date().toISOString() };
                    } else if (targetCol.mode === 'completion') {
                        optimisticTask.completed_at = new Date().toISOString();
                        optimisticTask.active_timer = null;
                    } else {
                        optimisticTask.completed_at = null;
                        optimisticTask.active_timer = null;
                    }
                    updateCardAppearance(draggedElement, optimisticTask, targetCol.mode);
                }
            }
        }

        draggedElement.style.transition = 'none';
        draggedElement.classList.remove('is-ghost');
        void draggedElement.offsetWidth;
        draggedElement.style.transition = '';

        const droppedEl = draggedElement;
        const rect = droppedEl.getBoundingClientRect();
        
        if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
            droppedEl.classList.add('is-dropped-hover');
            const cleanupHover = () => {
                droppedEl.classList.remove('is-dropped-hover');
                document.removeEventListener('pointermove', cleanupHover);
            };
            setTimeout(() => document.addEventListener('pointermove', cleanupHover), 50);
        }
        
        if (dragType === 'tab') {
            const currentTabs = Array.from(document.querySelectorAll('#tabs-container .board-tab'));
            const orderedIds = currentTabs.map(tab => parseInt(tab.dataset.workspaceId));
            state.workspaces.forEach(ws => { ws.position = orderedIds.indexOf(ws.id); });
            state.workspaces.sort((a, b) => a.position - b.position);
            if (window.updateTabsScrollbar) window.updateTabsScrollbar();
            try { await saveWorkspacesOrder(orderedIds); } catch (e) {}
        }

        if (dragType === 'column') {
            const currentColumns = Array.from(document.querySelectorAll('#board .column:not(.column-drag-clone)'));
            const orderedIds = currentColumns.map(col => parseInt(col.dataset.columnId));
            const colId = parseInt(draggedElement.dataset.columnId);
            
            if (state.activeWorkspaceId !== originalWorkspaceId) {
                try { await updateColumn(colId, { workspace_id: state.activeWorkspaceId }); } 
                catch (e) { console.error(e); }
            }

            state.columns.forEach(c => {
                const pos = orderedIds.indexOf(c.id);
                if (pos !== -1) c.position = pos;
            });
            state.columns.sort((a, b) => a.position - b.position);

            try { await saveColumnsOrder(orderedIds); } catch (e) {}
        }

        if (dragType === 'card') {
            const newColumnEl = draggedElement.closest('.column');
            if (newColumnEl) {
                const newColumnId = parseInt(newColumnEl.dataset.columnId);
                const sourceColumnId = parseInt(draggedElement.dataset.sourceColumnId);
                const taskId = parseInt(draggedElement.dataset.cardId);
                
                const currentCards = Array.from(newColumnEl.querySelectorAll('.card:not(.card-drag-clone)'));
                const orderedIds = currentCards.map(c => parseInt(c.dataset.cardId));

                if (state.activeWorkspaceId === originalWorkspaceId) {
                    const sourceColumnEl = document.querySelector(`.column[data-column-id="${sourceColumnId}"]`);
                    if (sourceColumnEl) updateColumnCount(sourceColumnEl);
                }
                updateColumnCount(newColumnEl);

                try {
                    const targetCol = state.columns.find(c => c.id === newColumnId);
                    const sourceCol = state.columns.find(c => c.id === sourceColumnId);

                    if (newColumnId !== sourceColumnId) {
                        const updatedTask = await moveTask(taskId, newColumnId);
                        let taskForUI = updatedTask;
                        
                        if (sourceCol && targetCol) {
                            const taskIndex = sourceCol.tasks.findIndex(t => t.id == taskId);
                            if (taskIndex !== -1) {
                                const [movedTask] = sourceCol.tasks.splice(taskIndex, 1);
                                movedTask.column_id = newColumnId; 
                                movedTask.completed_at = updatedTask.completed_at;
                                movedTask.active_timer = updatedTask.active_timer; 
                                movedTask.total_time_spent = updatedTask.total_time_spent;
                                targetCol.tasks.push(movedTask);
                                taskForUI = movedTask;
                            }
                        } else if (!sourceCol && targetCol) {
                            targetCol.tasks.push(updatedTask);
                        }
                        
                        updateCardAppearance(draggedElement, taskForUI, targetCol.mode);
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

    // ПЕРЕИМЕНОВАНИЕ ГЛАВНОГО ЗАГОЛОВКА В МОДАЛКЕ КАРТОЧКИ
    const modalTitleEl = target.closest('#task-modal-title');
    if (modalTitleEl) {
        startModalTaskRename(modalTitleEl);
        return;
    }

    // ПЕРЕИМЕНОВАНИЕ ПОДЗАДАЧИ
    const subtaskTitleEl = target.closest('.subtask-title');
    if (subtaskTitleEl) {
        const subtaskEl = subtaskTitleEl.closest('.subtask-item');
        // 🔥 ФИКС: Игнорируем клик, если это вложение (.attachment-item)
        if (subtaskEl && !subtaskEl.classList.contains('attachment-item') && !subtaskEl.classList.contains('is-renaming')) {
            startSubtaskRename(subtaskEl);
            return;
        }
    }

    // ОТВЯЗКА КАРТОЧКИ (ПРЯМО ИЗ МОДАЛКИ)
    const detachModalBtn = target.closest('.modal-detach');
    if (detachModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
        
        // Красивая анимация исчезновения самой кнопки
        detachModalBtn.style.transition = 'all 0.2s ease-in';
        detachModalBtn.style.opacity = '0';
        detachModalBtn.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            detachModalBtn.style.display = 'none';
            detachModalBtn.style.opacity = '1';
            detachModalBtn.style.transform = 'none';
        }, 200);

        try {
            updateTask(taskId, { parent_id: null }).then(() => {
                bumpModalUpdatedDate();
                refreshBoard(); // Карточка моментально появится на доске
                
                // Перестраиваем хлебные крошки: карточка теперь корень, очищаем стек
                modalNavigationStack = [{ id: taskId, title: document.getElementById('task-modal-title').textContent }];
                renderBreadcrumbs();
            });
        } catch (err) {
            console.error("Ошибка отвязки из модалки:", err);
            detachModalBtn.style.display = 'flex';
        }
        return;
    }

    // ЭКСПОРТ ИЗ МОДАЛКИ КАРТОЧКИ
    const exportModalBtn = target.closest('.modal-export');
    if (exportModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
        
        if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
            // Сначала показываем модалку выбора (с чекбоксом "Копировать папку вложений"),
            // и только после подтверждения открываем нативный диалог выбора папки.
            const exportModal = document.getElementById('export-modal');
            exportModal.dataset.taskId = taskId;
            exportModal.classList.add('show');
            
            const confirmBtn = document.getElementById('btn-confirm-export');
            // Снимаем старые обработчики (хак через замену узла)
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.replaceWith(newConfirmBtn);
            
            newConfirmBtn.onclick = async () => {
                const includeAtt = document.getElementById('export-include-att').checked;
                exportModal.classList.remove('show');
                
                const exportDir = await window.pywebview.api.choose_directory();
                if (exportDir) {
                    exportModalBtn.style.opacity = '0.5'; // Эффект загрузки на иконке кнопки экспорта
                    fetch(`${API_BASE}/tasks/${taskId}/export`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ export_path: exportDir, include_attachments: includeAtt })
                    }).then(res => {
                        exportModalBtn.style.opacity = '1';
                        if (!res.ok) alert(t('alerts.error'));
                    }).catch(err => {
                        exportModalBtn.style.opacity = '1';
                        console.error(err);
                    });
                }
            };
        } else {
            alert('Экспорт в Markdown работает только в десктопном приложении Doe.');
        }
        return;
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

    // 4. ОТКРЫТИЕ МЕНЮ НАСТРОЕК (Header & Vault)
    const settingsTrigger = target.closest('.settings-trigger');
    if (settingsTrigger) {
        // ФИКС: Ищем меню ИМЕННО внутри текущего враппера (чтобы работало и на стартовом экране)
        const wrapper = settingsTrigger.closest('.settings-wrapper');
        const menu = wrapper.querySelector('.dropdown-menu');
        
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
        
        // 1. Сначала закрываем всё остальное
        closeAllDropdowns();

        // 2. Подготавливаем меню
        globalMenu.dataset.activeCardId = cardEl.dataset.cardId;
        globalMenu.classList.add('show');
        cardMenuBtn.classList.add('active');
        cardEl.classList.add('has-open-menu');
        
        // 3. Запускаем режим переименования (DOM-мутация происходит тут)
        const taskId = parseInt(cardEl.dataset.cardId);
        const colId = parseInt(cardEl.closest('.column').dataset.columnId);
        const col = state.columns.find(c => c.id === colId);
        const task = col?.tasks.find(t => t.id === taskId);
        
        if (task && !cardEl.classList.contains('is-renaming')) {
            startCardRename(cardEl, task);
        } else {
            cardEl.querySelector('.card-title-input')?.focus({ preventScroll: true });
        }

        // 4. ГЛАВНЫЙ ФИКС: Используем двойной requestAnimationFrame
        // Это железно гарантирует, что браузер УЖЕ отрисовал инпут и знает его новые размеры
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardEl.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest', 
                    inline: 'center' 
                });
            });
        });

        // 5. Цикл позиции меню
        const updatePos = () => {
            if (!globalMenu.classList.contains('show') || globalMenu.dataset.activeCardId != cardEl.dataset.cardId) return;
            const cardRect = cardEl.getBoundingClientRect();
            globalMenu.style.top = `${cardRect.top}px`;
            globalMenu.style.left = `${cardRect.right + 12}px`;
            requestAnimationFrame(updatePos);
        };
        updatePos();

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
                    const taskId = parseInt(activeCardId);
                    modalNavigationStack = []; // Сбрасываем историю, так как открываем карточку с доски
                    
                    // Вызываем новую функцию загрузки (мы её создадим в шаге 3)
                    loadTaskIntoModal(taskId); 
                    
                    // Показываем саму модалку
                    document.getElementById('task-modal').classList.add('show');
                }
                else if (action === 'delete-card') {
                    // Запускаем красивое удаление (Клон + Spacer) мгновенно для кликнутой карточки
                    animateCardDeletion(cardEl);
                    
                    // Вычищаем из локального стейта до ответа сервера (optimistic UI)
                    for (let col of state.columns) {
                        col.tasks = col.tasks.filter(t => t.id !== taskId);
                    }
                    
                    deleteTask(taskId).then(data => {
                        const deletedIds = data.deleted_ids || [];
                        
                        // Удаляем с доски всё дерево превьюх (если у задачи были подзадачи на доске)
                        deletedIds.forEach(id => {
                            if (id === taskId) return; // Эту мы уже анимировали выше
                            const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                            if (boardCard) {
                                animateCardDeletion(boardCard);
                            }
                            
                            // Вычищаем остатки из локального стейта
                            for (let col of state.columns) {
                                col.tasks = col.tasks.filter(t => t.id !== id);
                            }
                        });
                    }).catch(err => { 
                        console.error(err); 
                        refreshBoard(); 
                    });
                }
                else if (action === 'clear-card-timer') {
                    clearTaskTimerAPI(taskId).then(updatedTask => {
                        const col = state.columns.find(c => c.id === parseInt(colEl.dataset.columnId));
                        if (col) {
                            const idx = col.tasks.findIndex(t => t.id === taskId);
                            if (idx !== -1) {
                                // Бережно переносим массив подзадач из старого стейта в новый
                                updatedTask.subtasks = col.tasks[idx].subtasks;
                                col.tasks[idx] = updatedTask;
                            }
                        }
                        updateCardAppearance(cardEl, updatedTask, col.mode);
                    });
                }
                else if (action === 'copy-card-link') {
                    // 🚀 ФИКС: Учитываем, что при открытом меню карточка находится в режиме редактирования (textarea)
                    const titleNode = cardEl.querySelector('.card-title') || cardEl.querySelector('.card-title-input');
                    const taskTitle = (titleNode.value !== undefined ? titleNode.value : titleNode.textContent).trim();
                    const link = `[${taskTitle}](doe://task/${taskId})`;
                    
                    try {
                        // 🚀 БРОНЕБОЙНОЕ КОПИРОВАНИЕ (Работает во всех WebView и браузерах)
                        if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(link);
                        } else {
                            const textArea = document.createElement("textarea");
                            textArea.value = link;
                            textArea.style.position = "fixed";
                            textArea.style.opacity = "0";
                            document.body.appendChild(textArea);
                            textArea.focus();
                            textArea.select();
                            document.execCommand('copy');
                            textArea.remove();
                        }

                        // Меняем текст прямо в меню для визуальной обратной связи
                        const span = menuItem.querySelector('span[data-i18n]') || menuItem.querySelector('span');
                        const oldText = span.textContent;
                        span.textContent = t('copied');
                        span.style.color = 'var(--success-done)';
                        
                        setTimeout(() => {
                            span.textContent = oldText;
                            span.style.color = '';
                            closeAllDropdowns();
                        }, 1000);
                        return; // Выходим, чтобы меню не закрылось мгновенно
                    } catch (err) {
                        console.error("Failed to copy link: ", err);
                    }
                }
                else if (action === 'export-card') {
                    if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
                        const exportModal = document.getElementById('export-modal');
                        exportModal.dataset.taskId = taskId;
                        exportModal.classList.add('show');
                        
                        const confirmBtn = document.getElementById('btn-confirm-export');
                        // Снимаем старые обработчики (хак через замену узла)
                        const newConfirmBtn = confirmBtn.cloneNode(true);
                        confirmBtn.replaceWith(newConfirmBtn);
                        
                        newConfirmBtn.onclick = async () => {
                            const includeAtt = document.getElementById('export-include-att').checked;
                            exportModal.classList.remove('show');
                            
                            const exportDir = await window.pywebview.api.choose_directory();
                            if (exportDir) {
                                fetch(`${API_BASE}/tasks/${taskId}/export`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ export_path: exportDir, include_attachments: includeAtt })
                                }).then(res => {
                                    if (!res.ok) alert(t('alerts.error'));
                                }).catch(err => console.error(err));
                            }
                        };
                    } else {
                        alert('Экспорт в Markdown работает только в десктопном приложении Doe.');
                    }
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
            closeAllDropdowns();
            showVaultScreen(); // <--- Теперь просто показываем наш красивый экран!
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
        else if (action === 'attachments-settings') {
            fetchSettings().then(data => {
                const pathBox = document.getElementById('att-path-display');
                const itemLocal = document.getElementById('setting-item-local');
                const itemExternal = document.getElementById('setting-item-external');

                if (data.global_attachments_path) {
                    pathBox.textContent = data.global_attachments_path; // Показываем реальный путь
                    itemLocal.classList.remove('active');
                    itemExternal.classList.add('active');
                } else {
                    pathBox.textContent = t('modals.attSelectBtn'); // "Выбрать папку..."
                    itemLocal.classList.add('active');
                    itemExternal.classList.remove('active');
                }
                document.getElementById('att-settings-modal').classList.add('show');
            }).catch(console.error);
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
        
        // 1. Сначала запускаем плавное CSS-растворение модалки
        document.getElementById('theme-modal').classList.remove('show');
        
        // 2. Ждем ровно 250мс (время fade-out из CSS) и запускаем красивый круг
        // смены темы уже на абсолютно чистом интерфейсе
        setTimeout(() => {
            applyTheme(theme, true);
        }, 250);
        
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
        
        // 🔥 ФИКС: Если кликнули по серому фону (overlay) именно модалки карточки — ничего не закрываем.
        if (target.id === 'task-modal' && target.classList.contains('modal-overlay')) {
            return; 
        }

        if (activeConfirmResolve && (target.id === 'confirm-modal' || target.closest('#confirm-modal'))) {
            activeConfirmResolve(false);
            activeConfirmResolve = null;
        }
        
        // --- СБРОС ГЕОМЕТРИИ И FULLSCREEN СТАТУСА ПРИ ЗАКРЫТИИ ---
        const taskModal = document.getElementById('task-modal');
        if (taskModal && taskModal.classList.contains('show')) {
            
            // 🌟 НОВОЕ: ЗАПУСК СБОРЩИКА МУСОРА ПРИ ЗАКРЫТИИ КАРТОЧКИ
            // Проверяем, что крестик нажали именно внутри модалки задачи
            if (target.closest('#task-modal')) {
                triggerGarbageCollector();
            }
            
            const card = taskModal.querySelector('.task-detail-card');
            const maximizeBtn = taskModal.querySelector('.modal-maximize');
            
            if (card) {

                // Иконку разворота возвращаем сразу
                if(maximizeBtn) {
                    maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 6 18 6 18 10"></polyline><polyline points="10 18 6 18 6 14"></polyline><line x1="18" y1="6" x2="13" y2="11"></line><line x1="6" y1="18" x2="11" y2="13"></line></svg>`;
                }

                // Ждем 300мс, пока окно плавно исчезнет (CSS анимация длится 0.25s).
                // Только когда оно станет полностью невидимым — стираем координаты.
                setTimeout(() => {
                    card.classList.remove('maximized', 'is-restoring');
                    card.style.transition = 'none';
                    card.style.position = '';
                    card.style.left = '';
                    card.style.top = '';
                    card.style.width = '';
                    card.style.height = '';
                    card.style.transform = '';
                    card.style.margin = '';
                    
                    void card.offsetWidth; // Сбрасываем кэш рендера
                    card.style.transition = '';
                }, 300);
            }
        }
        // ----------------------------------------------

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

function applyHighlight(container, query) {
    if (!query) return;
    // Разбиваем запрос на слова, чтобы подсветить каждое вхождение
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return;

    const regexWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${regexWords.join('|')})`, 'gi');

    // Находим все текстовые узлы
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const nodesToProcess = [];
    
    let node;
    while (node = walker.nextNode()) {
        const parent = node.parentNode;
        // Игнорируем технические теги и уже подсвеченные элементы
        if (['CODE', 'MARK', 'TEXTAREA', 'PRE', 'SCRIPT', 'STYLE'].includes(parent.tagName)) continue;
        if (parent.classList.contains('search-highlight')) continue;
        
        if (regex.test(node.nodeValue)) {
            nodesToProcess.push(node);
        }
    }

    // Оборачиваем вхождения
    nodesToProcess.forEach(textNode => {
        const parent = textNode.parentNode;
        if (!parent) return;

        const content = textNode.nodeValue;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        content.replace(regex, (match, p1, offset) => {
            // Текст до совпадения
            fragment.appendChild(document.createTextNode(content.substring(lastIndex, offset)));
            
            // Само совпадение в обертке
            const span = document.createElement('span');
            span.className = 'search-highlight';
            span.textContent = match;
            fragment.appendChild(span);
            
            lastIndex = offset + match.length;
        });

        // Оставшийся текст после последнего совпадения
        fragment.appendChild(document.createTextNode(content.substring(lastIndex)));
        parent.replaceChild(fragment, textNode);
    });

    // Senior UI UX: Мягкое затухание подсветки через 1.5 секунды
    const highlights = container.querySelectorAll('.search-highlight');
    if (highlights.length === 0) return;

    setTimeout(() => {
        highlights.forEach(h => {
            if (h.parentNode) {
                // Теперь CSS подхватит эти изменения плавно, так как нет !important
                h.style.backgroundColor = 'transparent';
                h.style.color = 'inherit';
                
                // Ждем завершения CSS-анимации (500мс)
                setTimeout(() => {
                    if (h.parentNode) {
                        const txt = document.createTextNode(h.textContent);
                        h.parentNode.replaceChild(txt, h);
                        // normalize() склеит соседние текстовые узлы в один
                        container.normalize();
                    }
                }, 550);
            }
        });
    }, 1500);
}

// <--- ДОБАВЛЕН ТРЕТИЙ ПАРАМЕТР highlightQuery
async function loadTaskIntoModal(taskId, pushToStack = true, highlightQuery = null) {
    try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (!res.ok) return;
        const task = await res.json();

        const modal = document.getElementById('task-modal');
        const titleEl = document.getElementById('task-modal-title');
        const renderDiv = document.getElementById('task-desc-render');
        const inputArea = document.getElementById('task-desc-input');
        const subtasksList = document.getElementById('subtasks-list');
        const subtasksCount = document.getElementById('subtasks-count');
        const formContainer = document.getElementById('subtask-form-container');

        // 🚀 Сброс ручного растягивания поля описания от предыдущей открытой карточки
        const descWrapper = document.querySelector('.description-wrapper');
        if (descWrapper) descWrapper.style.height = '';

        // 🚀 Сбрасываем позиции внутренних скроллов, чтобы новая карточка открывалась сверху,
        // а не на месте, где скроллилась прошлая.
        const bodyEl = document.querySelector('.task-detail-body');
        if (bodyEl) bodyEl.scrollTop = 0;
        const renderDivEl = document.getElementById('task-desc-render');
        if (renderDivEl) renderDivEl.scrollTop = 0;
        const inputAreaEl = document.getElementById('task-desc-input');
        if (inputAreaEl) inputAreaEl.scrollTop = 0;

        // 1. Хлебные крошки
        if (pushToStack) {
            // --- ПОЛНОЕ ВОССТАНОВЛЕНИЕ ИСТОРИИ (Рекурсивный подъем до корня) ---
            if (modalNavigationStack.length === 0 && task.parent_id) {
                let currentParentId = task.parent_id;
                const ancestry = [];
                
                // Поднимаемся вверх, пока не кончатся родители
                while (currentParentId) {
                    try {
                        const pRes = await fetch(`${API_BASE}/tasks/${currentParentId}`);
                        if (!pRes.ok) break;
                        const pTask = await pRes.json();
                        // Кладем в начало массива (unshift), чтобы корень был первым
                        ancestry.unshift({ id: pTask.id, title: pTask.title });
                        currentParentId = pTask.parent_id;
                    } catch (e) {
                        break;
                    }
                }
                // Присваиваем найденную цепочку стеку
                modalNavigationStack = [...ancestry];
            }

            const lastInStack = modalNavigationStack[modalNavigationStack.length - 1];
            if (!lastInStack || lastInStack.id !== task.id) {
                modalNavigationStack.push({ id: task.id, title: task.title });
            }
        }
        renderBreadcrumbs();

        // 2. Основные данные
        modal.dataset.taskId = task.id;
        modal.dataset.columnId = task.column_id;
        titleEl.textContent = task.title;
        
        // Показываем кнопку отвязки только если у карточки есть родитель
        const detachBtn = modal.querySelector('.modal-detach');
        if (detachBtn) {
            detachBtn.style.display = task.parent_id ? 'flex' : 'none';
            detachBtn.title = t('detachSubtask');
        }

        // --- Рендер дат создания и изменения ---
        const datesMetaEl = document.getElementById('task-dates-meta');
        if (datesMetaEl) {
            const createdStr = formatDateTime(task.created_at);
            const updatedStr = formatDateTime(task.updated_at);
            
            // 🚀 Убрали физическую точку из HTML. Теперь всё безупречно контролирует CSS!
            datesMetaEl.innerHTML = `<div><span>${t('taskModal.created')}: ${createdStr}</span><span id="task-updated-text">${t('taskModal.updated')}: ${updatedStr}</span></div>`;
        }
        // ----------------------------------------------

        // 3. Описание (Markdown)
        inputArea.value = task.description || "";
        const attachmentsList = document.getElementById('attachments-list');
        const attachmentsCount = document.getElementById('attachments-count');
        
        if (task.description) {
            // Парсим вложения и валидируем на диске
            let extracted = extractAttachments(task.description, task.attachments_order || []);
            extracted = await enrichAttachments(extracted); // <--- Валидация
            
            attachmentsCount.textContent = extracted.length;
            attachmentsList.innerHTML = '';
            extracted.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));

            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
            let readModeText = task.description.replace(cleanRegex, '');
            renderDiv.innerHTML = marked.parse(readModeText, { breaks: true });
            
            // --- ПОДСВЕТКА ПОИСКА ---
            if (highlightQuery) {
                applyHighlight(renderDiv, highlightQuery); // В описании
                applyHighlight(titleEl, highlightQuery);   // И в главном заголовке тоже
            }
            
            enhanceCodeBlocks(renderDiv);
        } else {
            attachmentsCount.textContent = '0';
            attachmentsList.innerHTML = '';
            renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
            
            // Если описания нет, но мы искали по заголовку
            if (highlightQuery) {
                applyHighlight(titleEl, highlightQuery);
            }
        }
        renderDiv.style.display = 'block';
        inputArea.style.display = 'none';

        // 4. Рендер списка подзадач
        subtasksList.innerHTML = '';
        subtasksCount.textContent = task.subtasks.length;
        
        // ВЫЧИСЛЯЕМ РЕЖИМ КОЛОНКИ РОДИТЕЛЯ
        const parentColumn = state.columns.find(c => c.id === task.column_id);
        const parentMode = parentColumn ? parentColumn.mode : 'default';
        
        task.subtasks.sort((a, b) => a.position - b.position).forEach(sub => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generateSubtaskHtml(sub, parentMode).trim();
            const subItem = tempDiv.firstChild;
            
            // Привязка событий с передачей режима
            bindSubtaskEvents(subItem, sub, task.id, parentMode);
            
            subtasksList.appendChild(subItem);
        });

        // 5. Инициализация кнопки добавления (вместо старого инпута)
        renderSubtaskAddButton(formContainer);

        // 6. Инициализация и логика Таймера (Редактируемого)
        const modalTimeTracker = document.getElementById('modal-time-tracker');
        const modalTimerPill = document.getElementById('modal-task-timer');
        const modalTimerInput = document.getElementById('modal-task-timer-input');
        
        // Всегда показываем таймер (в других колонках он будет просто на паузе)
        modalTimeTracker.style.display = 'flex';
        
        // Привязываем ID задачи к пилюле для живого обновления через updateTimers()
        modalTimerPill.dataset.taskId = task.id;
        
        // Отображаем исходное значение
        const exactTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        modalTimerPill.textContent = exactTime;

        // Сбрасываем старые обработчики путем глубокого клонирования
        const newPill = modalTimerPill.cloneNode(true);
        const newInput = modalTimerInput.cloneNode(true);
        modalTimerPill.replaceWith(newPill);
        modalTimerInput.replaceWith(newInput);

        let timerCommitted = false;

        newPill.addEventListener('click', (e) => {
            e.stopPropagation();
            timerCommitted = false;
            newPill.style.display = 'none';
            newInput.style.display = 'block';
            newInput.value = newPill.textContent;
            newInput.focus();
            newInput.select();
        });

        const commitTimer = async () => {
            if (timerCommitted) return;
            timerCommitted = true;
            
            const seconds = parseTimeToSeconds(newInput.value);
            
            // Если ввели чушь - просто возвращаем как было
            if (seconds === null) {
                newInput.style.display = 'none';
                newPill.style.display = 'block';
                return;
            }

            newInput.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/tasks/${task.id}/set-time`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ total_seconds: seconds })
                });

                if (res.ok) {
                    const updatedTask = await res.json();
                    const col = state.columns.find(c => c.id === updatedTask.column_id);
                    if (col) {
                        const idx = col.tasks.findIndex(t => t.id === updatedTask.id);
                        if (idx !== -1) {
                            // Сохраняем подзадачи при записи обновленного времени
                            updatedTask.subtasks = col.tasks[idx].subtasks;
                            col.tasks[idx] = updatedTask;
                        }
                    }
                    
                    const displayTime = updatedTask.active_timer ? formatTime(updatedTask) : formatExactTime(updatedTask.total_time_spent || 0);
                    newPill.textContent = displayTime;
                    
                    // Мгновенно обновляем карточку на самой доске (Senior UI: без ожидания сетевого refresh)
                    const boardCard = document.querySelector(`.card[data-card-id="${task.id}"]`);
                    if (boardCard) {
                        updateCardAppearance(boardCard, updatedTask, col.mode);
                    }
                    
                    refreshBoard();
                }
            } catch (err) {
                console.error("Ошибка сохранения времени:", err);
            } finally {
                newInput.disabled = false;
                newInput.style.display = 'none';
                newPill.style.display = 'block';
            }
        };

        newInput.addEventListener('mousedown', (e) => e.stopPropagation());
        newInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitTimer();
            if (e.key === 'Escape') {
                timerCommitted = true;
                newInput.style.display = 'none';
                newPill.style.display = 'block';
            }
        });
        newInput.addEventListener('blur', commitTimer);

    } catch (err) {
        console.error("Ошибка загрузки карточки:", err);
    }
}

// ФУНКЦИЯ 2: Рисует кликабельный путь наверху модалки
function renderBreadcrumbs() {
    const container = document.getElementById('task-breadcrumbs');
    if (modalNavigationStack.length <= 1) {
        container.innerHTML = ''; // Если мы на верхнем уровне, крошки не нужны
        return;
    }

    container.innerHTML = modalNavigationStack.map((item, index) => {
        const isLast = index === modalNavigationStack.length - 1;
        return `
            <span class="breadcrumb-item ${isLast ? 'active' : ''}" data-index="${index}" data-full-title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            ${!isLast ? '<span class="breadcrumb-separator">/</span>' : ''}
        `;
    }).join('');

    // Клик по крошке возвращает нас назад по стеку
    container.querySelectorAll('.breadcrumb-item').forEach(el => {
        el.onclick = () => {
            const index = parseInt(el.dataset.index);
            if (index === modalNavigationStack.length - 1) return;
            
            modalNavigationStack = modalNavigationStack.slice(0, index + 1);
            loadTaskIntoModal(modalNavigationStack[index].id, false);
        };
    });
}

function updateTimers() {
    // 1. Обновляем все таймеры на самой доске (в существующих колонках)
    document.querySelectorAll('.card-timer').forEach(el => {
        // Пропускаем таймеры внутри летящего клона (обновим их отдельно ниже)
        if (el.closest('.card-drag-clone')) return;

        const taskId = el.dataset.taskId;
        for (const col of state.columns) {
            const task = col.tasks.find(t => t.id == taskId);
            if (task?.active_timer) {
                el.textContent = formatTime(task);
                break;
            }
        }
    });

    // 🔥 2. ОБНОВЛЯЕМ ТАЙМЕР В ЛЕТЯЩЕЙ КАРТОЧКЕ (Drag Clone)
    // Это гарантирует, что время тикает при переходе между вкладками
    if (isDragging && dragType === 'card' && draggedTaskObject?.active_timer) {
        const newTime = formatTime(draggedTaskObject);
        
        // Обновляем текст в клоне, который видит пользователь
        if (dragClone) {
            const timerEl = dragClone.querySelector('.card-timer');
            if (timerEl) timerEl.textContent = newTime;
        }
        // Обновляем текст в "призраке", который лежит на доске (если он есть)
        if (draggedElement) {
            const timerEl = draggedElement.querySelector('.card-timer');
            if (timerEl) timerEl.textContent = newTime;
        }
    }

    // 3. Обновляем таймер внутри модалки (если она открыта)
    const modalTimerPill = document.getElementById('modal-task-timer');
    if (modalTimerPill && modalTimerPill.dataset.taskId && modalTimerPill.style.display !== 'none') {
        const taskId = modalTimerPill.dataset.taskId;
        
        // Сначала ищем в текущей доске
        let task = null;
        for (const col of state.columns) {
            task = col.tasks.find(t => t.id == taskId);
            if (task) break;
        }
        
        // Если не нашли на доске (например, карточка из другой вкладки), 
        // проверяем, не её ли мы сейчас тащим
        if (!task && draggedTaskObject && draggedTaskObject.id == taskId) {
            task = draggedTaskObject;
        }

        if (task && task.active_timer) {
            modalTimerPill.textContent = formatTime(task);
        }
    }
}

function updateColumnCount(columnEl, count = null) {
    const pill = columnEl.querySelector('.meta-pill .card-count');
    if (pill) {
        const tasks = columnEl.querySelectorAll('.card').length;
        pill.textContent = count !== null ? count : tasks;
    }
}

// Универсальная функция плавного удаления карточки с доски (Clone + Spacer)
function animateCardDeletion(boardCard) {
    if (!boardCard || !boardCard.parentNode) return;
    
    // 1. Снимаем размеры и координаты
    const rect = boardCard.getBoundingClientRect();
    
    // 2. Создаем клона
    const clone = boardCard.cloneNode(true);
    clone.classList.add('card-deleting-clone');
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.removeAttribute('id');
    clone.removeAttribute('data-card-id');
    document.body.appendChild(clone);
    
    // 3. Создаем распорку
    const spacer = document.createElement('div');
    spacer.className = 'card-spacer';
    spacer.style.height = `${rect.height}px`;
    
    // 4. Подменяем оригинал распоркой
    const parentCol = boardCard.closest('.column');
    boardCard.replaceWith(spacer);
    
    // Мгновенно обновляем счетчик в шапке
    if (parentCol) {
        updateColumnCount(parentCol, parentCol.querySelectorAll('.card:not(.card-drag-clone)').length);
    }
    
    // 5. Запускаем анимацию на следующем кадре
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            clone.classList.add('is-animating');
            spacer.classList.add('is-shrinking');
        });
    });
    
    // 6. Убираем мусор
    setTimeout(() => {
        if (clone.parentNode) clone.remove();
        if (spacer.parentNode) spacer.remove();
    }, 450);
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
        let scrollPercent = container.scrollLeft / maxScrollLeft;
        
        // ФИКС ИНЕРЦИИ: Защита от вылета при резиновом скролле macOS
        scrollPercent = Math.max(0, Math.min(1, scrollPercent));
        
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
            }, 800); // Синхронизировано с основным скроллбаром (800мс)
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

        // Добавили .vault-name-text в список отслеживаемых
        const titleEl = e.target.closest('.column-title, .tab-name, .breadcrumb-item, .vault-name-text');
        if (!titleEl) return;

        let isActuallyClamped = false;
        
        // Добавили проверку для названия хранилища
        if (titleEl.classList.contains('tab-name') || 
            titleEl.classList.contains('breadcrumb-item') || 
            titleEl.classList.contains('vault-name-text')) {
            
            // Если текст заканчивается на троеточие или физически не влезает
            isActuallyClamped = titleEl.textContent.endsWith('…') || titleEl.scrollWidth > titleEl.clientWidth;
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
        // ДОБАВИЛИ .vault-name-text в список. Теперь тултип поймет, что пора исчезать
        const titleEl = e.target.closest('.column-title, .tab-name, .breadcrumb-item, .vault-name-text');
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

function enhanceCodeBlocks(container) {
    const codeBlocks = container.querySelectorAll('pre code');
    
    codeBlocks.forEach(block => {
        // Ставим python если забыли указать язык
        if (!block.className || block.className === "") {
            block.classList.add('language-python');
        }
        
        // Подсвечиваем
        if (window.Prism) {
            Prism.highlightElement(block);
        }
    });

    // Кнопка копирования
    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-copy-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        btn.onclick = async (e) => {
            e.stopPropagation();
            const code = pre.querySelector('code').innerText;
            await navigator.clipboard.writeText(code);
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => {
                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            }, 2000);
        };
        pre.appendChild(btn);
    });
}

function generateSubtaskHtml(sub, parentMode = 'default') {
    const trashIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const openIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const eyeOpenSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosedSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    
    const currentEyeSvg = sub.is_visible_on_board ? eyeOpenSvg : eyeClosedSvg;
    const eyeClass = sub.is_visible_on_board ? 'active-eye' : '';
    
    const isAgent = sub.is_visible_on_board;
    const isLocked = isAgent;
    const isDone = sub.completed_at;

    const checkIcon = isAgent 
        ? (isDone 
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>` 
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`)
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>`;

    let titleAttr = '';
    if (isAgent) titleAttr = 'title="Статус управляется на доске"';

    return `
        <div class="subtask-item ${isDone ? 'is-done' : ''} ${isAgent ? 'is-board-agent' : ''}" data-subtask-id="${sub.id}">
            <div class="subtask-checkbox ${isLocked ? 'locked' : ''}" ${titleAttr}>
                ${checkIcon}
            </div>
            
            <!-- Группируем левые кнопки точно так же, как правые -->
            <div class="subtask-left-actions">
                <button class="subtask-eye-btn ${eyeClass}" title="Показывать на доске как карточку">${currentEyeSvg}</button>
                <button class="subtask-detach-btn" title="${t('detachSubtask')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
            
            <div class="subtask-title">${escapeHtml(sub.title)}</div>
            
            <div class="subtask-actions">
                <button class="subtask-open-btn" title="${t('menu.open')}">${openIconSvg}</button>
                <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIconSvg}</button>
            </div>
        </div>
    `;
}


async function onAddSubtask() {
    const container = document.getElementById('subtask-form-container');
    const subtasksList = document.getElementById('subtasks-list');
    const addBtn = container.querySelector('.btn-add-subtask');
    const modal = document.getElementById('task-modal');
    const parentId = parseInt(modal.dataset.taskId);
    const columnId = parseInt(modal.dataset.columnId);

    if (!addBtn) return;

    // 1. Создаем форму-пунктир
    const formItem = document.createElement('div');
    formItem.className = 'subtask-item subtask-entering';
    formItem.innerHTML = `
        <textarea class="subtask-inline-input" placeholder="${t('taskModal.subtasksPlaceholder').replace(/^\+ /, '')}" spellcheck="false" rows="1"></textarea>
    `;

    addBtn.replaceWith(formItem);
    const input = formItem.querySelector('textarea');
    
    const autoResize = () => {
        // ФИКС СКРОЛЛА: Запоминаем текущую позицию скролла модалки
        const scrollParent = formItem.closest('.task-detail-body');
        const currentScroll = scrollParent ? scrollParent.scrollTop : 0;

        // Идеальный расчет высоты: сбрасываем до 1px, замеряем с учетом бордеров
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px'; 
        input.style.height = (input.scrollHeight + offset) + 'px';
        
        // Восстанавливаем скролл, чтобы интерфейс не прыгал
        if (scrollParent) scrollParent.scrollTop = currentScroll;
    };

    input.addEventListener('input', () => {
        if (input.value.trim().length <= 200) {
            formItem.classList.remove('is-error');
            const hint = formItem.querySelector('.card-error-hint');
            if (hint) hint.remove();
        }
        autoResize();
    });
    
    autoResize();
    // ФИКС СКРОЛЛА: запрещаем браузеру мгновенно и резко прыгать к полю при фокусе
    input.focus({ preventScroll: true });

    // Единожды плавно скроллим к новой форме, если она не влезла в экран
    requestAnimationFrame(() => {
        formItem.classList.add('entered');
        formItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    let isResolved = false;

    const cancel = () => {
        if (isResolved) return;
        isResolved = true;
        formItem.style.opacity = '0';
        setTimeout(() => renderSubtaskAddButton(container), 200);
    };

    const submit = async () => {
        const title = input.value.trim();
        if (!title) { cancel(); return; }

        // --- МАГИЯ: ВСТАВКА ССЫЛКИ КАК ПОДЗАДАЧИ ---
        const linkMatch = title.match(/^\[(.*?)\]\(doe:\/\/task\/(\d+)\)$/) || title.match(/^doe:\/\/task\/(\d+)$/);
        if (linkMatch) {
            const linkedTaskId = parseInt(linkMatch[2] || linkMatch[1]);
            
            // Если пытаются привязать задачу саму к себе
            if (linkedTaskId === parentId) {
                formItem.classList.add('is-error');
                setTimeout(() => formItem.classList.remove('is-error'), 400);
                input.focus();
                return;
            }

            if (isResolved) return;
            isResolved = true;
            input.disabled = true;

            try {
                // Превращаем существующую задачу в подзадачу текущей
                await updateTask(linkedTaskId, { 
                    parent_id: parentId, 
                    is_visible_on_board: true // Автоматически включаем глазик
                });
                
                bumpModalUpdatedDate();
                formItem.remove();
                renderSubtaskAddButton(container);
                
                // Перезагружаем модалку, чтобы отобразить новую структуру
                await loadTaskIntoModal(parentId, false);
                refreshBoard();
                return;
            } catch (err) {
                isResolved = false;
                input.disabled = false;
                formItem.classList.add('is-error');
                
                // Если бэкенд отбил запрос из-за циклической зависимости
                if (err.message && err.message.includes('404')) {
                     alert(t('cyclicError'));
                }
                
                setTimeout(() => formItem.classList.remove('is-error'), 400);
                input.focus({ preventScroll: true });
                return;
            }
        }
        // ------------------------------------------

        if (title.length > 200) {
            if (!formItem.querySelector('.card-error-hint')) {
                const hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');
                formItem.appendChild(hint);
            }
            formItem.classList.remove('is-error');
            void formItem.offsetWidth;
            formItem.classList.add('is-error');
            autoResize(); 
            input.focus({ preventScroll: true });
            return;
        }

        if (isResolved) return;
        isResolved = true;
        input.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/tasks/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, column_id: columnId, parent_id: parentId })
            });

            if (!res.ok) throw new Error();
            const newSub = await res.json();
            
            bumpModalUpdatedDate();

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generateSubtaskHtml(newSub).trim();
            const realSub = tempDiv.firstChild;
            realSub.classList.add('subtask-birth');
            
            subtasksList.appendChild(realSub);
            bindSubtaskEvents(realSub, newSub, parentId);

            formItem.remove();
            renderSubtaskAddButton(container);

            // ФОКУС СКРОЛЛА: Когда родилась новая подзадача, плавно летим к ней
            requestAnimationFrame(() => {
                realSub.classList.add('born');
                realSub.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });

            setTimeout(() => realSub.classList.remove('subtask-birth', 'born'), 500);
            document.getElementById('subtasks-count').textContent = parseInt(document.getElementById('subtasks-count').textContent) + 1;
            refreshBoard(); // Обновляем индикатор на карточке доски
        } catch (err) {
            isResolved = false;
            input.disabled = false;
            formItem.classList.add('is-error');
            setTimeout(() => formItem.classList.remove('is-error'), 400);
            input.focus({ preventScroll: true });
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    input.addEventListener('blur', () => {
        if (!isResolved) { 
            if (input.value.trim()) submit(); 
            else cancel(); 
        }
    });
}

// Вспомогательная функция отрисовки кнопки добавления
function renderSubtaskAddButton(container) {
    container.innerHTML = `<button class="btn-add-subtask">${t('taskModal.subtasksPlaceholder')}</button>`;
    container.querySelector('.btn-add-subtask').onclick = onAddSubtask;
}

// Вспомогательная функция привязки событий (выносим из основного цикла)
function bindSubtaskEvents(el, sub, parentId, parentMode = 'default') {
    // 1. Чекбокс
    el.querySelector('.subtask-checkbox').onclick = async (e) => {
        e.stopPropagation();

        // --- БЛОКИРОВКА ТОЛЬКО ЕСЛИ КАРТОЧКА НА ДОСКЕ ---
        if (sub.is_visible_on_board) {
            el.classList.remove('is-error');
            void el.offsetWidth;
            el.classList.add('is-error');
            setTimeout(() => el.classList.remove('is-error'), 400);
            return;
        }

        const isDone = !el.classList.contains('is-done');
        el.classList.toggle('is-done', isDone);
        
        const timestamp = isDone ? new Date().toISOString() : null;
        sub.completed_at = timestamp; 
        
        await updateTask(sub.id, { completed_at: timestamp });
        refreshBoard(); // Обновляем прогресс на карточке доски
    };

    // 2. УДАЛЕНИЕ (Корзина)
    el.querySelector('.subtask-delete-btn').onclick = async (e) => {
        e.stopPropagation();
        el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px) scale(0.95)';
        
        setTimeout(() => {
            if (el.parentNode) el.remove();
            const countEl = document.getElementById('subtasks-count');
            countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
        }, 250);

        try {
            const data = await deleteTask(sub.id);
            
            bumpModalUpdatedDate();
            
            const deletedIds = data.deleted_ids || [];
            
            // Если у этой подзадачи были свои подзадачи или она была на доске - вычищаем всё!
            deletedIds.forEach(id => {
                const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                if (boardCard) {
                    animateCardDeletion(boardCard);
                }
                
                // Вычищаем из локального стейта
                for (let col of state.columns) {
                    const taskIndex = col.tasks.findIndex(t => t.id === id);
                    if (taskIndex !== -1) col.tasks.splice(taskIndex, 1);
                }
            });
            refreshBoard(); // Обновляем индикатор 1/10
        } catch(err) {
            console.error("Ошибка при глубоком удалении:", err);
        }
    };

    // 3. ОТКРЫТИЕ (Expand)
    el.querySelector('.subtask-open-btn').onclick = (e) => {
        e.stopPropagation();
        
        // 🚀 Узнаем контекст подзадачи (в какой вкладке и колонке она физически лежит)
        fetch(`${API_BASE}/tasks/${sub.id}/context`)
            .then(res => res.json())
            .then(context => {
                // Используем наш глобальный навигатор:
                // Он сам переключит вкладку, проскроллит к колонке,
                // подсветит карточку на фоне и загрузит её в модалку.
                // Параметр keepStack=true гарантирует, что хлебные крошки сохранятся!
                window.navigateToEntityGlobal(context.workspace_id, context.column_id, sub.id, null, true);
            })
            .catch(err => {
                console.error("Не удалось найти контекст задачи", err);
                // Фолбэк, если бэкенд вдруг не ответил — просто открываем поверх
                loadTaskIntoModal(sub.id, true);
            });
    };

    // 4. ГЛАЗИК (Видимость на доске)
    el.querySelector('.subtask-eye-btn').onclick = (e) => {
        e.stopPropagation();
        const eyeBtn = e.currentTarget;
        const checkbox = el.querySelector('.subtask-checkbox');
        
        sub.is_visible_on_board = !sub.is_visible_on_board;

        const eyeOpenSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        const eyeClosedSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        const checkIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>`;
        const boardIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;

        eyeBtn.innerHTML = sub.is_visible_on_board ? eyeOpenSvg : eyeClosedSvg;
        eyeBtn.classList.toggle('active-eye', sub.is_visible_on_board);
        el.classList.toggle('is-board-agent', sub.is_visible_on_board);
        
        // Отправляем запрос на сервер и ЖДЕМ ответ 
        updateTask(sub.id, { 
            is_visible_on_board: sub.is_visible_on_board
        }).then(updatedSub => {
            // Синхронизируем статус с БД
            sub.completed_at = updatedSub.completed_at;
            
            const isDone = sub.completed_at;
            const isLocked = sub.is_visible_on_board;

            checkbox.classList.toggle('locked', isLocked);
            el.classList.toggle('is-done', !!isDone);
            
            if (sub.is_visible_on_board) {
                checkbox.setAttribute('title', 'Статус управляется на доске');
                checkbox.innerHTML = isDone ? checkIconSvg : boardIconSvg;
            } else {
                checkbox.removeAttribute('title');
                checkbox.innerHTML = checkIconSvg;
            }
            
            refreshBoard();
        }).catch(console.error);
    };

    // 5. ОТВЯЗКА (Сделать корневой задачей)
    const detachBtn = el.querySelector('.subtask-detach-btn');
    if (detachBtn) {
        detachBtn.onclick = async (e) => {
            e.stopPropagation();
            el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px) scale(0.95)';
            
            setTimeout(() => {
                if (el.parentNode) el.remove();
                const countEl = document.getElementById('subtasks-count');
                countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
            }, 250);

            try {
                // Отвязываем от родителя. Карточка остается на доске как самостоятельная.
                await updateTask(sub.id, { parent_id: null });
                bumpModalUpdatedDate();
                refreshBoard();
            } catch(err) {
                console.error("Ошибка при отвязке задачи:", err);
            }
        };
    }
}

function initTaskDescriptionLogic() {
    const renderDiv = document.getElementById('task-desc-render');
    const inputArea = document.getElementById('task-desc-input');
    const descWrapper = document.querySelector('.description-wrapper');
    const modal = document.getElementById('task-modal');

    let lastSavedValue = "";

    const switchToEditMode = () => {
        lastSavedValue = inputArea.value; 

        // 1. Вычисляем пропорциональную позицию клика через Selection API
        let relativePos = 1; 
        const selection = window.getSelection();
        
        if (selection.rangeCount > 0 && renderDiv.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            const preCaretRange = range.cloneRange();
            
            preCaretRange.selectNodeContents(renderDiv);
            preCaretRange.setEnd(range.startContainer, range.startOffset);
            
            const textBefore = preCaretRange.toString();
            const totalText = renderDiv.textContent || '';
            
            if (totalText.length > 0) {
                relativePos = textBefore.length / totalText.length;
            }
        }

        renderDiv.style.display = 'none';
        inputArea.style.display = 'block';

        window.getSelection().removeAllRanges();
        
        // 2. Ставим курсор
        inputArea.focus();
        const targetIndex = Math.floor(inputArea.value.length * relativePos);
        inputArea.setSelectionRange(targetIndex, targetIndex);
        
        // 3. Синхронизируем скролл
        const scrollTarget = (inputArea.scrollHeight * relativePos) - (inputArea.clientHeight / 2);
        inputArea.scrollTop = Math.max(0, scrollTarget);
    };

    // ==========================================
    // ЛОГИКА ВСТАВКИ (PASTE) И DRAG & DROP ФАЙЛОВ
    // ==========================================
    const processFileForDescription = async (file) => {
        const isEditMode = renderDiv.style.display === 'none';

        let fileName = file.name;
        if (!fileName || fileName === 'image.png') {
            const dateStr = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15);
            fileName = `Скриншот_${dateStr}.png`;
        }

        const placeholder = `[⏳ Загрузка ${fileName}...]()`;

        if (isEditMode) {
            const cursorPos = inputArea.selectionStart;
            const text = inputArea.value;
            const textBefore = text.substring(0, cursorPos);
            
            // Умный префикс для пустой строки
            let prefix = "";
            if (textBefore.trim() !== "") {
                if (textBefore.endsWith('\n')) prefix = "\n";
                else prefix = "\n\n";
            }
            
            const insertText = `${prefix}${placeholder}\n`;
            inputArea.value = textBefore + insertText + text.substring(cursorPos);
            inputArea.selectionStart = inputArea.selectionEnd = cursorPos + insertText.length;
            inputArea.dispatchEvent(new Event('input'));
        } else {
            const text = inputArea.value;
            let prefix = "";
            if (text.trim() !== "") {
                if (text.endsWith('\n')) prefix = "\n";
                else prefix = "\n\n";
            }
            inputArea.value = text + prefix + placeholder;
            
            const cleanRegex = /(!?)\[[^\]]+\]\(attachments\/[^)]+\)!\s*/g;
            const tempText = inputArea.value.replace(cleanRegex, '');
            renderDiv.innerHTML = marked.parse(tempText, { breaks: true });
        }

        const formData = new FormData();
        formData.append('file', file, fileName);

        try {
            const res = await fetch(`${API_BASE}/system/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();
            const encodedPath = encodeURI(data.path);
            const finalMarkdown = `[${data.name}](${encodedPath})`;
            
            inputArea.value = inputArea.value.replace(placeholder, finalMarkdown);
        } catch (err) {
            inputArea.value = inputArea.value.replace(placeholder, `[❌ Ошибка: ${fileName}]()`);
        }

        if (isEditMode) {
            inputArea.dispatchEvent(new Event('input'));
            inputArea.focus();
        } else {
            lastSavedValue = null; 
            await switchToReadMode();
        }
    };

    const handleFileDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        descWrapper.style.borderColor = ''; 

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        processFileForDescription(files[0]);
    };

    const handleFilePaste = async (e) => {
        const items = (e.clipboardData || window.clipboardData).items;
        let file = null;

        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                file = items[i].getAsFile();
                break; 
            }
        }

        if (file) {
            e.preventDefault(); // Блокируем вставку текста base64
            processFileForDescription(file);
        }
    };

    descWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        descWrapper.style.borderColor = 'var(--brand-pine)';
    });

    descWrapper.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        descWrapper.style.borderColor = document.activeElement === inputArea ? 'rgba(74, 90, 72, 0.3)' : '';
    });

    descWrapper.addEventListener('drop', handleFileDrop);
    
    // Слушаем вставку из буфера обмена (Ctrl+V / Cmd+V)
    inputArea.addEventListener('paste', handleFilePaste);
    renderDiv.addEventListener('paste', handleFilePaste);

    // ==========================================
    // ЛОГИКА СОХРАНЕНИЯ ОПИСАНИЯ
    // ==========================================
    const switchToReadMode = async () => {
        const newDesc = inputArea.value;
        const taskId = modal.dataset.taskId;

        if (newDesc === lastSavedValue) {
            exitEditingUI(newDesc, null);
            return;
        }

        inputArea.style.opacity = "0.7";

        try {
            const currentAttachments = Array.from(document.querySelectorAll('#attachments-list .attachment-item'));
            const savedOrder = currentAttachments.map(el => el.dataset.path);

            const extracted = extractAttachments(newDesc, savedOrder);
            const newOrderPaths = extracted.map(a => a.path);

            const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    description: newDesc,
                    attachments_order: newOrderPaths 
                })
            });

            if (!res.ok) throw new Error("Save failed");
            
            bumpModalUpdatedDate();

            for (let col of state.columns) {
                let currentTask = col.tasks.find(t => t.id == taskId);
                if (currentTask) {
                    currentTask.description = newDesc;
                    currentTask.attachments_order = newOrderPaths;
                    break;
                }
            }
            
        exitEditingUI(newDesc, extracted);
        } catch (err) {
            console.error("Critical sync error:", err);
            exitEditingUI(newDesc, null);
        } finally {
            inputArea.style.opacity = "1";
        }
    };

    const exitEditingUI = async (content, preCalculatedAttachments = null) => {
        const attachmentsList = document.getElementById('attachments-list');
        const attachmentsCount = document.getElementById('attachments-count');
        
        if (attachmentsCount && attachmentsList && preCalculatedAttachments) {
            let extracted = preCalculatedAttachments;
            if (extracted.length > 0 && extracted[0].exists === undefined) {
                extracted = await enrichAttachments(extracted);
            }

            attachmentsCount.textContent = extracted.length;
            attachmentsList.innerHTML = '';
            extracted.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));
        }

        if (content.trim()) {
            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
            const cleanContent = content.replace(cleanRegex, '');
            renderDiv.innerHTML = marked.parse(cleanContent, { breaks: true });
            enhanceCodeBlocks(renderDiv);
        } else {
            renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
        }
        
        inputArea.style.display = 'none';
        renderDiv.style.display = 'block';
    };

    renderDiv.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'A') return;
        if (e.detail > 1) {
            e.preventDefault(); 
        }
    });

    renderDiv.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'A') return;
        switchToEditMode();
    });

    renderDiv.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        
        if (link) {
            e.preventDefault();
            e.stopPropagation();
            
            const href = link.getAttribute('href');
            if (!href) return;

            if (href.startsWith('doe/')) {
                fetch(`${API_BASE}/system/open-file`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({path: decodeURIComponent(href)})
                });
                return;
            }

            // --- МАГИЯ КРОСС-ССЫЛОК ---
            if (href.startsWith('doe://task/')) {
                const targetTaskId = parseInt(href.split('/').pop());
                
                // Узнаем, где живет эта карточка
                fetch(`${API_BASE}/tasks/${targetTaskId}/context`)
                    .then(res => res.json())
                    .then(context => {
                        // Добавляем true в конце, чтобы сохранить хлебные крошки!
                        window.navigateToEntityGlobal(context.workspace_id, context.column_id, targetTaskId, null, true);
                    })
                    .catch(err => console.error("Не удалось найти карточку", err));
                
                return;
            }
            
            fetch(`${API_BASE}/system/open-link`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url: href})
            });
            return;
        }
        
        if (!inputArea.value.trim()) {
            switchToEditMode();
        }
    });

    inputArea.addEventListener('blur', () => {
        switchToReadMode();
    });
}

function initTaskModalDragAndResize() {
    const taskModal = document.getElementById('task-modal');
    const card = taskModal.querySelector('.task-detail-card');
    const header = card.querySelector('.modal-header');
    const maximizeBtn = card.querySelector('.modal-maximize');

    let currentResizer = null;
    let isDragging = false;
    
    // Начальные параметры для позиционирования
    let startX, startY, startW, startH, startLeft, startTop;

    // --- ФИЗИКА МОДАЛКИ ---
    let currentRotation = 0;
    let targetRotation = 0;
    let lastMouseX = 0;
    let currentMouseX = 0;
    let rafId = null;

    // ЛОГИКА КНОПКИ РАЗВОРОТА И ПЛАВНОГО ЦЕНТРИРОВАНИЯ (FLIP-анимация)
    maximizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        const isMaximized = card.classList.contains('maximized');

        if (!isMaximized) {
            // РАЗВОРОТ: фиксируем стартовые инлайн-размеры для плавной растяжки
            if (card.style.position !== 'absolute') {
                const rect = card.getBoundingClientRect();
                card.style.position = 'absolute';
                card.style.margin = '0';
                card.style.left = `${rect.left}px`;
                card.style.top = `${rect.top}px`;
                card.style.width = `${rect.width}px`;
                card.style.height = `${rect.height}px`;
                card.style.transform = 'none';
            }

            void card.offsetWidth; // Force Reflow
            card.classList.add('maximized');
            // Меняем иконку на "Сжатие" (геометрически выверенная)
            maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 10 14 10 14 6"></polyline><polyline points="6 14 10 14 10 18"></polyline><line x1="14" y1="10" x2="18" y2="6"></line><line x1="10" y1="14" x2="6" y2="18"></line></svg>`;
        } else {
            // СЖАТИЕ В ЦЕНТР: FLIP анимация
            // 1. Измеряем начальную (полноэкранную) позицию
            const startRect = card.getBoundingClientRect();

            // 2. Временно убираем все стили, чтобы Flexbox поставил окно в центр
            card.classList.remove('maximized');
            card.style.transition = 'none'; // Отключаем анимацию
            card.style.position = '';
            card.style.left = '';
            card.style.top = '';
            card.style.width = '';
            card.style.height = '';
            card.style.transform = '';
            card.style.margin = '';

            // 3. Измеряем целевую (центральную) позицию
            const targetRect = card.getBoundingClientRect();

            // 4. Мгновенно возвращаем окно на полный экран
            card.style.position = 'absolute';
            card.style.margin = '0';
            card.style.left = `${startRect.left}px`;
            card.style.top = `${startRect.top}px`;
            card.style.width = `${startRect.width}px`;
            card.style.height = `${startRect.height}px`;

            void card.offsetWidth; // Force Reflow, чтобы браузер понял изменения

            // 5. Запускаем анимацию в центр
            card.style.transition = ''; // Возвращаем возможность анимации
            card.classList.add('is-restoring');
            
            card.style.left = `${targetRect.left}px`;
            card.style.top = `${targetRect.top}px`;
            card.style.width = `${targetRect.width}px`;
            card.style.height = `${targetRect.height}px`;

            maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 6 18 6 18 10"></polyline><polyline points="10 18 6 18 6 14"></polyline><line x1="18" y1="6" x2="13" y2="11"></line><line x1="6" y1="18" x2="11" y2="13"></line></svg>`;
            // 6. Убираем лишние стили после завершения анимации
            const cleanup = (ev) => {
                if (ev && ev.target !== card) return; // Игнорируем всплытия от дочерних элементов
                card.removeEventListener('transitionend', cleanup);
                card.classList.remove('is-restoring');
                card.style.position = '';
                card.style.left = '';
                card.style.top = '';
                card.style.width = '';
                card.style.height = '';
                card.style.margin = '';
            };
            card.addEventListener('transitionend', cleanup);
            setTimeout(cleanup, 350); // Fallback на случай, если эвент не сработает
        }
    });

    const renderModalPhysics = () => {
        if (!isDragging) return;
        
        const deltaX = currentMouseX - lastMouseX;
        lastMouseX = currentMouseX;
        
        const maxRotation = 2.5; 
        targetRotation = Math.max(-maxRotation, Math.min(maxRotation, deltaX * 0.15));
        currentRotation += (targetRotation - currentRotation) * 0.12;

        card.style.transform = `rotate(${currentRotation}deg)`;
        rafId = requestAnimationFrame(renderModalPhysics);
    };

    const onPointerDown = (e) => {
        if (e.button !== 0) return;
        
        // ЗАЩИТА: Запрещаем таскать и ресайзить, если окно на весь экран
        if (card.classList.contains('maximized')) return;

        // ЗАЩИТА: Игнорируем клики вне самой карточки (по полупрозрачному оверлею)
        if (!e.target.closest('.task-detail-card')) return;

        const resizer = e.target.closest('.resizer');
        
        // 🔥 ИСПРАВЛЕНИЕ: Убрали .modal-title из этого списка!
        // Теперь заголовок модалки можно хватать и тащить.
        const isInteractive = e.target.closest(
            'button, input, textarea, a, ' + 
            '.markdown-body, .description-wrapper, ' + 
            '.subtask-item, .attachment-item, ' +      
            '.breadcrumb-item'
        );

        // Исключаем клики по нативным скроллбарам
        const isScrollbarClick = (e.target.clientWidth > 0 && e.offsetX > e.target.clientWidth) || 
                                 (e.target.clientHeight > 0 && e.offsetY > e.target.clientHeight);

        if (!resizer && (isInteractive || isScrollbarClick)) return;

        // Если мы кликнули в пустоту (или по заголовку для драга), 
        // снимаем фокус с любого активного инпута (например, переименования), чтобы он сохранился.
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }

        e.preventDefault();
        
        // Переводим в абсолют при первом же взаимодействии
        if (card.style.position !== 'absolute') {
            const rect = card.getBoundingClientRect();
            card.style.position = 'absolute';
            card.style.margin = '0';
            card.style.left = `${rect.left}px`;
            card.style.top = `${rect.top}px`;
            card.style.width = `${rect.width}px`;
            card.style.height = `${rect.height}px`;
            card.style.transform = 'none';
        }

        isDragging = !resizer;
        currentResizer = resizer;

        startX = e.clientX;
        startY = e.clientY;
        startW = card.offsetWidth;
        startH = card.offsetHeight;
        startLeft = parseFloat(card.style.left);
        startTop = parseFloat(card.style.top);

        // Инициализация физики при старте
        if (isDragging) {
            lastMouseX = e.clientX;
            currentMouseX = e.clientX;
            currentRotation = 0;
            targetRotation = 0;
            
            card.style.transition = 'none'; 
            card.style.willChange = 'left, top, transform'; 
            
            // Включаем кулак
            document.body.classList.add('is-dragging-modal');

            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(renderModalPhysics);
        }

        document.body.style.userSelect = 'none';
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
        currentMouseX = e.clientX; // Обновляем глобальную мышь для loop-анимации
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // ЛОГИКА ПЕРЕМЕЩЕНИЯ
        if (isDragging) {
            card.style.left = `${startLeft + dx}px`;
            card.style.top = `${startTop + dy}px`;
            return;
        }

        // ЛОГИКА РАСШИРЕНИЯ (Ресайз)
        if (currentResizer) {
            const type = currentResizer.classList;

            // Тянем за правую сторону
            if (type.contains('r-right') || type.contains('r-top-right') || type.contains('r-bottom-right')) {
                const newWidth = startW + dx;
                if (newWidth > 400) card.style.width = `${newWidth}px`;
            }
            // Тянем за левую сторону
            if (type.contains('r-left') || type.contains('r-top-left') || type.contains('r-bottom-left')) {
                const newWidth = startW - dx;
                if (newWidth > 400) {
                    card.style.width = `${newWidth}px`;
                    card.style.left = `${startLeft + dx}px`;
                }
            }
            // Тянем за низ
            if (type.contains('r-bottom') || type.contains('r-bottom-left') || type.contains('r-bottom-right')) {
                const newHeight = startH + dy;
                if (newHeight > 400) card.style.height = `${newHeight}px`;
            }
            // Тянем за верх
            if (type.contains('r-top') || type.contains('r-top-left') || type.contains('r-top-right')) {
                const newHeight = startH - dy;
                if (newHeight > 400) {
                    card.style.height = `${newHeight}px`;
                    card.style.top = `${startTop + dy}px`;
                }
            }
        }
    };

    const onPointerUp = (e) => {
        // Завершение физики
        if (isDragging) {
            // 🔥 ФИКС КУРСОРА: Отключаем кулак
            document.body.classList.remove('is-dragging-modal');
            
            cancelAnimationFrame(rafId);
            // Плавно и "желейно" возвращаем наклон в 0 градусов
            card.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            card.style.transform = 'rotate(0deg)';
            card.style.willChange = 'auto'; // Снимаем нагрузку с GPU
            
            if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) {
                window._isAfterDrag = true;
                setTimeout(() => window._isAfterDrag = false, 50);
            }
        }

        isDragging = false;
        currentResizer = null;
        document.body.style.userSelect = '';
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    };

    // Вешаем один слушатель на все окно модалки
    taskModal.addEventListener('pointerdown', onPointerDown);
}

// Слушатель для инпута подзадач внутри модалки
document.addEventListener('keydown', async (e) => {
    if (e.target.id === 'subtask-quick-add' && e.key === 'Enter') {
        const input = e.target;
        const title = input.value.trim();
        const modal = document.getElementById('task-modal');
        const parentId = parseInt(modal.dataset.taskId);
        const columnId = parseInt(modal.dataset.columnId);

        if (title) {
            input.disabled = true;

            // МАГИЯ ССЫЛКИ ДЛЯ БЫСТРОГО ДОБАВЛЕНИЯ
            const linkMatch = title.match(/^\[(.*?)\]\(doe:\/\/task\/(\d+)\)$/) || title.match(/^doe:\/\/task\/(\d+)$/);
            if (linkMatch) {
                const linkedTaskId = parseInt(linkMatch[2] || linkMatch[1]);
                try {
                    await updateTask(linkedTaskId, { parent_id: parentId, is_visible_on_board: true });
                    input.value = '';
                    await loadTaskIntoModal(parentId, false); 
                    refreshBoard(); 
                } catch (err) {
                    alert(t('cyclicError'));
                } finally {
                    input.disabled = false;
                    input.focus();
                }
                return;
            }

            try {
                // Создаем задачу, передавая parent_id
                const res = await fetch(`${API_BASE}/tasks/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        title, 
                        column_id: columnId, 
                        parent_id: parentId 
                    })
                });
                if (res.ok) {
                    input.value = '';
                    // Перезагружаем текущую карточку, чтобы увидеть новую подзадачу
                    await loadTaskIntoModal(parentId, false); 
                    refreshBoard(); 
                }
            } catch (err) {
                console.error(err);
            } finally {
                input.disabled = false;
                input.focus();
            }
        }
    }
});

function extractAttachments(desc, savedOrder = []) {
    const regex = /(!?)\[([^\]]+)\]\((doe\/[^)]+)\)(!?)/g;
    let match;
    const attachments = [];
    
    while ((match = regex.exec(desc)) !== null) {
        attachments.push({
            fullMatch: match[0],       // Вся строка: [супер фотка](attachments/old.pn)
            isImage: match[1] === '!',
            label: match[2],           // Подпись пользователя: "супер фотка"
            path: match[3],            // Реальный или сломанный путь: "attachments/old.pn"
            isHidden: match[4] === '!'
        });
    }

    // Сортировка по сохраненному порядку
    attachments.sort((a, b) => {
        const idxA = savedOrder.indexOf(a.path);
        const idxB = savedOrder.indexOf(b.path);
        const posA = idxA !== -1 ? idxA : Infinity;
        const posB = idxB !== -1 ? idxB : Infinity;
        return posA - posB;
    });

    return attachments;
}

// Асинхронно обогащает сырые данные из Markdown реальными статусами с диска
async function enrichAttachments(attachments) {
    if (attachments.length === 0) return attachments;
    const paths = attachments.map(a => a.path);
    
    try {
        const res = await fetch(`${API_BASE}/system/validate-attachments`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({paths})
        });
        
        if (res.ok) {
            const validation = await res.json();
            attachments.forEach(a => {
                const status = validation[a.path];
                a.exists = status ? status.exists : false;
                // ИМЯ БЕРЕМ С ДИСКА (ИЛИ ИЗ ПУТИ), А НЕ ИЗ КВАДРАТНЫХ СКОБОК МАРКДАУНА!
                a.real_name = status ? status.real_name : a.name; 
            });
        }
    } catch (e) {
        console.error("Attachment validation failed", e);
        // Фолбэк, если сервер не ответил
        attachments.forEach(a => { a.exists = true; a.real_name = a.name; }); 
    }
    return attachments;
}

function createAttachmentElement(att) {
    const div = document.createElement('div');
    div.className = 'subtask-item attachment-item'; 
    div.dataset.fullMatch = att.fullMatch;
    div.dataset.path = att.path; 
    
    const isMissing = att.exists === false;
    
    // Если файла нет - показываем знак вопроса, если есть - скрепку/документ
    const fileIcon = isMissing 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    
    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    
    div.innerHTML = `
        <div class="subtask-checkbox ${isMissing ? 'missing' : ''}" ${isMissing ? 'title="Файл не найден. Нажмите, чтобы перепривязать"' : ''}>
            ${fileIcon}
        </div>
        <div class="subtask-title ${isMissing ? 'missing-text' : ''}" ${isMissing ? 'title="Ожидаемое имя файла"' : ''}>${escapeHtml(att.real_name)}</div>
        <div class="subtask-actions">
            <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIcon}</button>
        </div>
    `;
    
    // Обработка клика
    div.addEventListener('click', async (e) => {
        if (e.target.closest('.subtask-delete-btn')) return;
        
        // --- ЛОГИКА ПЕРЕПРИВЯЗКИ ФАЙЛА ---
        if (isMissing) {
            let newAbsPath = null;
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
                newAbsPath = await window.pywebview.api.choose_file();
            } else {
                // Fallback для браузера
                return new Promise(resolve => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.onchange = async () => {
                        if (input.files.length > 0) {
                            const formData = new FormData();
                            formData.append('file', input.files[0]);
                            const res = await fetch(`${API_BASE}/system/upload`, { method: 'POST', body: formData });
                            if(res.ok) {
                                const data = await res.json();
                                replaceBrokenAttachment(att, data);
                            }
                        }
                        resolve();
                    };
                    input.click();
                });
            }

            if (newAbsPath) {
                const res = await fetch(`${API_BASE}/system/import-file`, {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ absolute_path: newAbsPath })
                });
                if(res.ok) {
                    const data = await res.json();
                    replaceBrokenAttachment(att, data);
                }
            }
            return;
        }

        // Если файл есть - просто открываем
        await fetch(`${API_BASE}/system/open-file`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: decodeURIComponent(att.path)})
        });
    });
    
    // Удаление вложения из текста
    div.querySelector('.subtask-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        
        // 1. Визуально скрываем элемент мгновенно
        div.style.transition = 'all 0.2s ease-out';
        div.style.opacity = '0';
        div.style.transform = 'translateX(20px)';

        const pathToDelete = att.path;

        // 2. СРАЗУ отправляем запрос на физическое удаление с диска (исключение из правил)
        fetch(`${API_BASE}/system/delete-file`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ path: pathToDelete })
        }).catch(err => console.error("Physical delete failed:", err));

        // 3. Стираем упоминание файла из текста Markdown
        setTimeout(() => {
            const inputArea = document.getElementById('task-desc-input');
            const renderDiv = document.getElementById('task-desc-render');
            const isEditMode = renderDiv.style.display === 'none';
            
            const safePath = pathToDelete.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pathRegex = new RegExp(`(!?)\\[[^\\]]*\\]\\(${safePath}\\)(!?)`, 'g');
            
            const oldText = inputArea.value;
            inputArea.value = oldText.replace(pathRegex, '').trim();
            
            // Если текст реально изменился — решаем, что делать дальше в зависимости от режима
            if (oldText !== inputArea.value) {
                if (isEditMode) {
                    inputArea.dispatchEvent(new Event('input'));
                    inputArea.focus();
                } else {
                    inputArea.dispatchEvent(new Event('blur')); // Сохраняем в фоне
                }
            } else {
                // Если ссылка была где-то еще, просто убираем из DOM
                if (div.parentNode) div.remove();
            }
        }, 200);
    });
    
    return div;
}

// Вспомогательная функция для ювелирной замены сломанного пути в Markdown
function replaceBrokenAttachment(att, newData) {
    const inputArea = document.getElementById('task-desc-input');
    const renderDiv = document.getElementById('task-desc-render');
    const isEditMode = renderDiv.style.display === 'none';

    const encodedNewPath = encodeURI(newData.path);
    // Восстанавливаем стандартную ссылку
    const newMarkdown = `[${newData.name}](${encodedNewPath})`;
    
    // Заменяем старый битый кусок текста (att.fullMatch) на новую ссылку
    inputArea.value = inputArea.value.replace(att.fullMatch, newMarkdown);
    
    if (isEditMode) {
        inputArea.dispatchEvent(new Event('input'));
        inputArea.focus();
    } else {
        inputArea.dispatchEvent(new Event('blur'));
    }
}

function appendAttachmentToDescription(name, path) {
    const inputArea = document.getElementById('task-desc-input');
    const renderDiv = document.getElementById('task-desc-render');
    const isEditMode = renderDiv.style.display === 'none';

    const encodedPath = encodeURI(path); 
    const attachmentMarkdown = `[${name}](${encodedPath})`;
    
    if (isEditMode) {
        const cursorPos = inputArea.selectionStart;
        const text = inputArea.value;
        const textBefore = text.substring(0, cursorPos);

        let prefix = "";
        if (textBefore.trim() !== "") {
            // 🔥 SENIOR UI LOGIC:
            // Если текст заканчивается на один \n — добавляем еще один для пустой строки
            // Если текст заканчивается на буквы — добавляем два \n\n
            if (textBefore.endsWith('\n')) prefix = "\n";
            else prefix = "\n\n";
        }
        
        const insertText = `${prefix}${attachmentMarkdown}\n`;
        
        inputArea.value = textBefore + insertText + text.substring(cursorPos);
        inputArea.selectionStart = inputArea.selectionEnd = cursorPos + insertText.length;
        inputArea.dispatchEvent(new Event('input'));
        inputArea.focus();
    } else {
        const text = inputArea.value;
        let prefix = "";
        if (text.trim() !== "") {
            if (text.endsWith('\n')) prefix = "\n";
            else prefix = "\n\n";
        }
        inputArea.value = text + prefix + attachmentMarkdown;
        inputArea.dispatchEvent(new Event('blur')); 
    }
}

// Обработчик кнопки "+ Добавить вложение"
document.addEventListener('click', async (e) => {
    if (e.target.closest('#btn-add-attachment')) {
        if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
            const absPath = await window.pywebview.api.choose_file();
            if (absPath) {
                const res = await fetch(`${API_BASE}/system/import-file`, {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ absolute_path: absPath })
                });
                if(res.ok) {
                    const data = await res.json();
                    appendAttachmentToDescription(data.name, data.path);
                }
            }
        } else {
            // Фолбэк для браузера (если запускать без pywebview)
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async () => {
                if (input.files.length > 0) {
                    const formData = new FormData();
                    formData.append('file', input.files[0]);
                    const res = await fetch(`${API_BASE}/system/upload`, {
                        method: 'POST', body: formData
                    });
                    if(res.ok) {
                        const data = await res.json();
                        appendAttachmentToDescription(data.name, data.path);
                    }
                }
            };
            input.click();
        }
    }
});

// ==========================================
// ЛОГИКА ЭКРАНА ХРАНИЛИЩ (VAULT SELECTOR)
// ==========================================

async function showVaultScreen() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_vault_window) {
        window.pywebview.api.open_vault_window();
    } else {
        window.location.href = "/app?mode=vault"; // Fallback для разработки в браузере
    }
}

async function fetchVaultHistory() {
    try {
        const res = await fetch(`${API_BASE}/system/vault/history`);
        if (res.ok) return await res.json();
    } catch (e) { console.error(e); }
    return [];
}

async function renderVaultHistory() {
    const list = document.getElementById('vault-history-list');
    if (!list) return;
    list.innerHTML = '';
    
    const history = await fetchVaultHistory();
    
    if (history.length === 0) {
        list.innerHTML = `
            <div style="text-align:center; padding: 24px; color: var(--text-secondary); font-size: 13px; opacity: 0.6;" data-i18n="vault.recentEmpty">
                ${t('vault.recentEmpty')}
            </div>`;
        return;
    }

    const folderIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'subtask-item vault-history-item';
        div.dataset.path = item.path;
        
        // Форматируем дату (функция formatDateTime уже есть в коде и сама учитывает язык)
        let dateStr = '';
        if (item.last_opened) {
            dateStr = formatDateTime(item.last_opened);
        } else {
            // Если это старое хранилище, открывавшееся до появления этой функции в коде
            dateStr = currentLang === 'ru' ? 'Ранее' : 'Earlier';
        }

        div.innerHTML = `
            <div class="subtask-checkbox" style="border:none; color: var(--brand-pine); opacity: 0.8; cursor: inherit;">
                ${folderIcon}
            </div>
            <div class="vault-history-info">
                <div class="vault-history-name">${escapeHtml(item.name)}</div>
                <div class="vault-history-meta">
                    <div class="vault-history-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
                    <!-- Теперь блок даты есть в DOM всегда, поэтому он без проблем копируется в Drag&Drop клон -->
                    <div class="vault-history-date" data-timestamp="${item.last_opened || ''}">${dateStr}</div>
                </div>
            </div>
            <div class="subtask-actions">
                <button class="subtask-delete-btn vault-hist-del" title="${t('menu.delete')}">${trashIcon}</button>
            </div>
        `;

        // В обработчике КЛИКА нужно блокировать открытие, если мы только что бросили элемент
        div.addEventListener('click', async (e) => {
            if (window._isAfterDrag) return; // <--- ЗАЩИТА ОТ СЛУЧАЙНОГО ОТКРЫТИЯ ПРИ БРОСКЕ
            if (e.target.closest('.vault-hist-del')) return;
            
            try {
                // Эффект загрузки (затемняем интерфейс)
                div.style.opacity = '0.5';
                div.style.pointerEvents = 'none';

                const res = await fetch(`${API_BASE}/system/vault/switch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_path: item.path })
                });
                
                if (res.ok) {
                    const result = await res.json();
                    updateVaultName(result.name);
                    const settings = await fetchSettings().catch(() => ({}));
                    state.activeWorkspaceId = settings.active_workspace_id || null;
                    await transitionToApp();
                } else if (res.status === 400) {
                    // Папка удалена или повреждена (показываем ошибку тряской)
                    div.style.opacity = '1';
                    div.style.pointerEvents = 'auto';
                    div.classList.add('is-error');
                    setTimeout(() => div.classList.remove('is-error'), 400);
                }
            } catch (err) {
                console.error(err);
                div.style.opacity = '1';
                div.style.pointerEvents = 'auto';
            }
        });

        // Клик по корзине — удаление из истории
        div.querySelector('.vault-hist-del').addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // 1. Снимаем точные размеры
            const rect = div.getBoundingClientRect();
            
            // 2. Создаем клона (падает вниз)
            const clone = div.cloneNode(true);
            clone.classList.add('vault-deleting-clone');
            clone.style.left = `${rect.left}px`;
            clone.style.top = `${rect.top}px`;
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            document.body.appendChild(clone);
            
            // 3. Создаем умную распорку
            const spacer = document.createElement('div');
            spacer.className = 'vault-history-spacer';
            spacer.style.height = `${rect.height}px`;
            
            // 4. Мгновенно подменяем оригинал распоркой
            div.replaceWith(spacer);

            // 5. Запускаем анимации на следующем кадре
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    clone.classList.add('is-animating');
                    spacer.classList.add('is-shrinking');
                });
            });

            // 6. Убираем мусор из DOM после анимации. 
            // Благодаря отрицательному margin-top, в момент удаления spacer занимает 
            // ровно 0 пикселей в физике списка, поэтому скачка не будет вообще.
            setTimeout(() => {
                if (clone.parentNode) clone.remove();
                if (spacer.parentNode) spacer.remove();
                
                if (list.querySelectorAll('.vault-history-item').length === 0) {
                    renderVaultHistory();
                }
            }, 450);

            // 7. Фоновый запрос
            try {
                await fetch(`${API_BASE}/system/vault/history/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: item.path })
                });
            } catch (err) {
                console.error("Ошибка удаления из истории:", err);
            }
        });

        list.appendChild(div);
    });
}

async function transitionToApp() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_main_window) {
        window.pywebview.api.open_main_window();
    } else {
        window.location.href = "/app"; // Fallback для разработки в браузере
    }
}

window.handleVaultAction = async (actionType) => {
    const cards = document.querySelectorAll('.vault-action-card');
    const targetCard = (actionType === 'create') ? cards[0] : cards[1];
    
    if (actionType === 'create') {
        document.getElementById('vault-actions-cards').style.display = 'none';
        document.getElementById('vault-create-form').style.display = 'block';
        document.getElementById('new-vault-name').focus();
    } else {
        try {
            if (!window.pywebview || !window.pywebview.api) return;
            
            const selectedPath = await window.pywebview.api.choose_directory();
            if (!selectedPath) return;

            const res = await fetch(`${API_BASE}/system/vault/switch`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_path: selectedPath })
            });

            if (res.ok) {
                const result = await res.json();
                updateVaultName(result.name);
                const settings = await fetchSettings().catch(() => ({}));
                state.activeWorkspaceId = settings.active_workspace_id || null;
                
                // ЗАПУСКАЕМ КРАСИВУЮ АНИМАЦИЮ ПЕРЕХОДА
                await transitionToApp();
            } 
            else if (res.status === 400) {
                targetCard.classList.add('is-invalid');
                let hint = targetCard.querySelector('.vault-error-hint');
                if (!hint) {
                    hint = document.createElement('div');
                    hint.className = 'vault-error-hint';
                    targetCard.appendChild(hint);
                }
                hint.textContent = t('vault.errorInvalid');
                void hint.offsetWidth; 
                hint.classList.add('visible');

                setTimeout(() => {
                    targetCard.classList.remove('is-invalid');
                    hint.classList.remove('visible');
                    setTimeout(() => {
                        if (!hint.classList.contains('visible')) hint.remove();
                    }, 200); 
                }, 2200);
            }
        } catch (err) {
            console.error("Vault selection error:", err);
        }
    }
};

// Отмена создания (возврат к карточкам)
window.cancelVaultCreate = () => {
    document.getElementById('vault-actions-cards').style.display = 'flex';
    document.getElementById('vault-create-form').style.display = 'none';
    document.getElementById('new-vault-name').value = '';
};

// Финальное подтверждение создания
window.confirmVaultCreate = async () => {
    const nameInput = document.getElementById('new-vault-name');
    const vaultName = nameInput.value.trim();
    
    if (!vaultName) {
        nameInput.focus();
        nameInput.classList.add('is-error');
        setTimeout(() => nameInput.classList.remove('is-error'), 400);
        return;
    }

    if (!window.pywebview || !window.pywebview.api) return;

    const parentPath = await window.pywebview.api.choose_directory();
    if (!parentPath) return; 

    try {
        const res = await fetch(`${API_BASE}/system/vault/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_path: parentPath, name: vaultName })
        });

        if (!res.ok) throw new Error('Ошибка создания хранилища');
        const result = await res.json();

        updateVaultName(result.name);
        state.activeWorkspaceId = null; 
        
        // ЗАПУСКАЕМ КРАСИВУЮ АНИМАЦИЮ ПЕРЕХОДА
        await transitionToApp();
        
        // Сброс формы в фоне для будущих открытий
        setTimeout(window.cancelVaultCreate, 500); 

    } catch (err) {
        console.error(err);
        alert(t('alerts.error'));
    }
};

// Нажатие Enter в поле имени подтверждает создание
document.getElementById('new-vault-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        window.confirmVaultCreate();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        window.cancelVaultCreate();
    }
});

// ==========================================
// ЛОГИКА ГЛОБАЛЬНОГО ПОИСКА (FTS5)
// ==========================================
function initGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-dropdown');
    const content = document.getElementById('search-results-content');
    const wrapper = document.getElementById('global-search-wrapper');

    if (!input) return;

    // Глобальный Hotkey для фокуса (Cmd+S / Ctrl+S)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault(); // Защита от системного "Сохранить страницу"
            
            // Если карточка открыта — игнорируем фокус на поиске
            const taskModal = document.getElementById('task-modal');
            if (taskModal && taskModal.classList.contains('show')) return;
            
            input.focus();
        }
    });

    let debounceTimer;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();
        
        if (query.length < 2) {
            dropdown.classList.remove('show');
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/system/search?q=${encodeURIComponent(query)}`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                renderSearchResults(data, query); // <--- ПЕРЕДАЕМ QUERY СЮДА
            } catch (err) {
                console.error("Search failed:", err);
            }
        }, 250); // Debounce 250ms для снижения нагрузки
    });

    // Закрытие при потере фокуса
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 2 && content.innerHTML !== '') {
            dropdown.classList.add('show');
        }
    });

    function renderSearchResults(data, query) {
        content.innerHTML = '';
        const hasResults = data.workspaces.length || data.columns.length || data.tasks.length;

        // Вспомогательная функция для подсветки текста в строке результатов
        const highlightString = (text, q) => {
            if (!text) return "";
            if (!q) return escapeHtml(text);
            const words = q.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length === 0) return escapeHtml(text);
            
            const regexWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regex = new RegExp(`(${regexWords.join('|')})`, 'gi');
            
            // Используем стандартный тег <mark>, который мы стилизовали в CSS 
            // под системное выделение Кварцевым Мхом или Еловым Камнем
            return escapeHtml(text).replace(regex, '<mark>$1</mark>');
        };

        if (!hasResults) {
            content.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 13px;">Ничего не найдено</div>`;
            dropdown.classList.add('show');
            return;
        }

        const createItem = (titleHtml, meta, descHtml, onClick) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `
                <div class="search-result-title">${titleHtml}</div>
                <div class="search-result-meta">${meta}</div>
                ${descHtml ? `<div class="search-result-desc">${descHtml}</div>` : ''}
            `;
            div.onclick = () => {
                dropdown.classList.remove('show');
                input.value = '';
                input.blur();
                onClick();
            };
            content.appendChild(div);
        };

        const wsIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
        const colIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`;
        const taskIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

        data.workspaces.forEach(w => {
            // Подсвечиваем имя вкладки
            createItem(highlightString(w.name, query), `${wsIcon} Вкладка`, null, () => window.navigateToEntityGlobal(w.id, null, null));
        });

        data.columns.forEach(c => {
            // Подсвечиваем имя колонки
            createItem(highlightString(c.title, query), `${colIcon} Колонка &middot; ${c.workspace_name}`, null, () => window.navigateToEntityGlobal(c.workspace_id, c.id, null));
        });

        data.tasks.forEach(t => {
            // Сниппет уже подсвечен бэкендом (FTS5), поэтому его не трогаем, а заголовок подсвечиваем
            const desc = (t.snippet && t.snippet.trim()) ? `...${t.snippet}...` : null;
            createItem(highlightString(t.title, query), `${taskIcon} Карточка &middot; ${t.workspace_name} / ${t.column_title}`, desc, () => window.navigateToEntityGlobal(t.workspace_id, t.column_id, t.id, query));
        });

        dropdown.classList.add('show');
    }
}

// Супер-роутер: переходит на вкладку -> скроллит к колонке -> открывает карточку
window.navigateToEntityGlobal = async function(wsId, colId, taskId, highlightQuery = null, keepStack = false) {
    closeAllDropdowns();
    
    // 1. Свитч вкладки, если мы не на ней
    if (wsId && wsId !== state.activeWorkspaceId) {
        document.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
        const targetTab = document.querySelector(`.board-tab[data-workspace-id="${wsId}"]`);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
        
        state.activeWorkspaceId = wsId;
        updateSettings({ active_workspace_id: wsId }).catch(console.error);
        
        // Ждем загрузки доски
        const columns = await fetchColumns(wsId);
        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
        renderBoard();
    }

    // 2. Скролл до колонки
    if (colId) {
        // Даем DOM время на рендер (если был свитч)
        requestAnimationFrame(() => {
            const colEl = document.querySelector(`.column[data-column-id="${colId}"]`);
            if (colEl) {
                if (colEl.classList.contains('collapsed') && taskId) {
                    onExpandColumn(colEl); // Разворачиваем, если нужно показать карточку
                }
                colEl.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                
                // 3. Открытие карточки
                if (taskId) {
                    // Подсвечиваем саму карточку
                    const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                    if (cardEl) {
                        cardEl.style.transition = 'box-shadow 0.3s';
                        cardEl.style.boxShadow = '0 0 0 2px var(--brand-pine)';
                        setTimeout(() => cardEl.style.boxShadow = '', 1500);
                    }

                    if (!keepStack) {
                        modalNavigationStack = []; 
                    }
                    loadTaskIntoModal(taskId, true, highlightQuery);
                    document.getElementById('task-modal').classList.add('show');
                }
            }
        });
    }
};


window.chooseCustomAttFolder = async () => {
    if (!window.pywebview || !window.pywebview.api) return;
    const path = await window.pywebview.api.choose_directory();
    if (path) {
        try {
            // Эффект загрузки (блокируем UI пока файлы мигрируют)
            document.getElementById('setting-item-external').style.opacity = '0.5';
            
            await fetch(`${API_BASE}/system/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ global_attachments_path: path, reset_attachments: false })
            });
            
            // Обновляем UI
            document.getElementById('att-path-display').textContent = path;
            document.getElementById('setting-item-local').classList.remove('active');
            document.getElementById('setting-item-external').classList.add('active');
        } catch (e) { 
            console.error(e); 
        } finally {
            document.getElementById('setting-item-external').style.opacity = '1';
        }
    }
};

window.resetAttFolder = async () => {
    // Если уже локально, ничего не делаем
    if (document.getElementById('setting-item-local').classList.contains('active')) return;

    try {
        // Эффект загрузки
        document.getElementById('setting-item-local').style.opacity = '0.5';

        await fetch(`${API_BASE}/system/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset_attachments: true })
        });
        
        // Обновляем UI
        document.getElementById('att-path-display').textContent = t('modals.attSelectBtn');
        document.getElementById('setting-item-external').classList.remove('active');
        document.getElementById('setting-item-local').classList.add('active');
    } catch (e) { 
        console.error(e); 
    } finally {
        document.getElementById('setting-item-local').style.opacity = '1';
    }
};

// ==========================================
// ГЛОБАЛЬНЫЙ ОБРАБОТЧИК КНОПОК КОПИРОВАНИЯ ССЫЛОК (Для модалки)
// ==========================================
document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.modal-copy-link');
    if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();

        const modal = document.getElementById('task-modal');
        const taskId = modal.dataset.taskId;
        // 🚀 ФИКС: Учитываем, что заголовок модалки тоже может быть в режиме редактирования (textarea)
        const titleNode = document.getElementById('task-modal-title') || document.querySelector('.task-modal-title-input');
        const taskTitle = (titleNode.value !== undefined ? titleNode.value : titleNode.textContent).trim();

        const link = `[${taskTitle}](doe://task/${taskId})`;

        try {
            // 🚀 БРОНЕБОЙНОЕ КОПИРОВАНИЕ
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(link);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = link;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
            }
            
            // Анимация успешного копирования (меняем на галочку)
            const originalHtml = copyBtn.innerHTML;
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHtml;
                copyBtn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error("Failed to copy link: ", err);
        }
    }
});

// Запускаем инициализацию (можно поместить вызов внутрь главной IIFE async функции внизу файла)
initTaskDescriptionLogic();

(async () => {
    initTooltip();
    initTabsScrollbar();
    initTaskModalDragAndResize();
    initGlobalSearch();

    // Проверяем, в каком режиме открыто текущее окно (App или Vault Selector)
    const urlParams = new URLSearchParams(window.location.search);
    const isVaultMode = urlParams.get('mode') === 'vault';

    // 1. Первичная настройка темы/языка из кэша (чтобы не моргало)
    try {
        applyLanguage(localStorage.getItem('doe-lang') || 'ru', false);
        applyTheme(localStorage.getItem('doe-theme') || 'light', false);
    } catch (e) {}

    // Глобальные лисенеры вешаем в любом случае
    setInterval(updateTimers, 250);
    window.addEventListener('resize', () => {
        requestAnimationFrame(() => {
            clampExpandedTitles();
            adjustCollapsedColumnWidths();
        });
    });

    // Если это окно выбора хранилища — загружаем настройки, историю и показываем занавес
    if (isVaultMode) {
        document.getElementById('vault-screen').classList.remove('hidden', 'content-hidden');
        
        try {
            // Даже на экране входа мы запрашиваем глобальные настройки (тема/язык)
            const settingsData = await fetchSettings().catch(() => ({}));
            if (settingsData.theme) applyTheme(settingsData.theme, false);
            if (settingsData.language) applyLanguage(settingsData.language, false);
        } catch (e) { console.error("Settings load failed in vault mode", e); }

        renderVaultHistory();
        
        document.body.classList.remove('preload');
        setTimeout(triggerReveal, 50);
        return; 
    }

    // Если это основное окно доски — гарантируем, что занавес выбора хранилища скрыт
    document.getElementById('vault-screen').classList.add('hidden', 'content-hidden');

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

            // 🌟 НОВОЕ: Запускаем фоновую очистку мусора при старте приложения, 
            // когда хранилище и БД гарантированно подключены.
            triggerGarbageCollector();

        } else {
            // Если воркспейсов вообще нет (критическая ситуация)
            console.error("No workspaces found even after initialization");
            renderBoard(); 
        }

        // 5. ПОКАЗЫВАЕМ ОКНО (убираем preload)
        document.body.classList.remove('preload');
        setTimeout(triggerReveal, 50);

    } catch (e) {
        console.error("Fatal initialization error:", e);
        document.body.classList.remove('preload');
        setTimeout(triggerReveal, 50); 
    }
})();
