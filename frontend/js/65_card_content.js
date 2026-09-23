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

function initTaskDescriptionLogic() {
    const renderDiv = document.getElementById('task-desc-render');
    const inputArea = document.getElementById('task-desc-input');
    const descWrapper = document.querySelector('.description-wrapper');
    const modal = document.getElementById('task-modal');

    if (descWrapper && !descWrapper.dataset.descriptionDividerBound) {
        descWrapper.dataset.descriptionDividerBound = '1';
        const ZONE = 24, MIN = 150;
        let active = false, pid = null, sy = 0, sh = 0, oldCursor = '', oldSelect = '';
        const inZone = e => e.clientY >= descWrapper.getBoundingClientRect().bottom - ZONE;
        const clamp = h => {
            const parent = descWrapper.closest('.task-detail-body');
            const max = Math.max(MIN + 40, (parent?.clientHeight || window.innerHeight) - 96);
            return Math.max(MIN, Math.min(h, max));
        };
        const stop = e => {
            if (!active || (pid !== null && e?.pointerId !== pid)) return;
            active = false; pid = null;
            descWrapper.classList.remove('is-description-resize-hover', 'is-description-resizing');
            document.body.style.cursor = oldCursor;
            document.body.style.userSelect = oldSelect;
        };
        descWrapper.addEventListener('pointermove', e => {
            if (active) {
                if (pid !== null && e.pointerId !== pid) return;
                e.preventDefault();
                descWrapper.style.height = `${clamp(sh + e.clientY - sy)}px`;
            } else {
                descWrapper.classList.toggle('is-description-resize-hover', inZone(e));
            }
        });
        descWrapper.addEventListener('pointerleave', () => { if (!active) descWrapper.classList.remove('is-description-resize-hover'); });
        descWrapper.addEventListener('pointerdown', e => {
            if (e.button !== 0 || !inZone(e)) return;
            e.preventDefault(); e.stopPropagation();
            active = true; pid = e.pointerId; sy = e.clientY; sh = descWrapper.getBoundingClientRect().height;
            oldCursor = document.body.style.cursor; oldSelect = document.body.style.userSelect;
            descWrapper.classList.add('is-description-resizing');
            document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none';
            try { descWrapper.setPointerCapture(e.pointerId); } catch (_) {}
        });
        descWrapper.addEventListener('pointerup', stop);
        descWrapper.addEventListener('pointercancel', stop);
        descWrapper.addEventListener('lostpointercapture', stop);
    }

    let lastSavedValue = "";

    const toggleFormat = (cm, syntaxBefore, syntaxAfter) => {
        const selection = cm.getSelection();
        if (selection) {
            if (selection.startsWith(syntaxBefore) && selection.endsWith(syntaxAfter)) {
                const unwrapped = selection.substring(syntaxBefore.length, selection.length - syntaxAfter.length);
                cm.replaceSelection(unwrapped);
            } else {
                cm.replaceSelection(syntaxBefore + selection + syntaxAfter);
            }
        } else {
            const cursor = cm.getCursor();
            cm.replaceSelection(syntaxBefore + syntaxAfter);
            cm.setCursor({ line: cursor.line, ch: cursor.ch + syntaxBefore.length });
        }
    };

    const insertLink = (cm) => {
        const selection = cm.getSelection();
        if (selection) {
            cm.replaceSelection(`[${selection}](url)`);
            const cursor = cm.getCursor();
            const endCh = cursor.ch;
            cm.setSelection(
                { line: cursor.line, ch: endCh - 4 },
                { line: cursor.line, ch: endCh - 1 }
            );
        } else {
            const cursor = cm.getCursor();
            cm.replaceSelection("[](url)");
            cm.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
        }
    };

    if (!cmEditor && window.CodeMirror) {
        cmEditor = CodeMirror.fromTextArea(inputArea, {
            lineWrapping: true,
            viewportMargin: 50,
            maxHighlightLength: 2000,
            workTime: 10,
            workDelay: 100,
            spellcheck: false,
            autocorrect: false,
            extraKeys: {
                "Cmd-F": (cm) => { if (window.openLocalSearch) window.openLocalSearch(); },
                "Ctrl-F": (cm) => { if (window.openLocalSearch) window.openLocalSearch(); },

                "Cmd-B": (cm) => toggleFormat(cm, "**", "**"),
                "Ctrl-B": (cm) => toggleFormat(cm, "**", "**"),

                "Cmd-I": (cm) => toggleFormat(cm, "*", "*"),
                "Ctrl-I": (cm) => toggleFormat(cm, "*", "*"),

                "Cmd-U": (cm) => toggleFormat(cm, "<u>", "</u>"),
                "Ctrl-U": (cm) => toggleFormat(cm, "<u>", "</u>"),

                "Shift-Cmd-X": (cm) => toggleFormat(cm, "~~", "~~"),
                "Shift-Ctrl-X": (cm) => toggleFormat(cm, "~~", "~~"),

                "Cmd-E": (cm) => toggleFormat(cm, "`", "`"),
                "Ctrl-E": (cm) => toggleFormat(cm, "`", "`"),

                "Cmd-K": (cm) => insertLink(cm),
                "Ctrl-K": (cm) => insertLink(cm)
            }
        });
        cmEditor.getWrapperElement().style.display = 'none';
    }

    const _cmCalib = { gen: 0 };

    const _calibrateEditorHeights = () => {
        if (!cmEditor) return;
        const lineCount = cmEditor.lineCount();
        if (lineCount < 1000 || lineCount > 30000) return;
        const gen = ++_cmCalib.gen;
        let line = 0;
        const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
        const step = () => {
            if (gen !== _cmCalib.gen) return;
            if (!cmEditor || cmEditor.getWrapperElement().style.display === 'none') return;
            const t0 = performance.now();
            try {
                while (line < lineCount && performance.now() - t0 < 8) {
                    cmEditor.charCoords({ line: line, ch: 0 }, 'local');
                    line += 1;
                }
            } catch (e) {
                return;
            }
            if (line < cmEditor.lineCount()) idle(step);
        };
        idle(step);
    };

    const switchToEditMode = () => {
        if (window.closeLocalSearch) window.closeLocalSearch();
        lastSavedValue = cmEditor.getValue();

        const taskId = parseInt(modal.dataset.taskId);
        let currentTask = null;
        for (let col of state.columns) {
            currentTask = col.tasks.find(t => t.id === taskId);
            if (!currentTask) {
                for (let pt of col.tasks) {
                    if (pt.subtasks) {
                        currentTask = pt.subtasks.find(s => s.id === taskId);
                        if (currentTask) break;
                    }
                }
            }
            if (currentTask) break;
        }

        if (currentTask) {
            currentTask._readScrollTop = renderDiv.scrollTop;
            const detailBody = document.querySelector('.task-detail-body');
            if (detailBody) currentTask._modalScrollTop = detailBody.scrollTop;
        }

        renderDiv.style.display = 'none';
        cmEditor.getWrapperElement().style.display = 'block';
        cmEditor.refresh();

        window.getSelection().removeAllRanges();

        const targetPos = currentTask && currentTask._editCursorPos
            ? currentTask._editCursorPos
            : { line: 0, ch: 0 };

        cmEditor.focus();
        cmEditor.setCursor(targetPos);

        const info = cmEditor.getScrollInfo();
        cmEditor.scrollIntoView(targetPos, Math.round(info.clientHeight / 2));

        if (!cmEditor._calibHooked) {
            cmEditor._calibHooked = true;
            cmEditor.on('change', () => { _cmCalib.gen++; });
        }
        _calibrateEditorHeights();
    };

    // nativePath — настоящий путь файла на диске (если его удалось получить
    // от нативной обёртки). Тогда файл прикрепляется через /attach-local:
    // фоновое копирование на сервере, на macOS — мгновенный APFS-клон.
    // Без нативного пути — потоковая загрузка с прогрессом. Оба пути
    // работают с файлами любого размера и не блокируют интерфейс.
    const processFileForDescription = async (file, nativePath = null) => {
        const isEditMode = renderDiv.style.display === 'none';
        const taskIdAtStart = modal.dataset.taskId;

        let fileName = file.name;
        if (!fileName || fileName === 'image.png') {
            const dateStr = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15);
            fileName = `Скриншот_${dateStr}.png`;
        }

        const ext = fileName.split('.').pop().toLowerCase();
        const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
        const prefix = isImg ? '!' : '';
        const makeLabel = (pct) => pct === null ? `⏳ Загрузка ${fileName}...` : `⏳ Загрузка ${fileName}... ${pct}%`;
        const placeholder = `${prefix}[${makeLabel(null)}]()`;

        let placeholderRange = null;

        if (isEditMode) {
            const insertPos = cmEditor.getCursor();
            const textBefore = cmEditor.getRange({line: 0, ch: 0}, insertPos);

            let pfx = "";
            if (textBefore.trim() !== "") {
                if (textBefore.endsWith('\n')) pfx = "\n";
                else pfx = "\n\n";
            }

            const insertText = `${pfx}${placeholder}\n`;
            cmEditor.replaceSelection(insertText);
            cmEditor.focus();

            const startIdx = cmEditor.indexFromPos(insertPos) + pfx.length;
            placeholderRange = {
                from: cmEditor.posFromIndex(startIdx),
                to: cmEditor.posFromIndex(startIdx + placeholder.length)
            };
        } else {
            const text = cmEditor.getValue();
            let pfx = "";
            if (text.trim() !== "") {
                if (text.endsWith('\n')) pfx = "\n";
                else pfx = "\n\n";
            }
            cmEditor.setValue(text + pfx + placeholder);

            const startIdx = text.length + pfx.length;
            placeholderRange = {
                from: cmEditor.posFromIndex(startIdx),
                to: cmEditor.posFromIndex(startIdx + placeholder.length)
            };

            const cleanRegex = /(!?)\[[^\]]*\]\(doe\/[^)]+\)(?:\{[^}]+\})?!\s*/g;
            const tempText = cmEditor.getValue().replace(cleanRegex, '');
            renderDiv.innerHTML = parseMarkdownWithMath(tempText);
            enhanceCodeBlocks(renderDiv);

            // Сразу сохраняем плейсхолдер в описание: если карточку закроют,
            // пока большой файл копируется, завершение найдёт плейсхолдер в
            // БД и заменит его на готовую ссылку (finalizeAttachmentInTask).
            if (taskIdAtStart) {
                try {
                    const newText = cmEditor.getValue();
                    await fetch(`${API_BASE}/tasks/${taskIdAtStart}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ description: newText })
                    });
                    for (let col of state.columns) {
                        const tsk = col.tasks.find(tt => tt.id == taskIdAtStart);
                        if (tsk) { tsk.description = newText; break; }
                    }
                } catch (err) { /* некритично: сохранится при закрытии */ }
            }
        }

        // Маркер CodeMirror следит за плейсхолдером, даже если пользователь
        // редактирует текст выше/ниже, пока файл копируется.
        let marker = placeholderRange
            ? cmEditor.markText(placeholderRange.from, placeholderRange.to, {})
            : null;
        let currentLabel = makeLabel(null);

        // Заменяет текст плейсхолдера. Возвращает false, если плейсхолдер
        // уже недоступен (карточку закрыли / открыли другую).
        const replacePlaceholderWith = (newText) => {
            if (!marker) return false;
            const pos = marker.find();
            if (!pos) { marker = null; return false; }
            marker.clear();
            cmEditor.replaceRange(newText, pos.from, pos.to);
            const endIdx = cmEditor.indexFromPos(pos.from) + newText.length;
            marker = cmEditor.markText(pos.from, cmEditor.posFromIndex(endIdx), {});
            return true;
        };

        const setProgress = (pct) => {
            const label = makeLabel(pct);
            replacePlaceholderWith(`${prefix}[${label}]()`);
            // В режиме чтения обновляем и отрендеренный текст ссылки.
            if (!isEditMode) {
                try {
                    const links = renderDiv.querySelectorAll('a');
                    for (const a of links) {
                        if (a.textContent === currentLabel) { a.textContent = label; break; }
                    }
                } catch (err) { /* некритично */ }
            }
            currentLabel = label;
        };

        try {
            let data;
            if (nativePath) {
                data = await attachByNativePath(nativePath, setProgress);
            } else {
                data = await uploadFileStreaming(file, fileName, setProgress);
            }
            const encodedPath = encodeMarkdownPath(data.path);
            const finalMarkdown = `${prefix}[${data.name}](${encodedPath})`;

            const replaced = replacePlaceholderWith(finalMarkdown);
            if (!replaced && taskIdAtStart) {
                // Редактор уже показывает другую карточку — правим описание
                // исходной задачи напрямую через API.
                await finalizeAttachmentInTask(taskIdAtStart, fileName, finalMarkdown);
            }
            refreshAttachmentsList();
        } catch (err) {
            console.error('Attachment failed:', err);
            const errorMarkdown = `${prefix}[❌ Ошибка: ${fileName}]()`;
            const replaced = replacePlaceholderWith(errorMarkdown);
            if (!replaced && taskIdAtStart) {
                await finalizeAttachmentInTask(taskIdAtStart, fileName, errorMarkdown);
            }
        }
        if (marker) { marker.clear(); marker = null; }

        // Пока файл копировался, пользователь мог закрыть карточку или
        // открыть другую — тогда ничего не трогаем.
        const stillSameTask = modal.classList.contains('show') && modal.dataset.taskId === taskIdAtStart;
        if (!stillSameTask) return;

        const nowEditMode = renderDiv.style.display === 'none';
        if (nowEditMode) {
            if (isEditMode) cmEditor.focus();
        } else {
            lastSavedValue = null;
            await switchToReadMode();
        }
    };

    // Вставка ссылки на оригинал файла БЕЗ копирования в хранилище
    // (Option+DnD на macOS / Ctrl+DnD на Windows — как в Obsidian).
    // Путь пишется обычным Markdown-синтаксисом [имя](путь), без file:///.
    const insertExternalFileLink = (absPath) => {
        const normPath = String(absPath).replace(/\\/g, '/');
        const baseName = normPath.split('/').pop();
        const ext = baseName.split('.').pop().toLowerCase();
        const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
        const md = `${isImg ? '!' : ''}[${baseName}](${encodeMarkdownPath(normPath)})`;

        const isEditMode = renderDiv.style.display === 'none';
        if (isEditMode) {
            const cursor = cmEditor.getCursor();
            const textBefore = cmEditor.getRange({line: 0, ch: 0}, cursor);
            let pfx = "";
            if (textBefore.trim() !== "") pfx = textBefore.endsWith('\n') ? "\n" : "\n\n";
            cmEditor.replaceSelection(`${pfx}${md}\n`);
            cmEditor.focus();
        } else {
            const text = cmEditor.getValue();
            let pfx = "";
            if (text.trim() !== "") pfx = text.endsWith('\n') ? "\n" : "\n\n";
            cmEditor.setValue(text + pfx + md);
        }
        return isEditMode;
    };

    const handleFileDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragEnterCount = 0;
        descWrapper.classList.remove('is-drag-over');

        // Option (macOS) / Ctrl (Windows) — вставить ссылку на оригинал
        // без копирования файла в хранилище (как в Obsidian)
        const wantLinkOnly = e.altKey || e.ctrlKey;

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        // Нативные пути из обёртки (macOS): позволяют прикрепить файл
        // без HTTP-загрузки — мгновенный клон или быстрое фоновое копирование.
        const nativeFiles = await getNativeDropFiles();
        let needSave = false;
        for (const file of files) {
            const native = takeNativeDropMatch(nativeFiles, file);
            if (wantLinkOnly) {
                if (native) {
                    const wasEdit = insertExternalFileLink(native.path);
                    if (!wasEdit) needSave = true;
                    continue;
                }
                // Нативный путь недоступен (Windows DnD) — честно предупреждаем
                // и копируем файл, чтобы вложение не потерялось.
                if (window.showToast) window.showToast(t('alerts.error'), 'Путь к оригиналу недоступен — файл будет скопирован в хранилище', true);
            }
            await processFileForDescription(file, native ? native.path : null);
        }
        // Ссылки вставлялись в режиме чтения — сохраняем и перерисовываем
        if (needSave) {
            lastSavedValue = null;
            await switchToReadMode();
        }
    };

    const handleFilePaste = async (e) => {
        const items = (e.clipboardData || window.clipboardData).items;
        const files = [];

        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const f = items[i].getAsFile();
                if (f) files.push(f);
            }
        }

        if (files.length > 0) {
            e.preventDefault();
            for (const file of files) {
                await processFileForDescription(file);
            }
        }
    };

    let dragEnterCount = 0;
    descWrapper.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragEnterCount++;
        descWrapper.classList.add('is-drag-over');
    });

    descWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    descWrapper.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragEnterCount--;
        if (dragEnterCount <= 0) {
            dragEnterCount = 0;
            descWrapper.classList.remove('is-drag-over');
        }
    });

    descWrapper.addEventListener('drop', handleFileDrop);

    cmEditor.on('paste', (cm, e) => handleFilePaste(e));
    renderDiv.addEventListener('paste', handleFilePaste);

    const switchToReadMode = async () => {
        const newDesc = cmEditor.getValue();
        const taskId = modal.dataset.taskId;

        if (newDesc === lastSavedValue) {
            exitEditingUI(newDesc, null);
            return;
        }

        cmEditor.getWrapperElement().style.opacity = "0.7";

        try {
            const currentAttachments = Array.from(document.querySelectorAll('#attachments-list .attachment-item'));
            const savedOrder = currentAttachments.map(el => el.dataset.path);

            const extracted = extractAttachments(newDesc, savedOrder);
            const newOrderPaths = extracted.map(a => a.path);

            const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: newDesc,
                    attachments_order: newOrderPaths
                })
            });

            if (!res.ok) throw new Error("Save failed");

            bumpModalUpdatedDate();

            let updatedColId = null;
            for (let col of state.columns) {
                let currentTask = col.tasks.find(t => t.id == taskId);
                if (!currentTask) {
                    for (let pt of col.tasks) {
                        if (pt.subtasks) {
                            currentTask = pt.subtasks.find(s => s.id == taskId);
                            if (currentTask) break;
                        }
                    }
                }
                if (currentTask) {
                    currentTask.description = newDesc;
                    currentTask.attachments_order = newOrderPaths;
                    updatedColId = col.id;
                    break;
                }
            }

            if (updatedColId && window.syncColumnDOM) {
                await window.syncColumnDOM(updatedColId);
            }

            exitEditingUI(newDesc, extracted);
        } catch (err) {
            console.error("Critical sync error:", err);
            exitEditingUI(newDesc, null);
        } finally {
            cmEditor.getWrapperElement().style.opacity = "1";
        }
    };

    const exitEditingUI = async (content, preCalculatedAttachments = null) => {
        const attachmentsList = document.getElementById('attachments-list');
        const attachmentsCount = document.getElementById('attachments-count');
        const taskId = parseInt(modal.dataset.taskId);

        let currentTask = null;
        for (let col of state.columns) {
            currentTask = col.tasks.find(t => t.id === taskId);
            if (currentTask) break;
        }

        if (attachmentsCount && attachmentsList && preCalculatedAttachments) {
            let extracted = preCalculatedAttachments;
            if (extracted.length > 0 && extracted[0].exists === undefined) {
                extracted = await enrichAttachments(extracted);
            }
            attachmentsCount.textContent = extracted.length;
            attachmentsList.innerHTML = '';
            extracted.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));
        }

        if (currentTask && cmEditor) {
            currentTask._editCursorPos = cmEditor.getCursor();
        }

        if (cmEditor) cmEditor.getWrapperElement().style.display = 'none';
        renderDiv.style.display = 'block';

        const applyScroll = () => {
            if (currentTask && currentTask._readScrollTop !== undefined) {
                renderDiv.scrollTop = currentTask._readScrollTop;
            } else {
                renderDiv.scrollTop = 0;
            }
            if (currentTask && currentTask._modalScrollTop !== undefined) {
                const detailBody = document.querySelector('.task-detail-body');
                if (detailBody) detailBody.scrollTop = currentTask._modalScrollTop;
            }
        };

        if (content.trim()) {
            const cleanRegex = /(!?)\[[^\]]*\]\(doe\/[^)]+\)(?:\{[^}]+\})?!\s*/g;
            const cleanContent = content.replace(cleanRegex, '');

            renderMarkdownProgressively(cleanContent, renderDiv, {
                onFirstScreen: () => {
                    applyScroll();
                },
                onComplete: () => {
                    let localFolded = currentTask ? currentTask.folded_headings || [] : [];
                    initHeadingFolding(renderDiv, localFolded);
                    applyTextExpansion();
                    applyScroll();
                }
            });
        } else {
            renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
            applyTextExpansion();
            applyScroll();
        }
    };

    renderDiv.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('image-resize-handle')) {
            e.preventDefault();
            e.stopPropagation();

            const wrapper = e.target.closest('.image-resizer-wrapper');
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = wrapper.offsetWidth;
            const startHeight = wrapper.offsetHeight;
            const aspectRatio = startWidth / startHeight;

            // Keep the user's chosen size separate from the size currently
            // visible inside a narrow description viewport.
            const mdSource = unescapeHtml(wrapper.dataset.md || '');
            const sizeMatch = mdSource.match(/\{\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\}\s*$/);
            const storedWidth = sizeMatch ? Number(sizeMatch[1]) : startWidth;
            const storedHeight = sizeMatch ? Number(sizeMatch[2]) : startHeight;
            let desiredWidth = storedWidth;
            let desiredHeight = storedHeight;

            wrapper.classList.add('is-resizing');
            wrapper.classList.add('has-custom-size');
            document.body.style.userSelect = 'none';

            const imageResizeState = {
                descriptionHeightBefore: descWrapper ? descWrapper.getBoundingClientRect().height : 0,
                descriptionHeightExpanded: false
            };

            const onMouseMove = (moveEvent) => {
                desiredWidth = Math.max(50, storedWidth + (moveEvent.clientX - startX));
                desiredHeight = Math.max(50, storedHeight + (moveEvent.clientY - startY));

                if (moveEvent.shiftKey) desiredHeight = desiredWidth / aspectRatio;

                const wrapperRect = wrapper.getBoundingClientRect();
                const viewportRect = renderDiv.getBoundingClientRect();
                const availableWidth = Math.max(50, viewportRect.right - wrapperRect.left);

                // Horizontal size is constrained by the live description viewport.
                // Vertical size is NOT constrained by the current description height:
                // the description itself grows to make room for the image.
                const visibleWidth = Math.min(desiredWidth, availableWidth);
                const widthWasClamped = visibleWidth < desiredWidth;
                const visibleHeight = widthWasClamped
                    ? Math.max(50, visibleWidth / aspectRatio)
                    : desiredHeight;

                wrapper.style.width = visibleWidth + 'px';
                wrapper.style.height = visibleHeight + 'px';

                if (descWrapper) {
                    const descRect = descWrapper.getBoundingClientRect();
                    const imageBottom = wrapper.getBoundingClientRect().bottom;
                    const requiredHeight = Math.max(0, imageBottom - descRect.top + 18);
                    const currentHeight = descRect.height;
                    if (requiredHeight > currentHeight) {
                        descWrapper.style.height = `${requiredHeight}px`;
                        imageResizeState.descriptionHeightExpanded = true;
                    }
                }

            };

            const onMouseUp = async () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.userSelect = '';
                wrapper.classList.remove('is-resizing');
                // Клик, прилетающий сразу после ресайза, не должен открывать лайтбокс
                wrapper.dataset.justResized = '1';
                setTimeout(() => { delete wrapper.dataset.justResized; }, 300);

                // Persist the user's requested size, not the temporarily
                // clamped size currently visible in the description viewport.
                const finalWidth = Math.round(desiredWidth);
                const finalHeight = Math.round(desiredHeight);
                const originalMd = unescapeHtml(wrapper.dataset.md);

                const regex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{[^}]+\})?/;
                const newMd = originalMd.replace(regex, `![$1]($2){${finalWidth}, ${finalHeight}}`);

                const idx = cmEditor.getValue().indexOf(originalMd);
                if (idx !== -1) {
                    const from = cmEditor.posFromIndex(idx);
                    const to = cmEditor.posFromIndex(idx + originalMd.length);
                    cmEditor.replaceRange(newMd, from, to);
                }

                wrapper.dataset.md = escapeHtml(newMd);
                lastSavedValue = cmEditor.getValue();

                const taskId = modal.dataset.taskId;
                try {
                    await fetch(`${API_BASE}/tasks/${taskId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ description: cmEditor.getValue() })
                    });

                    bumpModalUpdatedDate();

                    for (let col of state.columns) {
                        let currentTask = col.tasks.find(t => t.id == taskId);
                        if (currentTask) {
                            currentTask.description = cmEditor.getValue();
                            break;
                        }
                    }
                } catch (err) {
                    console.error("Failed to save image resize", err);
                }
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            return;
        }

        if (e.target.tagName === 'A') return;
        if (e.detail > 1) {
            e.preventDefault();
        }
    });

    renderDiv.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'A') return;
        if (e.target.closest('.image-resizer-wrapper')) return;
        // Быстрые клики по чекбоксу/медиа не должны открывать редактор
        if (e.target.closest('input.doe-task-checkbox')) return;
        if (e.target.closest('.doe-pdf-embed, .doe-video-embed, .doe-audio-embed, .doe-media-embed, details.callout > summary')) return;
        switchToEditMode();
    });

    // Переключение чекбокса - [ ]/- [x] в режиме чтения: правим маркер
    // в исходном Markdown (по порядковому номеру, код-блоки замаскированы)
    // и сохраняем описание. Визуально input переключается сам.
    const toggleTaskCheckbox = async (idx, nowChecked) => {
        const src = cmEditor.getValue();
        const masked = src.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => m.replace(/\[[ xX]\]/g, '[?]'));
        const re = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])\]/gm;
        let n = -1, m, pos = -1;
        while ((m = re.exec(masked)) !== null) {
            n++;
            if (n === idx) { pos = m.index + m[1].length; break; }
        }
        if (pos === -1) return;

        const newSrc = src.slice(0, pos) + (nowChecked ? 'x' : ' ') + src.slice(pos + 1);
        cmEditor.setValue(newSrc);
        lastSavedValue = newSrc; // рендер уже актуален, повторное сохранение не нужно

        const taskId = parseInt(modal.dataset.taskId);
        if (!taskId) return;
        try {
            await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: newSrc })
            });
            bumpModalUpdatedDate();
            for (let col of state.columns) {
                const tk = col.tasks.find(tt => tt.id == taskId);
                if (tk) { tk.description = newSrc; break; }
            }
        } catch (err) {
            console.error('Checkbox toggle save failed:', err);
        }
    };

    renderDiv.addEventListener('click', (e) => {
        const checkbox = e.target.closest('input.doe-task-checkbox');
        if (checkbox) {
            e.stopPropagation();
            const all = Array.from(renderDiv.querySelectorAll('input.doe-task-checkbox'));
            toggleTaskCheckbox(all.indexOf(checkbox), checkbox.checked);
            return;
        }
        const link = e.target.closest('a');
        if (link) {
            e.preventDefault();
            e.stopPropagation();
            const href = link.getAttribute('href');
            if (!href) return;
            // Якоря сносок (#doe-fn-...) — плавный скролл внутри описания
            if (href.startsWith('#')) {
                const target = renderDiv.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            // Вики-ссылка на заметку [[...]] — открываем глобальный поиск
            if (href.startsWith('doe://wikilink/')) {
                const name = decodeURIComponent(href.slice('doe://wikilink/'.length));
                const input = document.getElementById('global-search-input');
                if (input) {
                    input.value = name;
                    input.focus();
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }
            if (href.startsWith('doe/') || href.startsWith('/doe/')) {
                const cleanHref = href.startsWith('/') ? href.slice(1) : href;
                const hashIdx = cleanHref.indexOf('#');
                const filePart = hashIdx === -1 ? cleanHref : cleanHref.slice(0, hashIdx);
                // PDF со страницей ([цитата](doe/файл.pdf#page=5)) — открываем
                // встроенный просмотрщик сразу на нужном месте
                if (hashIdx !== -1 && decodeURIComponent(filePart).toLowerCase().endsWith('.pdf')) {
                    openPdfOverlay(filePart + cleanHref.slice(hashIdx));
                    return;
                }
                fetch(`${API_BASE}/system/open-file`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: decodeURIComponent(filePart)}) });
                return;
            }
            // Относительный путь из Obsidian-заметки (attachments/file.pdf) —
            // ищем в папке вложений хранилища
            if (!/^([a-z][a-z0-9+.-]*:|\/)/i.test(href)) {
                fetch(`${API_BASE}/system/open-file`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: 'doe/' + decodeURIComponent(href.split('#')[0])}) });
                return;
            }
            if (href.startsWith('doe://task/')) {
                const rest = href.slice('doe://task/'.length);
                const hashIdx = rest.indexOf('#');
                const targetTaskId = parseInt(hashIdx === -1 ? rest : rest.slice(0, hashIdx));
                let fragText = null;
                if (hashIdx !== -1) {
                    const frag = rest.slice(hashIdx + 1);
                    if (frag.startsWith('text=')) {
                        try { fragText = decodeURIComponent(frag.slice(5)); } catch (err) { fragText = frag.slice(5); }
                    }
                }
                // Ссылка на фрагмент текущей карточки — просто подсвечиваем
                if (fragText && parseInt(modal.dataset.taskId) === targetTaskId) {
                    highlightDescriptionFragment(fragText);
                    return;
                }
                fetch(`${API_BASE}/tasks/${targetTaskId}/context`)
                    .then(res => res.json())
                    .then(context => {
                        window.navigateToEntityGlobal(context.workspace_id, context.column_id, targetTaskId, null, true);
                        if (fragText) highlightFragmentWhenReady(targetTaskId, fragText);
                    })
                    .catch(err => console.error("Не удалось найти карточку", err));
                return;
            }
            // Абсолютный путь на PDF со страницей — встроенный просмотрщик
            if (/^\//.test(href) && /\.pdf#/i.test(href)) {
                openPdfOverlay(href);
                return;
            }
            fetch(`${API_BASE}/system/open-link`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url: href}) })
                .then(r => r.json())
                .then(d => { if (d && d.success === false) window.showToast(t('alerts.error'), t('alerts.linkNotFound'), true); })
                .catch(() => {});
            return;
        }

        if (!cmEditor.getValue().trim()) {
            switchToEditMode();
        }
    });

    // Правый клик по выделенному тексту описания — «Скопировать ссылку
    // на фрагмент»: markdown-ссылка doe://task/ID#text=..., по клику
    // открывает карточку и подсвечивает это место (работает и из других карточек)
    renderDiv.addEventListener('contextmenu', (e) => {
        const sel = window.getSelection();
        const selText = sel ? String(sel).trim() : '';
        if (!selText || selText.length < 2) return;
        e.preventDefault();
        e.stopPropagation();

        document.querySelectorAll('.doe-fragment-menu').forEach(m => m.remove());
        const menu = document.createElement('div');
        menu.className = 'dropdown-menu doe-fragment-menu show';
        menu.style.position = 'fixed';
        menu.style.left = `${Math.min(e.clientX, window.innerWidth - 260)}px`;
        menu.style.top = `${Math.min(e.clientY, window.innerHeight - 60)}px`;
        menu.style.zIndex = '10000';
        const item = document.createElement('button');
        item.className = 'dropdown-item';
        item.textContent = '🔗 ' + t('copyFragmentLink');
        item.addEventListener('click', async () => {
            const taskId = modal.dataset.taskId;
            const preview = selText.length > 40 ? selText.slice(0, 40).trim() + '…' : selText;
            const md = `[«${preview}»](doe://task/${taskId}#text=${encodeURIComponent(selText)})`;
            await doeCopyText(md);
            menu.remove();
            if (window.showToast) window.showToast(t('fragmentLinkCopied'), preview);
        });
        menu.appendChild(item);
        document.body.appendChild(menu);
        const dismiss = (ev) => {
            if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', dismiss, true); }
        };
        document.addEventListener('mousedown', dismiss, true);
    });

    let preventBlurExit = false;
    let shouldRefocusCM = false;

    descWrapper.addEventListener('mousedown', (e) => {
        if (cmEditor && cmEditor.getWrapperElement().style.display === 'block') {
            preventBlurExit = true;
            shouldRefocusCM = true;
        }
    });

    const taskModal = document.getElementById('task-modal');
    taskModal.addEventListener('mousedown', (e) => {
        if (cmEditor && cmEditor.getWrapperElement().style.display === 'block') {
            const isSearch = e.target.closest('#local-search-widget');
            const isTools = e.target.closest('#modal-tools-wrapper');
            const isHeaderActions = e.target.closest('.modal-header-actions');
            const isDatePicker = e.target.closest('#datepicker-dropdown') || e.target.closest('.datepicker-dropdown');

            if (isSearch || isTools || isHeaderActions || isDatePicker) {
                preventBlurExit = true;
                shouldRefocusCM = false;
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (shouldRefocusCM) {
            shouldRefocusCM = false;
            if (cmEditor && cmEditor.getWrapperElement().style.display === 'block') {
                cmEditor.focus();
            }
        }

        setTimeout(() => {
            preventBlurExit = false;
        }, 150);
    });

    cmEditor.on('blur', () => {
        setTimeout(() => {
            if (preventBlurExit) return;

            const activeEl = document.activeElement;
            if (activeEl) {
                if (activeEl.closest('#local-search-widget') || activeEl.closest('#modal-tools-wrapper')) {
                    return;
                }
            }

            switchToReadMode();
        }, 120);
    });
}

function initTaskModalDragAndResize() {
    const taskModal = document.getElementById('task-modal');
    const card = taskModal.querySelector('.task-detail-card');
    const header = card.querySelector('.modal-header');
    const maximizeBtn = card.querySelector('.modal-maximize');

    let currentResizer = null;
    let isDragging = false;

    let startX, startY, startW, startH, startLeft, startTop;

    let currentRotation = 0;
    let targetRotation = 0;
    let lastMouseX = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;
    let rafId = null;

    let dragCleanupTimeout = null;
    let dragCleanupFn = null;

    maximizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        const isMaximized = card.classList.contains('maximized');

        if (!isMaximized) {
            if (card.style.position !== 'absolute') {
                const rect = card.getBoundingClientRect();
                card.style.position = 'absolute';
                card.style.margin = '0';
                card.style.left = `${rect.left}px`;
                card.style.top = `${rect.top}px`;
                card.style.width = `${rect.width}px`;
                card.style.height = `${rect.height}px`;
                card.style.transform = 'none';
            }

            void card.offsetWidth;
            card.classList.add('maximized');
            maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 10 14 10 14 6"></polyline><polyline points="6 14 10 14 10 18"></polyline><line x1="14" y1="10" x2="18" y2="6"></line><line x1="10" y1="14" x2="6" y2="18"></line></svg>`;
        } else {
            const startRect = card.getBoundingClientRect();

            card.classList.remove('maximized');
            card.style.transition = 'none';
            card.style.position = '';
            card.style.left = '';
            card.style.top = '';
            card.style.width = '';
            card.style.height = '';
            card.style.transform = '';
            card.style.margin = '';

            const targetRect = card.getBoundingClientRect();

            card.style.position = 'absolute';
            card.style.margin = '0';
            card.style.left = `${startRect.left}px`;
            card.style.top = `${startRect.top}px`;
            card.style.width = `${startRect.width}px`;
            card.style.height = `${startRect.height}px`;

            void card.offsetWidth;

            card.style.transition = '';
            card.classList.add('is-restoring');

            card.style.left = `${targetRect.left}px`;
            card.style.top = `${targetRect.top}px`;
            card.style.width = `${targetRect.width}px`;
            card.style.height = `${targetRect.height}px`;

            maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 6 18 6 18 10"></polyline><polyline points="10 18 6 18 6 14"></polyline><line x1="18" y1="6" x2="13" y2="11"></line><line x1="6" y1="18" x2="11" y2="13"></line></svg>`;

            const cleanup = (ev) => {
                if (ev && ev.target !== card) return;
                card.removeEventListener('transitionend', cleanup);
                card.classList.remove('is-restoring');
                card.style.position = '';
                card.style.left = '';
                card.style.top = '';
                card.style.width = '';
                card.style.height = '';
                card.style.margin = '';
            };
            card.addEventListener('transitionend', cleanup);
            setTimeout(cleanup, 350);
        }
    });

    const renderModalPhysics = () => {
        if (!isDragging) return;

        const deltaX = currentMouseX - lastMouseX;
        lastMouseX = currentMouseX;

        const maxRotation = 2.5;
        targetRotation = Math.max(-maxRotation, Math.min(maxRotation, deltaX * 0.15));
        currentRotation += (targetRotation - currentRotation) * 0.12;

        const dx = currentMouseX - startX;
        const dy = currentMouseY - startY;

        card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${currentRotation}deg)`;
        rafId = requestAnimationFrame(renderModalPhysics);
    };

    const onPointerDown = (e) => {
        if (e.button !== 0) return;

        if (card.classList.contains('maximized')) return;
        if (!e.target.closest('.task-detail-card')) return;

        const resizer = e.target.closest('.resizer');

        const isInteractive = e.target.closest(
            'button, input, textarea, a, ' +
            '.markdown-body, .description-wrapper, ' +
            '.subtask-item, .attachment-item, ' +
            '.breadcrumb-item, .modal-timer-pill, ' +
            '.toggle-switch'
        );

        const isScrollbarClick = (e.target.clientWidth > 0 && e.offsetX > e.target.clientWidth) ||
                                 (e.target.clientHeight > 0 && e.offsetY > e.target.clientHeight);

        if (!resizer && (isInteractive || isScrollbarClick)) return;

        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }

        e.preventDefault();

        if (dragCleanupFn) {
            card.removeEventListener('transitionend', dragCleanupFn);
            dragCleanupFn = null;
        }
        if (dragCleanupTimeout) {
            clearTimeout(dragCleanupTimeout);
            dragCleanupTimeout = null;
        }

        const rect = card.getBoundingClientRect();
        card.style.transition = 'none';
        card.style.position = 'absolute';
        card.style.margin = '0';
        card.style.left = `${rect.left}px`;
        card.style.top = `${rect.top}px`;
        card.style.width = `${rect.width}px`;
        card.style.height = `${rect.height}px`;
        card.style.transform = 'none';

        isDragging = !resizer;
        currentResizer = resizer;

        startX = e.clientX;
        startY = e.clientY;
        startW = rect.width;
        startH = rect.height;
        startLeft = rect.left;
        startTop = rect.top;

        if (isDragging) {
            lastMouseX = e.clientX;
            currentMouseX = e.clientX;
            currentMouseY = e.clientY;
            currentRotation = 0;
            targetRotation = 0;

            card.style.willChange = 'transform';

            document.body.classList.add('is-dragging-modal');

            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(renderModalPhysics);
        }

        document.body.style.userSelect = 'none';
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
        currentMouseX = e.clientX;
        currentMouseY = e.clientY;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (isDragging) {
            return;
        }

        if (currentResizer) {
            const type = currentResizer.classList;

            if (type.contains('r-right') || type.contains('r-top-right') || type.contains('r-bottom-right')) {
                const newWidth = startW + dx;
                if (newWidth > 400) card.style.width = `${newWidth}px`;
            }
            if (type.contains('r-left') || type.contains('r-top-left') || type.contains('r-bottom-left')) {
                const newWidth = startW - dx;
                if (newWidth > 400) {
                    card.style.width = `${newWidth}px`;
                    card.style.left = `${startLeft + dx}px`;
                }
            }
            if (type.contains('r-bottom') || type.contains('r-bottom-left') || type.contains('r-bottom-right')) {
                const newHeight = startH + dy;
                if (newHeight > 400) card.style.height = `${newHeight}px`;
            }
            if (type.contains('r-top') || type.contains('r-top-left') || type.contains('r-top-right')) {
                const newHeight = startH - dy;
                if (newHeight > 400) {
                    card.style.height = `${newHeight}px`;
                    card.style.top = `${startTop + dy}px`;
                }
            }
        }
    };

    const onPointerUp = (e) => {
        if (isDragging) {
            document.body.classList.remove('is-dragging-modal');
            cancelAnimationFrame(rafId);

            const dx = currentMouseX - startX;
            const dy = currentMouseY - startY;

            card.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(0deg)`;

            dragCleanupFn = (ev) => {
                if (ev && ev.target !== card) return;
                if (ev && ev.propertyName !== 'transform') return;

                if (dragCleanupFn) card.removeEventListener('transitionend', dragCleanupFn);
                if (dragCleanupTimeout) clearTimeout(dragCleanupTimeout);
                dragCleanupFn = null;
                dragCleanupTimeout = null;

                card.style.transition = 'none';
                card.style.left = `${startLeft + dx}px`;
                card.style.top = `${startTop + dy}px`;
                card.style.transform = 'none';
            };

            card.addEventListener('transitionend', dragCleanupFn);
            dragCleanupTimeout = setTimeout(dragCleanupFn, 450);

            if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) {
                window._isAfterDrag = true;
                setTimeout(() => window._isAfterDrag = false, 250);
            }
        }

        isDragging = false;
        currentResizer = null;
        document.body.style.userSelect = '';
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    };

    taskModal.addEventListener('pointerdown', onPointerDown);
}

