function renderBoard() {
    const board = document.getElementById('board');
    const savedScroll = board.scrollLeft;

    const savedColScrolls = {};
    board.querySelectorAll('.column[data-column-id]').forEach(colEl => {
        const listEl = colEl.querySelector('.card-list');
        if (listEl) savedColScrolls[colEl.dataset.columnId] = listEl.scrollTop;
    });

    board.innerHTML = '';
    const frag = document.createDocumentFragment();
    const sorted = [...state.columns].sort((a, b) => a.position - b.position);
    for (const col of sorted) frag.appendChild(createColumnElement(col));

    const addColBtn = document.createElement('button');
    addColBtn.className = 'new-column-btn';
    addColBtn.textContent = t('newColumn');
    addColBtn.addEventListener('click', onCreateColumn);
    frag.appendChild(addColBtn);
    board.appendChild(frag);

    board.querySelectorAll('.column[data-column-id]').forEach(colEl => {
        const listEl = colEl.querySelector('.card-list');
        const saved = savedColScrolls[colEl.dataset.columnId];
        if (listEl && saved !== undefined) listEl.scrollTop = saved;
    });

    board.scrollLeft = savedScroll;

    if (isDragging && draggedElement) {
        if (dragType === 'card') {
            const id = draggedElement.dataset.cardId;
            const newEl = board.querySelector(`.card[data-card-id="${id}"]`);
            if (newEl) {
                draggedElement = newEl;
                draggedElement.classList.add('is-ghost');
            }
        } else if (dragType === 'column') {
            const id = draggedElement.dataset.columnId;
            const newEl = board.querySelector(`.column[data-column-id="${id}"]`);
            if (newEl) {
                draggedElement = newEl;
                draggedElement.classList.add('is-ghost');
            }
        }
    }

    requestAnimationFrame(() => {
        adjustCollapsedColumnWidths();
        clampExpandedTitles();
        if (window.updateBoardScrollbar) window.updateBoardScrollbar();
    });
}

window.syncColumnDOM = async function(columnId) {
    try {
        const freshCols = await fetchColumns(state.activeWorkspaceId);
        state.columns = freshCols.map(col => ({ ...col, collapsed: col.collapsed || false }));

        const colEl = document.querySelector(`.column[data-column-id="${columnId}"]`);
        if (!colEl) {
            renderBoard();
            return;
        }

        const colState = state.columns.find(c => c.id === columnId);
        if (!colState) return;

        const cardList = colEl.querySelector('.card-list');
        if (!cardList) return;

        const oldCards = Array.from(cardList.querySelectorAll('.card:not(.card-drag-clone):not(.card-entering)'));
        const newIds = new Set(colState.tasks.map(t => String(t.id)));

        oldCards.forEach(card => {
            if (!newIds.has(card.dataset.cardId)) {
                animateCardDeletion(card);
            }
        });

        // Сохраняем открытые формы создания карточки, чтобы перестройка списка их не стёрла
        const openForms = Array.from(cardList.querySelectorAll('.card-entering')).map(form => {
            let prev = form.previousElementSibling;
            while (prev && !(prev.classList.contains('card') && prev.dataset.cardId)) {
                prev = prev.previousElementSibling;
            }
            const wasFocused = form.contains(document.activeElement);
            form.remove();
            return { form, prevId: prev ? prev.dataset.cardId : null, wasFocused };
        });

        const remainingCards = Array.from(cardList.querySelectorAll('.card:not(.card-drag-clone)'));
        const cardRects = new Map();
        remainingCards.forEach(c => cardRects.set(c.dataset.cardId, c.getBoundingClientRect()));

        const spacers = Array.from(cardList.querySelectorAll('.card-spacer'));
        const spacerMap = new Map();
        spacers.forEach(s => {
            let nextCard = s.nextElementSibling;
            while (nextCard && !nextCard.classList.contains('card')) {
                nextCard = nextCard.nextElementSibling;
            }
            const nextId = nextCard ? nextCard.dataset.cardId : 'END';

            if (!spacerMap.has(nextId)) spacerMap.set(nextId, []);
            spacerMap.get(nextId).push(s);

            s.remove();
        });

        cardList.innerHTML = '';
        const sortedTasks = [...colState.tasks].sort((a, b) => a.position - b.position);

        sortedTasks.forEach(task => {
            if (spacerMap.has(String(task.id))) {
                spacerMap.get(String(task.id)).forEach(s => cardList.appendChild(s));
            }

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generateCardHtml(task, colState.mode).trim();
            const newCard = tempDiv.firstChild;
            cardList.appendChild(newCard);

            const oldRect = cardRects.get(String(task.id));
            if (oldRect) {
                requestAnimationFrame(() => {
                    const newRect = newCard.getBoundingClientRect();
                    const deltaY = oldRect.top - newRect.top;
                    if (deltaY !== 0) {
                        newCard.style.transform = `translateY(${deltaY}px)`;
                        newCard.style.transition = 'none';
                        requestAnimationFrame(() => {
                            newCard.style.transform = '';
                            newCard.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
                        });
                    }
                });
            }
        });

        if (spacerMap.has('END')) {
            spacerMap.get('END').forEach(s => cardList.appendChild(s));
        }

        // Возвращаем открытые формы на место
        openForms.forEach(({ form, prevId, wasFocused }) => {
            const anchor = prevId ? cardList.querySelector(`.card[data-card-id="${prevId}"]`) : null;
            if (anchor) {
                anchor.after(form);
            } else {
                cardList.appendChild(form);
            }
            if (wasFocused) {
                const inp = form.querySelector('textarea');
                if (inp) inp.focus();
            }
        });

        updateColumnCount(colEl, sortedTasks.length);
    } catch (e) {
        console.error("Ошибка синхронизации колонки:", e);
        renderBoard();
    }
};

