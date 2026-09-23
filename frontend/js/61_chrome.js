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

        const thumbWidth = Math.max(container.clientWidth * scrollRatio, 40);
        thumb.style.width = `${thumbWidth}px`;

        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        let scrollPercent = container.scrollLeft / maxScrollLeft;

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
            }, 800);
        }
    }

    container.addEventListener('scroll', () => {
        updateThumb();
        showScrollbar();

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
            }, 400);
        }
    });

    window.addEventListener('resize', updateThumb);
    window.updateTabsScrollbar = updateThumb;

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

        const trackWidth = scrollbar.clientWidth;
        const thumbWidth = Math.max(trackWidth * scrollRatio, 40);
        thumb.style.width = `${thumbWidth}px`;

        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        let scrollPercent = container.scrollLeft / maxScrollLeft;

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

    if (board && window.ResizeObserver) {
        const ro = new ResizeObserver(() => updateThumb());
        ro.observe(board);
    }

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

        const titleEl = e.target.closest('.column-title, .tab-name, .breadcrumb-item, .vault-name-text, .vault-history-name, .cal-event-chip, .cal-ev-title, .cal-ev-time');
        if (!titleEl) return;

        let isActuallyClamped = false;

        if (titleEl.classList.contains('tab-name') ||
            titleEl.classList.contains('breadcrumb-item') ||
            titleEl.classList.contains('vault-name-text') ||
            titleEl.classList.contains('vault-history-name') ||
            titleEl.classList.contains('cal-event-chip') ||
            titleEl.classList.contains('cal-ev-title') ||
            titleEl.classList.contains('cal-ev-time')) {

            isActuallyClamped = titleEl.textContent.trim().endsWith('…') || titleEl.scrollWidth > titleEl.clientWidth;
        } else if (titleEl.closest('.column.collapsed')) {
            isActuallyClamped = titleEl.dataset.clamped === 'true';
        } else {
            isActuallyClamped = titleEl.scrollHeight > (titleEl.clientHeight + 2);
        }

        if (!isActuallyClamped) return;

        activeTitle = titleEl;

        tooltipInner.style.maxHeight = 'none';
        tooltipInner.innerHTML = renderInlineMarkdown(titleEl.dataset.fullTitle || titleEl.textContent);

        const paddingY = 16;
        const safeMarginY = 32;
        const maxAvailableHeight = window.innerHeight - paddingY - safeMarginY;

        const computedStyle = window.getComputedStyle(tooltipInner);
        const lineHeight = parseFloat(computedStyle.lineHeight) || 19.5;

        const maxLines = Math.max(1, Math.floor(maxAvailableHeight / lineHeight));

        tooltipInner.style.maxHeight = (maxLines * lineHeight) + 'px';

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
        const titleEl = e.target.closest('.column-title, .tab-name, .breadcrumb-item, .vault-name-text, .vault-history-name, .cal-event-chip, .cal-ev-title, .cal-ev-time');
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

    document.addEventListener('wheel', hideTooltip, { passive: true });
}

let isRevealed = false;
const triggerReveal = () => {
    if (isRevealed) return;
    if (window.pywebview && window.pywebview.api) {
        isRevealed = true;
        document.body.classList.remove('preload');
        try {
            const call = window.pywebview.api.reveal_window();
            if (call && call.catch) call.catch(() => {});
        } catch (e) {}
    }
};