function extractAttachments(desc, savedOrder = []) {
    let cleanDesc = desc.replace(/```[\s\S]*?```/g, '');
    cleanDesc = cleanDesc.replace(/`[^`]*`/g, '');

    // Метка может быть пустой ([](doe/...)), скрытые помечаются хвостовым "!",
    // #фрагмент (страница PDF и т.п.) не входит в путь вложения.
    const regex = /(!?)\[([^\]]*)\]\((doe\/[^)#]*)(?:#[^)]*)?\)(?:\{[^}]+\})?(!?)/g;
    let match;
    const attachments = [];
    const seenPaths = new Set();

    while ((match = regex.exec(cleanDesc)) !== null) {
        // Несколько ссылок на разные страницы одного PDF — одно вложение
        if (seenPaths.has(match[3])) continue;
        seenPaths.add(match[3]);
        attachments.push({
            fullMatch: match[0],
            isImage: match[1] === '!',
            label: match[2],
            path: match[3],
            isHidden: match[4] === '!'
        });
    }

    attachments.sort((a, b) => {
        const idxA = savedOrder.indexOf(a.path);
        const idxB = savedOrder.indexOf(b.path);
        const posA = idxA !== -1 ? idxA : Infinity;
        const posB = idxB !== -1 ? idxB : Infinity;
        return posA - posB;
    });

    return attachments;
}

async function enrichAttachments(attachments) {
    if (attachments.length === 0) return attachments;
    const paths = attachments.map(a => a.path);

    try {
        const res = await fetch(`${API_BASE}/system/validate-attachments`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({paths})
        });

        if (res.ok) {
            const validation = await res.json();
            attachments.forEach(a => {
                if (a.path === 'doe/') {
                    a.isPending = true;
                    a.exists = false;
                    a.real_name = a.label;
                } else {
                    const status = validation[a.path];
                    a.exists = status ? status.exists : false;
                    a.real_name = status ? status.real_name : a.label;
                }
            });
        }
    } catch (e) {
        console.error("Attachment validation failed", e);
        attachments.forEach(a => { a.exists = true; a.real_name = a.name; });
    }
    return attachments;
}

function createAttachmentElement(att) {
    const div = document.createElement('div');
    div.className = 'subtask-item attachment-item';
    div.dataset.fullMatch = att.fullMatch;
    div.dataset.path = att.path;

    const isPending = att.isPending === true;
    const isMissing = att.exists === false && !isPending;
    const needsRelink = isMissing || isPending;

    let fileIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    if (needsRelink) {
        fileIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }

    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    let displayTitle = escapeHtml(att.real_name);
    if (isPending) {
        displayTitle = t('pendingTitle', escapeHtml(att.label));
    }

    let checkboxClass = '';
    let titleAttr = '';
    if (isMissing) {
        checkboxClass = 'missing';
        titleAttr = `title="${t('missingTooltip')}"`;
    } else if (isPending) {
        checkboxClass = 'pending';
        titleAttr = `title="${t('pendingTooltip')}"`;
    }

    div.innerHTML = `
        <div class="subtask-checkbox ${checkboxClass}" ${titleAttr}>
            ${fileIcon}
        </div>
        <div class="subtask-title ${isMissing ? 'missing-text' : ''}" ${isMissing ? `title="${t('expectedFilename')}"` : ''}>${displayTitle}</div>
        <div class="subtask-actions">
            <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIcon}</button>
        </div>
    `;

    div.addEventListener('click', async (e) => {
        if (e.target.closest('.subtask-delete-btn')) return;

        if (needsRelink) {
            let newAbsPath = null;
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
                newAbsPath = await window.pywebview.api.choose_file();
            } else {
                return new Promise(resolve => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.onchange = async () => {
                        if (input.files.length > 0) {
                            try {
                                // Потоковая загрузка: работает с файлами любого размера.
                                const f = input.files[0];
                                const data = await uploadFileStreaming(f, f.name, null);
                                replaceBrokenAttachment(att, data);
                            } catch (err) {
                                console.error('Relink upload failed:', err);
                            }
                        }
                        resolve();
                    };
                    input.click();
                });
            }

            if (newAbsPath) {
                // Фоновое копирование с прогрессом прямо в строке вложения
                // (на macOS в пределах тома — мгновенно).
                const titleEl = div.querySelector('.subtask-title');
                const origTitle = titleEl ? titleEl.textContent : '';
                try {
                    const data = await attachByNativePath(newAbsPath, (pct) => {
                        if (titleEl && titleEl.isConnected) titleEl.textContent = `${origTitle} — ${pct}%`;
                    });
                    replaceBrokenAttachment(att, data);
                } catch (err) {
                    console.error('Relink failed:', err);
                    if (titleEl) titleEl.textContent = origTitle;
                    if (window.showToast) window.showToast(t('alerts.error'), origTitle, true);
                }
            }
            return;
        }

        await fetch(`${API_BASE}/system/open-file`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: decodeURIComponent(att.path)})
        });
    });

    div.querySelector('.subtask-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();

        div.style.transition = 'all 0.2s ease-out';
        div.style.opacity = '0';
        div.style.transform = 'translateX(20px)';

        const pathToDelete = att.path;

        if (!isPending) {
            fetch(`${API_BASE}/system/delete-file`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ path: pathToDelete })
            }).catch(err => console.error("Physical delete failed:", err));
        }

        setTimeout(async () => {
            const renderDiv = document.getElementById('task-desc-render');
            const isEditMode = renderDiv.style.display === 'none';

            const escapedPath = pathToDelete.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pathRegex = new RegExp(`!?\\[[^\\]]*\\]\\(${escapedPath}\\)(?:\\{[^}]+\\})?!?`, 'g');

            const oldText = cmEditor.getValue();
            const newText = oldText.replace(pathRegex, '');

            if (oldText !== newText) {
                cmEditor.setValue(newText);

                if (isEditMode) {
                    cmEditor.focus();
                    refreshAttachmentsList();
                } else {
                    const taskId = parseInt(document.getElementById('task-modal').dataset.taskId);
                    if (taskId) {
                        try {
                            await fetch(`${API_BASE}/tasks/${taskId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ description: newText })
                            });
                            bumpModalUpdatedDate();
                            for (let col of state.columns) {
                                let t = col.tasks.find(t => t.id == taskId);
                                if (t) { t.description = newText; break; }
                            }
                        } catch (err) {
                            console.error('Failed to save after attachment delete:', err);
                        }

                        const cleanRegex = /(!?)\[[^\]]*\]\(doe\/[^)]+\)(?:\{[^}]+\})?!\s*/g;
                        const cleanContent = newText.replace(cleanRegex, '');
                        if (cleanContent.trim()) {
                            renderMarkdownProgressively(cleanContent, renderDiv, {
                                onComplete: () => {
                                    initHeadingFolding(renderDiv, []);
                                    applyTextExpansion();
                                }
                            });
                        } else {
                            renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
                            applyTextExpansion();
                        }

                        const attachmentsList = document.getElementById('attachments-list');
                        const attachmentsCount = document.getElementById('attachments-count');
                        const currentOrder = Array.from(document.querySelectorAll('#attachments-list .attachment-item')).map(el => el.dataset.path);
                        const extracted = extractAttachments(newText, currentOrder);
                        const enriched = await enrichAttachments(extracted);
                        if (attachmentsCount) attachmentsCount.textContent = enriched.length;
                        if (attachmentsList) {
                            attachmentsList.innerHTML = '';
                            enriched.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));
                        }
                    }
                }
            }

            if (div.parentNode) div.remove();
        }, 200);
    });

    return div;
}

