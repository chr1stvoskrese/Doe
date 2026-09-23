function _buildCodeGutter(pre) {
    const code = pre.querySelector('code');
    if (!code) return;
    let g = pre.querySelector('.code-gutter');
    if (!g) {
        g = document.createElement('div');
        g.className = 'code-gutter';
        pre.insertBefore(g, code);
    }
    const lines = code.textContent.replace(/\n$/, '').split('\n').length;
    if (parseInt(g.dataset.lines || '0') !== lines) {
        g.dataset.lines = lines;
        let html = '';
        for (let i = 1; i <= lines; i++) html += `<span>${i}</span>`;
        g.innerHTML = html;
    }
}

function _applyCodePrefs(pre) {
    pre.classList.toggle('is-wrapped', codePrefs.wrap);
    pre.classList.toggle('is-numbered', codePrefs.nums && !codePrefs.wrap);
    if (codePrefs.nums && !codePrefs.wrap) _buildCodeGutter(pre);
    const wrapBtn = pre.querySelector('.code-wrap-btn');
    const numsBtn = pre.querySelector('.code-nums-btn');
    if (wrapBtn) wrapBtn.classList.toggle('active', codePrefs.wrap);
    if (numsBtn) {
        numsBtn.classList.toggle('active', codePrefs.nums && !codePrefs.wrap);
        // При переносе строк нумерация физических строк потеряла бы смысл
        numsBtn.classList.toggle('disabled', codePrefs.wrap);
    }
}

function _refreshAllCodeBlocks() {
    document.querySelectorAll('.markdown-body pre').forEach(_applyCodePrefs);
}

function enhanceCodeBlocks(container) {
    // Попутно инициализируем встроенные PDF-ридеры: эта функция вызывается
    // после каждого рендера описания — единая точка пост-обработки.
    if (typeof enhancePdfEmbeds === 'function') {
        try { enhancePdfEmbeds(container); } catch (e) { console.warn('PDF enhance failed:', e); }
    }

    const codeBlocks = Array.from(container.querySelectorAll('pre code'));

    codeBlocks.forEach(block => {
        if (!block.className || block.className === "") {
            block.classList.add('language-python');
        }
    });

    const L = (ru, en) => (currentLang === 'ru' ? ru : en);
    const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    container.querySelectorAll('pre').forEach(pre => {
        if (!pre.querySelector('.code-tools')) {
            const tools = document.createElement('div');
            tools.className = 'code-tools';

            // 🛡 Полная изоляция тулбара от обработчиков описания:
            // двойной клик по кнопке НЕ должен переключать описание в режим
            // редактирования (из-за этого «пропадал код»), а mousedown —
            // запускать выделение/드래ги.
            ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown'].forEach(ev => {
                tools.addEventListener(ev, (e) => e.stopPropagation());
            });

            const mkBtn = (extraClass, title, svg) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `code-tool ${extraClass}`;
                b.title = title;
                b.innerHTML = svg;
                return b;
            };

            // Перенос строк
            const wrapBtn = mkBtn('code-wrap-btn', L('Перенос строк', 'Wrap lines'),
                `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h13a3 3 0 1 1 0 6h-4"/><polyline points="14 16 12 18 14 20"/><path d="M3 18h6"/></svg>`);
            wrapBtn.addEventListener('click', () => {
                codePrefs.wrap = !codePrefs.wrap;
                _refreshAllCodeBlocks();
            });

            // Нумерация строк
            const numsBtn = mkBtn('code-nums-btn', L('Номера строк', 'Line numbers'),
                `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`);
            numsBtn.addEventListener('click', () => {
                codePrefs.nums = !codePrefs.nums;
                _refreshAllCodeBlocks();
            });

            // Копировать
            const copyBtn = mkBtn('code-copy-tool', L('Скопировать', 'Copy'), copyIcon);
            copyBtn.addEventListener('click', async () => {
                try {
                    const codeEl = pre.querySelector('code');
                    if (!codeEl) return;
                    await navigator.clipboard.writeText(codeEl.innerText);
                    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    copyBtn.classList.add('copied');
                    setTimeout(() => {
                        copyBtn.innerHTML = copyIcon;
                        copyBtn.classList.remove('copied');
                    }, 1600);
                } catch (e) { /* clipboard недоступен — молча */ }
            });

            tools.appendChild(wrapBtn);
            tools.appendChild(numsBtn);
            tools.appendChild(copyBtn);
            pre.appendChild(tools);
        }
        _applyCodePrefs(pre);
    });

    // 🖼 Соседние изображения — в один ряд, плейсхолдеры загрузки — в чипы
    enhanceImageRows(container);
    enhanceUploadChips(container);

    if (!window.Prism || codeBlocks.length === 0) return;

    const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));
    let prismIndex = 0;

    const highlightNextChunk = () => {
        const sliceStart = performance.now();
        while (prismIndex < codeBlocks.length && (performance.now() - sliceStart) < 16) {
            const block = codeBlocks[prismIndex++];
            if (block.isConnected) {
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