function updateCardAppearance(cardElement, task, columnMode) {
    if (task.completed_at) cardElement.classList.add('is-completed');
    else cardElement.classList.remove('is-completed');

    const subtasks = task.subtasks || [];
    const hasChecklist = subtasks.length > 0;
    const isTimerColumn = (columnMode === 'track_time');
    const isCompletionTime = (columnMode === 'completion' && task.total_time_spent !== undefined);

    cardElement.classList.toggle('has-unknown-time', isCompletionTime && task.total_time_spent === 0);

    let footer = cardElement.querySelector('.card-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'card-footer';
        cardElement.appendChild(footer);
    }

    let newContent = '';

    if (hasChecklist) {
        const total = subtasks.length;
        const done = subtasks.filter(s => s.completed_at).length;
        const allDone = done === total ? 'all-done' : '';
        newContent += `<div class="checklist-meta ${allDone}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg><span>${done}/${total}</span></div>`;
    }

    const ps = window.prioritySettings;
    const hasPriority = task.priority !== null && task.priority !== undefined;

    if (hasPriority || ps.show_always) {
        let levelClass = 'level-high';
        let emoji = ps.e_high;
        let displayValue = '';

        if (!hasPriority) {
            levelClass = 'level-none';
            emoji = ps.e_none || '?';
            displayValue = '—';
        } else {
            if (task.priority < ps.t_low) { levelClass = 'level-low'; emoji = ps.e_low; }
            else if (task.priority < ps.t_mid) { levelClass = 'level-mid'; emoji = ps.e_mid; }
            displayValue = (Math.round(parseFloat(task.priority) * 10) / 10) + '%';
        }

        newContent += `<div class="priority-pill ${levelClass} clickable" onclick="openPriorityModal(${task.id})"><span>${displayValue}</span><span>${emoji}</span></div>`;
    }

    if (isTimerColumn) {
        const displayTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        newContent += `<div class="card-timer" data-task-id="${task.id}">${displayTime}</div>`;
    }

    if (isCompletionTime) {
        newContent += `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
    }

    if (footer.innerHTML !== newContent) {
        footer.innerHTML = newContent;
    }
}

function generateCardHtml(task, columnMode) {
    let extraClasses = [];
    if (task.completed_at) extraClasses.push('is-completed');

    let checklistHtml = '';
    const subtasks = task.subtasks || [];
    if (subtasks.length > 0) {
        const total = subtasks.length;
        const done = subtasks.filter(s => s.completed_at).length;
        checklistHtml = `<div class="checklist-meta ${done === total ? 'all-done' : ''}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg><span>${done}/${total}</span></div>`;
    }

    let priorityHtml = '';
    const ps = window.prioritySettings;
    const hasPriority = task.priority !== null && task.priority !== undefined;

    if (hasPriority || ps.show_always) {
        let levelClass = 'level-high';
        let emoji = ps.e_high;
        let displayValue = '';

        if (!hasPriority) {
            levelClass = 'level-none';
            emoji = ps.e_none || '?';
            displayValue = '—';
        } else {
            if (task.priority < ps.t_low) { levelClass = 'level-low'; emoji = ps.e_low; }
            else if (task.priority < ps.t_mid) { levelClass = 'level-mid'; emoji = ps.e_mid; }
            displayValue = (Math.round(parseFloat(task.priority) * 10) / 10) + '%';
        }

        priorityHtml = `<div class="priority-pill ${levelClass} clickable" onclick="openPriorityModal(${task.id})"><span>${displayValue}</span><span>${emoji}</span></div>`;
    }

    let timerHtml = '';
    if (columnMode === 'track_time') {
        const displayTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        timerHtml = `<div class="card-timer" data-task-id="${task.id}">${displayTime}</div>`;
    }

    let spentTimeHtml = '';
    if (columnMode === 'completion' && task.total_time_spent !== undefined) {
        if (task.first_start && task.last_end && task.total_time_spent > 0) {
            const startStr = formatExactDateTime(task.first_start);
            const endStr = formatExactDateTime(task.last_end);
            const durStr = formatDetailedDuration(task.total_time_spent);
            spentTimeHtml = `
                <div class="card-time-details">
                    <div class="time-row"><span class="time-label">Начало:</span> <span>${startStr}</span></div>
                    <div class="time-row"><span class="time-label">Конец:</span> <span>${endStr}</span></div>
                    <div class="time-row"><span class="time-label">Затрачено:</span> <span>${durStr}</span></div>
                </div>
            `;
        } else {
            spentTimeHtml = `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
        }
        if (task.total_time_spent === 0) extraClasses.push('has-unknown-time');
    }

    let footerHtml = '';
    if (checklistHtml || priorityHtml || timerHtml || spentTimeHtml) {
        footerHtml = `<div class="card-footer">${checklistHtml}${priorityHtml}${timerHtml}${spentTimeHtml}</div>`;
    }

    return `
        <div class="card ${extraClasses.join(' ')}" data-card-id="${task.id}">
            <div class="card-title-wrapper">
                <svg class="completed-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <div class="card-title">${renderInlineMarkdown(task.title)}</div>
                <div class="card-menu-wrapper">
                    <button class="card-menu-btn" title="Редактировать">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                </div>
            </div>
            ${footerHtml}
            <!-- Инлайн триггер создания новой карточки под текущей -->
            <div class="card-inline-trigger">
                <button class="divider-plus-btn">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>
        </div>
    `;
}

function createColumnElement(column) {
    const colDiv = document.createElement('div');
    colDiv.className = 'column';
    colDiv.dataset.columnId = column.id;

    if (column.collapsed) colDiv.classList.add('collapsed');

    let pillClass = 'meta-pill default';
    let modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>';
    if (column.mode === 'track_time') {
        pillClass = 'meta-pill track-time';
        modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    } else if (column.mode === 'completion') {
        pillClass = 'meta-pill completion';
        modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    }

    const sortedTasks = [...column.tasks].sort((a, b) => a.position - b.position);

    let tasksHtml = '';
    sortedTasks.forEach((task) => {
        tasksHtml += generateCardHtml(task, column.mode);
    });

    colDiv.innerHTML = `
        <div class="column-header">
            <span class="column-title" data-full-title="${escapeHtml(column.title)}">${columnTitleHtml(column.title)}</span>
            <div class="column-actions">
                <div class="${pillClass}">
                    <span class="card-count">${column.tasks.length}</span>
                    ${modeIcon}
                </div>
                <button class="menu-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></button>
            </div>
        </div>
        <div class="dropdown-menu">
            <div class="menu-label">${t('menu.mode')}</div>
            <div class="menu-item ${column.mode === 'default' ? 'selected' : ''}" data-action="set-mode" data-mode="default">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                <span>${t('columnModes.default')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-item ${column.mode === 'track_time' ? 'selected' : ''}" data-action="set-mode" data-mode="track_time">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${t('columnModes.track_time')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-item ${column.mode === 'completion' ? 'selected' : ''}" data-action="set-mode" data-mode="completion">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${t('columnModes.completion')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-divider"></div>
            <div class="menu-item" data-action="collapse-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg><span>${t('menu.collapse')}</span></div>
            <div class="menu-item" data-action="sort-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg><span>${t('menu.sort')}</span></div>
            <div class="menu-item" data-action="rename-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>${t('menu.rename')}</span></div>
            <div class="menu-item danger" data-action="clear-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M19 10l-4 4"/><path d="M15 10l4 4"/></svg><span>${t('menu.clear')}</span></div>
            <div class="menu-item danger" data-action="delete-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>${t('menu.delete')}</span></div>
        </div>
        <div class="card-list">${tasksHtml}</div>
        <button class="btn-add-card">${t('newTask')}</button>
    `;

    if (column.width && !column.collapsed) {
        colDiv.style.width = column.width + 'px';
    }

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'column-resize-handle';
    resizeHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        startColumnResize(colDiv, column, e);
    });
    colDiv.appendChild(resizeHandle);

    const addBtn = colDiv.querySelector('.btn-add-card');
    addBtn.addEventListener('click', () => onAddTask(column.id));

    const menuBtn = colDiv.querySelector('.menu-btn');
    menuBtn.addEventListener('click', (e) => toggleColumnMenu(e, colDiv));

    const inlineTrigger = document.createElement('div');
    inlineTrigger.className = 'column-inline-trigger';
    inlineTrigger.innerHTML = `
        <button class="divider-plus-btn">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
    `;
    colDiv.appendChild(inlineTrigger);

    return colDiv;
}

async function clearTaskTimerAPI(taskId) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/clear-timer`, { method: 'POST' });
    if (!res.ok) throw new Error('Error');
    return res.json();
}

async function refreshBoard(scrollToActive = false, newTabId = null) {
    try {
        const _prefetchWsId = state.activeWorkspaceId;
        const [_wsList, _prefetchedColumns] = await Promise.all([
            fetchWorkspaces(),
            _prefetchWsId ? fetchColumns(_prefetchWsId).catch(() => null) : Promise.resolve(null)
        ]);
        state.workspaces = _wsList;

        if (!state.activeWorkspaceId || !state.workspaces.find(w => w.id === state.activeWorkspaceId)) {
            state.activeWorkspaceId = state.workspaces[0].id;
        }

        renderTabs(scrollToActive, newTabId);

        const columns = (_prefetchedColumns !== null && state.activeWorkspaceId === _prefetchWsId)
            ? _prefetchedColumns
            : await fetchColumns(state.activeWorkspaceId);
        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
        renderBoard();

        const calModal = document.getElementById('calendar-modal');
        if (calModal && calModal.classList.contains('show') && Calendar.syncData) {
            Calendar.syncData();
        }

    } catch (e) {
        console.error(e);
    }
}

