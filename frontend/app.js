let state = { columns: [], workspaces: [], activeWorkspaceId: null };
const API_BASE = '/api/v1';
// Определяем macOS для применения нативных безрамочных отступов
if (navigator.userAgent.toLowerCase().includes('mac')) {
    document.documentElement.classList.add('mac-os');
}
let cmEditor = null; // Глобальный редактор

if (navigator.userAgent.toLowerCase().includes('windows')) {
    document.documentElement.classList.add('win-os');
}


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
            copyCardLink: 'Скопировать ссылку', dueDate: 'Установить дедлайн', notify: 'Напомнить',
            reminders: 'Активные напоминания', remindersEmpty: 'Нет активных напоминаний'
        },
        copied: 'Скопировано!',
        modals: { 
            notifyTitle: 'Напомнить', notifyRelative: 'Через', notifyAbsolute: 'В точное время', btnSet: 'Установить',
            dueDateTitle: 'Установить дедлайн', dueDateSet: 'Установить дедлайн', dueDateClear: 'Очистить',
            themeTitle: 'Тема оформления', light: 'Светлая', dark: 'Тёмная', 
            langTitle: 'Выберите язык', aboutTitle: 'О приложении', 
            aboutDesc: 'Aesthetic. Local-first. Kanban sanctuary.',
            attTitle: 'Хранилище вложений', 
            attLocalTitle: 'Внутри хранилища',
            attLocalDesc: 'Файлы переносятся вместе с доской (По умолчанию)',
            attExternalTitle: 'Внешняя папка',
            attSelectBtn: 'Выбрать папку...',
            attWarning: 'При использовании внешней папки файлы не будут копироваться на флешку автоматически при переносе хранилища.',
            exportTitle: 'Экспорт карточки', exportIncludeAtt: 'Экспортировать с вложениями', btnExport: 'Экспортировать',
            detachTitle: 'Отвязать карточку?', detachDesc: 'Эта карточка привязана к нескольким карточкам.',
            detachCurrent: 'Только от текущей карточки', detachAll: 'От всех карточек (сделать независимой)'
        },
        copyLink: 'Копировать ссылку',
        detachSubtask: 'Отвязать от чек-листа (сделать независимой)',
        cyclicError: 'Нельзя привязать! Возникнет бесконечный цикл.',
        columnModes: { default: 'Стандартный', track_time: 'Учёт времени', completion: 'Результирующий' },
        defaultWorkspace: 'Начальная вкладка',
        attachments: 'Вложения', addAttachment: '+ Добавить вложение...',
        missingTooltip: 'Файл не найден. Нажмите, чтобы перепривязать',
        pendingTooltip: 'Ожидаемое вложение. Нажмите, чтобы привязать файл',
        pendingTitle: (name) => `Ожидание файла для [${name}](doe/)`,
        expectedFilename: 'Ожидаемое имя файла',
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
        timeUnitsFull: { s: 'секунд', m: 'минут', h: 'часов', d: 'дней', w: 'недель', mo: 'месяцев', y: 'лет' },
        prompts: {
            taskTitle: 'Название карточки:', columnTitle: 'Название колонки:', renameColumn: 'Новое название:', 
            deleteConfirmTitle: 'Удалить колонку?', deleteConfirmDesc: 'Все карточки внутри будут потеряны.',
            clearConfirmTitle: 'Очистить колонку?', clearConfirmDesc: 'Все карточки внутри будут удалены безвозвратно.',
            newTabTitle: 'Название новой вкладки:', deleteTabConfirm: 'Удалить вкладку?',
            deleteTabDesc: 'Вкладка и все колонки в ней будут удалены навсегда.'
        },
        errors: { tooLong: 'Максимум 200 символов' },
        graph: { title: 'Граф связей', empty: 'Карточек пока нет.\nСоздайте карточки на доске.', arrows: 'Стрелки' },
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
            copyCardLink: 'Copy link', dueDate: 'Set deadline', notify: 'Remind me',
            reminders: 'Active Reminders', remindersEmpty: 'No active reminders'
        },
        copied: 'Copied!',
        modals: { 
            notifyTitle: 'Remind me', notifyRelative: 'In', notifyAbsolute: 'At exact time', btnSet: 'Set',
            dueDateTitle: 'Due date', dueDateSet: 'Set deadline', dueDateClear: 'Clear',
            themeTitle: 'Theme', light: 'Light', dark: 'Dark', 
            langTitle: 'Select language', aboutTitle: 'About', 
            aboutDesc: 'Aesthetic. Local-first. Kanban sanctuary.',
            attTitle: 'Attachments Storage', 
            attLocalTitle: 'Inside vault',
            attLocalDesc: 'Files move together with the board (Default)',
            attExternalTitle: 'External folder',
            attSelectBtn: 'Choose folder...',
            attWarning: 'When using an external folder, files will not copy automatically if you move the vault to a USB drive.',
            exportTitle: 'Export Card', exportIncludeAtt: 'Export with attachments', btnExport: 'Export',
            detachTitle: 'Detach card?', detachDesc: 'This card is attached to multiple cards.',
            detachCurrent: 'Only from current card', detachAll: 'From all cards (make independent)'
        },
        columnModes: { default: 'Standard', track_time: 'Track time', completion: 'Completed' },
        defaultWorkspace: 'Main Board',
        attachments: 'Attachments', addAttachment: '+ Add attachment...',
        missingTooltip: 'File not found. Click to relink',
        pendingTooltip: 'Pending attachment. Click to link a file',
        pendingTitle: (name) => `Waiting for file [${name}](doe/)`,
        expectedFilename: 'Expected filename',
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
        timeUnitsFull: { s: 'seconds', m: 'minutes', h: 'hours', d: 'days', w: 'weeks', mo: 'months', y: 'years' },
        prompts: {
            taskTitle: 'Card title:', columnTitle: 'Column title:', renameColumn: 'New name:', 
            deleteConfirmTitle: 'Delete column?', deleteConfirmDesc: 'All cards inside will be lost.',
            clearConfirmTitle: 'Clear column?', clearConfirmDesc: 'All cards inside will be permanently deleted.',
            newTabTitle: 'New tab name:', deleteTabConfirm: 'Delete tab?',
            deleteTabDesc: 'The tab and all its columns will be deleted permanently.'
        },
        errors: { tooLong: 'Maximum 200 characters' },
        graph: { title: 'Connections Graph', empty: 'No cards yet.\nCreate cards on the board.', arrows: 'Arrows' },
        alerts: { loadError: 'Failed to load board', error: 'Error' }
    }
};

const dpLocales = {
    ru: {
        months: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
        monthsGenitive: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
        days: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
        time: 'Время'
    },
    en: {
        months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
        monthsGenitive: ['January','February','March','April','May','June','July','August','September','October','November','December'],
        days: ['Mo','Tu','We','Th','Fr','Sa','Su'],
        time: 'Time'
    }
};

let toastTimeout;
window.showToast = (title, message, isError = false) => {
    const toast = document.getElementById('app-toast');
    if (!toast) return;

    const titleEl = document.getElementById('app-toast-title');
    const msgEl = document.getElementById('app-toast-message');
    const iconEl = document.querySelector('.app-toast-icon');

    titleEl.textContent = title;
    msgEl.textContent = message;

    if (isError) {
        iconEl.style.color = '#D35446';
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
        iconEl.style.color = 'var(--success-done)';
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    }

    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
};

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

let currentLang = 'ru';
let activeConfirmResolve = null; 
let activeDetachResolve = null;

function showDetachModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('detach-modal');
        activeDetachResolve = resolve;
        modal.classList.add('show');
    });
}

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

    if (saveToBackend && document.startViewTransition) {
        document.startViewTransition(updateDOM);
    } else {
        updateDOM();
    }
}

function renderMarkdownProgressively(text, container, onComplete) {
    window.isRenderingMarkdown = true;

    const fullHtml = parseMarkdownWithMath(text);
    
    if (text.length < 5000) {
        container.innerHTML = fullHtml;
        enhanceCodeBlocks(container);
        window.isRenderingMarkdown = false;
        if (onComplete) onComplete();
        return;
    }

    // 🌟 ФИКС: Используем visibility: hidden. 
    // Браузер высчитает высоту для скролла, но не нарисует текст на экране.
    container.style.visibility = 'hidden'; 
    container.innerHTML = fullHtml;
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            // 1. Применяем скролл (он вызовется внутри onComplete) ДО отрисовки
            if (onComplete) onComplete();
            
            // 2. Делаем текст видимым - он появится мгновенно на нужном месте
            container.style.visibility = '';
            enhanceCodeBlocks(container);
            window.isRenderingMarkdown = false;
        });
    });
}

function formatExactTime(seconds) {
    if (!seconds) return "00:00:00";
    
    const MAX_SECONDS = 31536000000;
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

    const timeMatch = input.match(/(?:^|\s)(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\s|$)/);
    if (timeMatch) {
        seconds += parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60;
        if (timeMatch[3]) seconds += parseInt(timeMatch[3]);
        matchedAny = true;
    }

    const matchUnit = (regex, multiplier) => {
        const match = input.match(regex);
        if (match) {
            seconds += parseFloat(match[1]) * multiplier;
            matchedAny = true;
        }
    };

    matchUnit(/(\d+(?:\.\d+)?)\s*(y|л|год|лет|года)/, 31536000);
    matchUnit(/(\d+(?:\.\d+)?)\s*(mo|мес)/, 2592000);
    matchUnit(/(\d+(?:\.\d+)?)\s*(w|н|нед)/, 604800);
    matchUnit(/(\d+(?:\.\d+)?)\s*(d|д|день|дней|дня)/, 86400);
    matchUnit(/(\d+(?:\.\d+)?)\s*(h|ч|hour|час|часов|часа)/, 3600);
    matchUnit(/(\d+(?:\.\d+)?)\s*(m(?!o)|м|min|мин)/, 60);
    matchUnit(/(\d+(?:\.\d+)?)\s*(s|с|sec|сек)/, 1);

    const MAX_SECONDS = 31536000000;

    if (matchedAny) return Math.min(Math.floor(seconds), MAX_SECONDS);

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

async function saveWorkspacesOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/workspaces/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}

async function triggerGarbageCollector() {
    try {
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
    const res = await fetch(`${API_BASE}/system/vault?t=${Date.now()}`, {
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });
    if (!res.ok) throw new Error('Error fetch vault');
    return res.json();
}

async function switchVault() {
    if (!window.pywebview || !window.pywebview.api) {
        throw new Error("Native API not ready");
    }

    const selectedPath = await window.pywebview.api.choose_directory();
    
    if (!selectedPath) {
        return { canceled: true };
    }

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

        span.dataset.fullTitle = name;
        
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

function formatShortDate(isoString) {
    if (!isoString) return '';
    let dateStr = isoString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) dateStr += 'Z';
    const date = new Date(dateStr);
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleDateString(currentLang, options).replace(' г.', '');
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
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP Error ${res.status}`);
    }
    return res.json();
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
    const res = await fetch(`${API_BASE}/system/settings?t=${Date.now()}`, {
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });
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
function unescapeHtml(html) { const div = document.createElement('div'); div.innerHTML = html; return div.textContent; }

function applyTextExpansion() {
    const renderDiv = document.getElementById('task-desc-render');
    // 🚀 Исключили inputArea, textarea больше не будет динамически растягиваться и лагать
    if (!renderDiv) return;
    
    // Ищем самую широкую кастомную картинку
    const images = renderDiv.querySelectorAll('.image-resizer-wrapper.has-custom-size');
    let maxWidth = 0;
    images.forEach(img => {
        const w = parseInt(img.style.width);
        if (w > maxWidth) maxWidth = w;
    });
    
    // Расширяем минимальную ширину ТОЛЬКО в режиме чтения
    if (maxWidth > 0) {
        renderDiv.style.minWidth = (maxWidth + 24) + 'px';
    } else {
        renderDiv.style.minWidth = '100%';
    }
}

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
        if (window.updateBoardScrollbar) window.updateBoardScrollbar();
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

    if (task.due_date) {
        const dateStr = task.due_date + (task.due_date.endsWith('Z') || task.due_date.includes('+') ? '' : 'Z');
        const isOverdue = !task.completed_at && new Date(dateStr) < new Date();
        const overdueClass = isOverdue ? 'overdue' : '';
        const icon = isOverdue
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4.42 0-8-3.58-8-8 0-3.1 1.76-5.8 4.36-7.14.33-.17.7-.06.88.24.41.69 1.05 1.34 1.7 1.15.65-.19.96-1.55 1.4-3.13C12.8 3.42 13.5 2 14.5 2c.28 0 .54.12.72.32 1.41 1.6 3.1 3.96 4.13 6.08C20.44 10.64 20 12.3 20 14c0 4.42-3.58 8-8 8z"></path></svg>';
        
        newContent += `<div class="due-date-pill ${overdueClass}">${icon}<span>${formatShortDate(task.due_date)}</span></div>`;
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

    // 2. Срок выполнения (Due Date)
    let dueDateHtml = '';
    if (task.due_date) {
        const dateStr = task.due_date + (task.due_date.endsWith('Z') || task.due_date.includes('+') ? '' : 'Z');
        const isOverdue = !task.completed_at && new Date(dateStr) < new Date();
        const overdueClass = isOverdue ? 'overdue' : '';
        const icon = isOverdue
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4.42 0-8-3.58-8-8 0-3.1 1.76-5.8 4.36-7.14.33-.17.7-.06.88.24.41.69 1.05 1.34 1.7 1.15.65-.19.96-1.55 1.4-3.13C12.8 3.42 13.5 2 14.5 2c.28 0 .54.12.72.32 1.41 1.6 3.1 3.96 4.13 6.08C20.44 10.64 20 12.3 20 14c0 4.42-3.58 8-8 8z"></path></svg>';
        dueDateHtml = `<div class="due-date-pill ${overdueClass}">${icon}<span>${formatShortDate(task.due_date)}</span></div>`;
    }

    // 3. Таймер (активный или остановленный)
    let timerHtml = '';
    if (columnMode === 'track_time') {
        const displayTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        timerHtml = `<div class="card-timer" data-task-id="${task.id}">${displayTime}</div>`;
    }

    // 4. Затраченное время (Completion)
    let spentTimeHtml = '';
    if (columnMode === 'completion' && task.total_time_spent !== undefined) {
        spentTimeHtml = `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
        if (task.total_time_spent === 0) extraClasses.push('has-unknown-time');
    } 

    let footerHtml = '';
    if (checklistHtml || dueDateHtml || timerHtml || spentTimeHtml) {
        footerHtml = `<div class="card-footer">${checklistHtml}${dueDateHtml}${timerHtml}${spentTimeHtml}</div>`;
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
            <!-- Инлайн триггер создания новой карточки под текущей -->
            <div class="card-inline-trigger">
                <button class="divider-plus-btn">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>
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
    
    // Рендерим карточки. Каждый инлайн-триггер находится строго внизу карточки.
    let tasksHtml = '';
    sortedTasks.forEach((task) => {
        tasksHtml += generateCardHtml(task, column.mode);
    });

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

function createCardFormElement() {
    const card = document.createElement('div');
    card.className = 'card card-entering';
    const placeholder = t('prompts.taskTitle').replace(/:$/, '');
    card.innerHTML = `
        <div class="card-input-wrapper">
            <textarea 
                class="card-input" 
                placeholder="${placeholder}" 
                autocomplete="off"
                spellcheck="false"
                rows="1"
            ></textarea>
        </div>
    `;
    return card;
}

async function onAddCardInline(plusBtn) {
    const trigger = plusBtn.closest('.card-inline-trigger');
    const cardEl = trigger.closest('.card');
    const columnEl = cardEl.closest('.column');
    const columnId = parseInt(columnEl.dataset.columnId);
    const colState = state.columns.find(c => c.id === columnId);

    if (columnEl.dataset.ignoreNextAdd === 'true') return;

    // Синхронно и чисто закрываем все открытые формы на доске перед созданием новой
    closeAllOpenCardForms();

    columnEl.setAttribute('draggable', 'false');

    const formCard = createCardFormElement();
    
    // Вставляем форму строго под целевой карточкой (между текущей и следующей)
    cardEl.after(formCard);

    // Плавная анимация появления формы
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            formCard.classList.add('entered');
        });
    });

    const input = formCard.querySelector('.card-input');
    const autoResize = () => {
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
        const maxHeight = 120;
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

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;

        columnEl.setAttribute('draggable', 'true');
        input.blur();

        if (!animate) {
            formCard.remove();
            return;
        }

        formCard.classList.remove('entered');
        formCard.classList.add('is-exiting');

        const onTransitionEnd = (e) => {
            // Строго реагируем только на саму карточку (отсекаем всплытие от инпута)
            if (e.target === formCard && (e.propertyName === 'margin-top' || e.propertyName === 'grid-template-rows')) {
                formCard.remove();
                formCard.removeEventListener('transitionend', onTransitionEnd);
            }
        };
        formCard.addEventListener('transitionend', onTransitionEnd);
        // Страховочный таймаут (120ms анимация CSS + 10ms запас)
        setTimeout(() => { if (formCard.parentNode) formCard.remove(); }, 130);
    };

    formCard.cancelInline = cancel; // Сохраняем деструктор в DOM-элементе для вызова извне

    const submit = async () => {
        const title = input.value.trim();
        if (!title) {
            cancel(true);
            return;
        }

        if (title.length > 200) {
            formCard.classList.remove('is-error');
            void formCard.offsetWidth;
            formCard.classList.add('is-error');
            setTimeout(() => formCard.classList.remove('is-error'), 400);
            input.focus();
            return;
        }

        if (isResolved) return;
        isResolved = true;

        columnEl.setAttribute('draggable', 'true');
        input.disabled = true;
        formCard.classList.add('is-submitting');

        // ВЫЧИСЛЯЕМ МАТЕМАТИЧЕСКУЮ ПОЗИЦИЮ (Ювелирная точность)
        let nextPosition = null;
        let prevPosition = null;
        
        const currentCardId = parseInt(cardEl.dataset.cardId);
        const currentTask = colState.tasks.find(t => t.id === currentCardId);
        
        prevPosition = currentTask.position;
        // Ищем карточку, следующую за формой (пропускаем саму форму)
        const nextCardEl = cardEl.nextElementSibling;
        if (nextCardEl && nextCardEl.classList.contains('card') && !nextCardEl.classList.contains('card-entering')) {
            const nextCardId = parseInt(nextCardEl.dataset.cardId);
            const nextTask = colState.tasks.find(t => t.id === nextCardId);
            if (nextTask) nextPosition = nextTask.position;
        }
        
        let targetPosition = 0;
        if (prevPosition !== null && nextPosition !== null) {
            targetPosition = (prevPosition + nextPosition) / 2;
        } else if (prevPosition !== null) {
            targetPosition = prevPosition + 1.0;
        } else if (nextPosition !== null) {
            targetPosition = nextPosition - 1.0;
        } else {
            targetPosition = 1.0;
        }

        try {
            // Отправляем на бэкенд с указанием высчитанной позиции
            const res = await fetch(`${API_BASE}/tasks/`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    title, 
                    column_id: columnId,
                    position: targetPosition
                }) 
            });
            if (!res.ok) throw new Error('Create failed');
            const newTask = await res.json();

            // Интегрируем в стейт и сортируем массив, чтобы сохранить математическую гармонию
            colState.tasks.push(newTask);
            colState.tasks.sort((a, b) => a.position - b.position);

            // Создаем настоящую красивую карточку
            const realCardStr = generateCardHtml(newTask, colState.mode);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = realCardStr.trim();
            const realCard = tempDiv.firstChild;
            
            realCard.classList.add('card-birth');

            // Заменяем форму на карточку
            formCard.replaceWith(realCard);
            updateColumnCount(columnEl);

            // Плавное рождение карточки из прозрачности
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
            console.error('Task creation inline failed:', err);
            isResolved = false;
            input.disabled = false;
            formCard.classList.remove('is-submitting');
            formCard.classList.add('is-error');
            setTimeout(() => formCard.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(true); }
    });

    // Полностью изолируем события мыши на инпуте от перетаскивания доски
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousemove', (e) => e.stopPropagation());
    input.addEventListener('touchstart', (e) => e.stopPropagation());

    input.addEventListener('blur', () => {
        if (isResolved) return;
        requestAnimationFrame(() => {
            if (isResolved) return;
            if (input.value.trim()) {
                submit();
            } else {
                cancel(true);
            }
        });
    });
}

