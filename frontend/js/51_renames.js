function startTabRename(tabEl, ws) {
    const titleSpan = tabEl.querySelector('.tab-name');
    if (!titleSpan || tabEl.classList.contains('is-renaming')) return;

    const initialTextWidth = titleSpan.getBoundingClientRect().width;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-name-input';
    input.value = ws.name;
    input.spellcheck = false;
    input.autocomplete = "off";

    titleSpan.replaceWith(input);
    tabEl.setAttribute('draggable', 'false');
    tabEl.classList.add('is-renaming');

    const autoResize = () => {
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

        input.style.width = Math.max(20, span.getBoundingClientRect().width + 9) + 'px';
        document.body.removeChild(span);

        if (window.updateTabsScrollbar) window.updateTabsScrollbar();
    };

    input.addEventListener('input', autoResize);
    autoResize();

    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);

    let committed = false;

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

    const commit = async () => {
        if (committed) return;
        committed = true;

        const newName = input.value.trim();
        const finalName = newName || ws.name;

        restore(finalName);

        if (newName && newName !== ws.name) {
            try {
                await updateWorkspaceAPI(ws.id, newName);
                ws.name = newName;
            } catch (err) {
                console.error("Ошибка при переименовании вкладки:", err);
                const span = tabEl.querySelector('.tab-name');
                if (span) {
                    span.textContent = ws.name;
                    span.dataset.fullTitle = ws.name;
                }
            }
        }
    };

    const cancel = () => {
        if (committed) return;
        committed = true;
        restore(ws.name);
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey)  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

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

    let lastValidValue = input.value;
    const autoResize = () => {
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
        const boardHeight = document.getElementById('board').clientHeight;

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

    autoResize();

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let committed = false;

    const restore = (title) => {
        const span = document.createElement('span');
        span.className = 'column-title';
        setColumnTitleText(span, title);
        span.dataset.fullTitle = title;
        if (input.parentNode) input.replaceWith(span);
        columnEl.setAttribute('draggable', 'true');
        columnEl.classList.remove('is-renaming');
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
                if (span) setColumnTitleText(span, column.title);
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
        if (e.key === 'Enter' && !e.shiftKey)  { e.preventDefault(); commit(); }
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

        if (input.value.trim().length <= 1000) {
            cardEl.classList.remove('is-error');
        }
    };

    input.addEventListener('input', () => {
        autoResize();

        const globalMenu = document.getElementById('global-card-menu');
        if (globalMenu.classList.contains('show') && globalMenu.dataset.activeCardId == task.id) {
            closeAllDropdowns();
        }
    });
    autoResize();

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    bindTitleFormattingShortcuts(input);

    let committed = false;

    const validateAndShake = () => {
        const val = input.value.trim();
        if (val.length > 1000) {
            let hint = cardEl.querySelector('.card-error-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');

                const wrapper = input.closest('.card-title-wrapper');
                if (wrapper) {
                    wrapper.after(hint);
                } else {
                    input.after(hint);
                }
            }

            cardEl.classList.remove('is-error');
            void cardEl.offsetWidth;
            cardEl.classList.add('is-error');

            return false;
        }
        return true;
    };

    const restore = (title) => {
        const div = document.createElement('div');
        div.className = 'card-title';
        div.innerHTML = renderInlineMarkdown(title);

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

        closeAllDropdowns();

        const newTitle = input.value.trim();
        const finalTitle = newTitle || task.title;

        restore(finalTitle);

        if (newTitle && newTitle !== task.title) {
            try {
                const subtaskTitleEl = document.querySelector(`.subtask-item[data-subtask-id="${task.id}"] .subtask-title`);
                if (subtaskTitleEl) {
                    subtaskTitleEl.innerHTML = renderInlineMarkdown(newTitle);
                    subtaskTitleEl.dataset.rawTitle = newTitle;
                }

                await updateTask(task.id, { title: newTitle });
                task.title = newTitle;

                const colEl = cardEl.closest('.column');
                if (colEl) await syncColumnDOM(parseInt(colEl.dataset.columnId));
            } catch (_) {
                cardEl.classList.add('is-error');
                const div = cardEl.querySelector('.card-title');
                if (div) div.innerHTML = renderInlineMarkdown(task.title);

                const subtaskTitleEl = document.querySelector(`.subtask-item[data-subtask-id="${task.id}"] .subtask-title`);
                if (subtaskTitleEl) {
                    subtaskTitleEl.innerHTML = renderInlineMarkdown(task.title);
                    subtaskTitleEl.dataset.rawTitle = task.title;
                }
            }
        }
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (validateAndShake()) commit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            committed = true;

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

function startModalTaskRename(titleEl) {
    const modal = document.getElementById('task-modal');
    if (modal.classList.contains('is-renaming')) return;

    const taskId = parseInt(modal.dataset.taskId);
    const originalTitle = titleEl.dataset.rawTitle || titleEl.textContent;

    const input = document.createElement('textarea');
    input.className = 'task-modal-title-input';
    input.value = originalTitle;
    input.rows = 1;
    input.spellcheck = false;

    titleEl.replaceWith(input);
    modal.classList.add('is-renaming');

    const autoResize = () => {
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        input.style.height = (input.scrollHeight + offset) + 'px';
    };
    input.addEventListener('input', () => {
        autoResize();
        if (input.value.trim().length <= 1000) {
            const header = input.closest('.modal-header');
            if (header) header.classList.remove('is-error');
        }
    });
    autoResize();

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    bindTitleFormattingShortcuts(input);

    let committed = false;

    const restore = (title) => {
        const span = document.createElement('span');
        span.className = 'modal-title';
        span.id = 'task-modal-title';
        span.innerHTML = renderInlineMarkdown(title);
        span.dataset.rawTitle = title;

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
        if (newTitle.length > 1000) {
            const header = input.closest('.modal-header');
            if (header) {
                if (!header.querySelector('.card-error-hint')) {
                    const hint = document.createElement('div');
                    hint.className = 'card-error-hint';
                    hint.textContent = t('errors.tooLong');
                    header.appendChild(hint);
                }
                header.classList.remove('is-error');
                void header.offsetWidth;
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
                const boardCardTitle = document.querySelector(`.card[data-card-id="${taskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.innerHTML = renderInlineMarkdown(newTitle);
                }

                await updateTask(taskId, { title: newTitle });

                bumpModalUpdatedDate();

                let taskUpdated = false;
                for (let col of state.columns) {
                    let t = col.tasks.find(t => t.id === taskId);
                    if (!t) {
                        for (let pt of col.tasks) {
                            if (pt.subtasks) {
                                t = pt.subtasks.find(s => s.id === taskId);
                                if (t) break;
                            }
                        }
                    }
                    if (t) {
                        t.title = newTitle;
                        taskUpdated = true;
                        break;
                    }
                }
                refreshBoard();

                renderGraphBreadcrumbs(taskId);
            } catch (e) {
                console.error("Ошибка при переименовании задачи", e);
                restore(originalTitle);

                const boardCardTitle = document.querySelector(`.card[data-card-id="${taskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.innerHTML = renderInlineMarkdown(originalTitle);
                }
            }
        }
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); committed = true; restore(originalTitle); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!committed) commit(); }, 120));
}

