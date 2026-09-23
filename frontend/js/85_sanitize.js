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