// Новая анимированная функция добавления задачи
async function onAddTask(columnId) {
    const columnEl = document.querySelector(`.column[data-column-id="${columnId}"]`);
    if (!columnEl) return;

    // Игнорируем вызов, если только что закрыли пустую форму кликом по этой же кнопке
    if (columnEl.dataset.ignoreNextAdd === 'true') return;

    // Закрываем формы во всех других колонках на доске, кроме текущей
    closeAllOpenCardForms(columnId);

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
            // Плавно удерживаем растущую форму у нижнего края списка на всё время
            // анимации раскрытия — она видна целиком с первого кадра и не дёргается
            const pinStart = performance.now();
            const pinToBottom = () => {
                if (!formCard.isConnected) return;
                cardList.scrollTop = cardList.scrollHeight;
                if (performance.now() - pinStart < 260) requestAnimationFrame(pinToBottom);
            };
            pinToBottom();
        });
    });

    const input = formCard.querySelector('.card-input');
    
    // Автоматическое изменение высоты textarea (Фикс вылетающего курсора и скролла)
    const autoResize = () => {
        // Идеальная математика высоты для border-box без скачков
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
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
            // Строго реагируем только на саму карточку (отсекаем всплытие от инпута)
            if (e.target === formCard && (e.propertyName === 'margin-top' || e.propertyName === 'grid-template-rows')) {
                formCard.remove();
                formCard.removeEventListener('transitionend', onTransitionEnd);
            }
        };
        formCard.addEventListener('transitionend', onTransitionEnd);
        // Страховочный таймаут (120ms анимация CSS + 10ms запас)
        setTimeout(() => { if (formCard.parentNode) formCard.remove(); }, 130);
    };

    formCard.cancelInline = cancel; // Сохраняем деструктор в DOM-элементе для вызова извне

    const submit = async (reopen = false) => {
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

            // ⚡ После Enter сразу открываем новую форму создания карточки (в фокусе)
            if (reopen) {
                onAddTask(columnId);
            }

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
        if (e.key === 'Enter') { e.preventDefault(); submit(true); }
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
            ></textarea>
        </div>
    `;
    return col;
}

// Вспомогательная функция для синхронного закрытия всех открытых форм создания карточек на доске
function closeAllOpenCardForms(excludeColumnId = null) {
    document.querySelectorAll('.card-entering').forEach(form => {
        const col = form.closest('.column');
        const colId = col ? parseInt(col.dataset.columnId) : null;
        if (excludeColumnId && colId === excludeColumnId) {
            return; // Пропускаем формы в целевой колонке при нажатии нижней кнопки добавления
        }
        if (typeof form.cancelInline === 'function') {
            form.cancelInline(false); // Закрываем мгновенно и без анимации, переводя статус в resolved
        } else {
            form.remove();
        }
    });
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
        // Идеальная математика высоты для border-box без скачков
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
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
    
    // ФИКС: Вызываем замер scrollHeight на следующем кадре, 
    // когда CSS (паддинги и line-height) уже гарантированно применены к DOM-узлу
    requestAnimationFrame(() => {
        autoResize();
    });

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
    
    // Закрываем меню напоминаний
    const bellTrigger = document.getElementById('reminders-bell-trigger');
    if (bellTrigger) bellTrigger.classList.remove('active');
    
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
            window.showToast(t('alerts.error'), 'Не удалось очистить колонку', true);
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
            window.showToast(t('alerts.error'), 'Не удалось удалить колонку', true);
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
        // Идеальная математика высоты для border-box без скачков
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
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
                // OPTIMISTIC UI: Мгновенно меняем название подзадачи в открытой модалке (если есть)
                const subtaskTitleEl = document.querySelector(`.subtask-item[data-subtask-id="${task.id}"] .subtask-title`);
                if (subtaskTitleEl) {
                    subtaskTitleEl.textContent = newTitle;
                }

                await updateTask(task.id, { title: newTitle });
                task.title = newTitle;
            } catch (_) {
                cardEl.classList.add('is-error');
                const div = cardEl.querySelector('.card-title');
                if (div) div.textContent = task.title;
                
                // Откат в модалке при ошибке
                const subtaskTitleEl = document.querySelector(`.subtask-item[data-subtask-id="${task.id}"] .subtask-title`);
                if (subtaskTitleEl) {
                    subtaskTitleEl.textContent = task.title;
                }
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
                // OPTIMISTIC UI: Мгновенно обновляем название на самой доске
                const boardCardTitle = document.querySelector(`.card[data-card-id="${taskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.textContent = newTitle;
                }

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
                refreshBoard(); // Обновляем доску в фоне для полной синхронизации
                
                // Обновляем графовые крошки внутри модалки
                renderGraphBreadcrumbs(taskId);
            } catch (e) {
                console.error("Ошибка при переименовании задачи", e);
                restore(originalTitle);
                
                // Откат изменений на доске при ошибке
                const boardCardTitle = document.querySelector(`.card[data-card-id="${taskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.textContent = originalTitle;
                }
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
        
        if (newTitle.length > 200) {
            if (!subtaskEl.querySelector('.card-error-hint')) {
                const hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');
                subtaskEl.appendChild(hint);
            }
            subtaskEl.classList.remove('is-error');
            void subtaskEl.offsetWidth;
            subtaskEl.classList.add('is-error');
            input.focus();
            return;
        }

        committed = true;
        const finalTitle = newTitle || originalTitle;
        restore(finalTitle);

        if (newTitle && newTitle !== originalTitle) {
            try {
                // 1. OPTIMISTIC UI: Мгновенно обновляем название на самой доске (если она вынесена)
                const boardCardTitle = document.querySelector(`.card[data-card-id="${subtaskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.textContent = newTitle;
                }

                // 2. Обновляем локальный стейт самой карточки на доске
                for (let col of state.columns) {
                    let t = col.tasks.find(taskItem => taskItem.id === subtaskId);
                    if (t) {
                        t.title = newTitle;
                        break;
                    }
                }

                // 3. Обновляем стейт подзадачи внутри родительской карточки (модалки)
                const modal = document.getElementById('task-modal');
                const parentTaskId = parseInt(modal.dataset.taskId);
                for (let col of state.columns) {
                    let parentTask = col.tasks.find(taskItem => taskItem.id === parentTaskId);
                    if (parentTask && parentTask.subtasks) {
                        let subtaskObj = parentTask.subtasks.find(s => s.id === subtaskId);
                        if (subtaskObj) {
                            subtaskObj.title = newTitle;
                        }
                        break;
                    }
                }

                // 4. Отправляем на бэкенд
                await updateTask(subtaskId, { title: newTitle });
                
                // 5. Синхронизируем интерфейс в фоне
                refreshBoard(); 
            } catch (e) {
                console.error("Ошибка при переименовании подзадачи", e);
                restore(originalTitle);
                
                // Откат изменений на доске при ошибке сети
                const boardCardTitle = document.querySelector(`.card[data-card-id="${subtaskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.textContent = originalTitle;
                }
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
    if (e.target.closest('button, input, textarea, .menu-btn, .card-menu-btn, .tab-close-btn, .column.is-renaming, .board-tab.is-renaming, .card.is-renaming, .card-entering, .column-entering, .description-wrapper')) return;
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
    // Сворачиваем открытые выпадающие списки и убираем фокус с поиска перед началом перетаскивания
    closeAllDropdowns();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

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

                // Отдача при наведении на заголовок вкладки (пересечение физического барьера)
                if (window.pywebview && window.pywebview.api && window.pywebview.api.trigger_haptic) {
                    window.pywebview.api.trigger_haptic();
                }

                tabSwitchTimeout = setTimeout(async () => {
                    await switchToWorkspaceDuringDrag(tabId);
                }, 600); 
            }
        } else {
            clearTimeout(tabSwitchTimeout);
            pendingSwitchTabId = null;
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

    // Отдача при успешном фоновом переключении активной вкладки под курсором
    if (window.pywebview && window.pywebview.api && window.pywebview.api.trigger_haptic) {
        window.pywebview.api.trigger_haptic();
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

            try { 
                await saveColumnsOrder(orderedIds); 
                
                // 🔥 ФИКС КРОСС-ВКЛАДОЧНОГО ЗАЛИПАНИЯ КОЛОНОК:
                // При переносе колонки в другую вкладку её DOM-элемент вставляется на новую доску,
                // но локальный стейт (state.columns) о ней не знает, так как вкладка загрузилась ДО переноса.
                // Бесшумно запрашиваем обновленные данные, чтобы восстановить интерактивность (разворачивание, карточки и т.д.)
                if (state.activeWorkspaceId !== originalWorkspaceId) {
                    const freshColumns = await fetchColumns(state.activeWorkspaceId);
                    state.columns = freshColumns.map(c => ({ ...c, collapsed: c.collapsed || false }));
                }
            } catch (e) { console.error("Ошибка сохранения порядка колонок", e); }
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

                        // Синхронизация прогресса подзадач на родительской карточке
                        if (updatedTask.parent_ids && updatedTask.parent_ids.length > 0) {
                            updatedTask.parent_ids.forEach(parentId => {
                                let parentTask = null;
                                let parentCol = null;
                                
                                for (const col of state.columns) {
                                    parentTask = col.tasks.find(t => t.id === parentId);
                                    if (parentTask) {
                                        parentCol = col;
                                        break;
                                    }
                                }

                                if (parentTask && parentTask.subtasks) {
                                    const subtask = parentTask.subtasks.find(s => s.id === taskId);
                                    if (subtask) {
                                        subtask.completed_at = updatedTask.completed_at;
                                    }
                                    
                                    const parentCardEl = document.querySelector(`.card[data-card-id="${parentId}"]`);
                                    if (parentCardEl && parentCol) {
                                        updateCardAppearance(parentCardEl, parentTask, parentCol.mode);
                                    }
                                }
                            });
                        }
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
            updateTask(taskId, { parent_ids: [], is_visible_on_board: true }).then(() => {
                bumpModalUpdatedDate();
                refreshBoard(); // Карточка моментально появится на доске
                
                // Перерисовываем пути с сервера (теперь это будет просто пустой граф)
                renderGraphBreadcrumbs(taskId);
            });
        } catch (err) {
            console.error("Ошибка отвязки из модалки:", err);
            detachModalBtn.style.display = 'flex';
        }
        return;
    }

    // ПОИСК ИЗ МОДАЛКИ КАРТОЧКИ
    const searchModalBtn = target.closest('.modal-search');
    if (searchModalBtn) {
        e.stopPropagation();
        if (window.openLocalSearch) window.openLocalSearch();
        return;
    }

    // ЭКСПОРТ ИЗ МОДАЛКИ КАРТОЧКИ
    const exportModalBtn = target.closest('.modal-export');
    if (exportModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
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
            
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
                const exportDir = await window.pywebview.api.choose_directory();
                if (exportDir) {
                    exportModalBtn.style.opacity = '0.5'; // Эффект загрузки на иконке кнопки экспорта
                    fetch(`${API_BASE}/tasks/${taskId}/export`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ export_path: exportDir, include_attachments: includeAtt })
                    }).then(res => {
                        exportModalBtn.style.opacity = '1';
                        if (!res.ok) {
                            window.showToast(t('alerts.error'), 'Ошибка при экспорте', true);
                        } else {
                            window.showToast('Экспорт завершён', 'Карточка успешно сохранена');
                        }
                    }).catch(err => {
                        exportModalBtn.style.opacity = '1';
                        console.error(err);
                        window.showToast(t('alerts.error'), 'Сетевая ошибка при экспорте', true);
                    });
                }
            } else {
                window.showToast(t('alerts.error'), 'Экспорт работает только в десктопном приложении Doe', true);
            }
        };
        return;
    }

    // УВЕДОМЛЕНИЕ ИЗ МОДАЛКИ КАРТОЧКИ
    const notifyModalBtn = target.closest('.modal-notify');
    if (notifyModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
        
        // Бронебойное чтение заголовка (учитывает режим редактирования)
        const titleNode = document.getElementById('task-modal-title') || document.querySelector('.task-modal-title-input');
        const taskTitle = (titleNode.value !== undefined ? titleNode.value : titleNode.textContent).trim();
        
        openNotifyModal(taskId, taskTitle);
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
    
    // ОБРАБОТКА КНОПОК УМНОЙ ОТВЯЗКИ
    if (target.closest('[data-action="detach-cancel"]')) {
        if (activeDetachResolve) { activeDetachResolve(null); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="detach-current"]')) {
        if (activeDetachResolve) { activeDetachResolve('current'); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="detach-all"]')) {
        if (activeDetachResolve) { activeDetachResolve('all'); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }

    // ОТКРЫТИЕ МЕНЮ НАПОМИНАНИЙ (Колокольчик)
    const bellTrigger = target.closest('#reminders-bell-trigger');
    if (bellTrigger) {
        e.stopPropagation();
        const menu = document.getElementById('reminders-dropdown');
        const isShowing = menu.classList.contains('show');
        closeAllDropdowns();
        if (!isShowing) {
            menu.classList.add('show');
            bellTrigger.classList.add('active');
            renderRemindersDropdown(); // Загружаем список при открытии
        }
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

            // Высоту меню и границы окна читаем КАЖДЫЙ кадр — поэтому при ресайзе
            // окна меню само пересчитывает позицию и плавно «отпускает» обратно вниз
            const margin = 12;
            const menuHeight = globalMenu.offsetHeight;

            // По умолчанию равняем по верху карточки
            let top = cardRect.top;

            // Если меню не влезает по низу окна — приподнимаем вверх ровно настолько,
            // чтобы оно поместилось целиком
            const maxTop = window.innerHeight - menuHeight - margin;
            if (top > maxTop) top = maxTop;

            // И не даём уехать выше верхнего края
            if (top < margin) top = margin;

            globalMenu.style.top = `${top}px`;
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
                    
                    loadTaskIntoModal(taskId, true); 
                    
                    document.getElementById('task-modal').classList.add('show');
                }
                else if (action === 'delete-card') {
                    // Запускаем красивое удаление (Клон + Spacer) мгновенно для кликнутой карточки
                    animateCardDeletion(cardEl);
                    
                    // Вычищаем из локального стейта до ответа сервера (optimistic UI)
                    for (let col of state.columns) {
                        // 1. Удаляем саму карточку из списка
                        col.tasks = col.tasks.filter(t => t.id !== taskId);
                        
                        // 2. Ищем, не была ли эта карточка подзадачей в других карточках
                        col.tasks.forEach(parentTask => {
                            if (parentTask.subtasks) {
                                const originalLength = parentTask.subtasks.length;
                                parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== taskId);
                                
                                // Если удалили из чек-листа — мгновенно обновляем пилюлю на родительской карточке
                                if (parentTask.subtasks.length !== originalLength) {
                                    const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                                    if (parentCardEl) {
                                        updateCardAppearance(parentCardEl, parentTask, col.mode);
                                    }
                                    // Если родитель сейчас открыт в модалке - обновляем счетчик
                                    const modal = document.getElementById('task-modal');
                                    if (modal && modal.classList.contains('show') && parseInt(modal.dataset.taskId) === parentTask.id) {
                                        const countEl = document.getElementById('subtasks-count');
                                        if (countEl) countEl.textContent = parentTask.subtasks.length;
                                    }
                                }
                            }
                        });
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
                                
                                // Подчищаем каскадно удаленные задачи из чужих чек-листов
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
                        
                        // Оптимистичный UI успешно отработал, полная перерисовка доски больше не нужна!
                    }).catch(err => { 
                        console.error(err); 
                        refreshBoard(); // Оставляем refreshBoard ТОЛЬКО при ошибке сервера для отката сломанного UI
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

                        // Senior UX: Копируем и мгновенно закрываем меню без опасных таймеров
                        closeAllDropdowns();
                        return;
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
                                    if (!res.ok) {
                                        window.showToast(t('alerts.error'), 'Ошибка при экспорте', true);
                                    } else {
                                        window.showToast('Экспорт завершён', 'Карточка успешно сохранена');
                                    }
                                }).catch(err => {
                                    console.error(err);
                                    window.showToast(t('alerts.error'), 'Сетевая ошибка при экспорте', true);
                                });
                            }
                        };
                    } else {
                        window.showToast(t('alerts.error'), 'Экспорт работает только в десктопном приложении Doe', true);
                    }
                }
                else if (action === 'notify-card') {
                    // Бронебойное чтение заголовка (учитывает режим редактирования)
                    const titleNode = cardEl.querySelector('.card-title') || cardEl.querySelector('.card-title-input');
                    const taskTitle = (titleNode.value !== undefined ? titleNode.value : titleNode.textContent).trim();
                    
                    openNotifyModal(taskId, taskTitle);
                }
                else if (action === 'set-due-date') {
                    // Берем задачу из стейта, чтобы пробросить её текущую дату, если есть
                    const task = state.columns.find(c => c.id === parseInt(colEl.dataset.columnId))?.tasks.find(t => t.id === taskId);
                    openDueDateModal(taskId, task?.due_date);
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
    const modalCloseBtn = target.closest('.modal-close');
    const isOverlayClick = target.classList.contains('modal-overlay');

    if (modalCloseBtn || isOverlayClick) {
        // Определяем, какую именно модалку нужно закрыть
        const modalToClose = modalCloseBtn ? modalCloseBtn.closest('.modal-overlay') : target;
        
        if (!modalToClose) return;

        // 🔥 ФИКС: Если кликнули по серому фону (overlay) именно главной карточки — ничего не закрываем.
        if (modalToClose.id === 'task-modal' && isOverlayClick) {
            return; 
        }

        if (activeConfirmResolve && modalToClose.id === 'confirm-modal') {
            activeConfirmResolve(false);
            activeConfirmResolve = null;
        }
        if (activeDetachResolve && modalToClose.id === 'detach-modal') {
            activeDetachResolve(null);
            activeDetachResolve = null;
        }
        
        // --- СБРОС ГЕОМЕТРИИ И СОХРАНЕНИЕ ПРИ ЗАКРЫТИИ ГЛАВНОЙ КАРТОЧКИ ---
        if (modalToClose.id === 'task-modal') {
            if (window.closeLocalSearch) window.closeLocalSearch();
            
            document.getElementById('modal-tools-wrapper')?.classList.remove('expanded');
            triggerGarbageCollector();

            // 🌟 СОХРАНЯЕМ СКРОЛЛ РЕЖИМА ЧТЕНИЯ ПЕРЕД ЗАКРЫТИЕМ
            const taskId = parseInt(modalToClose.dataset.taskId);
            const renderDiv = document.getElementById('task-desc-render');
            const detailBody = document.querySelector('.task-detail-body');
            for (let col of state.columns) {
                let t = col.tasks.find(t => t.id === taskId);
                if (t) {
                    if (renderDiv.style.display !== 'none') {
                        t._readScrollTop = renderDiv.scrollTop;
                        if (detailBody) t._modalScrollTop = detailBody.scrollTop;
                    }
                    break;
                }
            }
            
            const card = modalToClose.querySelector('.task-detail-card');
            const maximizeBtn = modalToClose.querySelector('.modal-maximize');
            
            if (card) {
                if(maximizeBtn) {
                    maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 6 18 6 18 10"></polyline><polyline points="10 18 6 18 6 14"></polyline><line x1="18" y1="6" x2="13" y2="11"></line><line x1="6" y1="18" x2="11" y2="13"></line></svg>`;
                }

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
                    
                    void card.offsetWidth; 
                    card.style.transition = '';

                    if (renderDiv) renderDiv.innerHTML = '';
                    
                    const subtasksList = document.getElementById('subtasks-list');
                    if (subtasksList) subtasksList.innerHTML = '';
                    
                    const attachmentsList = document.getElementById('attachments-list');
                    if (attachmentsList) attachmentsList.innerHTML = '';
                    
                    const breadcrumbs = document.getElementById('task-breadcrumbs');
                    if (breadcrumbs) breadcrumbs.innerHTML = '';
                }, 300);
            }
        }

        // 🔥 ГЛАВНЫЙ ФИКС: Закрываем ТОЛЬКО ту модалку, с которой мы взаимодействовали
        modalToClose.classList.remove('show');
    }

    // === ЛОГИКА ПАНЕЛИ ИНСТРУМЕНТОВ В КАРТОЧКЕ ===
    const toolsTrigger = target.closest('.modal-tools-trigger');
    const toolsWrapper = document.getElementById('modal-tools-wrapper');
    if (toolsTrigger) {
        e.stopPropagation();
        toolsWrapper.classList.toggle('expanded');
        return;
    }
    // Закрываем панель инструментов при клике мимо неё
    if (toolsWrapper && toolsWrapper.classList.contains('expanded') && !target.closest('.modal-tools-wrapper')) {
        toolsWrapper.classList.remove('expanded');
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
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return;

    const regexWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${regexWords.join('|')})`, 'gi');

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const nodesToProcess = [];
    
    let node;
    while (node = walker.nextNode()) {
        const parent = node.parentNode;
        if (['CODE', 'MARK', 'TEXTAREA', 'PRE', 'SCRIPT', 'STYLE'].includes(parent.tagName)) continue;
        if (parent.classList.contains('search-highlight')) continue;
        if (regex.test(node.nodeValue)) {
            nodesToProcess.push(node);
        }
    }

    nodesToProcess.forEach(textNode => {
        const parent = textNode.parentNode;
        if (!parent) return;

        const content = textNode.nodeValue;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        content.replace(regex, (match, p1, offset) => {
            fragment.appendChild(document.createTextNode(content.substring(lastIndex, offset)));
            const span = document.createElement('span');
            span.className = 'search-highlight';
            span.textContent = match;
            fragment.appendChild(span);
            lastIndex = offset + match.length;
        });

        fragment.appendChild(document.createTextNode(content.substring(lastIndex)));
        parent.replaceChild(fragment, textNode);
    });

    const highlights = container.querySelectorAll('.search-highlight');
    if (highlights.length === 0) return;

    // 🔥 АВТО-СКРОЛЛ К ПЕРВОМУ РЕЗУЛЬТАТУ ПОИСКА И РАЗВОРАЧИВАНИЕ
    setTimeout(() => {
        if (container.id === 'task-desc-render') {
            const firstMatch = highlights[0];
            if (firstMatch) {
                // 1. Умное разворачивание всех родительских H1-H6, если текст был скрыт
                let block = firstMatch.closest('p, ul, ol, pre, blockquote, h1, h2, h3, h4, h5, h6, div, span');
                if (block) {
                    let prev = block.previousElementSibling;
                    while (prev && block.classList.contains('is-hidden-by-fold')) {
                        if (prev.tagName.match(/^H[1-6]$/) && prev.classList.contains('is-folded')) {
                            prev.click(); // Имитируем клик для разворачивания
                        }
                        prev = prev.previousElementSibling;
                    }
                }

                // 2. Скроллим внутренний контейнер текста (markdown-body)
                const mdBody = firstMatch.closest('.markdown-body');
                if (mdBody) {
                    const rect = firstMatch.getBoundingClientRect();
                    const containerRect = mdBody.getBoundingClientRect();
                    const relativeTop = rect.top - containerRect.top + mdBody.scrollTop;
                    mdBody.scrollTo({
                        top: relativeTop - (containerRect.height / 2),
                        behavior: 'smooth'
                    });
                }

                // 3. Скроллим внешнюю модалку (task-detail-body)
                const scrollParent = document.querySelector('.task-detail-body');
                if (scrollParent) {
                    setTimeout(() => {
                        const rect = firstMatch.getBoundingClientRect();
                        const parentRect = scrollParent.getBoundingClientRect();
                        if (rect.top < parentRect.top + 50 || rect.bottom > parentRect.bottom - 50) {
                            const relativeTop = rect.top - parentRect.top + scrollParent.scrollTop;
                            scrollParent.scrollTo({
                                top: relativeTop - (parentRect.height / 2),
                                behavior: 'smooth'
                            });
                        }
                    }, 50);
                }
            }
        }
    }, 50);

    setTimeout(() => {
        highlights.forEach(h => {
            if (h.parentNode) {
                h.style.backgroundColor = 'transparent';
                h.style.color = 'inherit';
                setTimeout(() => {
                    if (h.parentNode) {
                        const txt = document.createTextNode(h.textContent);
                        h.parentNode.replaceChild(txt, h);
                        container.normalize();
                    }
                }, 550);
            }
        });
    }, 2000);
}

async function loadTaskIntoModal(taskId, pushToStack = true, highlightQuery = null) {
    try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (!res.ok) return;
        const task = await res.json();

        // 🌟 ИЩЕМ ЛОКАЛЬНУЮ ВЕРСИЮ ЗАДАЧИ, ЧТОБЫ ДОСТАТЬ СОХРАНЕННЫЙ СКРОЛЛ
        let localTask = null;
        for (let col of state.columns) {
            localTask = col.tasks.find(t => t.id === taskId);
            if (localTask) break;
        }

        const modal = document.getElementById('task-modal');
        const titleEl = document.getElementById('task-modal-title');
        const renderDiv = document.getElementById('task-desc-render');
        const inputArea = document.getElementById('task-desc-input');
        const subtasksList = document.getElementById('subtasks-list');
        const subtasksCount = document.getElementById('subtasks-count');
        const formContainer = document.getElementById('subtask-form-container');

        const descWrapper = document.querySelector('.description-wrapper');
        if (descWrapper) descWrapper.style.height = '';

        // 🚀 Сбрасываем позиции внутренних скроллов для "чистого" старта.
        const bodyEl = document.querySelector('.task-detail-body');
        if (bodyEl) bodyEl.scrollTop = 0;
        if (renderDiv) renderDiv.scrollTop = 0;
        if (inputArea) inputArea.scrollTop = 0;

        renderGraphBreadcrumbs(task.id);

        modal.dataset.taskId = task.id;
        modal.dataset.columnId = task.column_id;
        titleEl.textContent = task.title;
        
        const detachBtn = modal.querySelector('.modal-detach');
        if (detachBtn) {
            detachBtn.style.display = (task.parent_ids && task.parent_ids.length > 0) ? 'flex' : 'none';
            detachBtn.title = t('detachSubtask');
        }

        const datesMetaEl = document.getElementById('task-dates-meta');
        if (datesMetaEl) {
            const createdStr = formatDateTime(task.created_at);
            const updatedStr = formatDateTime(task.updated_at);
            datesMetaEl.innerHTML = `<div><span>${t('taskModal.created')}: ${createdStr}</span><span id="task-updated-text">${t('taskModal.updated')}: ${updatedStr}</span></div>`;
        }
        
        const modalDueDatePill = document.getElementById('modal-due-date');
        if (modalDueDatePill) {
            const flameIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4.42 0-8-3.58-8-8 0-3.1 1.76-5.8 4.36-7.14.33-.17.7-.06.88.24.41.69 1.05 1.34 1.7 1.15.65-.19.96-1.55 1.4-3.13C12.8 3.42 13.5 2 14.5 2c.28 0 .54.12.72.32 1.41 1.6 3.1 3.96 4.13 6.08C20.44 10.64 20 12.3 20 14c0 4.42-3.58 8-8 8z"></path></svg>';
            const warningIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
            
            if (task.due_date) {
                const dateStr = task.due_date + (task.due_date.endsWith('Z') || task.due_date.includes('+') ? '' : 'Z');
                const isOverdue = !task.completed_at && new Date(dateStr) < new Date();
                modalDueDatePill.classList.toggle('overdue', isOverdue);
                
                const icon = isOverdue ? warningIcon : flameIcon;
                modalDueDatePill.innerHTML = `${icon}<span>${formatShortDate(task.due_date)}</span>`;
            } else {
                modalDueDatePill.classList.remove('overdue');
                modalDueDatePill.innerHTML = `${flameIcon}<span data-i18n="modals.dueDateSet">${t('modals.dueDateSet')}</span>`;
            }
            
            const newDueDatePill = modalDueDatePill.cloneNode(true);
            modalDueDatePill.replaceWith(newDueDatePill);
            newDueDatePill.onclick = (e) => {
                e.stopPropagation();
                openDueDateModal(task.id, task.due_date);
            };
        }

        inputArea.value = task.description || "";
        if (typeof cmEditor !== 'undefined' && cmEditor) {
            cmEditor.setValue(task.description || "");
            cmEditor.getWrapperElement().style.display = 'none';
        }
        
        const attachmentsList = document.getElementById('attachments-list');
        const attachmentsCount = document.getElementById('attachments-count');
        
        if (task.description) {
            let extracted = extractAttachments(task.description, task.attachments_order || []);
            extracted = await enrichAttachments(extracted);
            
            attachmentsCount.textContent = extracted.length;
            attachmentsList.innerHTML = '';
            extracted.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));

            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
            let readModeText = task.description.replace(cleanRegex, '');
            
            renderMarkdownProgressively(readModeText, renderDiv, () => {
                if (highlightQuery) {
                    applyHighlight(renderDiv, highlightQuery);
                    applyHighlight(titleEl, highlightQuery);
                }
                initHeadingFolding(renderDiv, task.folded_headings || []);
                applyTextExpansion();

                // 🌟 БЕЗ ЗАДЕРЖЕК: Высота уже просчитана, скролл применится мгновенно до отрисовки
                if (localTask && localTask._readScrollTop !== undefined) {
                    renderDiv.scrollTop = localTask._readScrollTop;
                } else {
                    renderDiv.scrollTop = 0;
                }

                if (localTask && localTask._modalScrollTop !== undefined) {
                    const detailBody = document.querySelector('.task-detail-body');
                    if (detailBody) detailBody.scrollTop = localTask._modalScrollTop;
                }
            });

        } else {
            attachmentsCount.textContent = '0';
            attachmentsList.innerHTML = '';
            renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
            if (highlightQuery) applyHighlight(titleEl, highlightQuery);
        }
        
        renderDiv.style.display = 'block';

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
            
            // Привязка событий с передачей объекта задачи вместо простого ID
            bindSubtaskEvents(subItem, sub, task, parentMode);
            
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

// ФУНКЦИЯ 2: Рисует сложный граф путей сверху модалки (с лимитом 15 символов)
async function renderGraphBreadcrumbs(taskId) {
    const container = document.getElementById('task-breadcrumbs');
    container.innerHTML = '';
    
    try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/paths`);
        if (!res.ok) return;
        const paths = await res.json();
        
        if (paths.length === 0 || (paths.length === 1 && paths[0].length === 1)) {
            return;
        }

        let html = '<div class="task-graph-breadcrumbs">';
        paths.forEach(path => {
            html += '<div class="breadcrumb-path">';
            path.forEach((node, index) => {
                const isLast = index === path.length - 1;
                
                // Senior UI Truncate: лимит 15 символов
                const rawTitle = node.title || "";
                const displayTitle = rawTitle.length > 15 
                    ? rawTitle.substring(0, 14) + '…' 
                    : rawTitle;

                // Обертка node, чтобы карточка и её стрелочка не разрывались при переносе строки
                html += `<div class="breadcrumb-node">`;
                
                // Важно: записываем ОРИГИНАЛЬНЫЙ заголовок в data-full-title для тултипа (он уже подхватывается нашим initTooltip)
                html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" 
                               data-id="${node.id}" 
                               data-full-title="${escapeHtml(rawTitle)}">${escapeHtml(displayTitle)}</span>`;
                
                if (!isLast) {
                    html += '<span class="breadcrumb-separator"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></span>';
                }
                
                html += `</div>`;
            });
            html += '</div>';
        });
        html += '</div>';
        
        container.innerHTML = html;

        container.querySelectorAll('.breadcrumb-item:not(.active)').forEach(el => {
            el.onclick = () => {
                const id = parseInt(el.dataset.id);
                // Подтягиваем контекст задачи (workspace_id, column_id) и вызываем супер-роутер
                fetch(`${API_BASE}/tasks/${id}/context`)
                    .then(res => res.json())
                    .then(context => {
                        window.navigateToEntityGlobal(context.workspace_id, context.column_id, id, null, true);
                    })
                    .catch(err => {
                        console.error("Не удалось найти контекст задачи", err);
                        // Фолбэк на простое открытие
                        loadTaskIntoModal(id, true);
                    });
            };
        });
    } catch (e) {
        console.error("Failed to render graph breadcrumbs", e);
    }
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


function initBoardScrollbar() {
    const wrapper = document.getElementById('board-wrapper');
    const container = document.querySelector('.board-container');
    const scrollbar = document.getElementById('board-scrollbar');
    const thumb = document.getElementById('board-thumb');
    const board = document.getElementById('board');

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

        // Ширина дорожки = реальная ширина DOM-элемента скроллбара
        // (учитывает left:24px / right:24px из CSS)
        const trackWidth = scrollbar.clientWidth;
        const thumbWidth = Math.max(trackWidth * scrollRatio, 40); // минимум 40px
        thumb.style.width = `${thumbWidth}px`;

        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        let scrollPercent = container.scrollLeft / maxScrollLeft;

        // Защита от вылета при инерционном скролле macOS
        scrollPercent = Math.max(0, Math.min(1, scrollPercent));

        const maxThumbLeft = trackWidth - thumbWidth;
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
            }, 800);
        }
    }

    container.addEventListener('scroll', () => {
        updateThumb();
        showScrollbar();
    });

    wrapper.addEventListener('mouseenter', showScrollbar);
    wrapper.addEventListener('mouseleave', () => {
        if (!isDraggingThumb) {
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                scrollbar.classList.remove('visible');
            }, 400);
        }
    });

    window.addEventListener('resize', updateThumb);
    window.updateBoardScrollbar = updateThumb;

    // 🚀 Автоматическое обновление при изменении ширины доски
    // (добавление/удаление/сворачивание колонок, ресайз окна и т.д.)
    if (board && window.ResizeObserver) {
        const ro = new ResizeObserver(() => updateThumb());
        ro.observe(board);
    }

    // --- Перетаскивание ползунка мышкой ---
    thumb.addEventListener('mousedown', (e) => {
        isDraggingThumb = true;
        startX = e.clientX;
        startScrollLeft = container.scrollLeft;
        thumb.classList.add('is-dragging');
        document.body.style.userSelect = 'none';
        e.preventDefault();
        e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDraggingThumb) return;
        const deltaX = e.clientX - startX;

        const trackWidth = scrollbar.clientWidth;
        const scrollRatio = container.clientWidth / container.scrollWidth;
        const thumbWidth = Math.max(trackWidth * scrollRatio, 40);
        const maxThumbLeft = trackWidth - thumbWidth;
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

        // Добавили .vault-name-text и .vault-history-name в список отслеживаемых
        const titleEl = e.target.closest('.column-title, .tab-name, .breadcrumb-item, .vault-name-text, .vault-history-name');
        if (!titleEl) return;

        let isActuallyClamped = false;
        
        // Добавили проверку для названия хранилища (и в шапке, и в истории)
        if (titleEl.classList.contains('tab-name') || 
            titleEl.classList.contains('breadcrumb-item') || 
            titleEl.classList.contains('vault-name-text') ||
            titleEl.classList.contains('vault-history-name')) {
            
            // Если текст заканчивается на троеточие (с защитой от пробелов) или физически не влезает
            isActuallyClamped = titleEl.textContent.trim().endsWith('…') || titleEl.scrollWidth > titleEl.clientWidth;
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
        // ДОБАВИЛИ .vault-name-text и .vault-history-name в список. Теперь тултип поймет, что пора исчезать
        const titleEl = e.target.closest('.column-title, .tab-name, .breadcrumb-item, .vault-name-text, .vault-history-name');
        if (titleEl && titleEl === activeTitle) {
            activeTitle = null;
            tooltip.classList.remove('visible');
        }
    });

    const hideTooltip = () => {
        if (activeTitle) {
            activeTitle = null;
            tooltip.classList.remove('visible');
        }
    };
    
    document.addEventListener('mousedown', hideTooltip);
    
    // Senior UX: Защита от залипания тултипа в воздухе при инерционном скролле на тачпаде Mac/Win
    document.addEventListener('wheel', hideTooltip, { passive: true });
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

function initHeadingFolding(container, foldedHeadings = []) {
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
        if (heading.querySelector('.heading-fold-arrow')) return;

        const arrow = document.createElement('span');
        arrow.className = 'heading-fold-arrow';
        arrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        
        heading.prepend(arrow);
        heading.classList.add('foldable-heading');

        const headingText = heading.textContent.replace(arrow.textContent || '', '').trim();

        // Первоначальное сворачивание на основе сохраненного состояния
        if (foldedHeadings.includes(headingText)) {
            heading.classList.add('is-folded');
            const level = parseInt(heading.tagName.substring(1));
            let next = heading.nextElementSibling;
            while (next) {
                if (next.tagName.match(/^H[1-6]$/)) {
                    const nextLevel = parseInt(next.tagName.substring(1));
                    if (nextLevel <= level) {
                        break;
                    }
                }
                next.classList.add('is-hidden-by-fold');
                next = next.nextElementSibling;
            }
        }

        heading.addEventListener('click', (e) => {
            if (e.target.closest('a')) return; // Игнорируем ссылки внутри заголовков

            const isFolded = heading.classList.toggle('is-folded');
            const level = parseInt(heading.tagName.substring(1));

            let next = heading.nextElementSibling;
            while (next) {
                // Если встретили заголовок такого же уровня или выше (меньший H-индекс) — останавливаемся
                if (next.tagName.match(/^H[1-6]$/)) {
                    const nextLevel = parseInt(next.tagName.substring(1));
                    if (nextLevel <= level) {
                        break;
                    }
                }

                if (isFolded) {
                    next.classList.add('is-hidden-by-fold');
                } else {
                    next.classList.remove('is-hidden-by-fold');
                    
                    // Если разворачиваем родительский блок, но встречаем вложенный заголовок,
                    // который тоже свернут — не разворачиваем его дочерние элементы
                    if (next.tagName.match(/^H[1-6]$/) && next.classList.contains('is-folded')) {
                        const skipLevel = parseInt(next.tagName.substring(1));
                        let skipNext = next.nextElementSibling;
                        while (skipNext) {
                            if (skipNext.tagName.match(/^H[1-6]$/)) {
                                const skipNextLevel = parseInt(skipNext.tagName.substring(1));
                                if (skipNextLevel <= skipLevel) {
                                    break;
                                }
                            }
                            skipNext = skipNext.nextElementSibling;
                        }
                        next = skipNext ? skipNext.previousElementSibling : null;
                    }
                }
                if (next) next = next.nextElementSibling;
            }

            // Отправка нового состояния свернутых заголовков на бэкенд
            const taskId = document.getElementById('task-modal').dataset.taskId;
            if (taskId) {
                const currentFolded = [];
                container.querySelectorAll('.foldable-heading.is-folded').forEach(h => {
                    const cleanText = h.textContent.replace(h.querySelector('.heading-fold-arrow')?.textContent || '', '').trim();
                    currentFolded.push(cleanText);
                });

                fetch(`${API_BASE}/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folded_headings: currentFolded })
                }).then(res => {
                    if (res.ok) {
                        // Локальная синхронизация состояния для избежания лишних перезапросов к БД
                        for (let col of state.columns) {
                            let t = col.tasks.find(taskItem => taskItem.id === parseInt(taskId));
                            if (t) {
                                t.folded_headings = currentFolded;
                                break;
                            }
                        }
                    }
                }).catch(console.error);
            }
        });
    });
}