function startSubtaskRename(subtaskEl) {
    const titleDiv = subtaskEl.querySelector('.subtask-title');
    if (!titleDiv || subtaskEl.classList.contains('is-renaming')) return;

    const subtaskId = parseInt(subtaskEl.dataset.subtaskId);
    const originalTitle = titleDiv.dataset.rawTitle || titleDiv.textContent;

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
        if (input.value.trim().length <= 1000) {
            subtaskEl.classList.remove('is-error');
            const hint = subtaskEl.querySelector('.card-error-hint');
            if (hint) hint.remove();
        }
        autoResize();
    });
    autoResize();

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    bindTitleFormattingShortcuts(input);

    let committed = false;

    const restore = (title) => {
        const div = document.createElement('div');
        div.className = 'subtask-title';
        div.innerHTML = renderInlineMarkdown(title);
        div.dataset.rawTitle = title;

        const hint = subtaskEl.querySelector('.card-error-hint');
        if (hint) hint.remove();

        if (input.parentNode) input.replaceWith(div);
        subtaskEl.classList.remove('is-renaming', 'is-error');
    };

    const commit = async () => {
        if (committed) return;

        const newTitle = stripDoeTaskLinks(input.value.trim());

        if (newTitle.length > 1000) {
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
                const boardCardTitle = document.querySelector(`.card[data-card-id="${subtaskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.innerHTML = renderInlineMarkdown(newTitle);
                }

                for (let col of state.columns) {
                    let t = col.tasks.find(taskItem => taskItem.id === subtaskId);
                    if (t) {
                        t.title = newTitle;
                        break;
                    }
                }

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

                await updateTask(subtaskId, { title: newTitle });

                refreshBoard();
            } catch (e) {
                console.error("Ошибка при переименовании подзадачи", e);
                restore(originalTitle);

                const boardCardTitle = document.querySelector(`.card[data-card-id="${subtaskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.innerHTML = renderInlineMarkdown(originalTitle);
                }
            }
        }
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); committed = true; restore(originalTitle); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!committed) commit(); }, 120));
}

