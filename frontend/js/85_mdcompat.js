// ============================================================
// 📖 Совместимость с Obsidian Markdown.
//
// Функции ниже самодостаточны (без замыканий на состояние приложения),
// потому что их исходник через .toString() внедряется и в веб-воркер
// превью карточек — синтаксис рендерится одинаково везде.
// ============================================================

// Превращает путь из Markdown в src для <img> / <video>.
// 🔒 Без сетевого сервера окно грузится по file://, поэтому вложения тоже
// адресуются абсолютными file://-URL (а не /doe/… и /localfile/…):
//   doe/файл, относительный → file://<attachments_dir>/файл (вложение хранилища)
//   /абсолютный, C:\        → file://<абсолютный путь>       (ссылка без копирования)
//   http(s), data:, file:   → как есть
// Функция самодостаточна: её исходник через .toString() внедряется и в
// web-worker превью, где корень вложений приходит через self.__DOE_ATTACH.
function resolveMarkdownAssetSrc(url) {
    if (/^(https?:|data:|blob:|file:)/i.test(url)) return url;
    function _fu(p) {
        p = String(p).replace(/\\/g, '/');
        if (/^[A-Za-z]:\//.test(p)) p = '/' + p;      // C:/… → /C:/…
        else if (p.charAt(0) !== '/') p = '/' + p;
        return 'file://' + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
    }
    var attach = (typeof self !== 'undefined' && self.__DOE_ATTACH) ? String(self.__DOE_ATTACH) : '';
    var u = String(url);
    if (/^[A-Za-z]:[\\/]/.test(u)) return _fu(u);     // C:\… абсолютный
    if (u.charAt(0) === '/') return _fu(u);            // /абсолютный
    if (u.indexOf('doe/') === 0) u = u.slice(4);       // вложение хранилища
    if (!attach) return url;                            // корень ещё не загружен
    return _fu(attach.replace(/[\/]+$/, '') + '/' + u);
}

// Распознаёт ссылки YouTube (watch, youtu.be, shorts, live, embed) и
// возвращает URL для встраивания (с сохранением стартового времени t=).
function getYoutubeEmbedUrl(url) {
    const m = String(url).match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i);
    if (!m) return null;
    const t = String(url).match(/[?&](?:t|start)=(\d+)/);
    return 'https://www.youtube.com/embed/' + m[1] + (t ? '?start=' + t[1] : '');
}

