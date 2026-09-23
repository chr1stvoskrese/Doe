window.appExit = async () => {
    // 🔐 Перед закрытием шифруем защищённое хранилище с видимым прогрессом,
    // чтобы окно не выглядело зависшим. Нативная страховка в wrapper.py
    // после этого мгновенно завершится no-op'ом (ключ сессии уже сброшен).
    try {
        if (window.lockVaultWithProgress) await window.lockVaultWithProgress();
    } catch (e) {
        console.error('Lock before exit failed:', e);
    }

    if (window.pywebview && window.pywebview.api && window.pywebview.api.force_close) {
        window.pywebview.api.force_close();
    } else {
        window.close();
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
        days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        time: 'Time'
    }
};

function applyPriorityStyles(ps) {
    window.prioritySettings = ps;
    let styleEl = document.getElementById('dynamic-priority-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-priority-styles';
        document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = `
        :root {
            --prio-low-color: ${ps.c_low};
            --prio-mid-color: ${ps.c_mid};
            --prio-high-color: ${ps.c_high};
            --prio-none-color: ${ps.c_none};
        }
    `;
}

function updateAppFont(uiFont, customFontPath) {
    let styleTag = document.getElementById('custom-font-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'custom-font-style';
        document.head.appendChild(styleTag);
    }

    let fontString = '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    if (customFontPath) {
        const url = `/${customFontPath}?t=${Date.now()}`;
        styleTag.innerHTML = `
            @font-face {
                font-family: 'DoeCustomFont';
                src: url('${url}');
                font-weight: normal;
                font-style: normal;
            }
        `;
        fontString = `'DoeCustomFont', ${fontString}`;
    } else {
        styleTag.innerHTML = '';
    }

    if (uiFont && uiFont.trim() && uiFont.trim() !== "Inter") {
        fontString = `"${uiFont.trim()}", ${fontString}`;
    }

    document.documentElement.style.setProperty('--font-main', fontString, 'important');
}

window.chooseCustomFont = async () => {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
        const absPath = await window.pywebview.api.choose_file();
        if (absPath) {
            try {
                const res = await fetch(`${API_BASE}/system/font/set`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ absolute_path: absPath })
                });
                if (res.ok) {
                    const data = await res.json();
                    document.getElementById('font-path-display').textContent = data.path;
                    const settings = await fetchSettings();
                    updateAppFont(settings.ui_font, settings.custom_font);
                } else {
                    window.showToast(t('alerts.error'), 'Поддерживаются только .ttf, .otf, .woff, .woff2', true);
                }
            } catch(e) { console.error(e); }
        }
    }
};

window.resetCustomFont = async () => {
    try {
        const res = await fetch(`${API_BASE}/system/font/clear`, { method: 'POST' });
        if (res.ok) {
            document.getElementById('font-path-display').textContent = t('modals.fontSelectCustom');
            const settings = await fetchSettings();
            updateAppFont(settings.ui_font, settings.custom_font);
        }
    } catch(e) { console.error(e); }
};

window.applyExtensionsUI = (exts) => {
    if (!exts) exts = { search: true, calendar: true, reminders: true, graph: true, tabs: true, priority: true, statistics: true };

    document.body.classList.toggle('ext-priority-hidden', !exts.priority);
    document.body.classList.toggle('ext-statistics-hidden', !exts.statistics);

    const searchWrapper = document.getElementById('global-search-wrapper');
    const calendarBtn = document.getElementById('calendar-trigger');
    const statisticsBtn = document.getElementById('statistics-trigger');
    const remindersBtn = document.getElementById('reminders-bell-wrapper');
    const graphBtn = document.getElementById('graph-trigger');
    const tabsWrapper = document.getElementById('tabs-wrapper');

    if (searchWrapper) searchWrapper.style.display = exts.search ? '' : 'none';
    if (calendarBtn) calendarBtn.style.display = exts.calendar ? '' : 'none';
    if (statisticsBtn) statisticsBtn.style.display = exts.statistics ? '' : 'none';
    if (remindersBtn) remindersBtn.style.display = exts.reminders ? '' : 'none';
    if (graphBtn) graphBtn.style.display = exts.graph ? '' : 'none';
    if (tabsWrapper) tabsWrapper.style.display = exts.tabs ? '' : 'none';

    const notifyMenuItem = document.querySelector('.menu-item[data-action="notify-card"]');
    if (notifyMenuItem) {
        notifyMenuItem.style.display = exts.reminders ? '' : 'none';
    }

    const modalNotifyBtn = document.querySelector('.modal-notify');
    if (modalNotifyBtn) {
        modalNotifyBtn.style.display = exts.reminders ? '' : 'none';
    }

    const tSearch = document.getElementById('ext-toggle-search');
    const tCalendar = document.getElementById('ext-toggle-calendar');
    const tReminders = document.getElementById('ext-toggle-reminders');
    const tGraph = document.getElementById('ext-toggle-graph');
    const tTabs = document.getElementById('ext-toggle-tabs');
    const tPriority = document.getElementById('ext-toggle-priority');
    const tStatistics = document.getElementById('ext-toggle-statistics');

    if (tSearch) tSearch.checked = exts.search;
    if (tCalendar) tCalendar.checked = exts.calendar;
    if (tReminders) tReminders.checked = exts.reminders;
    if (tGraph) tGraph.checked = exts.graph;
    if (tTabs) tTabs.checked = exts.tabs;
    if (tPriority) tPriority.checked = exts.priority;
    if (tStatistics) tStatistics.checked = exts.statistics;

};

window.toggleExtension = async (key, value) => {
    try {
        const payload = { extensions: {} };
        payload.extensions[key] = value;

        const res = await fetch(`${API_BASE}/system/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const updatedSettings = await res.json();
            window.applyExtensionsUI(updatedSettings.extensions);
        }
    } catch (e) {
        console.error("Ошибка переключения расширения:", e);
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
    // Инлайн-рендер Markdown: в сообщениях бывают названия карточек
    // с **жирным**, `кодом` и т.п. — сырой синтаксис не должен вылезать
    msgEl.innerHTML = renderInlineMarkdown(message);

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

let markdownWorker = null;
let markdownRenderId = 0;
const markdownCallbacks = {};