function enhanceCodeBlocks(container) {
    const codeBlocks = Array.from(container.querySelectorAll('pre code'));
    
    codeBlocks.forEach(block => {
        if (!block.className || block.className === "") {
            block.classList.add('language-python');
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

    if (!window.Prism || codeBlocks.length === 0) return;

    const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));
    let prismIndex = 0;
    
    const highlightNextChunk = () => {
        const sliceStart = performance.now();
        while (prismIndex < codeBlocks.length && (performance.now() - sliceStart) < 16) {
            const block = codeBlocks[prismIndex++];
            if (block.isConnected) {
                // Если код огромный (минифицированный CSS/JS), подсвечиваем его как Plain Text,
                // чтобы регулярки Prism не повесили браузер
                if (block.textContent.length > 20000) {
                    block.className = 'language-plain';
                }
                Prism.highlightElement(block);
            }
        }
        if (prismIndex < codeBlocks.length) {
            scheduleIdle(highlightNextChunk);
        }
    };
    scheduleIdle(highlightNextChunk);
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
                        <path d="m18.84 12.25 1.72-1.71h-.01a5.001 5.001 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="m5.17 11.67-1.71 1.71a5.001 5.001 0 0 0 7.07 7.07l1.71-1.71"></path>
                        <line x1="8" y1="2" x2="8" y2="5"></line>
                        <line x1="2" y1="8" x2="5" y2="8"></line>
                        <line x1="16" y1="22" x2="16" y2="19"></line>
                        <line x1="22" y1="16" x2="19" y2="16"></line>
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
        // Senior UX Fix: При любом вводе текста мы СРАЗУ убираем класс ошибки и удаляем элемент подсказки.
        // Это заставляет Flexbox мгновенно пересчитать высоту контейнера до вызова autoResize.
        formItem.classList.remove('is-error');
        const hint = formItem.querySelector('.card-error-hint');
        if (hint) {
            hint.remove();
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

        // МАГИЯ ССЫЛКИ ДЛЯ БЫСТРОГО ДОБАВЛЕНИЯ
        const linkMatch = title.match(/^\[(.*?)\]\(doe:\/\/task\/(\d+)\)$/) || title.match(/^doe:\/\/task\/(\d+)$/);
        if (linkMatch) {
            const linkedTaskId = parseInt(linkMatch[2] || linkMatch[1]);
            
            // Проверка 1: Сама на себя
            // Проверка 2: Уже есть в списке (дубликат)
            const isDuplicate = !!subtasksList.querySelector(`.subtask-item[data-subtask-id="${linkedTaskId}"]`);

            if (linkedTaskId === parentId || isDuplicate) {
                // Senior UX: Разблокируем ввод и вызываем визуальный фидбек
                input.disabled = false; 
                formItem.classList.remove('is-error');
                void formItem.offsetWidth; // Магия: заставляем браузер перезапустить анимацию тряски
                formItem.classList.add('is-error');
                
                // Очищаем класс ошибки после завершения анимации (400мс)
                setTimeout(() => formItem.classList.remove('is-error'), 400);

                input.focus({ preventScroll: true });
                return;
            }

            if (isResolved) return;
            isResolved = true;
            input.disabled = true;

            try {
                // Подтягиваем старых родителей и добавляем нового (Множественные связи)
                const linkedTaskRes = await fetch(`${API_BASE}/tasks/${linkedTaskId}`);
                if (!linkedTaskRes.ok) throw new Error("Task not found"); // Перехватываем 404
                
                const linkedTask = await linkedTaskRes.json();
                
                // Страховка (fallback на []), если массив вдруг не пришел
                const safeOldParents = Array.isArray(linkedTask.parent_ids) ? linkedTask.parent_ids : [];
                const newParents = [...new Set([...safeOldParents, parentId])];
                
                await updateTask(linkedTaskId, { 
                    parent_ids: newParents, 
                    is_visible_on_board: true 
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
                
                // Эстетичный показ ошибки вместо системного alert
                let hint = formItem.querySelector('.card-error-hint');
                if (!hint) {
                    hint = document.createElement('div');
                    hint.className = 'card-error-hint';
                    formItem.appendChild(hint);
                }
                
                if (err.message && (err.message.includes('цикл') || err.message.includes('самой себя'))) {
                     hint.textContent = t('cyclicError');
                } else {
                     hint.textContent = t('alerts.error');
                }

                formItem.classList.remove('is-error');
                void formItem.offsetWidth; // Магия: заставляем браузер перезапустить анимацию тряски
                formItem.classList.add('is-error');
                
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
                body: JSON.stringify({ title, column_id: columnId, parent_ids: [parentId] })
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
function bindSubtaskEvents(el, sub, parentTaskOrId, parentMode = 'default') {
    // Нормализуем родительскую задачу для поддержки разных сценариев вызова
    let parentTask = null;
    let parentId = null;
    if (typeof parentTaskOrId === 'object' && parentTaskOrId !== null) {
        parentTask = parentTaskOrId;
        parentId = parentTask.id;
    } else {
        parentId = parseInt(parentTaskOrId);
        for (const col of state.columns) {
            parentTask = col.tasks.find(t => t.id === parentId);
            if (parentTask) break;
        }
    }

    // 1. Чекбокс
    el.querySelector('.subtask-checkbox').onclick = (e) => {
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
        
        // --- OPTIMISTIC UI: Мгновенное визуальное переключение ---
        el.classList.toggle('is-done', isDone);
        
        const timestamp = isDone ? new Date().toISOString() : null;
        const previousTimestamp = sub.completed_at;
        sub.completed_at = timestamp;

        // --- МГНОВЕННОЕ ГЛОБАЛЬНОЕ ОБНОВЛЕНИЕ ВСЕХ КАРТОЧЕК НА ДОСКЕ ---
        // Проходим по всему стейту, так как подзадача может быть привязана к нескольким родителям
        state.columns.forEach(col => {
            col.tasks.forEach(task => {
                if (task.subtasks) {
                    const subIndex = task.subtasks.findIndex(s => s.id === sub.id);
                    if (subIndex !== -1) {
                        // Обновляем статус подзадачи в локальном стейте этой карточки
                        task.subtasks[subIndex].completed_at = timestamp;
                        
                        // Обновляем визуал пилюли на доске для этой карточки
                        const cardEl = document.querySelector(`.card[data-card-id="${task.id}"]`);
                        if (cardEl) {
                            updateCardAppearance(cardEl, task, col.mode);
                        }
                    }
                }
            });
        });

        // --- АСИНХРОННЫЙ ЗАПРОС БЕЗ БЛОКИРОВКИ ИНТЕРФЕЙСА ---
        updateTask(sub.id, { completed_at: timestamp }).catch((err) => {
            console.error("Failed to update subtask status:", err);
            
            // Откат состояния модалки UI в случае сетевой ошибки
            el.classList.toggle('is-done', !isDone);
            sub.completed_at = previousTimestamp;
            
            // Откат глобального состояния UI на доске
            state.columns.forEach(col => {
                col.tasks.forEach(task => {
                    if (task.subtasks) {
                        const subIndex = task.subtasks.findIndex(s => s.id === sub.id);
                        if (subIndex !== -1) {
                            task.subtasks[subIndex].completed_at = previousTimestamp;
                            
                            const cardEl = document.querySelector(`.card[data-card-id="${task.id}"]`);
                            if (cardEl) {
                                updateCardAppearance(cardEl, task, col.mode);
                            }
                        }
                    }
                });
            });
            
            window.showToast(t('alerts.error'), 'Не удалось сохранить статус подзадачи', true);
        });
    };

    // 2. УДАЛЕНИЕ (Корзина)
    el.querySelector('.subtask-delete-btn').onclick = async (e) => {
        e.stopPropagation();

        const parents = sub.parent_ids || [];

        // 1. Визуальное удаление
        el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px) scale(0.95)';
        
        setTimeout(() => {
            if (el.parentNode) el.remove();
            const countEl = document.getElementById('subtasks-count');
            countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
        }, 250);

        try {
            if (parents.length > 1) {
                // Если у подзадачи есть другие родители — просто отвязываем её от текущего (не удаляя глобально)
                const newParentIds = parents.filter(id => id !== parentId);
                await updateTask(sub.id, { parent_ids: newParentIds });
                
                bumpModalUpdatedDate();
                sub.parent_ids = newParentIds; // Обновляем локально
                refreshBoard();
            } else {
                // Если это был последний родитель — удаляем задачу безвозвратно
                const data = await deleteTask(sub.id);
                
                bumpModalUpdatedDate();
                
                const deletedIds = data.deleted_ids || [];
                
                // Если задача была вынесена на доску или имела подзадачи — вычищаем их с доски
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
                refreshBoard(); 
            }
        } catch(err) {
            console.error("Ошибка при удалении пункта:", err);
        }
    };

    // 3. ОТКРЫТИЕ (Expand)
    el.querySelector('.subtask-open-btn').onclick = (e) => {
        e.stopPropagation();

        // 🔥 СЕНЬОР-ФИКС: Если подзадача не вынесена на доску (глазик выключен),
        // просто открываем её поверх в модалке без смены контекста и вкладок.
        // Бэкенд всё еще помнит её колонку, чтобы восстановить карточку при включении глазика.
        if (!sub.is_visible_on_board) {
            loadTaskIntoModal(sub.id, true);
            return;
        }
        
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

            let parents = sub.parent_ids || [];
            let detachType = 'all';

            // Если карточка привязана более чем к одному родителю — показываем умную модалку
            if (parents.length > 1) {
                detachType = await showDetachModal();
                if (!detachType) return; // Нажали Отмена или кликнули вне модалки
            }

            // Визуальное удаление
            el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px) scale(0.95)';
            
            setTimeout(() => {
                if (el.parentNode) el.remove();
                const countEl = document.getElementById('subtasks-count');
                countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
            }, 250);

            try {
                let newParentIds = [];
                if (detachType === 'current') {
                    // Удаляем только текущего родителя
                    newParentIds = parents.filter(id => id !== parentId);
                } else if (detachType === 'all') {
                    // Очищаем массив, делая карточку полностью сиротой
                    newParentIds = [];
                }

                await updateTask(sub.id, { parent_ids: newParentIds, is_visible_on_board: true });
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

    // --- ИНИЦИАЛИЗАЦИЯ CODEMIRROR ---
    if (!cmEditor && window.CodeMirror) {
        cmEditor = CodeMirror.fromTextArea(inputArea, {
            lineWrapping: true,      
            viewportMargin: 10,       // ВАЖНО: Рендерить только 10 строк за пределами экрана (по умолчанию он рендерит больше)
            maxHighlightLength: 2000, // ВАЖНО: Не пытаться парсить синтаксис на строках длиннее 2000 символов (защита от зависания на минифицированном коде)
            workTime: 10,             // Тратить не более 10мс на парсинг в фоне
            workDelay: 100,           // Отдыхать 100мс между парсингом
            spellcheck: false,
            autocorrect: false
        });
        cmEditor.getWrapperElement().style.display = 'none';
    }

    const switchToEditMode = () => {
        if (window.closeLocalSearch) window.closeLocalSearch(); 
        lastSavedValue = cmEditor.getValue(); 

        const taskId = parseInt(modal.dataset.taskId);
        let currentTask = null;
        for (let col of state.columns) {
            currentTask = col.tasks.find(t => t.id === taskId);
            if (currentTask) break;
        }

        // 1. СОХРАНЯЕМ позицию скролла текста и самой модалки
        if (currentTask) {
            currentTask._readScrollTop = renderDiv.scrollTop;
            const detailBody = document.querySelector('.task-detail-body');
            if (detailBody) currentTask._modalScrollTop = detailBody.scrollTop;
        }

        renderDiv.style.display = 'none';
        cmEditor.getWrapperElement().style.display = 'block';
        cmEditor.refresh(); 

        window.getSelection().removeAllRanges();
        
        // 2. ВОССТАНАВЛИВАЕМ последнюю позицию курсора
        const targetPos = currentTask && currentTask._editCursorPos 
            ? currentTask._editCursorPos 
            : { line: 0, ch: 0 };

        cmEditor.focus();
        cmEditor.setCursor(targetPos);
        
        const info = cmEditor.getScrollInfo();
        cmEditor.scrollIntoView(targetPos, Math.round(info.clientHeight / 2));
    };


    // ==========================================
    // ЛОГИКА ВСТАВКИ ФАЙЛОВ
    // ==========================================
    const processFileForDescription = async (file) => {
        const isEditMode = renderDiv.style.display === 'none';

        let fileName = file.name;
        if (!fileName || fileName === 'image.png') {
            const dateStr = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15);
            fileName = `Скриншот_${dateStr}.png`;
        }

        const ext = fileName.split('.').pop().toLowerCase();
        const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
        const prefix = isImg ? '!' : '';
        const placeholder = `${prefix}[⏳ Загрузка ${fileName}...]()`;

        let insertPos = null;

        if (isEditMode) {
            insertPos = cmEditor.getCursor();
            const textBefore = cmEditor.getRange({line: 0, ch: 0}, insertPos);
            
            let pfx = "";
            if (textBefore.trim() !== "") {
                if (textBefore.endsWith('\n')) pfx = "\n";
                else pfx = "\n\n";
            }
            
            const insertText = `${pfx}${placeholder}\n`;
            cmEditor.replaceSelection(insertText);
            cmEditor.focus();
        } else {
            const text = cmEditor.getValue();
            let pfx = "";
            if (text.trim() !== "") {
                if (text.endsWith('\n')) pfx = "\n";
                else pfx = "\n\n";
            }
            cmEditor.setValue(text + pfx + placeholder);
            
            const cleanRegex = /(!?)\[[^\]]+\]\(attachments\/[^)]+\)!\s*/g;
            const tempText = cmEditor.getValue().replace(cleanRegex, '');
            renderDiv.innerHTML = marked.parse(tempText, { breaks: true });
        }

        const formData = new FormData();
        formData.append('file', file, fileName);

        try {
            const res = await fetch(`${API_BASE}/system/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();
            const encodedPath = encodeURI(data.path);
            const finalMarkdown = `${prefix}[${data.name}](${encodedPath})`;
            
            const currentVal = cmEditor.getValue();
            cmEditor.setValue(currentVal.replace(placeholder, finalMarkdown));
        } catch (err) {
            const currentVal = cmEditor.getValue();
            cmEditor.setValue(currentVal.replace(placeholder, `${prefix}[❌ Ошибка: ${fileName}]()`));
        }

        if (isEditMode) {
            cmEditor.focus();
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
            e.preventDefault();
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
        descWrapper.style.borderColor = '';
    });

    descWrapper.addEventListener('drop', handleFileDrop);
    
    // Перехватываем Paste внутри CodeMirror
    cmEditor.on('paste', (cm, e) => handleFilePaste(e));
    renderDiv.addEventListener('paste', handleFilePaste);

    // ==========================================
    // ЛОГИКА СОХРАНЕНИЯ ОПИСАНИЯ
    // ==========================================
    const switchToReadMode = async () => {
        const newDesc = cmEditor.getValue();
        const taskId = modal.dataset.taskId;

        if (newDesc === lastSavedValue) {
            exitEditingUI(newDesc, null);
            return;
        }

        cmEditor.getWrapperElement().style.opacity = "0.7";

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
            cmEditor.getWrapperElement().style.opacity = "1";
        }
    };

    const exitEditingUI = async (content, preCalculatedAttachments = null) => {
        const attachmentsList = document.getElementById('attachments-list');
        const attachmentsCount = document.getElementById('attachments-count');
        const taskId = parseInt(modal.dataset.taskId);
        
        let currentTask = null;
        for (let col of state.columns) {
            currentTask = col.tasks.find(t => t.id === taskId);
            if (currentTask) break;
        }
        
        if (attachmentsCount && attachmentsList && preCalculatedAttachments) {
            let extracted = preCalculatedAttachments;
            if (extracted.length > 0 && extracted[0].exists === undefined) {
                extracted = await enrichAttachments(extracted);
            }
            attachmentsCount.textContent = extracted.length;
            attachmentsList.innerHTML = '';
            extracted.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));
        }

        // 1. СОХРАНЯЕМ позицию курсора перед выходом
        if (currentTask && cmEditor) {
            currentTask._editCursorPos = cmEditor.getCursor();
        }

        if (cmEditor) cmEditor.getWrapperElement().style.display = 'none';
        renderDiv.style.display = 'block';

        if (content.trim()) {
            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
            const cleanContent = content.replace(cleanRegex, '');
            
            renderMarkdownProgressively(cleanContent, renderDiv, () => {
                let localFolded = currentTask ? currentTask.folded_headings || [] : [];
                initHeadingFolding(renderDiv, localFolded);
                applyTextExpansion(); 
                
                // 🌟 БЕЗ ЗАДЕРЖЕК: Мгновенное применение скролла
                if (currentTask && currentTask._readScrollTop !== undefined) {
                    renderDiv.scrollTop = currentTask._readScrollTop;
                } else {
                    renderDiv.scrollTop = 0;
                }

                if (currentTask && currentTask._modalScrollTop !== undefined) {
                    const detailBody = document.querySelector('.task-detail-body');
                    if (detailBody) detailBody.scrollTop = currentTask._modalScrollTop;
                }
            });
        } else {
            renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
            applyTextExpansion(); 
        }
    };

    renderDiv.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('image-resize-handle')) {
            e.preventDefault();
            e.stopPropagation();
            
            const wrapper = e.target.closest('.image-resizer-wrapper');
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = wrapper.offsetWidth;
            const startHeight = wrapper.offsetHeight;
            const aspectRatio = startWidth / startHeight;
            
            wrapper.classList.add('is-resizing');
            wrapper.classList.add('has-custom-size'); 
            document.body.style.userSelect = 'none'; 
            
            const onMouseMove = (moveEvent) => {
                let newWidth = Math.max(50, startWidth + (moveEvent.clientX - startX));
                let newHeight = Math.max(50, startHeight + (moveEvent.clientY - startY));
                
                if (moveEvent.shiftKey) newHeight = newWidth / aspectRatio;
                
                wrapper.style.width = newWidth + 'px';
                wrapper.style.height = newHeight + 'px';
                applyTextExpansion();
            };
            
            const onMouseUp = async () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.userSelect = '';
                wrapper.classList.remove('is-resizing');
                
                const finalWidth = Math.round(wrapper.offsetWidth);
                const finalHeight = Math.round(wrapper.offsetHeight);
                const originalMd = unescapeHtml(wrapper.dataset.md);
                
                const regex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{[^}]+\})?/;
                const newMd = originalMd.replace(regex, `![$1]($2){${finalWidth}, ${finalHeight}}`);
                
                const currentVal = cmEditor.getValue();
                cmEditor.setValue(currentVal.replace(originalMd, newMd));
                
                wrapper.dataset.md = escapeHtml(newMd);
                lastSavedValue = cmEditor.getValue(); 
                
                const taskId = modal.dataset.taskId;
                try {
                    await fetch(`${API_BASE}/tasks/${taskId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ description: cmEditor.getValue() })
                    });
                    
                    bumpModalUpdatedDate();
                    
                    for (let col of state.columns) {
                        let currentTask = col.tasks.find(t => t.id == taskId);
                        if (currentTask) {
                            currentTask.description = cmEditor.getValue();
                            break;
                        }
                    }
                } catch (err) {
                    console.error("Failed to save image resize", err);
                }
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            return;
        }

        if (e.target.tagName === 'A') return;
        if (e.detail > 1) {
            e.preventDefault(); 
        }
    });

    renderDiv.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'A') return;
        if (e.target.closest('.image-resizer-wrapper')) return; 
        switchToEditMode();
    });

    renderDiv.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link) {
            e.preventDefault();
            e.stopPropagation();
            const href = link.getAttribute('href');
            if (!href) return;
            if (href.startsWith('doe/') || href.startsWith('/doe/')) {
                const cleanHref = href.startsWith('/') ? href.slice(1) : href;
                fetch(`${API_BASE}/system/open-file`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: decodeURIComponent(cleanHref)}) });
                return;
            }
            if (href.startsWith('doe://task/')) {
                const targetTaskId = parseInt(href.split('/').pop());
                fetch(`${API_BASE}/tasks/${targetTaskId}/context`)
                    .then(res => res.json())
                    .then(context => { window.navigateToEntityGlobal(context.workspace_id, context.column_id, targetTaskId, null, true); })
                    .catch(err => console.error("Не удалось найти карточку", err));
                return;
            }
            fetch(`${API_BASE}/system/open-link`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url: href}) });
            return;
        }
        
        if (!cmEditor.getValue().trim()) {
            switchToEditMode();
        }
    });

    // ==========================================
    // ЛОГИКА БЛОКИРОВКИ СБРОСА ФОКУСА С РЕДАКТОРА
    // ==========================================
    let preventBlurExit = false;

    // Перехватываем клик мышкой в области описания
    descWrapper.addEventListener('mousedown', (e) => {
        // Если мы в режиме редактирования, блокируем выход (чтобы клик по скроллбару не выкидывал нас)
        if (cmEditor && cmEditor.getWrapperElement().style.display === 'block') {
            preventBlurExit = true;
        }
    });

    // Когда мышь отпустили (даже если утащили за пределы окна)
    window.addEventListener('mouseup', () => {
        if (preventBlurExit) {
            preventBlurExit = false;
            // Принудительно возвращаем фокус редактору после прокрутки
            if (cmEditor && cmEditor.getWrapperElement().style.display === 'block') {
                cmEditor.focus();
            }
        }
    });

    // Сохранение при клике мимо редактора
    cmEditor.on('blur', () => {
        if (preventBlurExit) return; // 🔥 Игнорируем blur при перетаскивании скроллбара
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
    let currentMouseY = 0;
    let rafId = null;
    
    // 🔥 ФИКС БАГА ПРЫЖКА: Переменные для контроля и отмены старых анимаций
    let dragCleanupTimeout = null;
    let dragCleanupFn = null;

    // ЛОГИКА КНОПКИ РАЗВОРОТА И ПЛАВНОГО ЦЕНТРИРОВАНИЯ (FLIP-анимация)
    maximizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        const isMaximized = card.classList.contains('maximized');

        if (!isMaximized) {
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
            maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 10 14 10 14 6"></polyline><polyline points="6 14 10 14 10 18"></polyline><line x1="14" y1="10" x2="18" y2="6"></line><line x1="10" y1="14" x2="6" y2="18"></line></svg>`;
        } else {
            const startRect = card.getBoundingClientRect();

            card.classList.remove('maximized');
            card.style.transition = 'none';
            card.style.position = '';
            card.style.left = '';
            card.style.top = '';
            card.style.width = '';
            card.style.height = '';
            card.style.transform = '';
            card.style.margin = '';

            const targetRect = card.getBoundingClientRect();

            card.style.position = 'absolute';
            card.style.margin = '0';
            card.style.left = `${startRect.left}px`;
            card.style.top = `${startRect.top}px`;
            card.style.width = `${startRect.width}px`;
            card.style.height = `${startRect.height}px`;

            void card.offsetWidth;

            card.style.transition = ''; 
            card.classList.add('is-restoring');
            
            card.style.left = `${targetRect.left}px`;
            card.style.top = `${targetRect.top}px`;
            card.style.width = `${targetRect.width}px`;
            card.style.height = `${targetRect.height}px`;

            maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 6 18 6 18 10"></polyline><polyline points="10 18 6 18 6 14"></polyline><line x1="18" y1="6" x2="13" y2="11"></line><line x1="6" y1="18" x2="11" y2="13"></line></svg>`;
            
            const cleanup = (ev) => {
                if (ev && ev.target !== card) return; 
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
            setTimeout(cleanup, 350);
        }
    });

    const renderModalPhysics = () => {
        if (!isDragging) return;
        
        const deltaX = currentMouseX - lastMouseX;
        lastMouseX = currentMouseX;
        
        const maxRotation = 2.5; 
        targetRotation = Math.max(-maxRotation, Math.min(maxRotation, deltaX * 0.15));
        currentRotation += (targetRotation - currentRotation) * 0.12;

        const dx = currentMouseX - startX;
        const dy = currentMouseY - startY;

        card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${currentRotation}deg)`;
        rafId = requestAnimationFrame(renderModalPhysics);
    };

    const onPointerDown = (e) => {
        if (e.button !== 0) return;
        
        if (card.classList.contains('maximized')) return;
        if (!e.target.closest('.task-detail-card')) return;

        const resizer = e.target.closest('.resizer');
        
        const isInteractive = e.target.closest(
            'button, input, textarea, a, ' + 
            '.markdown-body, .description-wrapper, ' + 
            '.subtask-item, .attachment-item, ' +      
            '.breadcrumb-item, .modal-timer-pill, ' +
            '.due-date-pill'
        );

        const isScrollbarClick = (e.target.clientWidth > 0 && e.offsetX > e.target.clientWidth) || 
                                 (e.target.clientHeight > 0 && e.offsetY > e.target.clientHeight);

        if (!resizer && (isInteractive || isScrollbarClick)) return;

        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }

        e.preventDefault();
        
        // 🔥 ФИКС ПРЫЖКА: Если юзер схватил карточку до того, как закончилась прошлая анимация
        // отпускания (или "возврата" на место), отменяем её!
        if (dragCleanupFn) {
            card.removeEventListener('transitionend', dragCleanupFn);
            dragCleanupFn = null;
        }
        if (dragCleanupTimeout) {
            clearTimeout(dragCleanupTimeout);
            dragCleanupTimeout = null;
        }

        // 🔥 ФИКС ПРЫЖКА: ВСЕГДА читаем актуальные физические координаты карточки на экране!
        // Это гарантирует, что мы подхватим её ровно там, где она летит в данный момент.
        const rect = card.getBoundingClientRect();
        card.style.transition = 'none'; // Мгновенно убиваем CSS-анимации
        card.style.position = 'absolute';
        card.style.margin = '0';
        card.style.left = `${rect.left}px`;
        card.style.top = `${rect.top}px`;
        card.style.width = `${rect.width}px`;
        card.style.height = `${rect.height}px`;
        card.style.transform = 'none';  // Сбрасываем CSS-translate

        isDragging = !resizer;
        currentResizer = resizer;

        startX = e.clientX;
        startY = e.clientY;
        startW = rect.width;
        startH = rect.height;
        startLeft = rect.left;
        startTop = rect.top;

        if (isDragging) {
            lastMouseX = e.clientX;
            currentMouseX = e.clientX;
            currentMouseY = e.clientY;
            currentRotation = 0;
            targetRotation = 0;
            
            card.style.willChange = 'transform'; 
            
            document.body.classList.add('is-dragging-modal');

            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(renderModalPhysics);
        }

        document.body.style.userSelect = 'none';
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
        currentMouseX = e.clientX; 
        currentMouseY = e.clientY;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (isDragging) {
            return; 
        }

        if (currentResizer) {
            const type = currentResizer.classList;

            if (type.contains('r-right') || type.contains('r-top-right') || type.contains('r-bottom-right')) {
                const newWidth = startW + dx;
                if (newWidth > 400) card.style.width = `${newWidth}px`;
            }
            if (type.contains('r-left') || type.contains('r-top-left') || type.contains('r-bottom-left')) {
                const newWidth = startW - dx;
                if (newWidth > 400) {
                    card.style.width = `${newWidth}px`;
                    card.style.left = `${startLeft + dx}px`;
                }
            }
            if (type.contains('r-bottom') || type.contains('r-bottom-left') || type.contains('r-bottom-right')) {
                const newHeight = startH + dy;
                if (newHeight > 400) card.style.height = `${newHeight}px`;
            }
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
        if (isDragging) {
            document.body.classList.remove('is-dragging-modal');
            cancelAnimationFrame(rafId);

            const dx = currentMouseX - startX;
            const dy = currentMouseY - startY;

            card.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(0deg)`;

            // 🔥 ФИКС ПРЫЖКА: Сохраняем ссылку на функцию очистки, чтобы отменить её,
            // если юзер схватит карточку ДО того, как анимация завершится.
            dragCleanupFn = (ev) => {
                if (ev && ev.target !== card) return; 
                if (ev && ev.propertyName !== 'transform') return;
                
                if (dragCleanupFn) card.removeEventListener('transitionend', dragCleanupFn);
                if (dragCleanupTimeout) clearTimeout(dragCleanupTimeout);
                dragCleanupFn = null;
                dragCleanupTimeout = null;
                
                card.style.transition = 'none';
                card.style.left = `${startLeft + dx}px`;
                card.style.top = `${startTop + dy}px`;
                card.style.transform = 'none';
            };
            
            card.addEventListener('transitionend', dragCleanupFn);
            dragCleanupTimeout = setTimeout(dragCleanupFn, 450); 
            
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

    taskModal.addEventListener('pointerdown', onPointerDown);
}

