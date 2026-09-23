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