// HTML в заметках разрешён (как в Obsidian), но скрипты не исполняются.
//
// 🔐 БЕЗОПАСНОСТЬ: раньше здесь стоял чисто регэксповый фильтр, который
// обходился тривиально (например `<img/src=x/onerror=alert(1)>` — разделитель
// «/» вместо пробела не ловился правилом `\son\w+`, а `>` внутри значения
// атрибута рвал сопоставление тега). Для приложения с мостом
// window.pywebview.api это XSS → выполнение нативного кода. Поэтому в основном
// потоке санитайзинг делается через инертный DOM (DOMParser не исполняет
// скрипты и не запускает onerror), что устойчиво к mXSS-обходам. В Web Worker'е
// DOM недоступен — там используется усиленный строковый фильтр как первый
// проход (авторитетная DOM-очистка всё равно выполняется на главном потоке
// перед вставкой в innerHTML).
function _sanitizeUrlValue(raw) {
    // Декодируем числовые HTML-сущности и убираем управляющие/пробельные
    // символы, чтобы «java&#09;script:» и «java\tscript:» тоже распознавались.
    var decoded = String(raw)
        .replace(/&#x([0-9a-f]+);?/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
        .replace(/&#(\d+);?/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); });
    var scheme = decoded.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
    return /^(javascript|vbscript|livescript):/.test(scheme) || /^data:text\/html/.test(scheme);
}

// Усиленный строковый фильтр (fallback для Worker, где нет DOM).
function _sanitizeHtmlRegex(html) {
    var s = String(html);
    // <script>…</script> и одиночные <script …>
    s = s.replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, '');
    s = s.replace(/<\s*script\b[^>]*>/gi, '');
    // Заведомо опасные элементы, не используемые в заметках
    s = s.replace(/<\s*\/?\s*(object|embed|base|form|meta|link)\b[^>]*>/gi, '');
    // Инлайновые обработчики on* — ГЛОБАЛЬНО (а не внутри одного тега, иначе
    // `>` в значении атрибута обходит фильтр). Разделителем в HTML может быть
    // пробел ИЛИ «/», ловим оба.
    s = s.replace(/[\s\/]on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' ');
    // Атрибут srcdoc (iframe) — вектор внедрения HTML/скрипта
    s = s.replace(/[\s\/]srcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' ');
    // <iframe> с недоверенным src (не YouTube/Vimeo/локальный file://*.pdf)
    // вырезаем целиком. Разрешать произвольный file:// нельзя: окно грузится
    // по file://, поэтому <iframe src="file://…/doe/evil.html"> исполнил бы
    // локальный HTML в привилегированном webview с доступом к мосту (RCE).
    // (На главном потоке результат ещё раз чистится DOM-санитайзером.)
    s = s.replace(/<\s*iframe\b[^>]*>/gi, function (tag) {
        var m = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        var src = m ? (m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : (m[3] || ''))) : '';
        if (/^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\//i.test(src)
            || /^https:\/\/player\.vimeo\.com\/video\//i.test(src)
            || /^file:\/\/[^?#]*\.pdf(?:[?#]|$)/i.test(src)) {
            return tag;
        }
        return '';
    });
    // Опасные схемы в href/src/xlink:href/action/formaction
    s = s.replace(/(href|src|xlink:href|formaction|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        function (full, attr, dq, sq, uq) {
            var raw = dq !== undefined ? dq : (sq !== undefined ? sq : (uq || ''));
            if (_sanitizeUrlValue(raw)) {
                var q = (dq !== undefined) ? '"' : (sq !== undefined ? "'" : '');
                return attr + '=' + q + '#' + q;
            }
            return full;
        });
    return s;
}

function sanitizeRenderedHtml(html) {
    var s = String(html);
    // В Worker'е (нет document/DOMParser) — строковый фильтр.
    if (typeof document === 'undefined' || typeof DOMParser === 'undefined') {
        return _sanitizeHtmlRegex(s);
    }
    var doc;
    try {
        doc = new DOMParser().parseFromString(s, 'text/html');
    } catch (e) {
        return _sanitizeHtmlRegex(s);
    }
    if (!doc || !doc.body) return _sanitizeHtmlRegex(s);
    var DANGEROUS_TAGS = { SCRIPT: 1, OBJECT: 1, EMBED: 1, BASE: 1, FORM: 1, META: 1, LINK: 1 };
    var URL_ATTRS = { 'href': 1, 'src': 1, 'xlink:href': 1, 'formaction': 1, 'action': 1 };
    var toRemove = [];
    var all = doc.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
        var node = all[i];
        var tag = node.tagName ? node.tagName.toUpperCase() : '';
        if (DANGEROUS_TAGS[tag]) { toRemove.push(node); continue; }
        // <iframe> — только доверенные встраивания (YouTube/Vimeo) и локальный
        // PDF (file://…*.pdf). Произвольный file:// недопустим: окно грузится по
        // file://, поэтому <iframe src="file://…/evil.html"> исполнил бы локальный
        // HTML в webview с доступом к мосту (RCE). Прочий src — фишинг/трекинг.
        if (tag === 'IFRAME') {
            var _isrc = node.getAttribute('src') || '';
            if (!/^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\//i.test(_isrc)
                && !/^https:\/\/player\.vimeo\.com\/video\//i.test(_isrc)
                && !/^file:\/\/[^?#]*\.pdf(?:[?#]|$)/i.test(_isrc)) {
                toRemove.push(node);
                continue;
            }
        }
        var attrs = Array.prototype.slice.call(node.attributes || []);
        for (var j = 0; j < attrs.length; j++) {
            var name = attrs[j].name.toLowerCase();
            var val = attrs[j].value || '';
            if (name.indexOf('on') === 0) { node.removeAttribute(attrs[j].name); continue; }
            if (name === 'srcdoc') { node.removeAttribute(attrs[j].name); continue; }
            if (URL_ATTRS[name] && _sanitizeUrlValue(val)) { node.removeAttribute(attrs[j].name); continue; }
            if (name === 'style' && /(javascript:|expression\s*\()/i.test(val)) { node.removeAttribute(attrs[j].name); }
        }
    }
    for (var k = 0; k < toRemove.length; k++) {
        if (toRemove[k].parentNode) toRemove[k].parentNode.removeChild(toRemove[k]);
    }
    return doc.body.innerHTML;
}

// Препроцессор Obsidian-синтаксиса. Вызывается ПОСЛЕ вырезания код-блоков.
// parseInner(md) — рекурсивный парсер для содержимого callout'ов и сносок.
// Возвращает { text, blocks }: text — изменённый markdown, blocks — готовые
// HTML-куски, подставляемые после marked.parse по плейсхолдерам DOEOBSBLOCKnEND.
function obsidianPreprocess(text, parseInner) {
    const blocks = [];
    const put = (html) => {
        blocks.push(html);
        return '\n\nDOEOBSBLOCK' + (blocks.length - 1) + 'END\n\n';
    };
    const encPath = (p) => encodeURIComponent(p).replace(/%2F/g, '/');
    const escHtml = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

    let processed = String(text);

    // ---- %%Комментарии%% — не показываются в предпросмотре ----
    processed = processed.replace(/%%[\s\S]*?%%/g, '');

    // ---- Сноски: определения [^id]: текст (+ продолжения с отступом) ----
    const footnotes = {};
    const footnoteOrder = [];
    processed = processed.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.*(?:\n[ \t]+[^\n]*)*)/gm, (m, id, def) => {
        footnotes[id] = def.replace(/\n[ \t]+/g, '\n').trim();
        return '';
    });
    // Ссылки на сноски [^id] → номерок-надстрочник
    processed = processed.replace(/\[\^([^\]\s]+)\]/g, (m, id) => {
        if (!(id in footnotes)) return m;
        let n = footnoteOrder.indexOf(id);
        if (n === -1) { footnoteOrder.push(id); n = footnoteOrder.length - 1; }
        return '<sup class="doe-footnote-ref"><a href="#doe-fn-' + encPath(id) + '" id="doe-fnref-' + encPath(id) + '">' + (n + 1) + '</a></sup>';
    });

    // ---- Размеры картинок Obsidian: ![alt|300](url), ![alt|300x200](url) ----
    processed = processed.replace(/!\[([^\]|]*)\|(\d+)(?:x(\d+))?\]\(([^)]+)\)/g, (m, alt, w, h, url) => {
        return '![' + alt + '](' + url + '){' + w + (h ? ',' + h : '') + '}';
    });

    // ---- Вики-встраивания ![[файл]] и ![[файл|300]] / ![[файл|300x200]] ----
    processed = processed.replace(/!\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g, (m, target, alias) => {
        const name = target.trim();
        const size = alias && /^\d+(x\d+)?$/.test(alias.trim()) ? alias.trim() : null;
        const label = (!size && alias) ? alias.trim() : name;
        const sizeSuffix = size ? '{' + size.replace('x', ',') + '}' : '';
        return '![' + label + '](doe/' + encPath(name) + ')' + sizeSuffix;
    });

    // ---- Вики-ссылки [[цель]], [[цель|текст]], [[цель#заголовок]] ----
    processed = processed.replace(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g, (m, target, alias) => {
        const name = target.trim();
        const label = (alias || name).trim();
        // Есть расширение файла → это вложение
        if (/\.[A-Za-z0-9]{1,8}$/.test(name)) {
            return '[' + label + '](doe/' + encPath(name) + ')';
        }
        // Иначе — ссылка на заметку/карточку: клик открывает глобальный поиск
        return '<a class="doe-wikilink" href="doe://wikilink/' + encPath(name) + '">' + escHtml(label) + '</a>';
    });

    // ---- ==Подсветка== ----
    processed = processed.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

    // ---- Callout-блоки: > [!type][+|-] Заголовок ----
    const CALLOUTS = {
        note: ['note', '📝'], abstract: ['abstract', '📋'], summary: ['abstract', '📋'], tldr: ['abstract', '📋'],
        info: ['info', 'ℹ️'], todo: ['todo', '☑️'],
        tip: ['tip', '💡'], hint: ['tip', '💡'], important: ['tip', '💡'],
        success: ['success', '✅'], check: ['success', '✅'], done: ['success', '✅'],
        question: ['question', '❓'], help: ['question', '❓'], faq: ['question', '❓'],
        warning: ['warning', '⚠️'], caution: ['warning', '⚠️'], attention: ['warning', '⚠️'],
        failure: ['failure', '❌'], fail: ['failure', '❌'], missing: ['failure', '❌'],
        danger: ['danger', '⚡'], error: ['danger', '⚡'],
        bug: ['bug', '🐞'], example: ['example', '🧪'],
        quote: ['quote', '❝'], cite: ['quote', '❝']
    };
    const lines = processed.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const calloutStart = lines[i].match(/^\s*>\s*\[!([A-Za-z-]+)\]([+-])?\s*(.*)$/);
        if (calloutStart && CALLOUTS[calloutStart[1].toLowerCase()]) {
            const group = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) { group.push(lines[i]); i++; }
            const type = calloutStart[1].toLowerCase();
            const fold = calloutStart[2] || '';
            const meta = CALLOUTS[type];
            const title = calloutStart[3].trim() || type.charAt(0).toUpperCase() + type.slice(1);
            const inner = group.slice(1).map(l => l.replace(/^\s*>\s?/, '')).join('\n');
            const contentHtml = inner.trim() && typeof parseInner === 'function'
                ? '<div class="callout-content">' + parseInner(inner) + '</div>' : '';
            const titleInner = '<span class="callout-icon">' + meta[1] + '</span><span class="callout-title-text">' + escHtml(title) + '</span>';
            let html;
            if (fold) {
                html = '<details class="callout callout-' + meta[0] + ' is-collapsible"' + (fold === '+' ? ' open' : '') + '>'
                    + '<summary class="callout-title">' + titleInner + '<span class="callout-fold">›</span></summary>' + contentHtml + '</details>';
            } else {
                html = '<div class="callout callout-' + meta[0] + '">'
                    + '<div class="callout-title">' + titleInner + '</div>' + contentHtml + '</div>';
            }
            out.push(put(html));
        } else {
            out.push(lines[i]);
            i++;
        }
    }
    processed = out.join('\n');

    // ---- Секция сносок в конце заметки ----
    if (footnoteOrder.length) {
        let fnHtml = '<section class="doe-footnotes"><ol>';
        for (const id of footnoteOrder) {
            const body = typeof parseInner === 'function' ? parseInner(footnotes[id]) : escHtml(footnotes[id]);
            fnHtml += '<li id="doe-fn-' + encPath(id) + '">' + body
                + '<a class="doe-footnote-backref" href="#doe-fnref-' + encPath(id) + '">↩</a></li>';
        }
        fnHtml += '</ol></section>';
        processed += put(fnHtml);
    }

    return { text: processed, blocks };
}

