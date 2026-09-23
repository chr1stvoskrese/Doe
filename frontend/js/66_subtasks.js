function generateSubtaskHtml(sub, parentMode = 'default') {
    const trashIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const openIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const eyeOpenSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosedSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    const currentEyeSvg = sub.is_visible_on_board ? eyeOpenSvg : eyeClosedSvg;
    const eyeClass = sub.is_visible_on_board ? 'active-eye' : '';

    const isAgent = sub.is_visible_on_board;
    const isLocked = isAgent;
    const isDone = sub.completed_at;

    const checkIcon = isAgent
        ? (isDone
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`)
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>`;

    let titleAttr = '';
    if (isAgent) titleAttr = 'title="Статус управляется на доске"';

    return `
        <div class="subtask-item ${isDone ? 'is-done' : ''} ${isAgent ? 'is-board-agent' : ''}" data-subtask-id="${sub.id}">
            <div class="subtask-checkbox ${isLocked ? 'locked' : ''}" ${titleAttr}>
                ${checkIcon}
            </div>

            <!-- Группируем левые кнопки точно так же, как правые -->
            <div class="subtask-left-actions">
                <button class="subtask-eye-btn ${eyeClass}" title="Показывать на доске как карточку">${currentEyeSvg}</button>
                <button class="subtask-detach-btn" title="${t('detachSubtask')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m18.84 12.25 1.72-1.71h-.01a5.001 5.001 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="m5.17 11.67-1.71 1.71a5.001 5.001 0 0 0 7.07 7.07l1.71-1.71"></path>
                        <line x1="8" y1="2" x2="8" y2="5"></line>
                        <line x1="2" y1="8" x2="5" y2="8"></line>
                        <line x1="16" y1="22" x2="16" y2="19"></line>
                        <line x1="22" y1="16" x2="19" y2="16"></line>
                    </svg>
                </button>
            </div>

            <div class="subtask-title" data-raw-title="${escapeHtml(sub.title)}">${renderInlineMarkdown(sub.title)}</div>

            <div class="subtask-actions">
                <button class="subtask-open-btn" title="${t('menu.open')}">${openIconSvg}</button>
                <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIconSvg}</button>
            </div>
        </div>
    `;
}

async function onAddSubtask() {
    const container = document.getElementById('subtask-form-container');
    const subtasksList = document.getElementById('subtasks-list');
    const addBtn = container.querySelector('.btn-add-subtask');
    const modal = document.getElementById('task-modal');
    const parentId = parseInt(modal.dataset.taskId);
    const columnId = parseInt(modal.dataset.columnId);

    if (!addBtn) return;

    const formItem = document.createElement('div');
    formItem.className = 'subtask-item subtask-entering';
    formItem.innerHTML = `
        <textarea class="subtask-inline-input" placeholder="${t('taskModal.subtasksPlaceholder').replace(/^\+ /, '')}" spellcheck="false" rows="1"></textarea>
    `;

    addBtn.replaceWith(formItem);
    const input = formItem.querySelector('textarea');

    const autoResize = () => {
        const scrollParent = formItem.closest('.task-detail-body');
        const currentScroll = scrollParent ? scrollParent.scrollTop : 0;

        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        input.style.height = (input.scrollHeight + offset) + 'px';

        if (scrollParent) scrollParent.scrollTop = currentScroll;
    };

    input.addEventListener('input', () => {
        formItem.classList.remove('is-error');
        const hint = formItem.querySelector('.card-error-hint');
        if (hint) {
            hint.remove();
        }
        autoResize();
    });

    autoResize();
    input.focus({ preventScroll: true });
    bindTitleFormattingShortcuts(input);

    requestAnimationFrame(() => {
        formItem.classList.add('entered');
        formItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    let isResolved = false;

    const cancel = () => {
        if (isResolved) return;
        isResolved = true;
        formItem.style.opacity = '0';
        setTimeout(() => renderSubtaskAddButton(container), 200);
    };

    const submit = async () => {
        const rawTitle = input.value.trim();
        if (!rawTitle) { cancel(); return; }

        // Ссылки на ФРАГМЕНТЫ описаний (doe://task/ID#text=...) и прочие
        // некорректные ссылки на карточки не могут быть подзадачами:
        // подзадача — это связь с целой карточкой, а не с куском текста.
        if (/doe:\/\/task\/\d+#/i.test(rawTitle) || /doe:\/\/task\/(?!\d+([)\s]|$))/i.test(rawTitle)) {
            let hint = formItem.querySelector('.card-error-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.className = 'card-error-hint';
                formItem.appendChild(hint);
            }
            hint.textContent = t('subtaskFragmentLinkError');
            formItem.classList.remove('is-error');
            void formItem.offsetWidth;
            formItem.classList.add('is-error');
            setTimeout(() => formItem.classList.remove('is-error'), 400);
            input.focus({ preventScroll: true });
            return;
        }

        const linkMatch = rawTitle.match(/\[(.*?)\]\(doe:\/\/task\/(\d+)\)/i) || rawTitle.match(/doe:\/\/task\/(\d+)/i);
        if (linkMatch) {
            const linkedTaskId = parseInt(linkMatch[2] || linkMatch[1]);

            const isDuplicate = !!subtasksList.querySelector(`.subtask-item[data-subtask-id="${linkedTaskId}"]`);

            if (linkedTaskId === parentId || isDuplicate) {
                input.disabled = false;
                formItem.classList.remove('is-error');
                void formItem.offsetWidth;
                formItem.classList.add('is-error');

                setTimeout(() => formItem.classList.remove('is-error'), 400);

                input.focus({ preventScroll: true });
                return;
            }

            if (isResolved) return;
            isResolved = true;
            input.disabled = true;

            try {
                const linkedTaskRes = await fetch(`${API_BASE}/tasks/${linkedTaskId}`);
                if (!linkedTaskRes.ok) throw new Error("Task not found");

                const linkedTask = await linkedTaskRes.json();

                const safeOldParents = Array.isArray(linkedTask.parent_ids) ? linkedTask.parent_ids : [];
                const newParents = [...new Set([...safeOldParents, parentId])];

                await updateTask(linkedTaskId, {
                    parent_ids: newParents,
                    is_visible_on_board: true
                });

                bumpModalUpdatedDate();
                formItem.remove();
                renderSubtaskAddButton(container);

                await loadTaskIntoModal(parentId, false);
                refreshBoard();
                return;
            } catch (err) {
                isResolved = false;
                input.disabled = false;

                let hint = formItem.querySelector('.card-error-hint');
                if (!hint) {
                    hint = document.createElement('div');
                    hint.className = 'card-error-hint';
                    formItem.appendChild(hint);
                }

                if (err.message && (err.message.includes('цикл') || err.message.includes('самой себя'))) {
                     hint.textContent = t('cyclicError');
                } else {
                     hint.textContent = t('alerts.error');
                }

                formItem.classList.remove('is-error');
                void formItem.offsetWidth;
                formItem.classList.add('is-error');

                setTimeout(() => formItem.classList.remove('is-error'), 400);
                input.focus({ preventScroll: true });
                return;
            }
        }

        const title = stripDoeTaskLinks(rawTitle);

        // 🔥 ФИКС: Защита от создания пустого имени после вырезания ссылок
        if (!title) { cancel(); return; }

        if (title.length > 1000) {
            if (!formItem.querySelector('.card-error-hint')) {
                const hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');
                formItem.appendChild(hint);
            }
            formItem.classList.remove('is-error');
            void formItem.offsetWidth;
            formItem.classList.add('is-error');
            autoResize();
            input.focus({ preventScroll: true });
            return;
        }

        if (isResolved) return;
        isResolved = true;
        input.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/tasks/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title, column_id: columnId, parent_ids: [parentId] })
            });

            if (!res.ok) throw new Error("Create subtask failed");
            const newSub = await res.json();

            bumpModalUpdatedDate();

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generateSubtaskHtml(newSub).trim();
            const realSub = tempDiv.firstChild;
            realSub.classList.add('subtask-birth');

            subtasksList.appendChild(realSub);
            bindSubtaskEvents(realSub, newSub, parentId);

            formItem.remove();
            renderSubtaskAddButton(container);

            requestAnimationFrame(() => {
                realSub.classList.add('born');
                realSub.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });

            setTimeout(() => realSub.classList.remove('subtask-birth', 'born'), 500);
            document.getElementById('subtasks-count').textContent = parseInt(document.getElementById('subtasks-count').textContent) + 1;

            // 🔥 ФИКС: Добавляем созданную подзадачу локально в стейт до перерендера
            for (let col of state.columns) {
                let pTask = col.tasks.find(t => t.id === parentId);
                if (pTask) {
                    if (!pTask.subtasks) pTask.subtasks = [];
                    pTask.subtasks.push(newSub);
                    break;
                }
            }

            refreshBoard();
        } catch (err) {
            console.error(err);
            isResolved = false;
            input.disabled = false;
            formItem.classList.add('is-error');
            setTimeout(() => formItem.classList.remove('is-error'), 400);
            input.focus({ preventScroll: true });
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    input.addEventListener('blur', () => {
        if (!isResolved) {
            if (input.value.trim()) submit();
            else cancel();
        }
    });
}