function extractAttachments(desc, savedOrder = []) {
    // 1. Вырезаем блоки кода из поиска, чтобы вложения внутри них не попадали в UI-список
    let cleanDesc = desc.replace(/```[\s\S]*?```/g, '');
    cleanDesc = cleanDesc.replace(/`[^`]*`/g, '');

    // 2. Регулярка учитывает возможные размеры {width, height}
    const regex = /(!?)\[([^\]]+)\]\((doe\/[^)]*)\)(?:\{[^}]+\})?(!?)/g;
    let match;
    const attachments = [];
    
    while ((match = regex.exec(cleanDesc)) !== null) {
        attachments.push({
            fullMatch: match[0],       // Вся строка со скобками размеров (если есть)
            isImage: match[1] === '!',
            label: match[2],
            path: match[3],
            isHidden: match[4] === '!'
        });
    }

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
                if (a.path === 'doe/') {
                    a.isPending = true;
                    a.exists = false;
                    a.real_name = a.label;
                } else {
                    const status = validation[a.path];
                    a.exists = status ? status.exists : false;
                    // ИМЯ БЕРЕМ С ДИСКА (ИЛИ ИЗ ПУТИ), А НЕ ИЗ КВАДРАТНЫХ СКОБОК МАРКДАУНА!
                    a.real_name = status ? status.real_name : a.label; 
                }
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
    
    const isPending = att.isPending === true;
    const isMissing = att.exists === false && !isPending;
    const needsRelink = isMissing || isPending;
    
    let fileIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    if (needsRelink) {
        fileIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }
    
    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    
    let displayTitle = escapeHtml(att.real_name);
    if (isPending) {
        displayTitle = t('pendingTitle', escapeHtml(att.label));
    }

    let checkboxClass = '';
    let titleAttr = '';
    if (isMissing) {
        checkboxClass = 'missing';
        titleAttr = `title="${t('missingTooltip')}"`;
    } else if (isPending) {
        checkboxClass = 'pending';
        titleAttr = `title="${t('pendingTooltip')}"`;
    }

    div.innerHTML = `
        <div class="subtask-checkbox ${checkboxClass}" ${titleAttr}>
            ${fileIcon}
        </div>
        <div class="subtask-title ${isMissing ? 'missing-text' : ''}" ${isMissing ? `title="${t('expectedFilename')}"` : ''}>${displayTitle}</div>
        <div class="subtask-actions">
            <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIcon}</button>
        </div>
    `;
    
    // Обработка клика
    div.addEventListener('click', async (e) => {
        if (e.target.closest('.subtask-delete-btn')) return;
        
        // --- ЛОГИКА ПЕРЕПРИВЯЗКИ ФАЙЛА ---
        if (needsRelink) {
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

        // 2. Отправляем запрос на физическое удаление с диска
        if (!isPending) {
            fetch(`${API_BASE}/system/delete-file`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ path: pathToDelete })
            }).catch(err => console.error("Physical delete failed:", err));
        }

        // 3. ПОЛНОСТЬЮ стираем упоминание файла из текста Markdown
        setTimeout(() => {
            const renderDiv = document.getElementById('task-desc-render');
            const isEditMode = renderDiv.style.display === 'none';
            
            const safePath = pathToDelete.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Регулярка захватывает всю конструкцию, включая ![...](...){...}!
            const pathRegex = new RegExp(`!?\\[[^\\]]*\\]\\(${safePath}\\)(?:\\{[^}]+\\})?!?`, 'g');
            
            const oldText = cmEditor.getValue();
            // Заменяем на пустоту, чтобы не оставлять мусорный текст (label)
            const newText = oldText.replace(pathRegex, '');
            
            cmEditor.setValue(newText);
            
            if (oldText !== newText) {
                if (isEditMode) {
                    cmEditor.focus();
                } else {
                    cmEditor.getInputField().blur(); // Сохраняем в фоне
                }
            } else {
                if (div.parentNode) div.remove();
            }
        }, 200);
    });
    
    return div;
}

function replaceBrokenAttachment(att, newData) {
    const isEditMode = document.getElementById('task-desc-render').style.display === 'none';

    const encodedNewPath = encodeURI(newData.path);
    const prefix = att.isImage ? '!' : '';
    const suffix = att.isHidden ? '!' : '';

    // 🔥 БАГФИКС: Сохраняем кастомные размеры {width, height}, если они были
    const sizeMatch = att.fullMatch.match(/\{[^}]+\}$/);
    const sizeStr = sizeMatch ? sizeMatch[0] : '';

    // Формируем новый валидный Markdown
    const newMarkdown = `${prefix}[${att.label}](${encodedNewPath})${sizeStr}${suffix}`;
    
    const currentVal = cmEditor.getValue();
    
    // Используем callback чтобы символы доллара в путях не ломали замену
    cmEditor.setValue(currentVal.replace(att.fullMatch, () => newMarkdown));
    
    if (isEditMode) {
        cmEditor.focus();
    } else {
        // Эмулируем blur для сохранения
        cmEditor.getInputField().blur(); 
    }
}

function appendAttachmentToDescription(name, path) {
    const renderDiv = document.getElementById('task-desc-render');
    const isEditMode = renderDiv.style.display === 'none';

    const ext = name.split('.').pop().toLowerCase();
    const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
    const prefix = isImg ? '!' : '';

    const encodedPath = encodeURI(path); 
    const attachmentMarkdown = `${prefix}[${name}](${encodedPath})`;
    
    if (isEditMode) {
        const cursor = cmEditor.getCursor();
        const textBefore = cmEditor.getRange({line: 0, ch: 0}, cursor);

        let pfx = "";
        if (textBefore.trim() !== "") {
            if (textBefore.endsWith('\n')) pfx = "\n";
            else pfx = "\n\n";
        }
        
        const insertText = `${pfx}${attachmentMarkdown}\n`;
        cmEditor.replaceSelection(insertText);
        cmEditor.focus();
    } else {
        const text = cmEditor.getValue();
        let pfx = "";
        if (text.trim() !== "") {
            if (text.endsWith('\n')) pfx = "\n";
            else pfx = "\n\n";
        }
        cmEditor.setValue(text + pfx + attachmentMarkdown);
        // Сохраняем
        cmEditor.getInputField().blur(); 
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
    // Включаем минималистичный крестик
    const lights = document.getElementById('mac-traffic-lights');
    if (lights) lights.classList.add('vault-mode');

    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_vault_window) {
        window.pywebview.api.open_vault_window();
    } else {
        window.location.href = "/app?mode=vault";
    }
}

async function fetchVaultHistory() {
    try {
        // Добавлен cache-buster и заголовки, чтобы браузер не отдавал старое состояние папок
        const res = await fetch(`${API_BASE}/system/vault/history?t=${Date.now()}`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        if (res.ok) return await res.json();
    } catch (e) { console.error(e); }
    return [];
}

// Проверяет, нужен ли списку эффект затенения (если есть скролл)
function updateVaultHistoryScrollState() {
    const list = document.getElementById('vault-history-list');
    if (!list) return;
    // Если реальная высота контента больше видимой области контейнера
    if (list.scrollHeight > list.clientHeight) {
        list.classList.add('is-scrollable');
    } else {
        list.classList.remove('is-scrollable');
    }
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
    const revealIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const missingIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

    history.forEach(item => {
        const div = document.createElement('div');
        const isMissing = item.exists === false;
        div.className = `subtask-item vault-history-item${isMissing ? ' is-missing' : ''}`;
        div.dataset.path = item.path;
        
        // Форматируем дату
        let dateStr = '';
        if (item.last_opened) {
            dateStr = formatDateTime(item.last_opened);
        } else {
            dateStr = currentLang === 'ru' ? 'Ранее' : 'Earlier';
        }

        const missingTooltip = currentLang === 'ru' ? 'Хранилище не найдено. Нажмите, чтобы перепривязать' : 'Vault not found. Click to relink';

        div.innerHTML = `
            <div class="subtask-checkbox ${isMissing ? 'missing' : ''}" style="border:none; color: var(--brand-pine); opacity: 0.8; cursor: inherit;" ${isMissing ? `title="${missingTooltip}"` : ''}>
                ${isMissing ? missingIcon : folderIcon}
            </div>
            <div class="vault-history-info">
                <div class="vault-history-name ${isMissing ? 'missing-text' : ''}" data-full-title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                <div class="vault-history-meta">
                    <div class="vault-history-path ${isMissing ? 'missing-text' : ''}" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
                    <!-- Теперь блок даты есть в DOM всегда, поэтому он без проблем копируется в Drag&Drop клон -->
                    <div class="vault-history-date" data-timestamp="${item.last_opened || ''}">${dateStr}</div>
                </div>
            </div>
            <div class="subtask-actions">
                <button class="subtask-open-btn vault-hist-reveal" title="${currentLang === 'ru' ? 'Показать в папке' : 'Reveal in folder'}" style="${isMissing ? 'display: none;' : ''}">${revealIcon}</button>
                <button class="subtask-delete-btn vault-hist-del" title="${t('menu.delete')}">${trashIcon}</button>
            </div>
        `;

        // Единый безопасный обработчик "Показать в папке"
        div.querySelector('.vault-hist-reveal').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                if (window.pywebview && window.pywebview.api && window.pywebview.api.reveal_local_path) {
                    await window.pywebview.api.reveal_local_path(item.path);
                } else {
                    await fetch(`${API_BASE}/system/reveal-folder`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({path: item.path})
                    });
                }
            } catch (err) {
                console.error("Failed to reveal folder:", err);
            }
        });

        // В обработчике КЛИКА нужно блокировать открытие, если мы только что бросили элемент
        div.addEventListener('click', async (e) => {
            if (window._isAfterDrag) return; 
            if (e.target.closest('.vault-hist-del')) return;
            if (e.target.closest('.vault-hist-reveal')) return;
            
            // 🔥 СЕНЬОР ФИКС: Читаем статус прямо из DOM (он мог измениться фоновым поллером)
            const currentlyMissing = div.querySelector('.subtask-checkbox').classList.contains('missing');
            
            // --- ЛОГИКА ПЕРЕПРИВЯЗКИ ---
            if (currentlyMissing) {
                try {
                    let newPath = null;
                    if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
                        newPath = await window.pywebview.api.choose_directory();
                    }
                    if (!newPath) return;

                    const res = await fetch(`${API_BASE}/system/vault/history/relink`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ old_path: item.path, new_path: newPath })
                    });

                    if (res.ok) {
                        renderVaultHistory(); // Перерисовываем список, чтобы снять статус "потерянного"
                    } else {
                        // Трясем карточку, если папка не является хранилищем или уже есть в списке
                        div.classList.remove('is-error');
                        void div.offsetWidth;
                        div.classList.add('is-error');
                        setTimeout(() => div.classList.remove('is-error'), 400);
                    }
                } catch (err) {
                    console.error(err);
                }
                return;
            }

            // --- ОБЫЧНАЯ ЛОГИКА ОТКРЫТИЯ ---
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
                    setTimeout(() => {
                        div.classList.remove('is-error');
                        renderVaultHistory(); 
                    }, 400);
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
                
                updateVaultHistoryScrollState(); // Пересчитываем маску после удаления элемента
                
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
    
    // Замеряем геометрию после того, как браузер отрендерит добавленные элементы
    requestAnimationFrame(updateVaultHistoryScrollState);
}

async function transitionToApp() {
    // Убираем минималистичный режим, возвращаем цветной светофор с плавной анимацией
    const lights = document.getElementById('mac-traffic-lights');
    if (lights) lights.classList.remove('vault-mode');

    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_main_window) {
        window.pywebview.api.open_main_window();
    } else {
        window.location.href = "/app"; 
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
        window.showToast(t('alerts.error'), 'Не удалось создать хранилище', true);
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

    // Глобальный Hotkey: Cmd+F / Ctrl+F
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault(); 
            
            const taskModal = document.getElementById('task-modal');
            // Если открыта карточка — запускаем локальный поиск VS Code-style
            if (taskModal && taskModal.classList.contains('show')) {
                if (window.openLocalSearch) window.openLocalSearch();
                return;
            }
            
            // Иначе фокусируемся на глобальном поиске
            input.focus();
            input.select();
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
        const isTagSearch = data.search_mode === 'tags';
        const hasResults = data.workspaces.length || data.columns.length || data.tasks.length;

        // Вспомогательная функция для подсветки текста в строке результатов
        const highlightString = (text, q) => {
            if (!text) return "";
            // В тэг-режиме не подсвечиваем заголовки — пользователь ищет карточки по тегам,
            // а не куски текста "tags" в названиях
            if (isTagSearch) return escapeHtml(text);
            if (!q) return escapeHtml(text);
            const words = q.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length === 0) return escapeHtml(text);
            
            const regexWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regex = new RegExp(`(${regexWords.join('|')})`, 'gi');
            
            // Разбиваем оригинальный текст на куски, экранируем каждый кусок ОТДЕЛЬНО
            // Это спасает от поломки HTML сущностей (когда поиск буквы "t" ломал "&lt;")
            const parts = text.split(regex);
            return parts.map((part, i) => {
                // split с группой захвата возвращает совпадения на нечетных индексах
                if (i % 2 !== 0) {
                    return `<mark>${escapeHtml(part)}</mark>`;
                }
                return escapeHtml(part);
            }).join('');
        };

        if (!hasResults) {
            let emptyMsg = 'Ничего не найдено';
            if (isTagSearch && data.tags && data.tags.length) {
                const tagList = data.tags.map(t => `#${escapeHtml(t)}`).join(', ');
                emptyMsg = `Карточек с тегами ${tagList} не найдено`;
            }
            content.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 13px;">${emptyMsg}</div>`;
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
            let desc = null;
            // В тэг-режиме сниппеты не показываем — пользователь хочет просто список карточек,
            // а не куски найденного текста
            if (!isTagSearch && t.snippet && t.snippet.trim()) {
                // Экранируем всё, НО возвращаем обратно теги <mark> и </mark>, 
                // которые прислал бэкенд из FTS5 (иначе они сломают вёрстку, если в тексте были символы < и >)
                const safeSnippet = escapeHtml(t.snippet)
                    .replace(/&lt;mark&gt;/gi, '<mark>')
                    .replace(/&lt;\/mark&gt;/gi, '</mark>');
                desc = `...${safeSnippet}...`;
            }
            
            // При клике на тэг-карточку query НЕ передаём, чтобы внутри карточки 
            // не подсвечивались буквы из слова "tags"
            createItem(highlightString(t.title, query), `${taskIcon} Карточка &middot; ${t.workspace_name} / ${t.column_title}`, desc, () => window.navigateToEntityGlobal(t.workspace_id, t.column_id, t.id, isTagSearch ? null : query));
        });

        dropdown.classList.add('show');
    }
}