function parseMarkdownWithMath(text, _depth = 0) {
    if (!text) return "";
    // Защита от бесконечной рекурсии (callout внутри callout внутри...)
    if (_depth > 4) return escapeHtml(String(text));
    const mathBlocks = [];
    const codeBlocks = [];

    let processed = text.replace(/(```[\s\S]*?```|`[^`]*`)/g, (match) => {
        codeBlocks.push(match);
        return `DOECODEPLACEHOLDER${codeBlocks.length - 1}END`;
    });

    // Obsidian-синтаксис: callouts, сноски, вики-ссылки, ==подсветка==,
    // %%комментарии%%, размеры картинок |300. Содержимое callout'ов и сносок
    // парсится рекурсивно (с возвратом вырезанных код-блоков).
    const parseInner = (md) => {
        codeBlocks.forEach((code, ci) => {
            md = md.replace(`DOECODEPLACEHOLDER${ci}END`, () => code);
        });
        return parseMarkdownWithMath(md, _depth + 1);
    };
    const obs = obsidianPreprocess(processed, parseInner);
    processed = obs.text;

    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
        mathBlocks.push({ math, displayMode: true });
        return `DOEMATHPLACEHOLDER${mathBlocks.length - 1}END`;
    });

    processed = processed.replace(/\$([^$\n]+?)\$/g, (match, math) => {
        mathBlocks.push({ math, displayMode: false });
        return `DOEMATHPLACEHOLDER${mathBlocks.length - 1}END`;
    });

    // Медиа-встраивания ![метка](путь){w,h}: изображения, видео, аудио,
    // PDF (в т.ч. с #page=N) и YouTube. Размер {w,h} или {w} (высота
    // автоматически — как |300 в Obsidian).
    processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{(\d+)\s*(?:,\s*(\d+))?\})?/g, (match, alt, url, w, h) => {
        // Отделяем #фрагмент (например, страницу PDF) от пути к файлу,
        // чтобы он не ломал определение расширения.
        const hashIdx = url.indexOf('#');
        const path = hashIdx === -1 ? url : url.slice(0, hashIdx);
        const frag = hashIdx === -1 ? '' : url.slice(hashIdx);
        const ext = path.split('.').pop().toLowerCase();

        // YouTube: ![](https://youtube.com/watch?v=...) → встроенный плеер
        const yt = getYoutubeEmbedUrl(url);
        if (yt) {
            const style = w ? ` style="width: ${w}px; height: ${h ? h + 'px' : Math.round(w * 9 / 16) + 'px'};"` : '';
            return `<span class="doe-media-embed doe-youtube-embed"${style}><iframe src="${yt}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></span>`;
        }

        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
        const isVideo = ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext);
        const isAudio = ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'opus'].includes(ext);

        if (isVideo) {
            const style = w ? ` style="width: ${w}px;${h ? ` height: ${h}px;` : ''}"` : '';
            return `<video class="doe-video-embed" controls preload="metadata" src="${resolveMarkdownAssetSrc(path)}"${style}></video>`;
        }
        if (isAudio) {
            return `<audio class="doe-audio-embed" controls preload="metadata" src="${resolveMarkdownAssetSrc(path)}"></audio>`;
        }
        if (ext === 'pdf') {
            const style = `width: ${w ? w + 'px' : '100%'}; height: ${h ? h + 'px' : '520px'};`;
            const pageM = frag.match(/page=(\d+)/);
            // Плейсхолдер: кастомный ридер на PDF.js инициализируется после
            // рендера (enhancePdfEmbeds), офлайн-фолбэк — нативный iframe.
            return `<div class="doe-pdf-embed doe-pdf-host" data-pdf-src="${resolveMarkdownAssetSrc(path)}" data-pdf-page="${pageM ? pageM[1] : 1}" style="${style}" title="${escapeHtml(alt || path)}"></div>`;
        }
        if (!isImage) {
            return `[${alt}](${url})`;
        }

        const safeMatch = escapeHtml(match);
        let style = '';
        let customClass = '';

        if (w) {
            style = `width: ${w}px;` + (h ? ` height: ${h}px;` : '');
            customClass = 'has-custom-size';
        }

        return `<span class="image-resizer-wrapper ${customClass}" style="${style}" data-md="${safeMatch}"><img src="${resolveMarkdownAssetSrc(path)}" alt="${alt}" draggable="false"><span class="image-resize-handle" title="Потяните для изменения размера"></span></span>`;
    });

    // Ссылка с пустым текстом [](путь) — CommonMark рендерит её невидимой.
    // Подставляем сам путь как текст, чтобы ссылка была видима и кликабельна.
    // Для путей с пробелами поддерживается синтаксис [](<путь с пробелами>).
    processed = processed.replace(/(^|[^!])\[\]\(([^)]+)\)/g, (m, pre, url) => {
        const label = url.replace(/^</, '').replace(/>$/, '');
        return pre + '[' + label + '](' + url + ')';
    });

    codeBlocks.forEach((code, i) => {
        processed = processed.replace(`DOECODEPLACEHOLDER${i}END`, () => code);
    });

    let html = marked.parse(processed, { breaks: true });

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

    // Готовые HTML-блоки Obsidian-синтаксиса (callouts, сноски)
    obs.blocks.forEach((blockHtml, i) => {
        html = html.replace(`DOEOBSBLOCK${i}END`, () => blockHtml);
    });

    // Чекбоксы задач (- [ ]) делаем кликабельными: marked отдаёт их
    // disabled, включаем и помечаем классом — клик в режиме чтения
    // переключает [ ]/[x] прямо в тексте описания (как в Obsidian).
    html = html.replace(/<input (checked="" )?disabled="" type="checkbox">/g,
        (m, chk) => `<input ${chk || ''}class="doe-task-checkbox" type="checkbox">`);

    return sanitizeRenderedHtml(html);
}

// ============================================================
// 🔗 Ссылки на фрагменты: текст описаний карточек и страницы PDF
// ============================================================

async function doeCopyText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            textArea.remove();
        }
        return true;
    } catch (err) {
        console.error("Copy failed:", err);
        return false;
    }
}

// Встроенный просмотрщик PDF: открывается по ссылкам вида
// [цитата](doe/файл.pdf#page=5) прямо в приложении на нужной странице.
// Внутри — кастомный ридер на PDF.js (см. createDoePdfViewer).
function openPdfOverlay(src) {
    let ov = document.getElementById('doe-pdf-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'doe-pdf-overlay';
        ov.innerHTML = `
            <div class="doe-pdf-overlay-backdrop"></div>
            <div class="doe-pdf-overlay-panel">
                <button class="doe-pdf-overlay-close" title="Esc">✕</button>
                <div class="doe-pdf-overlay-host"></div>
            </div>`;
        document.body.appendChild(ov);
        ov.querySelector('.doe-pdf-overlay-backdrop').addEventListener('click', closePdfOverlay);
        ov.querySelector('.doe-pdf-overlay-close').addEventListener('click', closePdfOverlay);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && ov.classList.contains('show')) {
                e.stopPropagation();
                closePdfOverlay();
            }
        }, true);
    }
    const hashIdx = src.indexOf('#');
    const rawSrc = hashIdx === -1 ? src : src.slice(0, hashIdx);
    const pageM = hashIdx === -1 ? null : src.slice(hashIdx).match(/page=(\d+)/);
    // 🔒 Без сервера PDF грузится по file:// — резолвим путь как и картинки.
    const cleanSrc = resolveMarkdownAssetSrc(rawSrc);
    const host = ov.querySelector('.doe-pdf-overlay-host');
    host.innerHTML = '';
    ov.classList.add('show');
    createDoePdfViewer(host, cleanSrc, pageM ? parseInt(pageM[1]) : 1);
}