async function refreshAttachmentsList() {
    const attachmentsList = document.getElementById('attachments-list');
    const attachmentsCount = document.getElementById('attachments-count');
    if (!attachmentsList || !attachmentsCount) return;

    const taskId = parseInt(document.getElementById('task-modal').dataset.taskId);
    if (!taskId) return;

    const desc = cmEditor ? cmEditor.getValue() : '';
    const currentOrder = Array.from(document.querySelectorAll('#attachments-list .attachment-item')).map(el => el.dataset.path);
    const extracted = extractAttachments(desc, currentOrder);
    const enriched = await enrichAttachments(extracted);

    attachmentsCount.textContent = enriched.length;
    attachmentsList.innerHTML = '';
    enriched.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));
}

async function replaceBrokenAttachment(att, newData) {
    const isEditMode = document.getElementById('task-desc-render').style.display === 'none';

    const encodedNewPath = encodeMarkdownPath(newData.path);
    const prefix = att.isImage ? '!' : '';
    const suffix = att.isHidden ? '!' : '';

    const sizeMatch = att.fullMatch.match(/\{[^}]+\}$/);
    const sizeStr = sizeMatch ? sizeMatch[0] : '';

    const newMarkdown = `${prefix}[${att.label}](${encodedNewPath})${sizeStr}${suffix}`;

    const idx = cmEditor.getValue().indexOf(att.fullMatch);
    if (idx !== -1) {
        const from = cmEditor.posFromIndex(idx);
        const to = cmEditor.posFromIndex(idx + att.fullMatch.length);
        cmEditor.replaceRange(newMarkdown, from, to);
    }

    if (isEditMode) {
        cmEditor.focus();
        refreshAttachmentsList();
    } else {
        const taskId = parseInt(document.getElementById('task-modal').dataset.taskId);
        if (taskId) {
            const newText = cmEditor.getValue();
            try {
                await fetch(`${API_BASE}/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: newText })
                });
                bumpModalUpdatedDate();
                for (let col of state.columns) {
                    let t = col.tasks.find(t => t.id == taskId);
                    if (t) { t.description = newText; break; }
                }
            } catch (err) {
                console.error('Failed to save after attachment relink:', err);
            }

            const renderDiv = document.getElementById('task-desc-render');
            const cleanRegex = /(!?)\[[^\]]*\]\(doe\/[^)]+\)(?:\{[^}]+\})?!\s*/g;
            const cleanContent = newText.replace(cleanRegex, '');
            if (cleanContent.trim()) {
                renderMarkdownProgressively(cleanContent, renderDiv, {
                    onComplete: () => {
                        initHeadingFolding(renderDiv, []);
                        applyTextExpansion();
                    }
                });
            } else {
                renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
                applyTextExpansion();
            }
            refreshAttachmentsList();
        }
    }
}

// ============================================================
// 📎 Прикрепление файлов любого размера (200 ГБ+)
//
// Два транспорта:
//   1. Нативный путь (DnD в десктоп-приложении, диалог «+») →
//      /system/attach-local: сервер копирует файл в фоновом потоке,
//      на macOS в пределах тома APFS — мгновенный CoW-клон (как
//      Cmd+C / Cmd+V в Finder). Прогресс поллится.
//   2. Нет нативного пути (браузер, DnD на Windows, вставка) →
//      /system/upload-stream: файл уходит сырым телом запроса и пишется
//      на диск сразу в папку вложений — одна запись, любой размер,
//      постоянная память. XHR вместо fetch ради события прогресса.
// ============================================================

async function uploadFileStreaming(file, name, onProgress) {
    // 🔒 Без сетевого сервера файл уходит через мост window.pywebview.api
    // (fetch-шим сериализует бинарное тело в base64). Гранулярный прогресс
    // XHR (xhr.upload.onprogress) недоступен — показываем приблизительный.
    if (onProgress) onProgress(30);
    const res = await fetch(
        `${API_BASE}/system/upload-stream?name=${encodeURIComponent(name || file.name || 'file')}`,
        { method: 'PUT', body: file }
    );
    if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`);
    const data = await res.json();
    if (onProgress) onProgress(100);
    return data;
}

async function attachByNativePath(absPath, onProgress) {
    const res = await fetch(`${API_BASE}/system/attach-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ absolute_path: absPath })
    });
    if (!res.ok) throw new Error('attach-local failed');
    let job = await res.json();
    let lastPct = -1;
    while (job.status === 'running') {
        await new Promise(r => setTimeout(r, 300));
        const pr = await fetch(`${API_BASE}/system/attach-progress/${job.job_id}?t=${Date.now()}`);
        if (!pr.ok) throw new Error('Progress poll failed');
        job = await pr.json();
        if (onProgress && job.total > 0) {
            const pct = Math.min(99, Math.round(job.done / job.total * 100));
            if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
        }
    }
    if (job.status !== 'done') throw new Error(job.error || 'Copy failed');
    if (onProgress) onProgress(100);
    return { path: job.path, name: job.name };
}

// Пути файлов последнего Drag & Drop, перехваченные нативной обёрткой
// (macOS). Если недоступно (браузер/Windows) — пустой список, и DnD
// автоматически идёт через потоковую загрузку.
async function getNativeDropFiles() {
    try {
        if (window.pywebview && window.pywebview.api && window.pywebview.api.get_dropped_files) {
            const files = await window.pywebview.api.get_dropped_files();
            if (Array.isArray(files)) return files.filter(f => f && f.path && !f.is_dir);
        }
    } catch (e) {
        console.warn('get_dropped_files failed:', e);
    }
    return [];
}

// Сопоставляет DOM-файл из события drop с нативным путём: сначала по
// имени и размеру, затем только по имени. Найденный элемент изымается,
// чтобы два одноимённых файла не получили один и тот же путь.
function takeNativeDropMatch(nativeFiles, file) {
    if (!nativeFiles || nativeFiles.length === 0) return null;
    let idx = nativeFiles.findIndex(nf => nf.name === file.name && nf.size === file.size);
    if (idx === -1) idx = nativeFiles.findIndex(nf => nf.name === file.name);
    if (idx === -1) return null;
    return nativeFiles.splice(idx, 1)[0];
}

// Финализация вложения, когда редактор уже недоступен (карточка закрыта
// или открыта другая): меняем плейсхолдер «⏳ …» на финальную ссылку
// прямо в описании задачи через API.
async function finalizeAttachmentInTask(taskId, fileName, finalMarkdown) {
    try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (!res.ok) return false;
        const task = await res.json();
        const desc = task.description || '';
        const esc = String(fileName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`!?\\[⏳ [^\\]]*${esc}[^\\]]*\\]\\(\\)`);
        if (!re.test(desc)) return false;
        const newDesc = desc.replace(re, finalMarkdown);
        await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: newDesc })
        });
        for (let col of state.columns) {
            const t = col.tasks.find(t => t.id == taskId);
            if (t) { t.description = newDesc; break; }
        }
        return true;
    } catch (e) {
        console.warn('finalizeAttachmentInTask failed:', e);
        return false;
    }
}

// Дописывает готовую ссылку на вложение в конец описания задачи через API —
// используется, если карточку закрыли, пока файл ещё копировался.
async function appendAttachmentMarkdownToTask(taskId, name, path) {
    try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (!res.ok) return false;
        const task = await res.json();
        const desc = task.description || '';
        const ext = name.split('.').pop().toLowerCase();
        const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
        const md = `${isImg ? '!' : ''}[${name}](${encodeMarkdownPath(path)})`;
        const pfx = desc.trim() === '' ? '' : (desc.endsWith('\n') ? '\n' : '\n\n');
        const newDesc = desc + pfx + md;
        await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: newDesc })
        });
        for (let col of state.columns) {
            const t = col.tasks.find(t => t.id == taskId);
            if (t) { t.description = newDesc; break; }
        }
        return true;
    } catch (e) {
        console.warn('appendAttachmentMarkdownToTask failed:', e);
        return false;
    }
}

// Прикрепление файла по нативному пути из панели вложений (кнопка «+»
// и повторная привязка). Прогресс показывается временной строкой в списке
// вложений; интерфейс не блокируется.
async function attachNativePathToCurrentTask(absPath) {
    const baseName = String(absPath).split(/[\\\/]/).pop();
    const modal = document.getElementById('task-modal');
    const taskIdAtStart = modal ? modal.dataset.taskId : null;

    const list = document.getElementById('attachments-list');
    let progressEl = null, titleEl = null;
    if (list) {
        progressEl = document.createElement('div');
        progressEl.className = 'attachment-item is-uploading';
        progressEl.style.opacity = '0.65';
        progressEl.innerHTML = `<div class="subtask-checkbox">⏳</div><div class="subtask-title"></div>`;
        titleEl = progressEl.querySelector('.subtask-title');
        titleEl.textContent = baseName;
        list.appendChild(progressEl);
    }

    try {
        const result = await attachByNativePath(absPath, (pct) => {
            if (titleEl && titleEl.isConnected) titleEl.textContent = `${baseName} — ${pct}%`;
        });
        if (progressEl) progressEl.remove();

        const stillSameTask = modal && modal.classList.contains('show')
            && modal.dataset.taskId === taskIdAtStart;
        if (stillSameTask && document.getElementById('attachments-list')) {
            appendAttachmentToDescription(result.name, result.path);
        } else if (taskIdAtStart) {
            await appendAttachmentMarkdownToTask(taskIdAtStart, result.name, result.path);
        }
        return result;
    } catch (e) {
        if (progressEl) progressEl.remove();
        console.error('attachNativePathToCurrentTask failed:', e);
        if (window.showToast) window.showToast(t('alerts.error'), baseName, true);
        return null;
    }
}

function appendAttachmentToDescription(name, path) {
    const renderDiv = document.getElementById('task-desc-render');
    const isEditMode = renderDiv.style.display === 'none';

    const ext = name.split('.').pop().toLowerCase();
    const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
    const prefix = isImg ? '!' : '';

    const encodedPath = encodeMarkdownPath(path);
    const attachmentMarkdown = `${prefix}[${name}](${encodedPath})`;

    if (isEditMode) {
        const cursor = cmEditor.getCursor();
        const textBefore = cmEditor.getRange({line: 0, ch: 0}, cursor);

        let pfx = "";
        if (textBefore.trim() !== "") {
            if (textBefore.endsWith('\n')) pfx = "\n";
            else pfx = "\n\n";
        }

        const insertText = `${pfx}${attachmentMarkdown}\n`;
        cmEditor.replaceSelection(insertText);
        cmEditor.focus();
        refreshAttachmentsList();
    } else {
        (async () => {
            const text = cmEditor.getValue();
            let pfx = "";
            if (text.trim() !== "") {
                if (text.endsWith('\n')) pfx = "\n";
                else pfx = "\n\n";
            }
            cmEditor.setValue(text + pfx + attachmentMarkdown);

            const taskId = parseInt(document.getElementById('task-modal').dataset.taskId);
            if (!taskId) return;
            const newText = cmEditor.getValue();
            const currentOrder = Array.from(document.querySelectorAll('#attachments-list .attachment-item')).map(el => el.dataset.path);
            const extracted = extractAttachments(newText, currentOrder);
            const newOrderPaths = extracted.map(a => a.path);

            try {
                await fetch(`${API_BASE}/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: newText, attachments_order: newOrderPaths })
                });
                bumpModalUpdatedDate();
                for (let col of state.columns) {
                    let t = col.tasks.find(t => t.id == taskId);
                    if (t) { t.description = newText; t.attachments_order = newOrderPaths; break; }
                }
            } catch (err) {
                console.error('Failed to save after attachment add:', err);
            }

            const renderedAtts = await enrichAttachments(extracted);
            const attachmentsList = document.getElementById('attachments-list');
            const attachmentsCount = document.getElementById('attachments-count');
            if (attachmentsCount) attachmentsCount.textContent = renderedAtts.length;
            if (attachmentsList) {
                attachmentsList.innerHTML = '';
                renderedAtts.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));
            }

            const cleanRegex = /(!?)\[[^\]]*\]\(doe\/[^)]+\)(?:\{[^}]+\})?!\s*/g;
            const cleanContent = newText.replace(cleanRegex, '');
            if (cleanContent.trim()) {
                renderMarkdownProgressively(cleanContent, renderDiv, {
                    onComplete: () => { initHeadingFolding(renderDiv, []); applyTextExpansion(); }
                });
            } else {
                renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
                applyTextExpansion();
            }
        })();
    }
}