// Супер-роутер: переходит на вкладку -> скроллит к колонке -> (опционально) открывает карточку
window.navigateToEntityGlobal = async function(wsId, colId, taskId, highlightQuery = null, keepStack = false, openModal = true) {
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
                
                // 3. Обработка карточки
                if (taskId) {
                    // Подсвечиваем саму карточку (миниатюру на доске)
                    const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                    if (cardEl) {
                        cardEl.style.transition = 'box-shadow 0.3s';
                        cardEl.style.boxShadow = '0 0 0 2px var(--brand-pine)';
                        setTimeout(() => cardEl.style.boxShadow = '', 1500);
                    }

                    if (openModal) {
                        loadTaskIntoModal(taskId, true, highlightQuery);
                        document.getElementById('task-modal').classList.add('show');
                    }
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
// ЛОГИКА УВЕДОМЛЕНИЙ И КАСТОМНОГО КАЛЕНДАРЯ
// ==========================================

// Глобальное состояние пикера
let dpCurrentDate = new Date();
let dpSelectedDate = new Date();
let activeDatePickerTrigger = null; // Хранит активное поле ввода даты

function renderDatePicker() {
    const locale = dpLocales[currentLang];
    document.getElementById('dp-time-label').textContent = locale.time;
    
    // Отрисовка дней недели
    const weekdaysEl = document.getElementById('dp-weekdays');
    weekdaysEl.innerHTML = locale.days.map(d => `<span>${d}</span>`).join('');

    const year = dpCurrentDate.getFullYear();
    const month = dpCurrentDate.getMonth();
    
    document.getElementById('dp-month-year').textContent = `${locale.months[month]} ${year}`;
    
    const grid = document.getElementById('dp-grid');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const startDay = firstDay === 0 ? 6 : firstDay - 1; // Пн - 0, Вс - 6
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    
    // Предыдущий месяц
    for (let i = 0; i < startDay; i++) {
        const d = daysInPrevMonth - startDay + i + 1;
        const div = document.createElement('div');
        div.className = 'dp-cell empty';
        div.textContent = d;
        grid.appendChild(div);
    }

    // Текущий месяц
    for (let i = 1; i <= daysInMonth; i++) {
        const div = document.createElement('div');
        div.className = 'dp-cell';
        div.textContent = i;
        
        // Проверка на "Сегодня"
        if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) {
            div.classList.add('today');
        }
        
        // Проверка на "Выбрано"
        if (year === dpSelectedDate.getFullYear() && month === dpSelectedDate.getMonth() && i === dpSelectedDate.getDate()) {
            div.classList.add('selected');
        }

        div.onclick = (e) => {
            e.stopPropagation();
            dpSelectedDate.setFullYear(year, month, i);
            renderDatePicker();
            if (window.updateDatePickerTrigger) window.updateDatePickerTrigger();
        };
        grid.appendChild(div);
    }

    // Следующий месяц (добиваем сетку)
    const totalCells = startDay + daysInMonth;
    const remaining = Math.ceil(totalCells / 7) * 7 - totalCells;
    for (let i = 1; i <= remaining; i++) {
        const div = document.createElement('div');
        div.className = 'dp-cell empty';
        div.textContent = i;
        grid.appendChild(div);
    }
}

window.updateDatePickerTrigger = function() {
    if (!activeDatePickerTrigger) return;
    const timeStr = dpSelectedDate.toLocaleTimeString(currentLang, {hour: '2-digit', minute: '2-digit'});
    const dateStr = dpSelectedDate.toLocaleDateString(currentLang, {day: 'numeric', month: 'short', year: 'numeric'});
    activeDatePickerTrigger.textContent = `${dateStr}, ${timeStr}`;
};

// Привязка обработчиков для пикера (выполняется один раз)
document.addEventListener('DOMContentLoaded', () => {
    // === НАЧАЛО ВСТАВКИ: Оформление логики напоминаний ===
    
    // Автозамена на 15 происходит только при потере фокуса (клике вне поля)
    const amountInput = document.getElementById('notify-amount');
    if (amountInput) {
        amountInput.addEventListener('blur', () => {
            const rawValue = amountInput.value.trim();
            
            // Если поле полностью стерто или введено некорректное значение (<= 0)
            if (rawValue === '') {
                amountInput.value = '15';
                return;
            }
            
            const val = parseInt(rawValue);
            if (isNaN(val) || val <= 0) {
                amountInput.value = '15';
            }
        });
    }

    // Логика работы кастомного выпадающего списка единиц времени
    const trigger = document.getElementById('notify-unit-trigger');
    const menu = document.getElementById('notify-unit-menu');

    if (trigger && menu) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = menu.classList.contains('show');
            closeAllDropdowns();
            if (!isShowing) {
                menu.classList.add('show');
            }
        });

        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = item.dataset.value;
                const i18nKey = item.dataset.i18n;

                const labelSpan = document.getElementById('notify-unit-label');
                labelSpan.textContent = item.textContent;
                labelSpan.setAttribute('data-i18n', i18nKey);

                document.getElementById('notify-unit').value = val;

                menu.querySelectorAll('.menu-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                menu.classList.remove('show');
            });
        });
    }

    // === КОНЕЦ ВСТАВКИ ===

    // --- Переключение месяцев ---
    document.getElementById('dp-prev').onclick = (e) => {
        e.stopPropagation();
        dpCurrentDate.setMonth(dpCurrentDate.getMonth() - 1);
        renderDatePicker();
    };
    document.getElementById('dp-next').onclick = (e) => {
        e.stopPropagation();
        dpCurrentDate.setMonth(dpCurrentDate.getMonth() + 1);
        renderDatePicker();
    };

    // --- Переключение годов ---
    document.getElementById('dp-prev-year').onclick = (e) => {
        e.stopPropagation();
        dpCurrentDate.setFullYear(dpCurrentDate.getFullYear() - 1);
        renderDatePicker();
    };
    document.getElementById('dp-next-year').onclick = (e) => {
        e.stopPropagation();
        dpCurrentDate.setFullYear(dpCurrentDate.getFullYear() + 1);
        renderDatePicker();
    };

    document.getElementById('datepicker-trigger').onclick = (e) => {
        e.stopPropagation();
        closeAllDropdowns(); // Закроет всё лишнее
        
        const trigger = e.currentTarget;
        const rect = trigger.getBoundingClientRect();
        const dropdown = document.getElementById('datepicker-dropdown');
        
        // Измеряем реальную высоту календаря (в скрытом виде)
        dropdown.style.visibility = 'hidden';
        dropdown.style.display = 'flex';
        dropdown.classList.add('show');
        const dropHeight = dropdown.offsetHeight;
        dropdown.classList.remove('show');
        dropdown.style.visibility = '';
        dropdown.style.display = '';

        let topPos = rect.bottom + 8;
        let transformOrigin = 'top center';
        
        // Smart Collision: Если не влезает снизу - открываем наверх!
        if (topPos + dropHeight > window.innerHeight - 10) {
            topPos = rect.top - dropHeight - 8;
            transformOrigin = 'bottom center';
        }
        
        dropdown.style.top = `${topPos}px`;
        dropdown.style.left = `${rect.left + (rect.width / 2)}px`;
        dropdown.style.transformOrigin = transformOrigin;
        
        // Обязательный forced reflow перед добавлением класса анимации
        void dropdown.offsetWidth;
        
        dropdown.classList.add('show');
    };

    // Запрет закрытия при клике внутри пикера
    document.getElementById('datepicker-dropdown').onclick = (e) => {
        e.stopPropagation();
    };

    // Инпуты времени
    const hInput = document.getElementById('dp-hour');
    const mInput = document.getElementById('dp-minute');

    const handleTimeChange = () => {
        let h = parseInt(hInput.value) || 0;
        let m = parseInt(mInput.value) || 0;
        if (h < 0) h = 0; if (h > 23) h = 23;
        if (m < 0) m = 0; if (m > 59) m = 59;
        
        hInput.value = h.toString().padStart(2, '0');
        mInput.value = m.toString().padStart(2, '0');
        
        dpSelectedDate.setHours(h, m, 0, 0);
        if (window.updateDatePickerTrigger) window.updateDatePickerTrigger();
    };

    hInput.addEventListener('blur', handleTimeChange);
    mInput.addEventListener('blur', handleTimeChange);
    
    hInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleTimeChange(); });
    mInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleTimeChange(); });
});