window.addEventListener('pywebviewready', triggerReveal);

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
            if (e.target.closest('a')) return;

            const isFolded = heading.classList.toggle('is-folded');
            const level = parseInt(heading.tagName.substring(1));

            let next = heading.nextElementSibling;
            while (next) {
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

// ============================================================
//  Настройки отображения код-блоков (глобальные, персистентные)
// ============================================================
const codePrefs = {
    get wrap()  { return localStorage.getItem('doe-code-wrap') === '1'; },
    set wrap(v) { localStorage.setItem('doe-code-wrap', v ? '1' : '0'); },
    get nums()  { return localStorage.getItem('doe-code-nums') === '1'; },
    set nums(v) { localStorage.setItem('doe-code-nums', v ? '1' : '0'); },
};

// ============================================================
//  🖼 Соседние изображения (![]() без пустой строки) — в один коллаж
// ============================================================
function enhanceImageRows(container) {
    container.querySelectorAll('p').forEach(p => {
        // Убираем <br> между соседними изображениями (marked ставит их
        // за каждый одиночный перенос строки)
        p.querySelectorAll('br').forEach(br => {
            const prev = br.previousElementSibling;
            const next = br.nextElementSibling;
            const isImg = el => el && el.classList && el.classList.contains('image-resizer-wrapper');
            const isEmptyText = nd => !nd || nd === prev || nd === next || (nd.nodeType === 3 && !nd.textContent.trim());
            if (isImg(prev) && isImg(next) && isEmptyText(br.previousSibling) && isEmptyText(br.nextSibling)) {
                br.remove();
            }
        });

        const imgs = Array.from(p.children).filter(c => c.classList && c.classList.contains('image-resizer-wrapper'));
        if (imgs.length >= 2) {
            // Ряд делаем только если в абзаце нет ничего, кроме изображений
            const onlyImages = Array.from(p.childNodes).every(n =>
                (n.nodeType === 1 && n.classList.contains('image-resizer-wrapper')) ||
                (n.nodeType === 3 && !n.textContent.trim())
            );
            p.classList.toggle('image-row', onlyImages);
            // Без пустой строки подряд идущие изображения собираются в коллаж.
            // Пустая строка создаёт отдельный <p>, поэтому такие изображения не объединяются.
            p.classList.toggle('image-collage', onlyImages);
            if (onlyImages) {
                p.querySelectorAll('.image-resizer-wrapper').forEach(wrap => {
                    wrap.classList.remove('has-custom-size', 'is-resizing');
                    wrap.style.removeProperty('width');
                    wrap.style.removeProperty('height');
                    wrap.querySelector('.image-resize-handle')?.remove();
                    delete wrap.dataset.justResized;
                });
            }
        }
    });
}

// ============================================================
//  📎 Плейсхолдер загрузки вложения "[⏳ ...]" → аккуратный чип со спиннером
// ============================================================
function enhanceUploadChips(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const targets = [];
    while (walker.nextNode()) {
        const n = walker.currentNode;
        if (n.textContent.includes('[⏳') && !n.parentElement.closest('pre, code, .upload-chip')) {
            targets.push(n);
        }
    }
    targets.forEach(n => {
        const html = escapeHtml(n.textContent).replace(
            /\[⏳\s*([^\]]*)\]/g,
            '<span class="upload-chip"><span class="upload-chip-spinner"></span><span class="upload-chip-name">$1</span></span>'
        );
        if (html !== escapeHtml(n.textContent)) {
            const span = document.createElement('span');
            span.innerHTML = html;
            n.replaceWith(span);
        }
    });
}

// ============================================================
//  🔍 Лайтбокс: клик по изображению — плавное раскрытие на весь экран
// ============================================================
(function initImageLightbox() {
    const lb = document.createElement('div');
    lb.className = 'image-lightbox';
    lb.id = 'image-lightbox';
    lb.innerHTML = '<img alt="" draggable="false">';
    document.body.appendChild(lb);
    const lbImg = lb.querySelector('img');

    const close = () => {
        lb.classList.remove('show');
        setTimeout(() => { if (!lb.classList.contains('show')) lbImg.src = ''; }, 260);
    };

    lb.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lb.classList.contains('show')) {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    }, true);

    // capture-фаза: перехватываем раньше, чем сработает переход в режим правки
    document.addEventListener('click', (e) => {
        const wrap = e.target.closest('.image-resizer-wrapper');
        if (!wrap) return;
        if (e.target.closest('.image-resize-handle')) return;
        if (wrap.classList.contains('is-resizing') || wrap.dataset.justResized) return;
        const src = wrap.querySelector('img')?.src;
        if (!src) return;
        e.preventDefault();
        e.stopPropagation();
        lbImg.src = src;
        lb.classList.add('show');
    }, true);
})();

