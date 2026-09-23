function initMarkdownWorker() {
    if (markdownWorker) return;

    // 🔒 Без сервера воркер грузит библиотеки по абсолютным file://-путям из
    // каталога frontend/, а KaTeX теперь локальный (не CDN). Корень вложений
    // прокидываем в воркер снимком self.__DOE_ATTACH (для resolveMarkdownAssetSrc).
    const _fb = window.__DOE_FRONTEND_BASE || '';
    const workerCode = `
        self.__DOE_ATTACH = '';
        // Загружаем библиотеки парсинга напрямую в поток
        self.importScripts(
            ${JSON.stringify(_fb + 'marked.min.js')},
            ${JSON.stringify(_fb + 'katex.min.js')}
        );

        function escapeHtml(text) {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }

        // Obsidian-совместимость: те же функции, что и в главном потоке
        // (исходник внедряется через .toString, чтобы не было двух копий логики)
        ${resolveMarkdownAssetSrc.toString()}
        ${_sanitizeUrlValue.toString()}
        ${_sanitizeHtmlRegex.toString()}
        ${sanitizeRenderedHtml.toString()}
        ${obsidianPreprocess.toString()}

        // Копия вашего парсера, работающая в фоне
        function parseMarkdownWithMathWorker(text, _depth = 0) {
            if (!text) return "";
            if (_depth > 4) return escapeHtml(String(text));
            const mathBlocks = [];
            const codeBlocks = [];

            let processed = text.replace(/(\`\`\`[\\s\\S]*?\`\`\`|\`[^\`]*\`)/g, (match) => {
                codeBlocks.push(match);
                return \`DOECODEPLACEHOLDER\${codeBlocks.length - 1}END\`;
            });

            const parseInner = (md) => {
                codeBlocks.forEach((code, ci) => {
                    md = md.replace(\`DOECODEPLACEHOLDER\${ci}END\`, () => code);
                });
                return parseMarkdownWithMathWorker(md, _depth + 1);
            };
            const obs = obsidianPreprocess(processed, parseInner);
            processed = obs.text;

            processed = processed.replace(/\\$\\$([\\s\\S]+?)\\$\\$/g, (match, math) => {
                mathBlocks.push({ math, displayMode: true });
                return \`DOEMATHPLACEHOLDER\${mathBlocks.length - 1}END\`;
            });

            processed = processed.replace(/\\$([^$\\n]+?)\\$/g, (match, math) => {
                mathBlocks.push({ math, displayMode: false });
                return \`DOEMATHPLACEHOLDER\${mathBlocks.length - 1}END\`;
            });

            processed = processed.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)(?:\\{(\\d+)\\s*(?:,\\s*(\\d+))?\\})?/g, (match, alt, url, w, h) => {
                const ext = url.split('.').pop().toLowerCase();
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);

                if (!isImage) {
                    return \`[\${alt}](\${url})\`;
                }

                const safeMatch = escapeHtml(match);
                let style = '';
                let customClass = '';

                if (w) {
                    style = \`width: \${w}px;\` + (h ? \` height: \${h}px;\` : '');
                    customClass = 'has-custom-size';
                }

                return \`<span class="image-resizer-wrapper \${customClass}" style="\${style}" data-md="\${safeMatch}"><img src="\${resolveMarkdownAssetSrc(url)}" alt="\${alt}" draggable="false"><span class="image-resize-handle" title="Потяните для изменения размера"></span></span>\`;
            });

            // Ссылка с пустым текстом [](путь) — CommonMark рендерит её невидимой.
            // Подставляем сам путь как текст, чтобы ссылка была видима и кликабельна.
            // Для путей с пробелами поддерживается синтаксис [](<путь с пробелами>).
            processed = processed.replace(/(^|[^!])\\[\\]\\(([^)]+)\\)/g, (m, pre, url) => {
                const label = url.replace(/^</, '').replace(/>$/, '');
                return pre + '[' + label + '](' + url + ')';
            });

            codeBlocks.forEach((code, i) => {
                processed = processed.replace(\`DOECODEPLACEHOLDER\${i}END\`, () => code);
            });

            let html = marked.parse(processed, { breaks: true });

            if (self.katex) {
                mathBlocks.forEach((item, i) => {
                    try {
                        const rendered = katex.renderToString(item.math, {
                            displayMode: item.displayMode,
                            throwOnError: false,
                            output: 'html',
                            strict: false
                        });
                        html = html.replace(\`DOEMATHPLACEHOLDER\${i}END\`, () => rendered);
                    } catch (e) {
                        html = html.replace(\`DOEMATHPLACEHOLDER\${i}END\`, () => \`<code>\${item.math}</code>\`);
                    }
                });
            } else {
                mathBlocks.forEach((item, i) => {
                    html = html.replace(\`DOEMATHPLACEHOLDER\${i}END\`, () => \`<code>\${item.math}</code>\`);
                });
            }

            obs.blocks.forEach((blockHtml, i) => {
                html = html.replace(\`DOEOBSBLOCK\${i}END\`, () => blockHtml);
            });

            return sanitizeRenderedHtml(html);
        }

        // Слушатель сообщений от главного потока
        self.onmessage = function(e) {
            const { id, text, attach } = e.data;
            self.__DOE_ATTACH = attach || '';
            const html = parseMarkdownWithMathWorker(text);
            self.postMessage({ id, html }); // Возвращаем готовый HTML
        };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    markdownWorker = new Worker(URL.createObjectURL(blob));

    markdownWorker.onmessage = function(e) {
        const { id, html } = e.data;
        if (markdownCallbacks[id]) {
            markdownCallbacks[id](html);
            delete markdownCallbacks[id];
        }
    };
}

function renderMarkdownProgressively(text, container, options) {
    window.isRenderingMarkdown = true;

    let onBeforeInsert = null;
    let onFirstScreen = null;
    let onComplete = null;

    if (typeof options === 'function') {
        onComplete = options;
    } else if (options) {
        onBeforeInsert = options.onBeforeInsert;
        onFirstScreen = options.onFirstScreen;
        onComplete = options.onComplete;
    }

    if (text.length < 5000) {
        container._renderToken = null;
        if (onBeforeInsert) onBeforeInsert();
        container.style.visibility = '';
        container.innerHTML = parseMarkdownWithMath(text);
        if (onFirstScreen) onFirstScreen();
        enhanceCodeBlocks(container);
        enhanceSpaceVectors(container);
        window.isRenderingMarkdown = false;
        if (onComplete) onComplete();
        return;
    }

    const token = Symbol();
    container._renderToken = token;

    container.style.visibility = '';
    container.innerHTML = `<span class="markdown-empty">${t('loading')}</span>`;

    initMarkdownWorker();
    markdownRenderId++;
    const currentId = markdownRenderId;

    markdownCallbacks[currentId] = (html) => {
        if (container._renderToken !== token) return;

        if (onBeforeInsert) onBeforeInsert();

        // 🔐 Worker чистит HTML строковым фильтром (в нём нет DOM). Здесь, на
        // главном потоке, прогоняем авторитетную DOM-очистку перед вставкой.
        container.innerHTML = sanitizeRenderedHtml(html);

        if (onFirstScreen) onFirstScreen();

        const nodes = Array.from(container.childNodes);
        for (const n of nodes) {
            if (n.nodeType === 1 && !/^H[1-6]$/.test(n.tagName) && !(n.querySelector && n.querySelector('img'))) {
                n.classList.add('md-deferred');
            }
        }

        requestAnimationFrame(() => {
            if (container._renderToken !== token) {
                window.isRenderingMarkdown = false;
                return;
            }
            if (onComplete) onComplete();
            enhanceCodeBlocks(container);
            enhanceSpaceVectors(container);
            window.isRenderingMarkdown = false;
        });
    };

    markdownWorker.postMessage({ id: currentId, text: text, attach: window.__DOE_ATTACH || '' });
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

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        const translation = getNestedTranslation(lang, key);
        if (translation) el.setAttribute('title', translation);
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.dataset.i18nAria;
        const translation = getNestedTranslation(lang, key);
        if (translation) el.setAttribute('aria-label', translation);
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
async function createColumn(title, mode = 'default', workspaceId, position = null) {
    const body = { title, mode, workspace_id: workspaceId };
    if (position !== null) body.position = position;

    const res = await fetch(`${API_BASE}/columns/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Error'); return res.json();
}
async function updateColumn(id, data) {
    const res = await fetch(`${API_BASE}/columns/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Error'); return res.json();
}
function formatTotalTime(seconds) {
    if (seconds === 0) return t('card.unknownTime');

    const MAX_SECONDS = 31536000000;
    if (seconds >= MAX_SECONDS) {
        return currentLang === 'ru' ? '1000+ лет' : '1000+ y';
    }

    const YEAR = 31536000;
    const WEEK = 604800;
    const DAY = 86400;
    const HOUR = 3600;

    const y = Math.floor(seconds / YEAR);
    const w = Math.floor((seconds % YEAR) / WEEK);
    const d = Math.floor((seconds % WEEK) / DAY);
    const h = Math.floor((seconds % DAY) / HOUR);
    const m = Math.floor((seconds % HOUR) / 60);
    const s = Math.floor(seconds % 60);

    const units = t('timeUnits');
    const parts = [];

    if (y > 0) parts.push(`${y}${units.y}`);
    if (w > 0) parts.push(`${w}${units.w}`);
    if (d > 0) parts.push(`${d}${units.d}`);
    if (h > 0) parts.push(`${h}${units.h}`);
    if (m > 0) parts.push(`${m}${units.m}`);

    if (s > 0 || parts.length === 0) {
        parts.push(`${s}${units.s}`);
    }

    return parts.slice(0, 2).join(' ');
}

function formatExactDateTime(isoString) {
    if (!isoString) return '';
    let dateStr = isoString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) dateStr += 'Z';
    const date = new Date(dateStr);
    const d = date.getDate().toString().padStart(2, '0');
    const mo = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${d}.${mo}.${y}, ${h}:${m}:${s}`;
}

function formatDetailedDuration(seconds) {
    if (!seconds) return "0с";
    const Y = 31536000, M = 2592000, D = 86400, H = 3600, MIN = 60;
    let y = Math.floor(seconds / Y); seconds %= Y;
    let mo = Math.floor(seconds / M); seconds %= M;
    let d = Math.floor(seconds / D); seconds %= D;
    let h = Math.floor(seconds / H); seconds %= H;
    let m = Math.floor(seconds / MIN);
    let s = seconds % MIN;

    let parts = [];
    let started = false;

    if (y > 0) { parts.push(`${y}л`); started = true; }
    if (mo > 0 || started) { parts.push(`${mo}мес`); started = true; }
    if (d > 0 || started) { parts.push(`${d}д`); started = true; }
    if (h > 0 || started) { parts.push(`${h}ч`); started = true; }
    if (m > 0 || started) { parts.push(`${m}м`); started = true; }
    parts.push(`${s}с`);

    return parts.join(' ');
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

const _escapeDiv = document.createElement('div');
function escapeHtml(text) { _escapeDiv.textContent = text; return _escapeDiv.innerHTML; }

// Эмодзи (включая составные через ZWJ, вариационный селектор и флаги)
// для контр-поворота в свёрнутых колонках
const _emojiUprightRe = new RegExp(
    '(\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}\\uFE0F?)*|[\\u{1F1E6}-\\u{1F1FF}]{2})',
    'gu'
);

// Заголовок колонки: эмодзи оборачиваются в span. В свёрнутой колонке текст
// повёрнут на 180° (writing-mode + rotate), из-за чего эмодзи оказывались
// вверх ногами — CSS контр-поворачивает их обратно (.emoji-upright).
function columnTitleHtml(title) {
    return escapeHtml(title || '').replace(_emojiUprightRe, '<span class="emoji-upright">$1</span>');
}

function setColumnTitleText(el, title) {
    if (el) el.innerHTML = columnTitleHtml(title);
}
function renderInlineMarkdown(text) {
    if (!text) return '';

    const doeLinks = [];
    const doePattern = /\]\(doe:\/\/task\/\d+\)/g;
    let match;
    let raw = text;
    while ((match = doePattern.exec(raw)) !== null) {
        const closePos = match.index;
        let depth = 1, openPos = -1;
        for (let i = closePos - 1; i >= 0; i--) {
            if (raw[i] === ']') depth++;
            else if (raw[i] === '[') { depth--; if (depth === 0) { openPos = i; break; } }
        }
        if (openPos >= 0) {
            const inner = raw.substring(openPos + 1, closePos);
            const taskId = match[0].match(/\d+/)[0];
            const placeholder = `\uE000DOE_${doeLinks.length}\uE000`;
            doeLinks.push({ inner, taskId, placeholder, start: openPos, end: match.index + match[0].length });
        }
    }
    for (let i = doeLinks.length - 1; i >= 0; i--) {
        const dl = doeLinks[i];
        raw = raw.substring(0, dl.start) + dl.placeholder + raw.substring(dl.end);
    }

    let html = escapeHtml(raw);

    // ⚗️ Инлайн-LaTeX ($...$) в заголовках/крошках: рендерим через KaTeX,
    // формулы прячем в плейсхолдеры, чтобы * _ ` внутри них не пострадали
    const mathChunks = [];
    if (window.katex) {
        html = html.replace(/\$([^$\n]+?)\$/g, (m, expr) => {
            try {
                const rendered = katex.renderToString(unescapeHtml(expr), {
                    throwOnError: false, output: 'html', strict: false
                });
                mathChunks.push(rendered);
                return `M${mathChunks.length - 1}`;
            } catch (e) { return m; }
        });
    }

    html = html.replace(/\n/g, '<br>');
    html = html.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    // 🖼 Изображения в заголовках НЕ рендерим — превращаем в обычную ссылку
    // (клик работает так же, как в описании: файл откроется нативно)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => {
        const label = alt || decodeURIComponent(url.split('/').pop() || url);
        return `[${label}](${url})`;
    });
    // Ссылка с пустым текстом — подставляем адрес как текст
    html = html.replace(/\[\]\(([^)]+)\)/g, (m, url) => `[${url}](${url})`);
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    for (const dl of doeLinks) {
        const innerClean = dl.inner.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
        const innerHtml = renderInlineMarkdown(innerClean);
        html = html.replace(dl.placeholder, `<a href="doe://task/${dl.taskId}" target="_blank" rel="noopener">${innerHtml}</a>`);
    }

    mathChunks.forEach((r, i) => {
        html = html.replace(`M${i}`, () => r);
    });

    return html;
}
function unescapeHtml(html) { const div = document.createElement('div'); div.innerHTML = html; return div.textContent; }