document.addEventListener('click', async (e) => {
    if (e.target.closest('#btn-add-attachment')) {
        const api = window.pywebview && window.pywebview.api;
        if (api && (api.choose_files || api.choose_file)) {
            // Нативный диалог → настоящие пути → фоновое копирование с
            // прогрессом (мгновенный клон на macOS). Файлы любого размера.
            let paths = [];
            if (api.choose_files) {
                paths = (await api.choose_files()) || [];
            } else {
                const p = await api.choose_file();
                if (p) paths = [p];
            }
            for (const absPath of paths) {
                await attachNativePathToCurrentTask(absPath);
            }
        } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.onchange = async () => {
                for (const f of Array.from(input.files || [])) {
                    // Потоковая загрузка: любой размер, одна запись на диск.
                    try {
                        const data = await uploadFileStreaming(f, f.name, null);
                        appendAttachmentToDescription(data.name, data.path);
                    } catch (err) {
                        console.error('Upload failed:', err);
                        if (window.showToast) window.showToast(t('alerts.error'), f.name, true);
                    }
                }
            };
            input.click();
        }
    }
});

async function showVaultScreen() {
    if (window.aiAbortController) {
        window.aiAbortController.abort();
        window.aiAbortController = null;
    }
    if (window.aiState) window.aiState.isTyping = false;

    // 🔐 Выход на экран выбора хранилищ = выход из хранилища:
    // закрываем БД и шифруем файлы (если установлен пароль), сбрасываем ключ сессии.
    // С красивым оверлеем прогресса, чтобы приложение не выглядело зависшим.
    await window.lockVaultWithProgress();

    // ⚠️ Класс vault-mode здесь НЕ добавляем: окно доски видно ещё всё время
    // шифрования и ~0.4с до подмены окном селектора — зелёная кнопка пропадала
    // бы раньше времени. Селектор открывается свежей страницей (?mode=vault),
    // которая сама скрывает зелёную кнопку при инициализации.
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_vault_window) {
        window.pywebview.api.open_vault_window();
    } else {
        // 🔒 Без сервера прямого URL /app нет — окно всегда пересоздаёт мост.
        // Этот фолбэк недостижим в упакованном приложении (мост всегда есть).
        window.location.reload();
    }
}