function closePdfOverlay() {
    const ov = document.getElementById('doe-pdf-overlay');
    if (!ov) return;
    ov.classList.remove('show');
    // Освобождаем документ PDF.js
    const host = ov.querySelector('.doe-pdf-overlay-host');
    if (host) setTimeout(() => { if (!ov.classList.contains('show')) { host.innerHTML = ''; _cleanupPdfDocs(); } }, 300);
}

// Ищет фразу в отрендеренном описании, подсвечивает и скроллит к ней.
// Если точного совпадения нет (фраза пересекает форматирование) —
// пробует более короткие префиксы.
function highlightDescriptionFragment(text) {
    const renderDiv = document.getElementById('task-desc-render');
    if (!renderDiv || !text) return false;

    const tryFind = (needle) => {
        needle = needle.toLowerCase();
        if (!needle) return null;
        const walker = document.createTreeWalker(renderDiv, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            const idx = node.nodeValue.toLowerCase().indexOf(needle);
            if (idx !== -1) {
                const range = new Range();
                range.setStart(node, idx);
                range.setEnd(node, idx + needle.length);
                return range;
            }
        }
        return null;
    };

    const words = String(text).trim().split(/\s+/);
    let range = tryFind(String(text).trim());
    if (!range && words.length > 5) range = tryFind(words.slice(0, 5).join(' '));
    if (!range && words.length > 1) range = tryFind(words[0]);
    if (!range) return false;

    if (window.CSS && CSS.highlights) {
        CSS.highlights.set('doe-fragment', new Highlight(range));
        setTimeout(() => { try { CSS.highlights.delete('doe-fragment'); } catch (e) {} }, 3000);
    }
    const el = range.startContainer.parentElement;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
}

// Ждёт открытия карточки (после navigateToEntityGlobal) и подсвечивает фрагмент.
function highlightFragmentWhenReady(taskId, text, attempts = 25) {
    const modal = document.getElementById('task-modal');
    const tick = (left) => {
        if (left <= 0) return;
        const ready = modal && modal.classList.contains('show')
            && parseInt(modal.dataset.taskId) === parseInt(taskId)
            && document.getElementById('task-desc-render')
            && document.getElementById('task-desc-render').textContent.trim() !== '';
        if (ready && highlightDescriptionFragment(text)) return;
        setTimeout(() => tick(left - 1), 200);
    };
    tick(attempts);
}

// ============================================================
// 📄 Кастомный PDF-ридер на PDF.js (тот же движок, что в Obsidian).
// Библиотека скачивается один раз в локальный кэш (~/.doe/vendor),
// дальше работает офлайн. Если недоступна — нативный фолбэк WebView.
// ============================================================

let _pdfjsLoadPromise = null;
function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(true);
    if (_pdfjsLoadPromise) return _pdfjsLoadPromise;
    _pdfjsLoadPromise = (async () => {
        try {
            const st = await fetch(`${API_BASE}/system/ensure-pdfjs`, { method: 'POST' }).then(r => r.json());
            if (!st.ready) throw new Error('PDF.js not available');
            // 🔒 Без сервера грузим PDF.js по file:// из локального кэша.
            let pdfBase = '';
            if (window.pywebview && window.pywebview.api && window.pywebview.api.get_pdfjs_dir) {
                const dir = await window.pywebview.api.get_pdfjs_dir();
                if (dir) {
                    let p = String(dir).replace(/\\/g, '/');
                    if (/^[A-Za-z]:\//.test(p)) p = '/' + p; else if (p.charAt(0) !== '/') p = '/' + p;
                    pdfBase = 'file://' + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F') + '/';
                }
            }
            if (!pdfBase) throw new Error('PDF.js dir unavailable');
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = pdfBase + 'pdf.min.js';
                s.onload = resolve;
                s.onerror = () => reject(new Error('script load failed'));
                document.head.appendChild(s);
            });
            if (!window.pdfjsLib) throw new Error('pdfjsLib missing');
            pdfjsLib.GlobalWorkerOptions.workerSrc = pdfBase + 'pdf.worker.min.js';
            return true;
        } catch (e) {
            console.warn('[PDF.js]', e.message || e);
            _pdfjsLoadPromise = null; // позволит повторить попытку позже
            return false;
        }
    })();
    return _pdfjsLoadPromise;
}

// Реестр открытых документов — освобождаем память, когда host-элемент
// исчезает из DOM (перерисовка описания, закрытие оверлея).
const _doePdfDocs = new Set();
function _cleanupPdfDocs() {
    for (const entry of Array.from(_doePdfDocs)) {
        if (!entry.el.isConnected) {
            try { entry.doc.destroy(); } catch (e) {}
            _doePdfDocs.delete(entry);
        }
    }
}