function stripMarkdownToPlain(md) {
    if (!md) return '';
    return md.replace(/!\[.*?\]\(.*?\)/g, '')
             .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
             .replace(/[*_~`]/g, '')
             .replace(/<[^>]+>/g, '')
             .trim();
}

function stripDoeTaskLinks(text) {
    if (!text) return text;
    const pattern = /\]\(doe:\/\/task\/\d+\)/g;
    let match;
    const replacements = [];
    while ((match = pattern.exec(text)) !== null) {
        const closePos = match.index;
        let depth = 1, openPos = -1;
        for (let i = closePos - 1; i >= 0; i--) {
            if (text[i] === ']') depth++;
            else if (text[i] === '[') { depth--; if (depth === 0) { openPos = i; break; } }
        }
        if (openPos >= 0) {
            replacements.push({ start: openPos, end: match.index + match[0].length, inner: text.substring(openPos + 1, closePos) });
        }
    }
    for (let i = replacements.length - 1; i >= 0; i--) {
        const r = replacements[i];
        text = text.substring(0, r.start) + r.inner + text.substring(r.end);
    }
    return text;
}

function bindTitleFormattingShortcuts(inputEl) {
    const toggleFormat = (before, after) => {
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        const selected = inputEl.value.substring(start, end);
        if (selected) {
            if (selected.startsWith(before) && selected.endsWith(after)) {
                inputEl.setRangeText(selected.substring(before.length, selected.length - after.length), start, end, 'select');
            } else {
                inputEl.setRangeText(before + selected + after, start, end, 'select');
            }
        } else {
            inputEl.setRangeText(before + after, start, end, 'start');
            inputEl.setSelectionRange(start + before.length, start + before.length);
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const insertLink = () => {
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        const selected = inputEl.value.substring(start, end);
        if (selected) {
            inputEl.setRangeText(`[${selected}](url)`, start, end, 'end');
            const newEnd = start + selected.length + 7;
            inputEl.setSelectionRange(newEnd - 4, newEnd - 1);
        } else {
            inputEl.setRangeText('[](url)', start, end, 'start');
            inputEl.setSelectionRange(start + 1, start + 1);
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    };
    inputEl.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        const key = e.key.toLowerCase();
        if (key === 'b') { e.preventDefault(); toggleFormat('**', '**'); }
        else if (key === 'i') { e.preventDefault(); toggleFormat('*', '*'); }
        else if (key === 'u') { e.preventDefault(); toggleFormat('<u>', '</u>'); }
        else if (key === 'k') { e.preventDefault(); insertLink(); }
        else if (key === 'e') { e.preventDefault(); toggleFormat('`', '`'); }
        else if (e.shiftKey && (key === 'x')) { e.preventDefault(); toggleFormat('~~', '~~'); }
    });
}

let _isFullscreen = false;

window.toggleFullscreenState = (force) => {
    const lights = document.getElementById('mac-traffic-lights');
    if (!lights) return;

    if (typeof force === 'boolean') {
        _isFullscreen = force;
    } else {
        _isFullscreen = !_isFullscreen;
    }

    if (_isFullscreen) {
        lights.classList.add('is-fullscreen');
    } else {
        lights.classList.remove('is-fullscreen');
    }
};

function encodeMarkdownPath(path) {
    return encodeURIComponent(path).replace(/%2F/g, '/');
}

function applyTextExpansion() {
    const renderDiv = document.getElementById('task-desc-render');
    if (!renderDiv) return;

    const images = renderDiv.querySelectorAll('.image-resizer-wrapper.has-custom-size');
    let maxWidth = 0;
    images.forEach(img => {
        const w = parseInt(img.style.width);
        if (w > maxWidth) maxWidth = w;
    });

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

    const activeSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const closedSeconds = task.total_time_spent || 0;

    const diff = activeSeconds + closedSeconds;

    const MAX_SECONDS = 31536000000;
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

function formatDateTime(isoString) {
    if (!isoString) return '';

    let dateStr = isoString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        dateStr += 'Z';
    }

    const date = new Date(dateStr);

    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };

    return date.toLocaleDateString(currentLang, options);
}