function renderSubtaskAddButton(container) {
    container.innerHTML = `<button class="btn-add-subtask">${t('taskModal.subtasksPlaceholder')}</button>`;
    container.querySelector('.btn-add-subtask').onclick = onAddSubtask;
}

function bindSubtaskEvents(el, sub, parentTaskOrId, parentMode = 'default') {
    let parentTask = null;
    let parentId = null;
    if (typeof parentTaskOrId === 'object' && parentTaskOrId !== null) {
        parentTask = parentTaskOrId;
        parentId = parentTask.id;
    } else {
        parentId = parseInt(parentTaskOrId);
        for (const col of state.columns) {
            parentTask = col.tasks.find(t => t.id === parentId);
            if (parentTask) break;
        }
    }

    el.querySelector('.subtask-checkbox').onclick = (e) => {
        e.stopPropagation();

        if (sub.is_visible_on_board) {
            el.classList.remove('is-error');
            void el.offsetWidth;
            el.classList.add('is-error');
            setTimeout(() => el.classList.remove('is-error'), 400);
            return;
        }

        const isDone = !el.classList.contains('is-done');

        el.classList.toggle('is-done', isDone);

        const timestamp = isDone ? new Date().toISOString() : null;
        const previousTimestamp = sub.completed_at;
        sub.completed_at = timestamp;

        state.columns.forEach(col => {
            col.tasks.forEach(task => {
                if (task.subtasks) {
                    const subIndex = task.subtasks.findIndex(s => s.id === sub.id);
                    if (subIndex !== -1) {
                        task.subtasks[subIndex].completed_at = timestamp;

                        const cardEl = document.querySelector(`.card[data-card-id="${task.id}"]`);
                        if (cardEl) {
                            updateCardAppearance(cardEl, task, col.mode);
                        }
                    }
                }
            });
        });

        updateTask(sub.id, { completed_at: timestamp }).catch((err) => {
            console.error("Failed to update subtask status:", err);

            el.classList.toggle('is-done', !isDone);
            sub.completed_at = previousTimestamp;

            state.columns.forEach(col => {
                col.tasks.forEach(task => {
                    if (task.subtasks) {
                        const subIndex = task.subtasks.findIndex(s => s.id === sub.id);
                        if (subIndex !== -1) {
                            task.subtasks[subIndex].completed_at = previousTimestamp;

                            const cardEl = document.querySelector(`.card[data-card-id="${task.id}"]`);
                            if (cardEl) {
                                updateCardAppearance(cardEl, task, col.mode);
                            }
                        }
                    }
                });
            });

            window.showToast(t('alerts.error'), 'Не удалось сохранить статус подзадачи', true);
        });
    };

    el.querySelector('.subtask-delete-btn').onclick = async (e) => {
        e.stopPropagation();

        const parents = sub.parent_ids || [];

        el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px) scale(0.95)';

        setTimeout(() => {
            if (el.parentNode) el.remove();
            const countEl = document.getElementById('subtasks-count');
            countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
        }, 250);

        try {
                if (parents.length > 1) {
                    const newParentIds = parents.filter(id => id !== parentId);
                    await updateTask(sub.id, { parent_ids: newParentIds });
                    bumpModalUpdatedDate();
                    sub.parent_ids = newParentIds;
                    refreshBoard();
                } else {
                    const data = await deleteTask(sub.id);
                    const snapshot = data.snapshot;
                    if (snapshot) pushBoardAction({ type: 'DELETE_CARD', taskData: snapshot });

                    bumpModalUpdatedDate();
                    const deletedIds = data.deleted_ids || [];

                    deletedIds.forEach(id => {
                        const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                        if (boardCard) {
                            animateCardDeletion(boardCard);
                        }

                        for (let col of state.columns) {
                            const taskIndex = col.tasks.findIndex(t => t.id === id);
                            if (taskIndex !== -1) col.tasks.splice(taskIndex, 1);
                        }
                    });
                    refreshBoard();
                }
            } catch(err) {
                console.error("Ошибка при удалении пункта:", err);
            }
    };

    el.querySelector('.subtask-open-btn').onclick = (e) => {
        e.stopPropagation();

        if (!sub.is_visible_on_board) {
            loadTaskIntoModal(sub.id, true);
            return;
        }

        fetch(`${API_BASE}/tasks/${sub.id}/context`)
            .then(res => res.json())
            .then(context => {
                window.navigateToEntityGlobal(context.workspace_id, context.column_id, sub.id, null, true);
            })
            .catch(err => {
                console.error("Не удалось найти контекст задачи", err);
                loadTaskIntoModal(sub.id, true);
            });
    };

    el.querySelector('.subtask-eye-btn').onclick = (e) => {
        e.stopPropagation();
        const eyeBtn = e.currentTarget;
        const checkbox = el.querySelector('.subtask-checkbox');

        sub.is_visible_on_board = !sub.is_visible_on_board;

        const eyeOpenSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        const eyeClosedSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        const checkIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>`;
        const boardIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;

        eyeBtn.innerHTML = sub.is_visible_on_board ? eyeOpenSvg : eyeClosedSvg;
        eyeBtn.classList.toggle('active-eye', sub.is_visible_on_board);
        el.classList.toggle('is-board-agent', sub.is_visible_on_board);

        updateTask(sub.id, {
            is_visible_on_board: sub.is_visible_on_board
        }).then(updatedSub => {
            sub.completed_at = updatedSub.completed_at;

            const isDone = sub.completed_at;
            const isLocked = sub.is_visible_on_board;

            checkbox.classList.toggle('locked', isLocked);
            el.classList.toggle('is-done', !!isDone);

            if (sub.is_visible_on_board) {
                checkbox.setAttribute('title', 'Статус управляется на доске');
                checkbox.innerHTML = isDone ? checkIconSvg : boardIconSvg;
            } else {
                checkbox.removeAttribute('title');
                checkbox.innerHTML = checkIconSvg;
            }

            refreshBoard();
        }).catch(console.error);
    };

    const detachBtn = el.querySelector('.subtask-detach-btn');
    if (detachBtn) {
        detachBtn.onclick = async (e) => {
            e.stopPropagation();

            let parents = sub.parent_ids || [];
            let detachType = 'all';

            if (parents.length > 1) {
                detachType = await showDetachModal();
                if (!detachType) return;
            }

            el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px) scale(0.95)';

            setTimeout(() => {
                if (el.parentNode) el.remove();
                const countEl = document.getElementById('subtasks-count');
                countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
            }, 250);

            try {
                let newParentIds = [];
                if (detachType === 'current') {
                    newParentIds = parents.filter(id => id !== parentId);
                } else if (detachType === 'all') {
                    newParentIds = [];
                }

                await updateTask(sub.id, { parent_ids: newParentIds, is_visible_on_board: true });
                bumpModalUpdatedDate();
                refreshBoard();
            } catch(err) {
                console.error("Ошибка при отвязке задачи:", err);
            }
        };
    }
}