function openNotifyModal(taskId, taskTitle) {
    const modal = document.getElementById('notify-modal');
    modal.dataset.taskId = taskId;
    modal.dataset.taskTitle = taskTitle;
    
    // Сброс инпутов "Через"
    document.getElementById('notify-amount').value = 15;
    
    // Сброс Кастомного Календаря на "Сейчас + 1 минута"
    dpSelectedDate = new Date();
    dpSelectedDate.setMinutes(dpSelectedDate.getMinutes() + 1);
    dpSelectedDate.setSeconds(0);
    dpSelectedDate.setMilliseconds(0);
    dpCurrentDate = new Date(dpSelectedDate);
    
    document.getElementById('dp-hour').value = dpSelectedDate.getHours().toString().padStart(2, '0');
    document.getElementById('dp-minute').value = dpSelectedDate.getMinutes().toString().padStart(2, '0');
    
    activeDatePickerTrigger = document.getElementById('datepicker-trigger');
    renderDatePicker();
    updateDatePickerTrigger();
    
    // Логика вкладок Segmented Control
    const btns = modal.querySelectorAll('.segmented-btn');
    const contents = modal.querySelectorAll('.notify-tab-content');
    
    btns.forEach(btn => {
        btn.onclick = () => {
            btns.forEach(b => b.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        };
    });
    
    // Кнопка подтверждения
    const confirmBtn = document.getElementById('btn-confirm-notify');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirmBtn);
    
    newConfirmBtn.onclick = async () => {
        let delaySeconds = 0;
        let timeText = ''; // Текст для подтверждающего уведомления
        const isRelative = modal.querySelector('.segmented-btn.active').dataset.target === 'notify-relative';
        
        if (isRelative) {
            const amount = parseInt(document.getElementById('notify-amount').value) || 0;
            const unitSelect = document.getElementById('notify-unit');
            const multiplier = parseInt(unitSelect.value) || 60;
            const unitText = document.getElementById('notify-unit-label').textContent;
            
            delaySeconds = amount * multiplier;
            timeText = currentLang === 'ru' ? `через ${amount} ${unitText}` : `in ${amount} ${unitText}`;
        } else {
            let targetTime = dpSelectedDate.getTime();
            const nowTime = Date.now();
            
            // Автоматическая корректировка, если время ушло в прошлое во время открытого окна
            if (targetTime < nowTime && (nowTime - targetTime) < 300000) {
                dpSelectedDate = new Date(nowTime + 10000); // Сдвигаем на 10 секунд вперед
                targetTime = dpSelectedDate.getTime();
            }
            
            delaySeconds = Math.floor((targetTime - nowTime) / 1000);
            
            const timeStr = dpSelectedDate.toLocaleTimeString(currentLang, {hour: '2-digit', minute: '2-digit'});
            const dateStr = dpSelectedDate.toLocaleDateString(currentLang, {day: 'numeric', month: 'short'});
            timeText = currentLang === 'ru' ? `${dateStr} в ${timeStr}` : `on ${dateStr} at ${timeStr}`;
        }
        
        if (delaySeconds <= 0) {
            window.showToast(
                t('alerts.error'), 
                currentLang === 'ru' ? 'Укажите время в будущем' : 'Please specify a future time', 
                true
            );
            return;
        }
        
        newConfirmBtn.style.opacity = '0.5';
        newConfirmBtn.disabled = true;
        
        try {
            const notificationMsg = currentLang === 'ru' 
                ? `Вы просили напомнить о карточке: "${taskTitle}"` 
                : `Reminder for card: "${taskTitle}"`;

            // 2. Само отложенное СИСТЕМНОЕ ОС-уведомление для задачи
            const res = await fetch(`${API_BASE}/tasks/${taskId}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    delay_seconds: delaySeconds,
                    title: 'Doe',
                    message: notificationMsg
                })
            });
            
            if (!res.ok) throw new Error('Network response was not ok');

            // 1. Красивое ВНУТРИПРОГРАММНОЕ уведомление о постановке таймера (теперь не вызывает краш)
            window.showToast(
                currentLang === 'ru' ? 'Напоминание установлено' : 'Reminder set',
                `"${taskTitle}" сработает ${timeText}`
            );

            modal.classList.remove('show');
            
            // Мгновенное обновление статуса индикатора в шапке
            updateBellBadge();
            
            // Мигание зеленой галочкой у кнопки модалки (если открыта карточка)
            const bellBtn = document.querySelector('.modal-notify');
            if (bellBtn) {
                bellBtn.style.color = 'var(--success-done)';
                setTimeout(() => bellBtn.style.color = '', 2000);
            }
        } catch (e) {
            console.error(e);
            window.showToast(t('alerts.error'), 'Не удалось установить напоминание', true);
        } finally {
            newConfirmBtn.style.opacity = '1';
            newConfirmBtn.disabled = false;
        }
    };
    
    modal.classList.add('show');
}

function openDueDateModal(taskId, currentDueDate) {
    const modal = document.getElementById('due-date-modal');
    modal.dataset.taskId = taskId;
    
    // Настраиваем пикер
    if (currentDueDate) {
        const dateStr = currentDueDate + (currentDueDate.endsWith('Z') || currentDueDate.includes('+') ? '' : 'Z');
        dpSelectedDate = new Date(dateStr);
    } else {
        dpSelectedDate = new Date();
        dpSelectedDate.setMinutes(dpSelectedDate.getMinutes() + 1);
        dpSelectedDate.setSeconds(0);
        dpSelectedDate.setMilliseconds(0);
    }
    dpCurrentDate = new Date(dpSelectedDate);
    
    document.getElementById('dp-hour').value = dpSelectedDate.getHours().toString().padStart(2, '0');
    document.getElementById('dp-minute').value = dpSelectedDate.getMinutes().toString().padStart(2, '0');
    
    // Устанавливаем активный триггер для календаря
    activeDatePickerTrigger = document.getElementById('due-datepicker-trigger');
    const trigger = activeDatePickerTrigger;
    
    // Вешаем открытие календаря на новый триггер
    trigger.onclick = (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        
        const rect = trigger.getBoundingClientRect();
        const dropdown = document.getElementById('datepicker-dropdown');
        
        dropdown.style.visibility = 'hidden';
        dropdown.style.display = 'flex';
        dropdown.classList.add('show');
        const dropHeight = dropdown.offsetHeight;
        dropdown.classList.remove('show');
        dropdown.style.visibility = '';
        dropdown.style.display = '';

        let topPos = rect.bottom + 8;
        let transformOrigin = 'top center';
        
        if (topPos + dropHeight > window.innerHeight - 10) {
            topPos = rect.top - dropHeight - 8;
            transformOrigin = 'bottom center';
        }
        
        dropdown.style.top = `${topPos}px`;
        dropdown.style.left = `${rect.left + (rect.width / 2)}px`;
        dropdown.style.transformOrigin = transformOrigin;
        
        void dropdown.offsetWidth;
        dropdown.classList.add('show');
    };

    renderDatePicker();
    updateDatePickerTrigger();

    // Кнопка Установить
    const confirmBtn = document.getElementById('btn-confirm-due-date');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirmBtn);
    
    newConfirmBtn.onclick = async () => {
        newConfirmBtn.style.opacity = '0.5';
        newConfirmBtn.disabled = true;
        try {
            const isoString = dpSelectedDate.toISOString();
            await updateTask(taskId, { due_date: isoString });
            
            // Обновляем локальный стейт
            for (let col of state.columns) {
                let t = col.tasks.find(task => task.id == taskId);
                if (t) {
                    t.due_date = isoString;
                    const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                    if (cardEl) updateCardAppearance(cardEl, t, col.mode);
                    break;
                }
            }
            
            loadTaskIntoModal(taskId, false); // Обновляем пилюлю в модалке
            modal.classList.remove('show');
        } catch (e) {
            window.showToast(t('alerts.error'), 'Не удалось установить срок', true);
        } finally {
            newConfirmBtn.style.opacity = '1';
            newConfirmBtn.disabled = false;
        }
    };

    // Кнопка Очистить / Отмена
            const clearBtn = document.getElementById('btn-clear-due-date');
            const newClearBtn = clearBtn.cloneNode(true);
            clearBtn.replaceWith(newClearBtn);
            
            if (currentDueDate) {
                // Если срок был задан ранее — показываем кнопку "Очистить"
                newClearBtn.textContent = t('modals.dueDateClear');
                newClearBtn.setAttribute('data-i18n', 'modals.dueDateClear');
                newClearBtn.onclick = async () => {
                    newClearBtn.style.opacity = '0.5';
                    newClearBtn.disabled = true;
                    try {
                        await updateTask(taskId, { due_date: null });
                        
                        // Обновляем локальный стейт
                        for (let col of state.columns) {
                            let t = col.tasks.find(task => task.id == taskId);
                            if (t) {
                                t.due_date = null;
                                const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                                if (cardEl) updateCardAppearance(cardEl, t, col.mode);
                                break;
                            }
                        }
                        
                        loadTaskIntoModal(taskId, false);
                        modal.classList.remove('show');
                    } catch (e) {
                        window.showToast(t('alerts.error'), 'Не удалось очистить срок', true);
                    } finally {
                        newClearBtn.style.opacity = '1';
                        newClearBtn.disabled = false;
                    }
                };
            } else {
                // Если срок не задан — показываем кнопку "Отмена"
                newClearBtn.textContent = t('cancel');
                newClearBtn.setAttribute('data-i18n', 'cancel');
                newClearBtn.onclick = () => {
                    modal.classList.remove('show');
                };
            }
            
            modal.classList.add('show');
}

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
            
            // Анимация успешного копирования (короткая вспышка цвета без смены HTML)
            copyBtn.classList.add('copied');
            setTimeout(() => copyBtn.classList.remove('copied'), 600);
        } catch (err) {
            console.error("Failed to copy link: ", err);
        }
    }
});

function parseMarkdownWithMath(text) {
    if (!text) return "";
    const mathBlocks = [];
    const codeBlocks = [];
    
    // 1. ИЗОЛИРУЕМ КОД (чтобы внутри него не парсились картинки, формулы и HTML)
    let processed = text.replace(/(```[\s\S]*?```|`[^`]*`)/g, (match) => {
        codeBlocks.push(match);
        return `DOECODEPLACEHOLDER${codeBlocks.length - 1}END`;
    });

    // 2. Изолируем Блочные формулы ($$...$$)
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
        mathBlocks.push({ math, displayMode: true });
        return `DOEMATHPLACEHOLDER${mathBlocks.length - 1}END`;
    });

    // 3. Изолируем Инлайн формулы ($...$)
    processed = processed.replace(/\$([^$\n]+?)\$/g, (match, math) => {
        mathBlocks.push({ math, displayMode: false });
        return `DOEMATHPLACEHOLDER${mathBlocks.length - 1}END`;
    });

    // 4. ПРЕ-ПРОЦЕССИНГ ИЗОБРАЖЕНИЙ С РЕСАЙЗОМ (и отсев не-изображений)
    // Ищет: ![alt](doe/file.png){100, 200} или просто ![alt](doe/file.png)
    processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{(\d+)\s*,\s*(\d+)\})?/g, (match, alt, url, w, h) => {
        const ext = url.split('.').pop().toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
        
        if (!isImage) {
            return `[${alt}](${url})`;
        }

        const safeMatch = escapeHtml(match);
        let style = '';
        let customClass = '';
        
        if (w && h) {
            style = `width: ${w}px; height: ${h}px;`;
            customClass = 'has-custom-size';
        }

        return `<span class="image-resizer-wrapper ${customClass}" style="${style}" data-md="${safeMatch}"><img src="/${url}" alt="${alt}" draggable="false"><span class="image-resize-handle" title="Потяните для изменения размера"></span></span>`;
    });

    // 5. ВОЗВРАЩАЕМ КОД НА МЕСТО ДО ПАРСИНГА MARKED (Marked сам обернет его в <pre><code>)
    codeBlocks.forEach((code, i) => {
        // Используем callback () => code, чтобы символы '$' в коде не ломали replace
        processed = processed.replace(`DOECODEPLACEHOLDER${i}END`, () => code);
    });

    // 6. Парсим чистый Markdown
    let html = marked.parse(processed, { breaks: true });

    // 7. Рендерим и возвращаем формулы на место
    if (window.katex) {
        mathBlocks.forEach((item, i) => {
            try {
                const rendered = katex.renderToString(item.math, {
                    displayMode: item.displayMode,
                    throwOnError: false,
                    output: 'html',
                    strict: false
                });
                html = html.replace(`DOEMATHPLACEHOLDER${i}END`, () => rendered);
            } catch (e) {
                html = html.replace(`DOEMATHPLACEHOLDER${i}END`, () => `<code>${item.math}</code>`);
            }
        });
    } else {
        mathBlocks.forEach((item, i) => {
            html = html.replace(`DOEMATHPLACEHOLDER${i}END`, () => `<code>${item.math}</code>`);
        });
    }

    return html;
}

function initLocalSearchLogic() {
    const widget = document.getElementById('local-search-widget');
    const input = document.getElementById('local-search-input');
    const countEl = document.getElementById('local-search-count');
    const btnNext = document.getElementById('local-search-next');
    const btnPrev = document.getElementById('local-search-prev');
    const btnClose = document.getElementById('local-search-close');
    const renderDiv = document.getElementById('task-desc-render');
    const scrollParent = document.querySelector('.task-detail-body');

    let matchRanges = [];
    let currentMatchIndex = -1;

    window.openLocalSearch = () => {
        if (renderDiv.style.display === 'none') return;
        widget.classList.add('show');
        setTimeout(() => { input.focus(); input.select(); }, 50);
        if (input.value.trim()) performLocalSearch(input.value);
    };

    window.closeLocalSearch = () => {
        widget.classList.remove('show');
        clearLocalSearch();
        input.value = '';
    };

    function clearLocalSearch() {
        if (CSS.highlights) {
            CSS.highlights.clear();
        }
        matchRanges = [];
        currentMatchIndex = -1;
        countEl.textContent = '0/0';
    }

    function performLocalSearch(query) {
        clearLocalSearch();
        if (!query.trim()) return;

        const textLower = query.toLowerCase();
        const walker = document.createTreeWalker(renderDiv, NodeFilter.SHOW_TEXT, null, false);
        
        // Асинхронный поиск порциями, чтобы не вешать UI
        function searchNextChunk() {
            const startTime = performance.now();
            let node;
            
            // Ищем, пока не исчерпаем 10 миллисекунд (оставляем время на отрисовку кадров)
            while ((node = walker.nextNode()) && (performance.now() - startTime < 10)) {
                const nodeText = node.nodeValue.toLowerCase();
                let startIndex = 0;
                while ((startIndex = nodeText.indexOf(textLower, startIndex)) !== -1) {
                    const range = new Range();
                    range.setStart(node, startIndex);
                    range.setEnd(node, startIndex + query.length);
                    matchRanges.push(range);
                    startIndex += query.length;
                }
            }

            if (node) {
                // Если не успели дойти до конца текста - планируем продолжение на следующий кадр
                requestAnimationFrame(searchNextChunk);
            } else {
                // Поиск завершен
                if (matchRanges.length > 0) {
                    currentMatchIndex = 0;
                    if (CSS.highlights) {
                        CSS.highlights.set('local-search', new Highlight(...matchRanges));
                    }
                    updateLocalSearchUI();
                } else {
                    countEl.textContent = '0/0';
                }
            }
        }
        
        requestAnimationFrame(searchNextChunk);
    }

    function updateLocalSearchUI() {
        if (matchRanges.length === 0 || currentMatchIndex < 0) return;

        const activeRange = matchRanges[currentMatchIndex];

        // Подсвечиваем активный элемент (если поддерживается API)
        if (CSS.highlights) {
            const highlightActive = new Highlight(activeRange);
            CSS.highlights.set('local-search-active', highlightActive);
        }

        // Автоскролл к элементу (Range имеет getBoundingClientRect)
        const rect = activeRange.getBoundingClientRect();
        
        // Разворачивание скрытых заголовков
        let block = activeRange.startContainer.parentElement;
        while (block && block !== renderDiv) {
            if (block.classList.contains('is-hidden-by-fold')) {
                let prev = block.previousElementSibling;
                while (prev) {
                    if (prev.classList.contains('foldable-heading') && prev.classList.contains('is-folded')) {
                        prev.click();
                    }
                    prev = prev.previousElementSibling;
                }
            }
            block = block.parentElement;
        }

        // Скроллим родителя
        if (scrollParent && rect.top !== 0) {
            const parentRect = scrollParent.getBoundingClientRect();
            if (rect.top < parentRect.top + 50 || rect.bottom > parentRect.bottom - 50) {
                const relativeTop = rect.top - parentRect.top + scrollParent.scrollTop;
                scrollParent.scrollTo({
                    top: relativeTop - (parentRect.height / 2),
                    behavior: 'smooth'
                });
            }
        }

        countEl.textContent = `${currentMatchIndex + 1}/${matchRanges.length}`;
    }

    function nextMatch() {
        if (matchRanges.length === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % matchRanges.length;
        updateLocalSearchUI();
    }

    function prevMatch() {
        if (matchRanges.length === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + matchRanges.length) % matchRanges.length;
        updateLocalSearchUI();
    }

    input.addEventListener('input', () => performLocalSearch(input.value));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prevMatch() : nextMatch(); }
        if (e.key === 'Escape') { e.preventDefault(); window.closeLocalSearch(); }
    });
    btnNext.addEventListener('click', nextMatch);
    btnPrev.addEventListener('click', prevMatch);
    btnClose.addEventListener('click', window.closeLocalSearch);
}

// Запускаем инициализацию (можно поместить вызов внутрь главной IIFE async функции внизу файла)
initTaskDescriptionLogic();
initLocalSearchLogic();

// ==========================================
// ГРАФ СВЯЗЕЙ (Obsidian-style, Canvas + физика)
// ==========================================
const G = {
    nodes: [], edges: [], nodeMap: {},
    scale: 1, offsetX: 0, offsetY: 0,
    W: 0, H: 0, dpr: 1,
    hoverNode: null, dragNode: null, isPanning: false,
    mouseDownPos: null, lastX: 0, lastY: 0,
    running: false,
    showArrows: false,
    repulsionForce: 9000,         // <-- НОВОЕ: Текущая сила отталкивания
    nodeAt: null, graphNodeRadius: null
};

function resizeGraphCanvas() {
    const canvas = document.getElementById('graph-canvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    G.W = rect.width;
    G.H = rect.height;
    G.dpr = dpr;
}

function initGraphModal() {
    const canvas = document.getElementById('graph-canvas');
    const modal = document.getElementById('graph-modal');
    const tooltip = document.getElementById('graph-tooltip');
    if (!canvas || !modal || !tooltip) return;
    const tooltipInner = tooltip.querySelector('.tooltip-inner');

    function screenToWorld(mx, my) {
        return { x: (mx - G.offsetX) / G.scale, y: (my - G.offsetY) / G.scale };
    }
    function graphNodeRadius(n) {
        // Чем больше связей — тем жирнее точка
        return 5 + Math.min(n.degree || 0, 12) * 1.6;
    }
    function nodeAt(mx, my) {
        const w = screenToWorld(mx, my);
        for (let i = G.nodes.length - 1; i >= 0; i--) {
            const n = G.nodes[i];
            const r = graphNodeRadius(n) + 4 / G.scale; // запас на попадание
            const dx = n.x - w.x, dy = n.y - w.y;
            if (dx * dx + dy * dy <= r * r) return n;
        }
        return null;
    }
    G.nodeAt = nodeAt;
    G.graphNodeRadius = graphNodeRadius;

    // ЗУМ (колесо мыши / тачпад) с центрированием на курсоре
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const w = screenToWorld(mx, my);
        let ns = G.scale * (1 - e.deltaY * 0.0015);
        ns = Math.max(0.15, Math.min(6, ns));
        G.scale = ns;
        G.offsetX = mx - w.x * G.scale;
        G.offsetY = my - w.y * G.scale;
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        G.mouseDownPos = { x: e.clientX, y: e.clientY };
        const n = nodeAt(mx, my);
        if (n) {
            G.dragNode = n; // тащим узел
        } else {
            G.isPanning = true; // двигаем "холст"
            canvas.style.cursor = 'grabbing';
        }
        G.lastX = e.clientX; G.lastY = e.clientY;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;

        if (G.dragNode) {
            const w = screenToWorld(mx, my);
            G.dragNode.x = w.x; G.dragNode.y = w.y;
            G.dragNode.vx = 0; G.dragNode.vy = 0;
        } else if (G.isPanning) {
            G.offsetX += e.clientX - G.lastX;
            G.offsetY += e.clientY - G.lastY;
            G.lastX = e.clientX; G.lastY = e.clientY;
        } else {
            G.hoverNode = nodeAt(mx, my);
            if (G.hoverNode) {
                canvas.style.cursor = 'pointer';
                tooltipInner.textContent = G.hoverNode.title || '';
                tooltip.style.left = (e.clientX + 14) + 'px';
                tooltip.style.top = (e.clientY + 14) + 'px';
                tooltip.classList.add('visible');
            } else {
                canvas.style.cursor = 'grab';
                tooltip.classList.remove('visible');
            }
        }
    });

    const endPointer = (e) => {
        // Если мышь почти не сдвинулась — считаем это кликом
        if (G.mouseDownPos &&
            Math.abs(e.clientX - G.mouseDownPos.x) < 5 &&
            Math.abs(e.clientY - G.mouseDownPos.y) < 5) {
            const rect = canvas.getBoundingClientRect();
            const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (n) {
                G.running = false;
                modal.classList.remove('show');
                tooltip.classList.remove('visible');
                // Переход к карточке на доске + подсветка + открытие
                window.navigateToEntityGlobal(n.workspace_id, n.column_id, n.id, null, true, true);
            }
        }
        G.dragNode = null;
        G.isPanning = false;
        G.mouseDownPos = null;
        canvas.style.cursor = G.hoverNode ? 'pointer' : 'grab';
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('pointerleave', () => {
        tooltip.classList.remove('visible');
        G.hoverNode = null;
    });

    window.addEventListener('resize', () => {
        if (modal.classList.contains('show')) resizeGraphCanvas();
    });

    // Переключатель стрелок (со стрелками / без)
    const arrowsToggle = document.getElementById('graph-arrows-toggle');
    if (arrowsToggle) {
        arrowsToggle.classList.toggle('active', G.showArrows);
        arrowsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            G.showArrows = !G.showArrows;
            arrowsToggle.classList.toggle('active', G.showArrows);
        });
    }

    // Слушатель для ползунка силы отталкивания
    const repulsionSlider = document.getElementById('graph-repulsion-slider');
    if (repulsionSlider) {
        G.repulsionForce = parseInt(repulsionSlider.value);
        repulsionSlider.addEventListener('input', (e) => {
            G.repulsionForce = parseInt(e.target.value);
            // Если физика уже уснула, даем микро-импульс для перестроения
            if (G.running) {
                G.nodes.forEach(n => { n.vx += (Math.random() - 0.5) * 2; n.vy += (Math.random() - 0.5) * 2; });
            }
        });
    }
}

