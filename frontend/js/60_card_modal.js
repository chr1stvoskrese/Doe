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