async function createDoePdfViewer(container, src, initialPage = 1) {
    const L = (ru, en) => ((typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ru);
    container.innerHTML = `<div class="doe-pdfv-msg">${L('Загрузка PDF…', 'Loading PDF…')}</div>`;

    const ok = await loadPdfJs();
    if (!ok) {
        // Офлайн при первом использовании — нативный просмотрщик WebView
        container.innerHTML = `<iframe class="doe-pdf-native" src="${src}${initialPage > 1 ? '#page=' + initialPage : ''}" title="PDF"></iframe>`;
        return null;
    }

    let doc;
    try {
        doc = await pdfjsLib.getDocument({ url: src }).promise;
    } catch (e) {
        container.innerHTML = `<div class="doe-pdfv-msg">${L('Не удалось открыть PDF', 'Failed to open PDF')}</div>`;
        return null;
    }
    _doePdfDocs.add({ el: container, doc });

    container.classList.add('doe-pdfv');
    container.innerHTML = `
        <div class="doe-pdfv-toolbar">
            <button data-act="prev" title="${L('Предыдущая страница', 'Previous page')}">‹</button>
            <span class="doe-pdfv-pageinfo"><input class="doe-pdfv-pagenum" type="text" inputmode="numeric" value="1"><span class="doe-pdfv-pagecount">/ ${doc.numPages}</span></span>
            <button data-act="next" title="${L('Следующая страница', 'Next page')}">›</button>
            <span class="doe-pdfv-sep"></span>
            <button data-act="zoomout" title="−">−</button>
            <span class="doe-pdfv-zoomlabel">100%</span>
            <button data-act="zoomin" title="+">+</button>
            <button data-act="fit" title="${L('По ширине', 'Fit width')}">⛶</button>
            <span class="doe-pdfv-spacer"></span>
            <button data-act="open" title="${L('Открыть в системном приложении', 'Open in system app')}">↗</button>
        </div>
        <div class="doe-pdfv-scroll"></div>`;

    const scroll = container.querySelector('.doe-pdfv-scroll');
    const pageInput = container.querySelector('.doe-pdfv-pagenum');
    const zoomLabel = container.querySelector('.doe-pdfv-zoomlabel');

    const firstPage = await doc.getPage(1);
    const baseVp = firstPage.getViewport({ scale: 1 });
    const fitScale = () => Math.max(0.2, (scroll.clientWidth - 20) / baseVp.width);

    let scale = fitScale();
    let fitMode = true;
    const pages = [];

    for (let i = 1; i <= doc.numPages; i++) {
        const el = document.createElement('div');
        el.className = 'doe-pdfv-page';
        el.dataset.page = i;
        el.style.width = Math.floor(baseVp.width * scale) + 'px';
        el.style.height = Math.floor(baseVp.height * scale) + 'px';
        scroll.appendChild(el);
        pages.push({ el, num: i, renderedScale: 0, rendering: false, vpRatio: baseVp.height / baseVp.width });
    }

    const dpr = () => Math.min(window.devicePixelRatio || 1, 3);

    async function renderPage(p) {
        if (p.rendering || p.renderedScale === scale) return;
        p.rendering = true;
        try {
            const page = await doc.getPage(p.num);
            const targetScale = scale; // фиксируем на время рендера
            const vp = page.getViewport({ scale: targetScale });
            const k = dpr();
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(vp.width * k);
            canvas.height = Math.floor(vp.height * k);
            canvas.style.width = Math.floor(vp.width) + 'px';
            canvas.style.height = Math.floor(vp.height) + 'px';
            await page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: vp,
                transform: k !== 1 ? [k, 0, 0, k, 0, 0] : null
            }).promise;

            // Текстовый слой — выделение и копирование текста, как в Obsidian
            let textLayer = null;
            try {
                const tc = await page.getTextContent();
                textLayer = document.createElement('div');
                textLayer.className = 'textLayer';
                textLayer.style.setProperty('--scale-factor', vp.scale);
                await pdfjsLib.renderTextLayer({ textContentSource: tc, container: textLayer, viewport: vp }).promise;
            } catch (e) { textLayer = null; }

            p.el.style.width = Math.floor(vp.width) + 'px';
            p.el.style.height = Math.floor(vp.height) + 'px';
            p.el.innerHTML = '';
            p.el.appendChild(canvas);
            if (textLayer) p.el.appendChild(textLayer);
            p.vpRatio = vp.height / vp.width;
            p.renderedScale = targetScale;
        } catch (e) {
            console.warn('[PDF.js] page render failed:', e);
        } finally {
            p.rendering = false;
            // масштаб успел смениться — перерендерим актуальным
            if (p.renderedScale !== scale && p.el.isConnected && isPageVisible(p)) renderPage(p);
        }
    }

    const isPageVisible = (p) => {
        const r = p.el.getBoundingClientRect();
        const s = scroll.getBoundingClientRect();
        return r.bottom > s.top - 600 && r.top < s.bottom + 600;
    };

    const io = new IntersectionObserver((entries) => {
        for (const en of entries) {
            if (en.isIntersecting) renderPage(pages[+en.target.dataset.page - 1]);
        }
    }, { root: scroll, rootMargin: '600px' });
    pages.forEach(p => io.observe(p.el));

    let rerenderTimer = null;
    const setScale = (newScale, keepFit = false) => {
        newScale = Math.min(6, Math.max(0.2, newScale));
        if (!keepFit) fitMode = false;
        const ratio = newScale / scale;
        scale = newScale;
        zoomLabel.textContent = Math.round(scale / fitScale() * 100) + '%';
        // мгновенный визуальный отклик — CSS-растяжение, чёткий перерендер следом
        for (const p of pages) {
            const wNow = parseFloat(p.el.style.width) * ratio;
            p.el.style.width = Math.floor(wNow) + 'px';
            p.el.style.height = Math.floor(wNow * p.vpRatio) + 'px';
            const c = p.el.querySelector('canvas');
            if (c) { c.style.width = '100%'; c.style.height = '100%'; }
            const tl = p.el.querySelector('.textLayer');
            if (tl) tl.style.setProperty('--scale-factor', scale);
        }
        clearTimeout(rerenderTimer);
        rerenderTimer = setTimeout(() => {
            pages.forEach(p => { if (isPageVisible(p)) renderPage(p); });
        }, 180);
    };

    const currentPage = () => {
        const sTop = scroll.getBoundingClientRect().top;
        for (const p of pages) {
            if (p.el.getBoundingClientRect().bottom > sTop + 40) return p.num;
        }
        return doc.numPages;
    };
    const gotoPage = (n) => {
        n = Math.min(doc.numPages, Math.max(1, n));
        pages[n - 1].el.scrollIntoView({ block: 'start' });
        pageInput.value = n;
    };

    scroll.addEventListener('scroll', () => {
        if (document.activeElement !== pageInput) pageInput.value = currentPage();
    }, { passive: true });

    container.querySelector('.doe-pdfv-toolbar').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'prev') gotoPage(currentPage() - 1);
        else if (act === 'next') gotoPage(currentPage() + 1);
        else if (act === 'zoomin') setScale(scale * 1.2);
        else if (act === 'zoomout') setScale(scale / 1.2);
        else if (act === 'fit') { fitMode = true; setScale(fitScale(), true); }
        else if (act === 'open') {
            // 🔒 src теперь file://… — открываем нативно через мост; http/data — как ссылку.
            if (/^file:\/\//i.test(src)) {
                let p = src.replace(/^file:\/\//i, '').split('#')[0];
                try { p = decodeURIComponent(p); } catch (e) {}
                if (window.pywebview && window.pywebview.api && window.pywebview.api.open_local_path) {
                    window.pywebview.api.open_local_path(p);
                }
            } else {
                fetch(`${API_BASE}/system/open-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: src }) });
            }
        }
    });

    pageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); gotoPage(parseInt(pageInput.value) || 1); pageInput.blur(); }
        e.stopPropagation();
    });

    // Зум внутри ридера: Ctrl+колесо (Windows) — pinch на трекпаде macOS
    // приходит как жест (см. ниже). Не даём событию уйти в зум заметки.
    scroll.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.stopPropagation();
        setScale(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
    let gestureStartScale = null;
    scroll.addEventListener('gesturestart', (e) => { e.preventDefault(); e.stopPropagation(); gestureStartScale = scale; });
    scroll.addEventListener('gesturechange', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gestureStartScale) setScale(gestureStartScale * e.scale);
    });
    scroll.addEventListener('gestureend', (e) => { e.stopPropagation(); gestureStartScale = null; });

    // Пересчёт "по ширине" при изменении размеров контейнера
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (fitMode && scroll.isConnected && scroll.clientWidth > 0) setScale(fitScale(), true);
        });
        ro.observe(scroll);
    }

    zoomLabel.textContent = '100%';
    if (initialPage > 1) {
        // даём страницам построиться, затем прыгаем
        requestAnimationFrame(() => gotoPage(initialPage));
    }
    return { doc, gotoPage };
}

// Инициализация встроенных PDF в отрендеренном описании
function enhancePdfEmbeds(container) {
    _cleanupPdfDocs();
    if (!container || !container.querySelectorAll) return;
    container.querySelectorAll('.doe-pdf-host:not(.doe-pdfv-inited)').forEach(el => {
        el.classList.add('doe-pdfv-inited');
        createDoePdfViewer(el, el.dataset.pdfSrc, parseInt(el.dataset.pdfPage) || 1);
    });
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
    let cachedTextNodes = null;

    let cmMatches = [];
    let cmMarkers = [];
    let cmActiveMarker = null;

    let currentMatchIndex = -1;
    let searchId = 0;
    let searchDebounce = null;

    const isEditMode = () => {
        return !!(cmEditor && cmEditor.getWrapperElement().style.display !== 'none');
    };

    window.openLocalSearch = () => {
        widget.classList.add('show');
        setTimeout(() => { input.focus(); input.select(); }, 50);

        if (isEditMode()) {
            cachedTextNodes = null;
        } else {
            cachedTextNodes = [];
            const walker = document.createTreeWalker(renderDiv, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                const text = node.nodeValue.toLowerCase();
                if (text.trim()) {
                    cachedTextNodes.push({ node, text });
                }
            }
        }

        if (input.value.trim()) performLocalSearch(input.value);
    };

    window.closeLocalSearch = () => {
        widget.classList.remove('show');
        clearLocalSearch();
        input.value = '';
        cachedTextNodes = null;
        searchId++;
        if (isEditMode() && cmEditor) {
            cmEditor.focus();
        }
    };

    function clearLocalSearch() {
        if (CSS.highlights) {
            CSS.highlights.clear();
        }
        matchRanges = [];

        if (cmEditor) {
            cmEditor.operation(() => {
                cmMarkers.forEach(m => m.clear());
                if (cmActiveMarker) {
                    cmActiveMarker.clear();
                    cmActiveMarker = null;
                }
            });
        }
        cmMatches = [];
        cmMarkers = [];

        currentMatchIndex = -1;
        countEl.textContent = '0/0';
    }

    function performLocalSearch(query) {
        clearLocalSearch();
        const textLower = query.trim().toLowerCase();
        if (!textLower) return;

        const currentSearchId = ++searchId;

        if (isEditMode()) {
            cmEditor.operation(() => {
                const lineCount = cmEditor.lineCount();
                for (let line = 0; line < lineCount; line++) {
                    const text = cmEditor.getLine(line).toLowerCase();
                    let pos = 0;
                    while ((pos = text.indexOf(textLower, pos)) !== -1) {
                        const from = { line, ch: pos };
                        const to = { line, ch: pos + textLower.length };
                        cmMatches.push({ from, to });

                        const marker = cmEditor.markText(from, to, { className: 'local-search-highlight' });
                        cmMarkers.push(marker);

                        pos += textLower.length;
                    }
                }
            });

            if (cmMatches.length > 0) {
                currentMatchIndex = 0;
                updateLocalSearchUI();
            } else {
                countEl.textContent = '0/0';
            }
        } else {
            if (!renderDiv.textContent.toLowerCase().includes(textLower)) {
                countEl.textContent = '0/0';
                return;
            }

            function searchNextChunk(startIndex) {
                if (currentSearchId !== searchId) return;

                const startTime = performance.now();
                let i = startIndex;

                for (; i < cachedTextNodes.length; i++) {
                    if (performance.now() - startTime > 12) break;

                    const item = cachedTextNodes[i];
                    if (!item.text.includes(textLower)) continue;

                    let pos = 0;
                    while ((pos = item.text.indexOf(textLower, pos)) !== -1) {
                        const range = new Range();
                        range.setStart(item.node, pos);
                        range.setEnd(item.node, pos + query.length);
                        matchRanges.push(range);
                        pos += query.length;
                    }

                    if (matchRanges.length >= 10000) break;
                }

                if (i < cachedTextNodes.length && matchRanges.length < 10000) {
                    requestAnimationFrame(() => searchNextChunk(i));
                } else {
                    if (matchRanges.length > 0) {
                        currentMatchIndex = 0;
                        if (CSS.highlights) {
                            CSS.highlights.set('local-search', new Highlight(...matchRanges));
                        }
                        updateLocalSearchUI();

                        if (matchRanges.length >= 10000) {
                            countEl.textContent = `1/10000+`;
                        }
                    } else {
                        countEl.textContent = '0/0';
                    }
                }
            }
            requestAnimationFrame(() => searchNextChunk(0));
        }
    }

    function updateLocalSearchUI() {
        if (isEditMode()) {
            if (cmActiveMarker) {
                cmActiveMarker.clear();
                cmActiveMarker = null;
            }
            if (cmMatches.length === 0 || currentMatchIndex < 0) return;

            const activeMatch = cmMatches[currentMatchIndex];
            cmActiveMarker = cmEditor.markText(activeMatch.from, activeMatch.to, { className: 'local-search-highlight active' });

            cmEditor.scrollIntoView(activeMatch.from, 150);
            countEl.textContent = `${currentMatchIndex + 1}/${cmMatches.length}`;
        } else {
            if (matchRanges.length === 0 || currentMatchIndex < 0) return;

            const activeRange = matchRanges[currentMatchIndex];

            if (CSS.highlights) {
                const highlightActive = new Highlight(activeRange);
                CSS.highlights.set('local-search-active', highlightActive);
            }

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

            requestAnimationFrame(() => {
                const innerScroll = renderDiv;
                const outerScroll = scrollParent;
                const descWrapper = document.querySelector('.description-wrapper');

                let rangeRect = activeRange.getBoundingClientRect();

                if (rangeRect.top === 0 || rangeRect.height === 0) {
                    const parentEl = activeRange.startContainer.parentElement;
                    if (parentEl) {
                        rangeRect = parentEl.getBoundingClientRect();
                    }
                }

                if (rangeRect.top === 0) return;

                if (innerScroll) {
                    const innerRect = innerScroll.getBoundingClientRect();
                    const relativeTop = rangeRect.top - innerRect.top + innerScroll.scrollTop;
                    innerScroll.scrollTo({
                        top: relativeTop - (innerRect.height / 2),
                        behavior: 'auto'
                    });
                }

                if (outerScroll && descWrapper) {
                    const wrapperRect = descWrapper.getBoundingClientRect();
                    const outerRect = outerScroll.getBoundingClientRect();

                    if (wrapperRect.top < outerRect.top + 16 || wrapperRect.bottom > outerRect.bottom - 16) {
                        const relativeWrapperTop = wrapperRect.top - outerRect.top + outerScroll.scrollTop;
                        outerScroll.scrollTo({
                            top: relativeWrapperTop - 16,
                            behavior: 'auto'
                        });
                    }
                }
            });

            if (matchRanges.length < 10000) {
                countEl.textContent = `${currentMatchIndex + 1}/${matchRanges.length}`;
            }
        }
    }

    function nextMatch() {
        const length = isEditMode() ? cmMatches.length : matchRanges.length;
        if (length === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % length;
        updateLocalSearchUI();
    }

    function prevMatch() {
        const length = isEditMode() ? cmMatches.length : matchRanges.length;
        if (length === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + length) % length;
        updateLocalSearchUI();
    }

    input.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => performLocalSearch(input.value), 120);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prevMatch() : nextMatch(); }
        if (e.key === 'Escape') { e.preventDefault(); window.closeLocalSearch(); }
    });

    btnNext.addEventListener('click', nextMatch);
    btnPrev.addEventListener('click', prevMatch);
    btnClose.addEventListener('click', window.closeLocalSearch);
}

initTaskDescriptionLogic();
initLocalSearchLogic();

const G = {
    nodes: [], edges: [], nodeMap: {},
    scale: 1, offsetX: 0, offsetY: 0,
    W: 0, H: 0, dpr: 1,
    hoverNode: null, dragNode: null, isPanning: false,
    mouseDownPos: null, lastX: 0, lastY: 0,
    running: false,
    showArrows: false,
    repulsionForce: 9000,
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
        return 5 + Math.min(n.degree || 0, 12) * 1.6;
    }
    function nodeAt(mx, my) {
        const w = screenToWorld(mx, my);
        for (let i = G.nodes.length - 1; i >= 0; i--) {
            const n = G.nodes[i];
            const r = graphNodeRadius(n) + 4 / G.scale;
            const dx = n.x - w.x, dy = n.y - w.y;
            if (dx * dx + dy * dy <= r * r) return n;
        }
        return null;
    }
    G.nodeAt = nodeAt;
    G.graphNodeRadius = graphNodeRadius;

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
            G.dragNode = n;
        } else {
            G.isPanning = true;
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
                tooltipInner.innerHTML = renderInlineMarkdown(G.hoverNode.title || '');
                tooltip.classList.add('visible');
            } else {
                canvas.style.cursor = 'grab';
                tooltip.classList.remove('visible');
            }
        }
    });

    const endPointer = (e) => {
        if (G.mouseDownPos &&
            Math.abs(e.clientX - G.mouseDownPos.x) < 5 &&
            Math.abs(e.clientY - G.mouseDownPos.y) < 5) {
            const rect = canvas.getBoundingClientRect();
            const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (n) {
                G.running = false;
                modal.classList.remove('show');
                tooltip.classList.remove('visible');
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

    const arrowsToggle = document.getElementById('graph-arrows-toggle');
    if (arrowsToggle) {
        arrowsToggle.classList.toggle('active', G.showArrows);
        arrowsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            G.showArrows = !G.showArrows;
            arrowsToggle.classList.toggle('active', G.showArrows);
        });
    }

    const repulsionSlider = document.getElementById('graph-repulsion-slider');
    if (repulsionSlider) {
        G.repulsionForce = parseInt(repulsionSlider.value);
        repulsionSlider.addEventListener('input', (e) => {
            G.repulsionForce = parseInt(e.target.value);
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

    await new Promise(r => requestAnimationFrame(r));
    resizeGraphCanvas();

    let data = { nodes: [], edges: [] };
    try {
        const res = await fetch(`${API_BASE}/system/graph`);
        if (res.ok) data = await res.json();
    } catch (e) {
        console.error("Graph load failed", e);
    }

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
    const ctx = canvas.getContext('2d', { alpha: false });

    const styles = getComputedStyle(document.documentElement);
    const colorNode = (styles.getPropertyValue('--brand-pine') || '#4A5A48').trim();
    const colorText = (styles.getPropertyValue('--text-primary') || '#2A3029').trim();
    const colorEdge = (styles.getPropertyValue('--text-secondary') || '#828A80').trim();
    const bgColor = (styles.getPropertyValue('--bg-board') || '#EBEAE3').trim();

    const CELL_SIZE = 300;

    function step() {
        if (!G.running || !modal.classList.contains('show')) {
            G.running = false;
            return;
        }

        const repulsion = G.repulsionForce;
        const k = 0.015;
        const nodes = G.nodes;
        const totalNodes = nodes.length;

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

                        if (d2 > CELL_SIZE * CELL_SIZE) continue;

                        if (d2 < 0.01) {
                            diffX = (Math.random() - 0.5);
                            diffY = (Math.random() - 0.5);
                            d2 = 1;
                        }

                        const d = Math.sqrt(d2);
                        const f = (repulsion / d2) * 0.5;

                        a.vx += (diffX / d) * f;
                        a.vy += (diffY / d) * f;
                    }
                }
            }
        }

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

        ctx.save();
        ctx.scale(G.dpr, G.dpr);

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, G.W, G.H);

        ctx.translate(G.offsetX, G.offsetY);
        ctx.scale(G.scale, G.scale);

        const viewLeft = -G.offsetX / G.scale;
        const viewTop = -G.offsetY / G.scale;
        const viewRight = (G.W - G.offsetX) / G.scale;
        const viewBottom = (G.H - G.offsetY) / G.scale;

        const useFastLOD = (totalNodes > 5000 && G.scale < 0.2);

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

        ctx.fillStyle = colorNode;
        if (useFastLOD) {
            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;

                if (n === G.hoverNode) {
                    ctx.fillStyle = colorText;
                    ctx.fillRect(n.x - r, n.y - r, r*2, r*2);
                    ctx.fillStyle = colorNode;
                } else {
                    ctx.fillRect(n.x - r, n.y - r, r*2, r*2);
                }
            }
        } else {
            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;

                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
                ctx.fillStyle = (n === G.hoverNode) ? colorText : colorNode;
                ctx.fill();
            }
        }

        if (G.scale > 1.3) {
            ctx.fillStyle = colorText;
            ctx.textAlign = 'center';
            ctx.font = `${12 / G.scale}px Inter, -apple-system, sans-serif`;
            ctx.globalAlpha = Math.min(1, (G.scale - 1.3) / 0.6);

            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;

                let label = n.title || '';
                label = label.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_~`]/g, '').trim();

                if (label.length > 15) label = label.substring(0, 14) + '…';
                ctx.fillText(label, n.x, n.y + r + 14 / G.scale);
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        const tooltip = document.getElementById('graph-tooltip');
        if (G.hoverNode && tooltip && tooltip.classList.contains('visible')) {
            const rect = canvas.getBoundingClientRect();
            const rScaled = G.graphNodeRadius(G.hoverNode) * G.scale;

            let tx = G.hoverNode.x * G.scale + G.offsetX + rect.left + rScaled + 12;
            let ty = G.hoverNode.y * G.scale + G.offsetY + rect.top + rScaled + 12;

            const tRect = tooltip.getBoundingClientRect();
            if (tx + tRect.width > window.innerWidth - 12) tx = window.innerWidth - tRect.width - 12;
            if (ty + tRect.height > window.innerHeight - 12) ty = window.innerHeight - tRect.height - 12;

            tooltip.style.left = tx + 'px';
            tooltip.style.top = ty + 'px';
        }

        if (totalKineticEnergy < 0.1 && !G.dragNode) {
            requestAnimationFrame(step);
            return;
        }

        requestAnimationFrame(step);
    }
    step();
}