async function openGraphModal() {
    const modal = document.getElementById('graph-modal');
    const emptyEl = document.getElementById('graph-empty');
    if (!modal) return;

    modal.classList.add('show');

    // Даём модалке встать в layout, затем меряем canvas
    await new Promise(r => requestAnimationFrame(r));
    resizeGraphCanvas();

    let data = { nodes: [], edges: [] };
    try {
        const res = await fetch(`${API_BASE}/system/graph`);
        if (res.ok) data = await res.json();
    } catch (e) {
        console.error("Graph load failed", e);
    }

    // Раскидываем узлы вокруг центра
    const cx = G.W / 2, cy = G.H / 2;
    const spread = Math.min(600, Math.max(200, G.W));
    G.nodes = data.nodes.map(n => ({
        ...n,
        x: cx + (Math.random() - 0.5) * spread,
        y: cy + (Math.random() - 0.5) * spread,
        vx: 0, vy: 0
    }));
    G.nodeMap = {};
    G.nodes.forEach(n => G.nodeMap[n.id] = n);
    G.edges = data.edges.filter(e => G.nodeMap[e.source] && G.nodeMap[e.target]);

    // Сброс камеры
    G.scale = 1; G.offsetX = 0; G.offsetY = 0;
    G.hoverNode = null; G.dragNode = null; G.isPanning = false;

    if (G.nodes.length === 0) {
        emptyEl.textContent = t('graph.empty');
        emptyEl.style.display = 'flex';
    } else {
        emptyEl.style.display = 'none';
    }

    G.running = true;
    runGraphLoop();
}

function runGraphLoop() {
    const modal = document.getElementById('graph-modal');
    const canvas = document.getElementById('graph-canvas');
    // Получаем контекст один раз, отключаем alpha чтение для скорости, если применимо
    const ctx = canvas.getContext('2d', { alpha: false });

    const styles = getComputedStyle(document.documentElement);
    const colorNode = (styles.getPropertyValue('--brand-pine') || '#4A5A48').trim();
    const colorText = (styles.getPropertyValue('--text-primary') || '#2A3029').trim();
    const colorEdge = (styles.getPropertyValue('--text-secondary') || '#828A80').trim();
    const bgColor = (styles.getPropertyValue('--bg-board') || '#EBEAE3').trim();

    // Настройки Spatial Hash Grid
    const CELL_SIZE = 300; // Дистанция, дальше которой узлы не отталкиваются

    function step() {
        if (!G.running || !modal.classList.contains('show')) {
            G.running = false;
            return;
        }

        const repulsion = G.repulsionForce; // Берем силу из ползунка
        const k = 0.015;        // Притяжение по рёбрам
        const nodes = G.nodes;
        const totalNodes = nodes.length;

        // --- 1. ФИЗИКА: SPATIAL HASH GRID O(N) вместо O(N^2) ---
        // Очищаем и строим сетку заново каждый кадр (быстрая операция)
        const grid = new Map();
        
        for (let i = 0; i < totalNodes; i++) {
            const n = nodes[i];
            const cx = Math.floor(n.x / CELL_SIZE);
            const cy = Math.floor(n.y / CELL_SIZE);
            const key = cx + ',' + cy;
            
            let cell = grid.get(key);
            if (!cell) {
                cell = [];
                grid.set(key, cell);
            }
            cell.push(n);
        }

        // Отталкивание только от узлов в текущей и 8 соседних ячейках
        for (let i = 0; i < totalNodes; i++) {
            const a = nodes[i];
            const cx = Math.floor(a.x / CELL_SIZE);
            const cy = Math.floor(a.y / CELL_SIZE);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = (cx + dx) + ',' + (cy + dy);
                    const cell = grid.get(key);
                    if (!cell) continue;

                    for (let j = 0; j < cell.length; j++) {
                        const b = cell[j];
                        if (a === b) continue;
                        
                        let diffX = a.x - b.x;
                        let diffY = a.y - b.y;
                        let d2 = diffX * diffX + diffY * diffY;
                        
                        // Если расстояние больше CELL_SIZE, сила = 0 (обрезаем физику)
                        if (d2 > CELL_SIZE * CELL_SIZE) continue;
                        
                        if (d2 < 0.01) { 
                            diffX = (Math.random() - 0.5); 
                            diffY = (Math.random() - 0.5); 
                            d2 = 1; 
                        }
                        
                        const d = Math.sqrt(d2);
                        // Высчитываем силу (учитываем, что мы считаем это для каждой пары, поэтому делим силу)
                        const f = (repulsion / d2) * 0.5; 
                        
                        a.vx += (diffX / d) * f;
                        a.vy += (diffY / d) * f;
                    }
                }
            }
        }

        // Притяжение по рёбрам (Пружины) O(E)
        const edgesCount = G.edges.length;
        for (let i = 0; i < edgesCount; i++) {
            const e = G.edges[i];
            const a = G.nodeMap[e.source];
            const b = G.nodeMap[e.target];
            if (!a || !b) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            a.vx += dx * k; a.vy += dy * k;
            b.vx -= dx * k; b.vy -= dy * k;
        }

        // Применение скоростей, затухание и легкое центрирование
        const cx = G.W / 2, cy = G.H / 2;
        let totalKineticEnergy = 0;

        for (let i = 0; i < totalNodes; i++) {
            const n = nodes[i];
            n.vx += (cx - n.x) * 0.002; 
            n.vy += (cy - n.y) * 0.002;
            n.vx *= 0.82; 
            n.vy *= 0.82; 
            if (n !== G.dragNode) { 
                n.x += n.vx; 
                n.y += n.vy; 
            }
            totalKineticEnergy += Math.abs(n.vx) + Math.abs(n.vy);
        }

        // --- 2. РЕНДЕР: Frustum Culling (Отсечение невидимого) и LOD ---
        ctx.save();
        ctx.scale(G.dpr, G.dpr);
        
        // Рисуем фон (так как alpha: false)
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, G.W, G.H);
        
        ctx.translate(G.offsetX, G.offsetY);
        ctx.scale(G.scale, G.scale);

        // Вычисляем видимую область (View Frustum) в координатах мира
        const viewLeft = -G.offsetX / G.scale;
        const viewTop = -G.offsetY / G.scale;
        const viewRight = (G.W - G.offsetX) / G.scale;
        const viewBottom = (G.H - G.offsetY) / G.scale;

        // Если узлов слишком много (>5000) и отдаление сильное, рисуем квадратами для экономии CPU
        const useFastLOD = (totalNodes > 5000 && G.scale < 0.2);

        // Отрисовка Рёбер (Только те, которые попадают в экран)
        ctx.strokeStyle = colorEdge;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1 / G.scale;
        
        const arrowLen = 9 / G.scale;
        const arrowAng = 0.42;

        ctx.beginPath();
        for (let i = 0; i < edgesCount; i++) {
            const e = G.edges[i];
            const a = G.nodeMap[e.source];
            const b = G.nodeMap[e.target];
            if (!a || !b) continue;

            // Frustum Culling для рёбер (хотя бы один конец на экране)
            if ((a.x < viewLeft && b.x < viewLeft) || 
                (a.x > viewRight && b.x > viewRight) || 
                (a.y < viewTop && b.y < viewTop) || 
                (a.y > viewBottom && b.y > viewBottom)) {
                continue; 
            }

            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);

            if (G.showArrows) {
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 1;
                const ux = dx / dist, uy = dy / dist;
                const rRadius = G.graphNodeRadius(b);
                const tipX = b.x - ux * rRadius;
                const tipY = b.y - uy * rRadius;
                const ang = Math.atan2(uy, ux);
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(tipX - arrowLen * Math.cos(ang - arrowAng), tipY - arrowLen * Math.sin(ang - arrowAng));
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(tipX - arrowLen * Math.cos(ang + arrowAng), tipY - arrowLen * Math.sin(ang + arrowAng));
            }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Отрисовка Узлов (С отсечением невидимого)
        ctx.fillStyle = colorNode;
        if (useFastLOD) {
            // Сверхбыстрый рендер квадратами (без beginPath на каждый узел)
            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                // Culling
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;
                
                if (n === G.hoverNode) {
                    ctx.fillStyle = colorText;
                    ctx.fillRect(n.x - r, n.y - r, r*2, r*2);
                    ctx.fillStyle = colorNode; // Возвращаем цвет
                } else {
                    ctx.fillRect(n.x - r, n.y - r, r*2, r*2);
                }
            }
        } else {
            // Классический красивый рендер кругами
            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                // Culling
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;

                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
                ctx.fillStyle = (n === G.hoverNode) ? colorText : colorNode;
                ctx.fill();
            }
        }

        // Отрисовка подписей (Они видны только вблизи, и только на экране)
        if (G.scale > 1.3) {
            ctx.fillStyle = colorText;
            ctx.textAlign = 'center';
            ctx.font = `${12 / G.scale}px Inter, -apple-system, sans-serif`;
            ctx.globalAlpha = Math.min(1, (G.scale - 1.3) / 0.6);
            
            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                // Строгий Culling для текста
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;

                let label = n.title || '';
                if (label.length > 15) label = label.substring(0, 14) + '…';
                ctx.fillText(label, n.x, n.y + r + 14 / G.scale);
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // Спящий режим: если кинетическая энергия системы близка к нулю (и мышь не тащит),
        // пропускаем кадры для экономии батареи, пока юзер не покрутит колесико или не тронет слайдер.
        if (totalKineticEnergy < 0.1 && !G.dragNode) {
            // Мы не останавливаем requestAnimationFrame полностью, чтобы мгновенно проснуться при зуме
            requestAnimationFrame(step);
            return;
        }

        requestAnimationFrame(step);
    }
    step();
}

// Инициализация слушателей канваса (один раз)
initGraphModal();

// Открытие графа по кнопке в шапке
document.getElementById('graph-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    openGraphModal();
});

// 🔥 ГЛОБАЛЬНЫЙ ПЕРЕХВАТ FETCH: Игнорируем эхо своих же изменений в БД
const originalFetch = window.fetch;
window._lastLocalEdit = 0;
window.fetch = async function(...args) {
    const url = args[0] || '';
    const options = args[1] || {};
    const method = options.method || 'GET';
    
    // Если мы отправляем команду на изменение данных (POST, PUT, DELETE)
    if (method !== 'GET' && typeof url === 'string' && url.includes('/api/v1/')) {
        window._lastLocalEdit = Date.now();
    }
    return originalFetch.apply(this, args);
};

// 🔥 WEBSOCKET КЛИЕНТ ДЛЯ ICLOUD SYNC
function initCloudSync() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//127.0.0.1:8000/api/v1/system/ws`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
        if (event.data === "db_updated") {
            // 1. Защита от "эха": Если мы сами меняли БД менее 2.5 сек назад — игнорируем
            if (Date.now() - window._lastLocalEdit < 2500) return;
            
            // 2. UX Защита: Не мешаем пользователю, если он сейчас работает руками
            if (typeof isDragging !== 'undefined' && isDragging) return;
            if (document.querySelector('.is-renaming')) return;
            if (document.querySelector('.card-entering:not(.is-exiting)')) return;
            if (document.querySelector('.column-entering:not(.is-exiting)')) return;
            
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
                // Пользователь печатает, тихий рефреш лучше отложить
                return;
            }

            console.log("[iCloud Sync] Обнаружено внешнее изменение файла БД. Перерисовываем UI...");
            
            // Если мы на главном экране — перерисовываем доску (тихо, без сброса скролла)
            if (document.getElementById('vault-screen').classList.contains('hidden')) {
                refreshBoard();
            } else {
                // Если мы на экране хранилищ — обновляем список (там могла измениться дата последнего входа)
                renderVaultHistory();
            }
        }
    };

    ws.onclose = () => {
        setTimeout(initCloudSync, 3000); // Авто-реконнект при потере связи
    };
}

(async () => {
    initTooltip();
    initTabsScrollbar();
    initBoardScrollbar();
    initTaskModalDragAndResize();
    initGlobalSearch();
    initCloudSync(); // <-- ЗАПУСКАЕМ НАШ СИНХРОНИЗАТОР

    // Проверяем, в каком режиме открыто текущее окно (App или Vault Selector)
    const urlParams = new URLSearchParams(window.location.search);
    const isVaultMode = urlParams.get('mode') === 'vault';

    // 1. Первичная настройка темы/языка из кэша (чтобы не моргало)
        try {
            applyLanguage(localStorage.getItem('doe-lang') || 'ru', false);
            applyTheme(localStorage.getItem('doe-theme') || 'light', false);
        } catch (e) {}

        // Обработка карточки, если произошла перезагрузка страницы для смены хранилища по уведомлению
        const pendingHighlight = localStorage.getItem('doe-pending-highlight');
        if (pendingHighlight) {
            localStorage.removeItem('doe-pending-highlight');
            setTimeout(async () => {
                try {
                    const ctxRes = await fetch(`${API_BASE}/tasks/${pendingHighlight}/context`);
                    if (ctxRes.ok) {
                        const context = await ctxRes.json();
                        window.navigateToEntityGlobal(context.workspace_id, context.column_id, parseInt(pendingHighlight), null, true, true);
                    }
                } catch (e) {}
            }, 800); // Даем UI время на полное построение доски
        }

        // Глобальные лисенеры вешаем в любом случае
        setInterval(updateTimers, 250);
        
        // 🌟 МОСТ С ОПЕРАЦИОННОЙ СИСТЕМОЙ: Слушаем клики по системным уведомлениям
        setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/system/pending-highlights`);
                if (!res.ok) return;
                const data = await res.json();
                
                if (data.task_id) {
                    const vaultRes = await fetch(`${API_BASE}/system/vault`);
                    const currentVault = await vaultRes.json();
                    
                    // Если ОС-уведомление от другого хранилища, переключаем контекст
                    if (data.vault_path && data.vault_path !== currentVault.path) {
                        await fetch(`${API_BASE}/system/vault/switch`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ new_path: data.vault_path })
                        });
                        localStorage.setItem('doe-pending-highlight', data.task_id);
                        window.location.reload();
                        return;
                    }
                    
                    // Запрашиваем контекст, чтобы знать в какой вкладке эта карточка
                    const ctxRes = await fetch(`${API_BASE}/tasks/${data.task_id}/context`);
                    if (!ctxRes.ok) return;
                    
                    const context = await ctxRes.json();
                    
                    // Закрываем модалку карточки, если она открыта, чтобы юзер увидел доску
                    const taskModal = document.getElementById('task-modal');
                    if (taskModal && taskModal.classList.contains('show')) {
                        taskModal.classList.remove('show');
                    }
                    
                    // Используем наш роутер: он переключит вкладку, доскроллит, 
                    // подсветит миниатюру карточки на доске и ОТКРОЕТ модалку (последний параметр true)
                    window.navigateToEntityGlobal(context.workspace_id, context.column_id, data.task_id, null, true, true);
                    
                    // Мгновенно обновляем индикатор колокольчика при переходе по клику
                    updateBellBadge();
                }
            } catch (e) {}
        }, 1000); // Опрашиваем раз в секунду

        window.addEventListener('resize', () => {
            requestAnimationFrame(() => {
                clampExpandedTitles();
                adjustCollapsedColumnWidths();
                updateVaultHistoryScrollState();
            });
        });

    // Если это окно выбора хранилища — загружаем настройки, историю и показываем занавес
    if (isVaultMode) {
        document.getElementById('vault-screen').classList.remove('hidden', 'content-hidden');

        // Включаем Vault Mode для светофора при загрузке
        const lights = document.getElementById('mac-traffic-lights');
        if (lights) lights.classList.add('vault-mode');

        try {
            // Даже на экране входа мы запрашиваем глобальные настройки (тема/язык)
            const settingsData = await fetchSettings().catch(() => ({}));
            if (settingsData.theme) applyTheme(settingsData.theme, false);
            if (settingsData.language) applyLanguage(settingsData.language, false);
        } catch (e) { console.error("Settings load failed in vault mode", e); }

        renderVaultHistory();

        // 🔥 СЕНЬОР ФИКС: Живая синхронизация с файловой системой ОС (Background Poller)
        // Динамически обновляет DOM без перерисовки всего списка (не ломает фокусы и ховеры)
        setInterval(async () => {
            try {
                const history = await fetchVaultHistory();
                history.forEach(item => {
                    // Экранируем слэши (особенно важно для путей Windows)
                    const safePath = item.path.replace(/\\/g, '\\\\');
                    const el = document.querySelector(`.vault-history-item[data-path="${safePath}"]`);
                    
                    if (el) {
                        const isMissing = item.exists === false;
                        const checkbox = el.querySelector('.subtask-checkbox');
                        const nameEl = el.querySelector('.vault-history-name');
                        const pathEl = el.querySelector('.vault-history-path');
                        const revealBtn = el.querySelector('.vault-hist-reveal');

                        if (isMissing && !checkbox.classList.contains('missing')) {
                            // Хранилище пропало (удалили или переименовали в ОС)
                            checkbox.classList.add('missing');
                            el.classList.add('is-missing');
                            checkbox.title = currentLang === 'ru' ? 'Хранилище не найдено. Нажмите, чтобы перепривязать' : 'Vault not found. Click to relink';
                            checkbox.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
                            nameEl.classList.add('missing-text');
                            pathEl.classList.add('missing-text');
                            if (revealBtn) revealBtn.style.display = 'none';
                        } else if (!isMissing && checkbox.classList.contains('missing')) {
                            // Хранилище появилось (восстановили из корзины в ОС)
                            checkbox.classList.remove('missing');
                            el.classList.remove('is-missing');
                            checkbox.removeAttribute('title');
                            checkbox.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
                            nameEl.classList.remove('missing-text');
                            pathEl.classList.remove('missing-text');
                            if (revealBtn) revealBtn.style.display = '';
                        }
                    }
                });
            } catch (e) {}
        }, 1500); // Опрос раз в 1.5 секунды абсолютно не нагружает железо, но дает идеальный отклик

        document.body.classList.remove('preload');
        setTimeout(triggerReveal, 50);
        return; 
    }

    // Если это основное окно доски — гарантируем, что занавес выбора хранилища скрыт
    document.getElementById('vault-screen').classList.add('hidden', 'content-hidden');

    try {
        // 🌟 ЗАПРОС РАЗРЕШЕНИЙ НА УВЕДОМЛЕНИЯ ПРИ ПЕРВОМ ЗАПУСКЕ
        if (!localStorage.getItem('doe-notif-requested')) {
            localStorage.setItem('doe-notif-requested', 'true');
            // Web API запрос (если поддерживается)
            if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                Notification.requestPermission();
            }
        }

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

            // Запрашиваем состояние напоминаний ДО удаления класса preload и показа окна.
            // Это гарантирует, что индикатор отрисуется за кулисами и появится одновременно с доской.
            await updateBellBadge().catch(console.error);

            // 5. ПОКАЗЫВАЕМ ОКНО (убираем preload)
            document.body.classList.remove('preload');
            setTimeout(triggerReveal, 50);

        } catch (e) {
            console.error("Fatal initialization error:", e);
            document.body.classList.remove('preload');
            setTimeout(triggerReveal, 50); 
        }
})();

// Перехватываем нажатие на плюс в зазорах на этапе погружения (capture),
// чтобы мгновенно открыть новую форму ДО того, как асинхронный blur старой формы
// запустит анимацию схлопывания и сдвинет верстку под курсором мыши.
document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // Только левый клик мыши
    const plusBtn = e.target.closest('.divider-plus-btn');
    if (plusBtn) {
        e.preventDefault();
        e.stopPropagation();
        onAddCardInline(plusBtn);
    }
}, { capture: true });


// --- ФУНКЦИОНАЛ НАПОМИНАНИЙ И КОЛОКОЛЬЧИКА ---
async function fetchActiveReminders() {
    try {
        const res = await fetch(`${API_BASE}/system/reminders?t=${Date.now()}`);
        if (res.ok) return await res.json();
    } catch (e) {
        console.error("Failed to fetch reminders:", e);
    }
    return [];
}

async function cancelReminder(reminderId, event) {
    if (event) event.stopPropagation();
    try {
        const res = await fetch(`${API_BASE}/system/reminders/${reminderId}`, { method: 'DELETE' });
        if (res.ok) {
            renderRemindersDropdown(); 
            updateBellBadge();         
        }
    } catch (e) {
        console.error("Failed to cancel reminder:", e);
    }
}

async function updateBellBadge() {
    const badge = document.getElementById('bell-badge');
    if (!badge) return;
    const reminders = await fetchActiveReminders();
    if (reminders.length > 0) {
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

async function renderRemindersDropdown() {
    const list = document.getElementById('reminders-list');
    if (!list) return;
    list.innerHTML = '';
    
    const reminders = await fetchActiveReminders();
    if (reminders.length === 0) {
        list.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 13px;">${t('menu.remindersEmpty')}</div>`;
        return;
    }
    
    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    
    reminders.forEach(r => {
        const div = document.createElement('div');
        div.className = 'reminder-item';
        
        const dueTimeStr = formatDateTime(r.due_time);
        
        div.innerHTML = `
            <div class="reminder-info">
                <div class="reminder-task-title">${escapeHtml(r.task_title)}</div>
                <div class="reminder-time">${dueTimeStr}</div>
            </div>
            <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIcon}</button>
        `;
        
        // Клик по карточке напоминания перенаправляет к самой задаче на доске
        div.addEventListener('click', async (e) => {
            if (e.target.closest('.subtask-delete-btn')) return;
            document.getElementById('reminders-dropdown').classList.remove('show');
            document.getElementById('reminders-bell-trigger').classList.remove('active');
            
            const vaultRes = await fetch(`${API_BASE}/system/vault`);
            const currentVault = await vaultRes.json();
            
            // Если карточка из другого хранилища — сперва свитчимся
            if (r.vault_path && r.vault_path !== currentVault.path) {
                await fetch(`${API_BASE}/system/vault/switch`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_path: r.vault_path })
                });
                localStorage.setItem('doe-pending-highlight', r.task_id);
                window.location.reload();
                return;
            }
            
            // Навигация внутри текущего хранилища
            fetch(`${API_BASE}/tasks/${r.task_id}/context`)
                .then(res => res.json())
                .then(context => {
                    window.navigateToEntityGlobal(context.workspace_id, context.column_id, r.task_id, null, true);
                })
                .catch(() => {
                    // Фолбэк, если задача была удалена
                    loadTaskIntoModal(r.task_id, true);
                    document.getElementById('task-modal').classList.add('show');
                });
        });
        
        div.querySelector('.subtask-delete-btn').onclick = (e) => cancelReminder(r.reminder_id, e);

        list.appendChild(div);
    });
}



// Запускаем периодический опрос активных напоминаний раз в 3 секунды для моментальной синхронизации
setInterval(updateBellBadge, 3000);

