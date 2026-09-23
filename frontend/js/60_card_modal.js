function applyHighlight(container, query) {
    if (!query || !CSS.highlights) return;
    const words = query.trim().split(/\s+/).filter(w => w.length > 0).map(w => w.toLowerCase());
    if (words.length === 0) return;

    const fullText = container.textContent.toLowerCase();
    if (!words.some(w => fullText.includes(w))) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const ranges = [];
    let node;

    while ((node = walker.nextNode())) {
        const nodeText = node.nodeValue.toLowerCase();
        if (!nodeText.trim()) continue;

        for (const word of words) {
            if (!nodeText.includes(word)) continue;
            let pos = 0;
            while ((pos = nodeText.indexOf(word, pos)) !== -1) {
                const range = new Range();
                range.setStart(node, pos);
                range.setEnd(node, pos + word.length);
                ranges.push(range);
                pos += word.length;
            }
        }
        if (ranges.length > 5000) break;
    }

    if (ranges.length === 0) return;

    const highlight = new Highlight(...ranges);
    CSS.highlights.set('global-search-highlight', highlight);

    setTimeout(() => {
        const firstMatch = ranges[0];
        let block = firstMatch.startContainer.parentElement;

        while (block && block !== container) {
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

        const rect = firstMatch.getBoundingClientRect();
        if (rect.top === 0) return;

        const scrollParent = document.querySelector('.task-detail-body');
        if (scrollParent) {
            const parentRect = scrollParent.getBoundingClientRect();
            const relativeTop = rect.top - parentRect.top + scrollParent.scrollTop;
            scrollParent.scrollTo({
                top: relativeTop - (parentRect.height / 2),
                behavior: 'smooth'
            });
        }

        setTimeout(() => {
            if (CSS.highlights.has('global-search-highlight')) {
                CSS.highlights.delete('global-search-highlight');
            }
        }, 2500);

    }, 50);
}

async function loadTaskIntoModal(taskId, pushToStack = true, highlightQuery = null) {
    try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (!res.ok) return;
        const task = await res.json();

        let localTask = null;
        for (let col of state.columns) {
            localTask = col.tasks.find(t => t.id === taskId);
            if (!localTask) {
                for (let pt of col.tasks) {
                    if (pt.subtasks) {
                        localTask = pt.subtasks.find(s => s.id === taskId);
                        if (localTask) break;
                    }
                }
            }
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

        const bodyEl = document.querySelector('.task-detail-body');
        if (bodyEl) bodyEl.scrollTop = 0;
        if (renderDiv) renderDiv.scrollTop = 0;
        if (inputArea) inputArea.scrollTop = 0;

        renderGraphBreadcrumbs(task.id);

        modal.dataset.taskId = task.id;
        modal.dataset.columnId = task.column_id;
        titleEl.innerHTML = renderInlineMarkdown(task.title);
        titleEl.dataset.rawTitle = task.title;

        const detachBtn = modal.querySelector('.modal-detach');
        if (detachBtn) {
            detachBtn.style.display = (task.parent_ids && task.parent_ids.length > 0) ? 'flex' : 'none';
            detachBtn.title = t('detachSubtask');
        }

        const completeSubtaskBtn = modal.querySelector('.modal-complete-subtask');
        if (completeSubtaskBtn) {
            if (task.parent_ids && task.parent_ids.length > 0 && !task.is_visible_on_board) {
                completeSubtaskBtn.style.display = 'flex';
                if (task.completed_at) {
                    completeSubtaskBtn.title = t('modals.uncompleteSubtask');
                    completeSubtaskBtn.style.color = 'var(--success-done)';
                } else {
                    completeSubtaskBtn.title = t('modals.completeSubtask');
                    completeSubtaskBtn.style.color = '';
                }
            } else {
                completeSubtaskBtn.style.display = 'none';
            }
        }

        const datesMetaEl = document.getElementById('task-dates-meta');
        if (datesMetaEl) {
            const createdStr = formatDateTime(task.created_at);
            const updatedStr = formatDateTime(task.updated_at);

            let datesHtml = `<div><span>${t('taskModal.created')}: ${createdStr}</span><span id="task-updated-text">${t('taskModal.updated')}: ${updatedStr}</span>`;

            datesHtml += `</div>`;
            datesMetaEl.innerHTML = datesHtml;
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

            const cleanRegex = /(!?)\[[^\]]*\]\(doe\/[^)]+\)(?:\{[^}]+\})?!\s*/g;
            let readModeText = task.description.replace(cleanRegex, '');

            const applyScroll = () => {
                if (localTask && localTask._readScrollTop !== undefined) {
                    renderDiv.scrollTop = localTask._readScrollTop;
                } else {
                    renderDiv.scrollTop = 0;
                }
                if (localTask && localTask._modalScrollTop !== undefined) {
                    const detailBody = document.querySelector('.task-detail-body');
                    if (detailBody) detailBody.scrollTop = localTask._modalScrollTop;
                }
            };

            renderMarkdownProgressively(readModeText, renderDiv, {
                preserveScroll: (localTask && localTask._readScrollTop !== undefined),
                onFirstScreen: () => {
                    applyScroll();
                },
                onComplete: () => {
                    if (highlightQuery) {
                        applyHighlight(renderDiv, highlightQuery);
                        applyHighlight(titleEl, highlightQuery);
                    }
                    initHeadingFolding(renderDiv, task.folded_headings || []);
                    applyTextExpansion();
                    applyScroll();
                }
            });

        } else {
            attachmentsCount.textContent = '0';
            attachmentsList.innerHTML = '';
            renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
            if (highlightQuery) applyHighlight(titleEl, highlightQuery);
        }

        renderDiv.style.display = 'block';

        subtasksList.innerHTML = '';
        subtasksCount.textContent = task.subtasks.length;

        const parentColumn = state.columns.find(c => c.id === task.column_id);
        const parentMode = parentColumn ? parentColumn.mode : 'default';

        task.subtasks.sort((a, b) => a.position - b.position).forEach(sub => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generateSubtaskHtml(sub, parentMode).trim();
            const subItem = tempDiv.firstChild;

            bindSubtaskEvents(subItem, sub, task, parentMode);

            subtasksList.appendChild(subItem);
        });

        renderSubtaskAddButton(formContainer);

        const modalTimeTracker = document.getElementById('modal-time-tracker');
        const modalTimerPill = document.getElementById('modal-task-timer');
        const modalTimerInput = document.getElementById('modal-task-timer-input');

        modalTimeTracker.style.display = 'flex';

        modalTimerPill.dataset.taskId = task.id;

        const exactTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        modalTimerPill.textContent = exactTime;

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
                            updatedTask.subtasks = col.tasks[idx].subtasks;
                            col.tasks[idx] = updatedTask;
                        }
                    }

                    const displayTime = updatedTask.active_timer ? formatTime(updatedTask) : formatExactTime(updatedTask.total_time_spent || 0);
                    newPill.textContent = displayTime;

                    const boardCard = document.querySelector(`.card[data-card-id="${task.id}"]`);
                    if (boardCard) {
                        updateCardAppearance(boardCard, updatedTask, col.mode);
                    }

                    if (col && window.syncColumnDOM) {
                        await window.syncColumnDOM(col.id);
                    } else {
                        refreshBoard();
                    }
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

                const rawTitle = node.title || "";
                const firstLine = rawTitle.includes('\n') ? rawTitle.split('\n')[0] : rawTitle;
                const isMultiLine = rawTitle.includes('\n');

                // Обрезка не должна резать Markdown посреди синтаксиса
                // (**жир… → сырые звёздочки). Если заголовок влезает целиком —
                // рендерим Markdown; если нужен срез — режем ЧИСТЫЙ текст.
                let titleHtml;
                if (firstLine.length > 15) {
                    const plain = stripMarkdownToPlain(firstLine);
                    titleHtml = escapeHtml(plain.substring(0, 14)) + '…';
                } else if (isMultiLine) {
                    titleHtml = renderInlineMarkdown(firstLine) + '…';
                } else {
                    titleHtml = renderInlineMarkdown(firstLine);
                }

                html += `<div class="breadcrumb-node">`;

                html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}"
                               data-id="${node.id}"
                               data-full-title="${escapeHtml(rawTitle)}">${titleHtml}</span>`;

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
                fetch(`${API_BASE}/tasks/${id}/context`)
                    .then(res => res.json())
                    .then(context => {
                        window.navigateToEntityGlobal(context.workspace_id, context.column_id, id, null, true);
                    })
                    .catch(err => {
                        console.error("Не удалось найти контекст задачи", err);
                        loadTaskIntoModal(id, true);
                    });
            };
        });
    } catch (e) {
        console.error("Failed to render graph breadcrumbs", e);
    }
}

const _visibleTimerEls = new Set();
let _timerIO = null;

function _buildTaskIndex() {
    const map = new Map();
    for (const col of state.columns) {
        for (const t of col.tasks) map.set(String(t.id), t);
    }
    return map;
}

function _refreshTimerEl(el, index) {
    const task = index.get(String(el.dataset.taskId));
    if (task?.active_timer) {
        const newText = formatTime(task);
        if (el.textContent !== newText) el.textContent = newText;
    }
}

function _collectTimerEls(node, out) {
    if (node.nodeType !== 1) return;
    if (node.classList && node.classList.contains('card-timer')) out.push(node);
    if (node.querySelectorAll) {
        node.querySelectorAll('.card-timer').forEach(t => out.push(t));
    }
}

function initTimerCulling() {
    if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
    const board = document.getElementById('board');
    if (!board) return;

    _timerIO = new IntersectionObserver((entries) => {
        let index = null;
        for (const en of entries) {
            if (en.isIntersecting) {
                _visibleTimerEls.add(en.target);
                if (!index) index = _buildTaskIndex();
                _refreshTimerEl(en.target, index);
            } else {
                _visibleTimerEls.delete(en.target);
            }
        }
    }, { root: null, rootMargin: '256px' });

    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                const added = [];
                _collectTimerEls(n, added);
                for (const t of added) _timerIO.observe(t);
            }
            for (const n of m.removedNodes) {
                const removed = [];
                _collectTimerEls(n, removed);
                for (const t of removed) {
                    _timerIO.unobserve(t);
                    _visibleTimerEls.delete(t);
                }
            }
        }
    });
    mo.observe(board, { childList: true, subtree: true });

    board.querySelectorAll('.card-timer').forEach(t => _timerIO.observe(t));
}

function updateTimers() {
    if (document.hidden) return;

    const modalTimerPill = document.getElementById('modal-task-timer');
    const modalActive = !!(modalTimerPill && modalTimerPill.dataset.taskId && modalTimerPill.style.display !== 'none');
    const dragActive = !!(isDragging && dragType === 'card' && draggedTaskObject?.active_timer);

    if (_timerIO && _visibleTimerEls.size === 0 && !modalActive && !dragActive) return;

    let _taskIndex = null;
    const _getTask = (id) => {
        if (!_taskIndex) _taskIndex = _buildTaskIndex();
        return _taskIndex.get(String(id));
    };

    if (_timerIO) {
        for (const el of _visibleTimerEls) {
            if (!el.isConnected) { _visibleTimerEls.delete(el); continue; }
            const task = _getTask(el.dataset.taskId);
            if (task?.active_timer) {
                const newText = formatTime(task);
                if (el.textContent !== newText) el.textContent = newText;
            }
        }
    } else {
        document.querySelectorAll('.card-timer').forEach(el => {
            if (el.closest('.card-drag-clone')) return;
            const task = _getTask(el.dataset.taskId);
            if (task?.active_timer) {
                const newText = formatTime(task);
                if (el.textContent !== newText) el.textContent = newText;
            }
        });
    }

    if (dragActive) {
        const newTime = formatTime(draggedTaskObject);

        if (dragClone) {
            const timerEl = dragClone.querySelector('.card-timer');
            if (timerEl) timerEl.textContent = newTime;
        }
        if (draggedElement) {
            const timerEl = draggedElement.querySelector('.card-timer');
            if (timerEl) timerEl.textContent = newTime;
        }
    }

    if (modalActive) {
        const taskId = modalTimerPill.dataset.taskId;

        let task = _getTask(taskId) || null;

        if (!task && draggedTaskObject && draggedTaskObject.id == taskId) {
            task = draggedTaskObject;
        }

        if (task && task.active_timer) {
            const newText = formatTime(task);
            if (modalTimerPill.textContent !== newText) modalTimerPill.textContent = newText;
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

function animateCardDeletion(boardCard) {
    if (!boardCard || !boardCard.parentNode) return;

    const rect = boardCard.getBoundingClientRect();

    const clone = boardCard.cloneNode(true);
    clone.classList.add('card-deleting-clone');
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.removeAttribute('id');
    clone.removeAttribute('data-card-id');
    document.body.appendChild(clone);

    const spacer = document.createElement('div');
    spacer.className = 'card-spacer';
    spacer.style.height = `${rect.height}px`;

    const parentCol = boardCard.closest('.column');
    boardCard.replaceWith(spacer);

    if (parentCol) {
        updateColumnCount(parentCol, parentCol.querySelectorAll('.card:not(.card-drag-clone)').length);
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            clone.classList.add('is-animating');
            spacer.classList.add('is-shrinking');
        });
    });

    setTimeout(() => {
        if (clone.parentNode) clone.remove();
        if (spacer.parentNode) spacer.remove();
    }, 450);
}

function clampSingleTitle(titleEl) {
    if (!titleEl) return;

    const MAX_ALLOWED_HEIGHT = window.innerHeight * 0.25;

    const fullTitle = titleEl.dataset.fullTitle || titleEl.textContent;

    titleEl.style.webkitLineClamp = 'unset';
    titleEl.style.maxHeight = 'none';

    const computedStyle = window.getComputedStyle(titleEl);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 21.75;

    if (titleEl.scrollHeight > MAX_ALLOWED_HEIGHT) {
        const maxLines = Math.max(2, Math.floor((MAX_ALLOWED_HEIGHT - 2) / lineHeight));

        titleEl.style.webkitLineClamp = String(maxLines);

        titleEl.style.maxHeight = (maxLines * lineHeight) + "px";

        titleEl.dataset.fullTitle = fullTitle;
        titleEl.dataset.clamped = 'true';
    } else {
        titleEl.style.webkitLineClamp = 'unset';
        titleEl.style.maxHeight = 'none';
        titleEl.dataset.clamped = 'false';
    }
}

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