function adjustCollapsedColumnWidths() {
    const CHAR_HEIGHT = 18.2;
    const MAX_LINES = 5;
    const PADDING = 32;
    const CHAR_WIDTH = 22;

    document.querySelectorAll('#board .column.collapsed').forEach(colEl => {
        const titleEl = colEl.querySelector('.column-title');
        if (!titleEl) return;

        const fullTitle = titleEl.dataset.fullTitle || titleEl.textContent;
        const colHeight = colEl.getBoundingClientRect().height - 24;
        if (colHeight < 10) return;

        titleEl.style.maxHeight = colHeight + 'px';

        const charsPerLine = Math.max(1, Math.floor(colHeight / CHAR_HEIGHT));
        const maxChars = charsPerLine * MAX_LINES;

        if (!titleEl.dataset.fullTitle) {
            titleEl.dataset.fullTitle = fullTitle;
        }

        const isClamped = fullTitle.length > maxChars;

        if (isClamped) {
            const visibleChars = maxChars - 1;
            setColumnTitleText(titleEl, fullTitle.substring(0, visibleChars) + '…');
            titleEl.dataset.clamped = 'true';
        } else {
            setColumnTitleText(titleEl, fullTitle);
            titleEl.dataset.clamped = 'false';
        }

        const actualLines = Math.min(MAX_LINES, Math.ceil(fullTitle.length / charsPerLine));
        const colWidth = Math.max(60, PADDING + actualLines * CHAR_WIDTH);

        colEl.style.width = colWidth + 'px';
        colEl.style.minWidth = colWidth + 'px';
    });
}

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

let lastHitTestTime = 0;
let wasScrolling = false;

let scrollAccumX = 0;
let scrollAccumY = 0;
let currentScrollSpeedX = 0;
let currentScrollSpeedY = 0;

let originalWorkspaceId = null;
let isHoveringTabs = false;
let draggedTaskObject = null;
let currentDragScale = 1;
let dragCloneWidth = 0;

let autoExpandedColumnId = null;
let autoExpandTimeout = null;
let autoExpandTimeoutColumnId = null;
let dragCloneHeight = 0;
let pendingSwitchTabId = null;
let tabSwitchTimeout = null;

let originalOffsetX = 0;
let originalOffsetY = 0;
let currentOriginX = 0;
let currentOriginY = 0;

document.addEventListener('dragstart', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;

    // Пространство (холст) имеет собственную обработку перетаскивания. Не даём драг-системе доски
    // вмешиваться ни во вкладки Пространства (класс .board-tab), ни во встроенные карточки/колонки.
    if (e.target.closest('.space-view')) return;

    if (e.target.closest('button, input, textarea, .menu-btn, .card-menu-btn, .tab-close-btn, .column.is-renaming, .board-tab.is-renaming, .card.is-renaming, .card-entering, .column-entering, .description-wrapper, .column-resize-handle')) return;
    const vaultHistory = e.target.closest('.vault-history-item');
    const subtask = e.target.closest('.subtask-item');
    const attachment = e.target.closest('.attachment-item');
    const card = e.target.closest('.card');
    const column = e.target.closest('.column');
    const tab = e.target.closest('.board-tab');

    if (vaultHistory) {
        potentialDragType = 'vault-history';
        potentialDragTarget = vaultHistory;
    }
    else if (attachment) {
        potentialDragType = 'attachment';
        potentialDragTarget = attachment;
    }
    else if (subtask) {
        potentialDragType = 'subtask';
        potentialDragTarget = subtask;
    }
    else if (card) {
        potentialDragType = 'card';
        potentialDragTarget = card;
    } else if (column) {
        potentialDragType = 'column';
        potentialDragTarget = column;
    } else if (tab) {
        potentialDragType = 'tab';
        potentialDragTarget = tab;
    } else {
        return;
    }

    isPointerDown = true;
    startX = e.clientX;
    startY = e.clientY;
});

document.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;

    if (!isDragging) {
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
            startDrag(potentialDragTarget, potentialDragType, e);
        } else {
            return;
        }
    }

    e.preventDefault();
    mouseX = e.clientX;
    mouseY = e.clientY;

    performHitTest();
});

document.addEventListener('pointerup', async (e) => {
    isPointerDown = false;
    potentialDragTarget = null;

    if (isDragging) {
        window._isAfterDrag = true;
        setTimeout(() => window._isAfterDrag = false, 250);
        await endDrag();
    }
});