// ==========================================
// ГЛОБАЛЬНЫЙ КАЛЕНДАРЬ
// ==========================================
const Calendar = {
    modal: null, body: null, titleLabel: null, zoomWrapper: null, zoomSlider: null,
    events: [],
    currentDate: new Date(),
    view: 'month', // 'month', 'week', 'day'
    zoomHourHeight: 60, // px per hour
    
    init() {
        this.modal = document.getElementById('calendar-modal');
        this.body = document.getElementById('cal-body');
        this.titleLabel = document.getElementById('cal-title-label');
        this.zoomWrapper = document.getElementById('cal-zoom-wrapper');
        this.zoomSlider = document.getElementById('cal-zoom-slider');
        
        document.getElementById('calendar-trigger').addEventListener('click', () => this.open());
        
        document.getElementById('cal-prev').addEventListener('click', () => this.navigate(-1));
        document.getElementById('cal-next').addEventListener('click', () => this.navigate(1));
        document.getElementById('cal-today').addEventListener('click', () => {
            this.currentDate = new Date();
            this.render();
        });
        
        const viewBtns = this.modal.querySelectorAll('.cal-controls-center .segmented-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.view = btn.dataset.view;
                this.zoomWrapper.style.display = this.view === 'month' ? 'none' : 'inline-flex';
                this.render();
            });
        });

        this.zoomSlider.addEventListener('input', (e) => {
            this.zoomHourHeight = parseInt(e.target.value);
            this.body.style.setProperty('--hour-height', `${this.zoomHourHeight}px`);
        });

        // 🔥 ДОБАВЛЕНО: Обработка Pinch-to-Zoom (Сведение/разведение пальцев) на тачпаде
        this.body.addEventListener('wheel', (e) => {
            // Браузеры транслируют жест pinch-to-zoom как wheel с зажатым ctrlKey
            if (e.ctrlKey && this.view !== 'month') {
                e.preventDefault(); // Блокируем системный зум браузера всей страницы

                const zoomSpeed = 0.5; // Чувствительность зума
                let newZoom = this.zoomHourHeight - (e.deltaY * zoomSpeed);
                
                // Жесткие лимиты из ползунка (min: 30, max: 150)
                newZoom = Math.max(30, Math.min(150, newZoom));

                if (newZoom !== this.zoomHourHeight) {
                    const scrollContainer = this.body.querySelector('.cal-time-scroll');
                    
                    if (scrollContainer) {
                        // 🚀 SENIOR UX: Зум с фокусом на курсор. 
                        // Вычисляем, какая точка сетки времени сейчас под курсором, 
                        // и подгоняем скролл так, чтобы после зума она осталась под ним.
                        const rect = scrollContainer.getBoundingClientRect();
                        const cursorY = e.clientY - rect.top; // Позиция мыши относительно контейнера
                        const scrollY = scrollContainer.scrollTop; // Текущий скролл
                        
                        const absoluteY = scrollY + cursorY; // Абсолютная точка на виртуальном холсте
                        const zoomRatio = newZoom / this.zoomHourHeight; // Коэффициент изменения
                        
                        // Применяем зум
                        this.zoomHourHeight = newZoom;
                        this.body.style.setProperty('--hour-height', `${this.zoomHourHeight}px`);
                        this.zoomSlider.value = this.zoomHourHeight; // Синхронизируем ползунок
                        
                        // Корректируем скролл с учетом нового масштаба
                        const newAbsoluteY = absoluteY * zoomRatio;
                        scrollContainer.scrollTop = newAbsoluteY - cursorY;
                    } else {
                        // Фолбэк, если контейнер не найден
                        this.zoomHourHeight = newZoom;
                        this.body.style.setProperty('--hour-height', `${this.zoomHourHeight}px`);
                        this.zoomSlider.value = this.zoomHourHeight;
                    }
                }
            }
        }, { passive: false }); // КРИТИЧНО: passive: false позволяет вызывать e.preventDefault()
    },
    
    async open() {
        closeAllDropdowns();
        this.modal.classList.add('show');
        
        // Сброс на сегодня при открытии
        this.currentDate = new Date();
        this.body.innerHTML = `<div class="graph-empty" style="display:flex;">Загрузка данных...</div>`;
        
        try {
            const res = await fetch(`${API_BASE}/system/calendar`);
            if (res.ok) {
                const data = await res.json();
                // Парсим даты
                this.events = data.map(ev => ({
                    ...ev,
                    dateObj: new Date(ev.due_date)
                }));
                this.render();
            }
        } catch (e) {
            console.error("Calendar fetch error:", e);
            this.body.innerHTML = `<div class="graph-empty" style="display:flex;">Ошибка загрузки</div>`;
        }
    },
    
    navigate(dir) {
        if (this.view === 'month') {
            this.currentDate.setMonth(this.currentDate.getMonth() + dir);
        } else if (this.view === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() + (dir * 7));
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + dir);
        }
        this.render();
    },
    
    getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // С понедельника
        return new Date(d.setDate(diff));
    },

    formatTimeText(date, durationSec) {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        if (durationSec <= 3600) return `${h}:${m}`;
        const end = new Date(date.getTime() + durationSec * 1000);
        const eh = end.getHours().toString().padStart(2, '0');
        const em = end.getMinutes().toString().padStart(2, '0');
        return `${h}:${m} - ${eh}:${em}`;
    },

    render() {
        const locale = dpLocales[currentLang];
        this.body.style.setProperty('--hour-height', `${this.zoomHourHeight}px`);
        
        if (this.view === 'month') {
            this.renderMonth(locale);
        } else {
            this.renderTimeView(locale, this.view === 'week');
        }
    },
    
    renderMonth(locale) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        this.titleLabel.textContent = `${locale.months[month]} ${year}`;
        
        const firstDay = new Date(year, month, 1).getDay();
        const startDay = firstDay === 0 ? 6 : firstDay - 1; 
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        
        let html = `<div class="cal-month-view">`;
        html += `<div class="cal-weekdays">${locale.days.map(d => `<div class="cal-weekday">${d}</div>`).join('')}</div>`;
        html += `<div class="cal-month-grid">`;
        
        const today = new Date();
        const addCell = (dNum, isOther, curDateObj) => {
            const isToday = !isOther && year === today.getFullYear() && month === today.getMonth() && dNum === today.getDate();
            
            // Ищем события на этот день
            const dayEvents = this.events.filter(ev => 
                ev.dateObj.getFullYear() === curDateObj.getFullYear() &&
                ev.dateObj.getMonth() === curDateObj.getMonth() &&
                ev.dateObj.getDate() === curDateObj.getDate()
            ).sort((a,b) => a.dateObj - b.dateObj);
            
            let evHtml = dayEvents.map(ev => {
                const time = `${ev.dateObj.getHours().toString().padStart(2,'0')}:${ev.dateObj.getMinutes().toString().padStart(2,'0')}`;
                return `<div class="cal-event-chip ${ev.completed ? 'is-done' : ''}" data-id="${ev.id}" data-ws="${ev.workspace_id}" data-col="${ev.column_id}">${time} ${escapeHtml(ev.title)}</div>`;
            }).join('');

            return `<div class="cal-day-cell ${isOther ? 'other-month' : ''} ${isToday ? 'is-today' : ''}">
                <div class="cal-day-number">${dNum}</div>
                ${evHtml}
            </div>`;
        };

        // Предыдущий месяц
        for (let i = 0; i < startDay; i++) {
            const d = daysInPrevMonth - startDay + i + 1;
            html += addCell(d, true, new Date(year, month - 1, d));
        }
        // Текущий месяц
        for (let i = 1; i <= daysInMonth; i++) {
            html += addCell(i, false, new Date(year, month, i));
        }
        // Следующий месяц
        const totalCells = startDay + daysInMonth;
        const remaining = Math.ceil(totalCells / 7) * 7 - totalCells;
        for (let i = 1; i <= remaining; i++) {
            html += addCell(i, true, new Date(year, month + 1, i));
        }
        
        html += `</div></div>`;
        this.body.innerHTML = html;
        this.attachEventClicks();
    },
    
    renderTimeView(locale, isWeek) {
        let startDate;
        if (isWeek) {
            startDate = this.getStartOfWeek(this.currentDate);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            
            let m1 = locale.months[startDate.getMonth()];
            let m2 = locale.months[endDate.getMonth()];
            if (startDate.getMonth() === endDate.getMonth()) {
                this.titleLabel.textContent = `${m1} ${startDate.getFullYear()}`;
            } else {
                this.titleLabel.textContent = `${m1} - ${m2} ${startDate.getFullYear()}`;
            }
        } else {
            startDate = new Date(this.currentDate);
            // Если есть родительный падеж (monthsGenitive) - используем его, иначе обычный массив
            const monthName = locale.monthsGenitive ? locale.monthsGenitive[startDate.getMonth()] : locale.months[startDate.getMonth()];
            this.titleLabel.textContent = `${startDate.getDate()} ${monthName} ${startDate.getFullYear()}`;
        }
        
        const daysCount = isWeek ? 7 : 1;
        const today = new Date();
        
        let headerHtml = `<div class="cal-time-header"><div class="cal-time-zone"></div><div class="cal-time-days">`;
        const colDates = [];
        
        for (let i = 0; i < daysCount; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            colDates.push(d);
            const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
            const dayName = locale.days[d.getDay() === 0 ? 6 : d.getDay() - 1]; 
            
            headerHtml += `<div class="cal-time-day-hdr ${isToday ? 'is-today' : ''}">
                <span>${dayName}</span><span>${d.getDate()}</span>
            </div>`;
        }
        // ДОБАВЛЕНА РАСПОРКА В КОНЕЦ ШАПКИ ДЛЯ КОМПЕНСАЦИИ ШИРИНЫ СКРОЛЛБАРА (6px)
        headerHtml += `</div><div class="cal-header-scrollbar-spacer"></div></div>`;
        
        let gridHtml = `<div class="cal-time-scroll" id="cal-time-scroll"><div class="cal-time-grid">`;
        
        // Линейка времени слева
        gridHtml += `<div class="cal-time-labels">`;
        for (let h = 0; h < 24; h++) {
            gridHtml += `<div class="cal-time-label" style="top: calc(${h} * var(--hour-height))">${h}:00</div>`;
        }
        gridHtml += `</div>`;
        
        // Колонки дней
        gridHtml += `<div class="cal-time-columns">`;
        
        let earliestEventHour = 24; // Для умного автоскролла

        for (let i = 0; i < daysCount; i++) {
            const curDate = colDates[i];
            const curDayStartTs = new Date(curDate.getFullYear(), curDate.getMonth(), curDate.getDate(), 0, 0, 0).getTime();
            const curDayEndTs = curDayStartTs + 24 * 3600 * 1000;
            
            gridHtml += `<div class="cal-time-col">`;
            
            // 1. Фильтруем события, которые ПЕРЕСЕКАЮТСЯ с текущими сутками
            const dayEvents = [];
            this.events.forEach(ev => {
                const origDurSec = ev.duration > 0 ? ev.duration : 3600;
                const evStartTs = ev.dateObj.getTime();
                const evEndTs = evStartTs + origDurSec * 1000;

                // Строгое условие пересечения отрезков времени
                if (evStartTs < curDayEndTs && evEndTs > curDayStartTs) {
                    // Вычисляем фактические рамки события внутри ЭТИХ суток
                    const effectiveStartTs = Math.max(evStartTs, curDayStartTs);
                    const effectiveEndTs = Math.min(evEndTs, curDayEndTs);
                    const effectiveDurSec = (effectiveEndTs - effectiveStartTs) / 1000;

                    dayEvents.push({
                        originalEv: ev,
                        dateObj: new Date(effectiveStartTs),
                        effectiveDurSec: effectiveDurSec,
                        origDurSec: origDurSec,
                        isContinuation: evStartTs < curDayStartTs // Флаг: карточка пришла со вчерашнего дня
                    });
                }
            });

            // Сортируем по фактическому началу в ЭТИХ сутках
            dayEvents.sort((a,b) => a.dateObj.getTime() - b.dateObj.getTime());
            
            // --- АЛГОРИТМ ГРУППИРОВКИ ПЕРЕСЕКАЮЩИХСЯ СОБЫТИЙ (Overlap Logic) ---
            const groups = [];
            let currentGroup = [];
            let groupEnd = 0;

            dayEvents.forEach(mappedEv => {
                const start = mappedEv.dateObj.getTime();
                // Для расчета плотности пересечений используем эффективную длительность с визуальным запасом (40 мин)
                const end = start + Math.max(mappedEv.effectiveDurSec * 1000, 2400000); 

                // Обновляем статистику для умного скролла
                if (mappedEv.dateObj.getHours() < earliestEventHour) earliestEventHour = mappedEv.dateObj.getHours();

                if (currentGroup.length === 0) {
                    currentGroup.push({ mappedEv, start, end, colIndex: 0 });
                    groupEnd = end;
                } else if (start < groupEnd) {
                    let colIndex = 0;
                    while (currentGroup.some(item => item.colIndex === colIndex && item.end > start)) {
                        colIndex++;
                    }
                    currentGroup.push({ mappedEv, start, end, colIndex });
                    groupEnd = Math.max(groupEnd, end);
                } else {
                    groups.push(currentGroup);
                    currentGroup = [{ mappedEv, start, end, colIndex: 0 }];
                    groupEnd = end;
                }
            });
            if (currentGroup.length > 0) groups.push(currentGroup);

            // Рендерим группы с учетом разделения ширины
            groups.forEach(group => {
                const columnsCount = Math.max(...group.map(item => item.colIndex)) + 1;
                
                group.forEach(item => {
                    const mappedEv = item.mappedEv;
                    const ev = mappedEv.originalEv;
                    const hours = mappedEv.dateObj.getHours();
                    const mins = mappedEv.dateObj.getMinutes();
                    
                    const startSecFromMidnight = (hours * 3600) + (mins * 60);
                    const secondsInDay = 24 * 3600;
                    const maxAllowedDurSec = secondsInDay - startSecFromMidnight;

                    // Используем эффективную длительность внутри этих суток
                    const visDurSec = Math.min(Math.max(mappedEv.effectiveDurSec, 2400), maxAllowedDurSec); 
                    
                    const topPos = `calc((${hours} + ${mins}/60) * var(--hour-height))`;
                    const heightPos = `calc((${visDurSec}/3600) * var(--hour-height))`;
                    
                    const widthPercent = 100 / columnsCount;
                    const leftPercent = item.colIndex * widthPercent;
                    
                    // В тексте всегда показываем ОРИГИНАЛЬНОЕ время карточки для консистентности
                    const timeText = this.formatTimeText(ev.dateObj, mappedEv.origDurSec);
                    
                    const positionStyle = `top: ${topPos}; height: ${heightPos}; left: ${leftPercent}%; width: calc(${widthPercent}% - 2px);`;
                    
                    // Класс is-continuation указывает, что это визуальный "хвост" задачи
                    const continuationClass = mappedEv.isContinuation ? 'is-continuation' : '';
                    
                    gridHtml += `<div class="cal-abs-event ${ev.completed ? 'is-done' : ''} ${continuationClass}" 
                                      data-id="${ev.id}" data-ws="${ev.workspace_id}" data-col="${ev.column_id}"
                                      style="${positionStyle}">
                        <div class="cal-ev-title">${escapeHtml(ev.title)}</div>
                        <div class="cal-ev-time">${timeText}</div>
                    </div>`;
                });
            });
            
            // Если это сегодня - рисуем красную линию времени
            if (curDate.getFullYear() === today.getFullYear() && curDate.getMonth() === today.getMonth() && curDate.getDate() === today.getDate()) {
                const nowH = today.getHours();
                const nowM = today.getMinutes();
                const nowTop = `calc((${nowH} + ${nowM}/60) * var(--hour-height))`;
                
                // Формируем красивую строку времени
                const timeStr = `${nowH.toString().padStart(2, '0')}:${nowM.toString().padStart(2, '0')}`;
                gridHtml += `<div class="cal-now-line" style="top: ${nowTop}" data-time="${timeStr}"></div>`;
                
                // Если нет ранних событий, пытаемся скроллить к текущему времени
                if (earliestEventHour === 24) earliestEventHour = Math.max(0, nowH - 1);
            }
            
            gridHtml += `</div>`;
        }
        
        gridHtml += `</div></div></div>`; 
        
        this.body.innerHTML = `<div class="cal-time-view">${headerHtml}${gridHtml}</div>`;
        this.attachEventClicks();
        
        // Умный автоскролл
        setTimeout(() => {
            const scrollEl = document.getElementById('cal-time-scroll');
            if (scrollEl) {
                // Пытаемся скроллить к самому раннему событию (с отступом в 1 час наверх)
                // Если событий нет, скроллим к 8 утра
                let targetHour = earliestEventHour === 24 ? 8 : earliestEventHour - 1;
                targetHour = Math.max(0, targetHour); // Не ниже полуночи
                
                // Используем behavior: 'smooth' для эстетики открытия
                scrollEl.scrollTo({
                    top: targetHour * this.zoomHourHeight,
                    behavior: 'smooth'
                });
            }
        }, 50);
    },
    
    attachEventClicks() {
        this.body.querySelectorAll('.cal-event-chip, .cal-abs-event').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(el.dataset.id);
                const wsId = parseInt(el.dataset.ws);
                const colId = parseInt(el.dataset.col);
                
                this.modal.classList.remove('show');
                window.navigateToEntityGlobal(wsId, colId, id, null, true, true);
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Calendar.init();
});

/* ── Ручное перетаскивание безрамочного окна macOS (easy_drag=False) ──
   Координаты считает нативный код (AppKit) — JS только сигнализирует фазы.
   Окно двигается ТОЛЬКО за фон шапки / экрана выбора хранилища. */
(() => {
    if (!document.documentElement.classList.contains('mac-os')) return;

    let dragging = false, rafScheduled = false;

    const NO_DRAG = 'button, input, textarea, select, a, [contenteditable="true"],' +
        '.search-wrapper, .settings-wrapper, .tabs-wrapper, .board-tab,' +
        '.vault-container, .menu-btn, .card-menu-btn, .traffic-btn';

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (!e.target.closest('.app-header, .vault-screen')) return;
        if (e.target.closest(NO_DRAG)) return;
        try { window.pywebview?.api?.begin_window_drag?.(); } catch (err) {}
        dragging = true;
        e.preventDefault();
    }, true);

    document.addEventListener('mousemove', () => {
        if (!dragging || rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            if (dragging) { try { window.pywebview?.api?.drag_window?.(); } catch (err) {} }
        });
    });

    const stop = () => {
        if (!dragging) return;
        dragging = false;
        try { window.pywebview?.api?.end_window_drag?.(); } catch (err) {}
    };
    document.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
})();

// ==========================================
// WINDOWS НАТИВНЫЙ ХРОМ (только .win-os; macOS не затрагивается)
// ==========================================
(function setupWindowsChrome() {
    if (!document.documentElement.classList.contains('win-os')) return;

    const isVault = new URLSearchParams(location.search).get('mode') === 'vault';
    const api = () => (window.pywebview && window.pywebview.api) || null;

    const style = document.createElement('style');
    style.textContent = `
      html.win-os .app-header { padding-right: 150px; }
      .win-controls { position: fixed; top: 0; right: 0; height: 40px; display: flex; z-index: 2147483647; user-select: none; -webkit-user-select: none; }
      .win-ctrl { width: 46px; height: 100%; border: none; background: transparent; display: flex; align-items: center; justify-content: center; cursor: default; color: #333; transition: background .12s; padding: 0; }
      .win-ctrl:hover { background: rgba(128,128,128,.18); }
      .win-ctrl.close:hover { background: #e81123; color: #fff; }
      .win-ctrl svg { width: 11px; height: 11px; }
      html[data-theme="dark"] .win-ctrl { color: #ddd; }
      .win-rh { position: fixed; z-index: 2147483646; }
      .win-rh-t{top:0;left:8px;right:8px;height:6px;cursor:ns-resize}
      .win-rh-b{bottom:0;left:8px;right:8px;height:6px;cursor:ns-resize}
      .win-rh-l{left:0;top:8px;bottom:8px;width:6px;cursor:ew-resize}
      .win-rh-r{right:0;top:8px;bottom:8px;width:6px;cursor:ew-resize}
      .win-rh-tl{top:0;left:0;width:10px;height:10px;cursor:nwse-resize}
      .win-rh-tr{top:0;right:0;width:10px;height:10px;cursor:nesw-resize}
      .win-rh-bl{bottom:0;left:0;width:10px;height:10px;cursor:nesw-resize}
      .win-rh-br{bottom:0;right:0;width:10px;height:10px;cursor:nwse-resize}
    `;
    document.head.appendChild(style);

    // --- Кнопки управления окном ---
    const controls = document.createElement('div');
    controls.className = 'win-controls';
    const maxBtn = isVault ? '' :
      `<button class="win-ctrl max" title="Развернуть"><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg></button>`;
    controls.innerHTML = `
      <button class="win-ctrl min" title="Свернуть"><svg viewBox="0 0 10 10"><rect x="0" y="5" width="10" height="1" fill="currentColor"/></svg></button>
      ${maxBtn}
      <button class="win-ctrl close" title="Закрыть"><svg viewBox="0 0 10 10"><path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" stroke-width="1.2"/></svg></button>
    `;
    document.body.appendChild(controls);
    controls.querySelector('.min').onclick = () => api()?.minimize_window?.();
    controls.querySelector('.close').onclick = () => api()?.close_window?.();
    controls.querySelector('.max')?.addEventListener('click', () => api()?.toggle_maximize_window?.());

    // --- Нативный ресайз за края через DWM (без визуальных разрывов) ---
    if (!isVault) {
        // Карта WinAPI HitTest кодов
        const htMap = {
            'l': 10, 'r': 11, 't': 12, 'tl': 13,
            'tr': 14, 'b': 15, 'bl': 16, 'br': 17
        };
        
        ['t','b','l','r','tl','tr','bl','br'].forEach((cls) => {
            const h = document.createElement('div');
            h.className = `win-rh win-rh-${cls}`;
            h.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                // Передаем управление размерностью самой ОС Windows
                api()?.start_window_resize?.(htMap[cls]);
            });
            document.body.appendChild(h);
        });
    }

    // --- Нативное перетаскивание окна за шапку ---
    const NO_DRAG = 'button, input, textarea, select, a, [contenteditable="true"],' +
        '.search-wrapper, .settings-wrapper, .tabs-wrapper, .board-tab,' +
        '.vault-container, .menu-btn, .card-menu-btn, .win-controls, .win-rh';

    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (!e.target.closest('.app-header, .vault-screen')) return;
        if (e.target.closest(NO_DRAG)) return;
        e.preventDefault();
        
        // Передаем перемещение (с поддержкой прилипания к краям экрана) в Windows DWM
        api()?.start_window_drag?.();
    }, true);
})();