initGraphModal();

document.getElementById('graph-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    openGraphModal();
});

let statsWeekOffset = 0;

document.getElementById('statistics-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    statsWeekOffset = 0;
    openStatisticsModal();
});

document.getElementById('stats-prev-btn')?.addEventListener('click', () => {
    statsWeekOffset++;
    openStatisticsModal();
});

document.getElementById('stats-next-btn')?.addEventListener('click', () => {
    if (statsWeekOffset > 0) {
        statsWeekOffset--;
        openStatisticsModal();
    }
});

async function openStatisticsModal() {
    const modal = document.getElementById('statistics-modal');
    const loading = document.getElementById('stats-loading');
    const content = document.getElementById('stats-content');

    modal.classList.add('show');

    const nextBtn = document.getElementById('stats-next-btn');
    if (statsWeekOffset === 0) {
        nextBtn.style.visibility = 'hidden';
    } else {
        nextBtn.style.visibility = 'visible';
    }

    if (content.style.display === 'flex') {
        content.style.opacity = '0.4';
        content.style.pointerEvents = 'none';
    } else {
        loading.style.display = 'block';
    }

    try {
        const res = await fetch(`${API_BASE}/system/statistics?offset_weeks=${statsWeekOffset}`);
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();

        document.getElementById('stats-date-label').textContent = data.date_range_label;

        document.getElementById('stat-val-done').textContent = data.total_done;

        let h = Math.floor(data.total_time / 3600);
        let m = Math.floor((data.total_time % 3600) / 60);
        document.getElementById('stat-val-time').textContent = h > 0 ? `${h}${t('timeUnits.h')} ${m}${t('timeUnits.m')}` : `${m}${t('timeUnits.m')}`;

        const applyTrend = (elId, pct) => {
            const el = document.getElementById(elId);
            if (!el) return;

            if (pct === 0) {
                el.style.display = 'none';
            } else {
                el.style.display = 'block';
                if (pct > 0) {
                    el.textContent = `+${pct}%`;
                    el.className = 'stats-trend positive';
                } else {
                    el.textContent = `${pct}%`;
                    el.className = 'stats-trend negative';
                }
            }
        };

        applyTrend('stat-trend-time', data.trend_time_pct);
        applyTrend('stat-trend-done', data.trend_done_pct);

        const insightEl = document.getElementById('stats-insight');
        const fullDayNamesRu = ['в <b>понедельник</b>', 'во <b>вторник</b>', 'в <b>среду</b>', 'в <b>четверг</b>', 'в <b>пятницу</b>', 'в <b>субботу</b>', 'в <b>воскресенье</b>'];
        const fullDayNamesEn = ['on <b>Monday</b>', 'on <b>Tuesday</b>', 'on <b>Wednesday</b>', 'on <b>Thursday</b>', 'on <b>Friday</b>', 'on <b>Saturday</b>', 'on <b>Sunday</b>'];
        const fullDayNames = currentLang === 'ru' ? fullDayNamesRu : fullDayNamesEn;

        if (data.total_time === 0) {
            insightEl.innerHTML = `<span>💡 ${t('stats.insightEmpty')}</span>`;
        } else {
            const bestDayName = data.best_day !== null ? fullDayNames[data.best_day] : '';
            if (data.trend_time_pct > 0) {
                insightEl.innerHTML = `<span>✨ ${t('stats.insightPositive', data.trend_time_pct, bestDayName)}</span>`;
            } else if (data.trend_time_pct < 0) {
                insightEl.innerHTML = `<span>📉 ${t('stats.insightNegative', data.trend_time_pct, bestDayName)}</span>`;
            } else {
                insightEl.innerHTML = `<span>⚖️ ${t('stats.insightNeutral', bestDayName)}</span>`;
            }
        }

        const topContainer = document.getElementById('stats-top-tasks');
        const topTitleEl = document.getElementById('stats-top-title-el');

        const renderTasksList = (title, tasks, emptyMsg) => {
            topTitleEl.textContent = title;
            topContainer.innerHTML = '';

            if (tasks.length === 0) {
                topContainer.innerHTML = `<div style="font-size: 13px; color: var(--text-secondary); opacity: 0.7; text-align: center; padding: 20px 16px 12px;">${emptyMsg}</div>`;
                return;
            }

            tasks.forEach(task => {
                const timeFormatted = formatDetailedDuration(task.time_spent);
                topContainer.innerHTML += `
                    <div class="stats-top-item" onclick="if(event.target.closest('a')) { document.getElementById('statistics-modal').classList.remove('show'); return; } document.getElementById('statistics-modal').classList.remove('show'); loadTaskIntoModal(${task.id}, true); document.getElementById('task-modal').classList.add('show');">
                        <div class="stats-top-header">
                            <div class="stats-top-title">${renderInlineMarkdown(task.title)}</div>
                            <div class="stats-top-time">${timeFormatted}</div>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px;">
                            <div class="stats-top-progress-bg">
                                <div class="stats-top-progress-fill" style="width: 0%;" data-target="${task.percentage}%"></div>
                            </div>
                            <div class="stats-top-pct" style="margin-left: auto;">${task.percentage}%</div>
                        </div>
                    </div>
                `;
            });

            setTimeout(() => {
                topContainer.querySelectorAll('.stats-top-progress-fill').forEach(fill => fill.style.width = fill.dataset.target);
            }, 50);
        };

        const chartContainer = document.getElementById('stats-activity-chart');
        chartContainer.innerHTML = '';

        let maxTime = Math.max(...data.chart_data.map(d => d.time_spent));
        if (maxTime === 0) maxTime = 1;

        const daysShort = currentLang === 'ru' ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

        data.chart_data.forEach((day, index) => {
            const pct = day.time_spent === 0 ? 0 : Math.max(2, Math.round((day.time_spent / maxTime) * 100));
            const timeFormatted = formatDetailedDuration(day.time_spent);
            const tooltipText = t('stats.tooltip', day.tasks_done, timeFormatted);
            const isBest = day.day_name === data.best_day;
            const dayNameStr = daysShort[day.day_name];

            const dateObj = new Date(day.date);
            const todayObj = new Date();
            const isToday = dateObj.getFullYear() === todayObj.getFullYear() &&
                            dateObj.getMonth() === todayObj.getMonth() &&
                            dateObj.getDate() === todayObj.getDate();

            const colDiv = document.createElement('div');
            colDiv.className = `stats-chart-col ${isBest ? 'is-best' : ''}`;
            colDiv.title = tooltipText;
            colDiv.innerHTML = `
                <div class="stats-chart-bar-bg">
                    <div class="stats-chart-bar-fill" style="height: 0%;" data-target="${pct}%"></div>
                </div>
                <div class="stats-chart-label-wrapper">
                    <div class="stats-chart-label">${dayNameStr}</div>
                    <div class="stats-chart-indicator ${isToday ? 'is-today' : ''}"></div>
                </div>
            `;

            colDiv.onclick = () => {
                const isAlreadySelected = colDiv.classList.contains('is-selected');

                chartContainer.querySelectorAll('.stats-chart-col').forEach(c => c.classList.remove('is-selected'));

                if (isAlreadySelected) {
                    renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));
                } else {
                    colDiv.classList.add('is-selected');
                    renderTasksList(t('stats.dayTasks', dayNameStr), day.tasks, t('stats.emptyDay'));
                }
            };

            chartContainer.appendChild(colDiv);
        });

        renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));

        const modalBody = modal.querySelector('.modal-body');
        modalBody.onclick = (e) => {
            if (!e.target.closest('.stats-chart-col') && !e.target.closest('.stats-top-item')) {
                const hasSelection = chartContainer.querySelector('.stats-chart-col.is-selected');
                if (hasSelection) {
                    chartContainer.querySelectorAll('.stats-chart-col').forEach(c => c.classList.remove('is-selected'));
                    renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));
                }
            }
        };

        loading.style.display = 'none';
        content.style.display = 'flex';
        content.style.opacity = '1';
        content.style.pointerEvents = 'auto';

        setTimeout(() => {
            const bars = chartContainer.querySelectorAll('.stats-chart-bar-fill');
            bars.forEach(bar => bar.style.height = bar.dataset.target);
        }, 50);

    } catch (e) {
        console.error("Stats loading error", e);
        loading.textContent = t('alerts.error');
        content.style.opacity = '1';
        content.style.pointerEvents = 'auto';
    }
}


// 🔒 МОСТ К БЭКЕНДУ ВМЕСТО HTTP-СЕРВЕРА
