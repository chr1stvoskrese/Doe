document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.card-menu-btn')) {
        e.preventDefault();
    }
});

document.addEventListener('click', async (e) => {
    if (window._isAfterDrag) {
        e.stopPropagation();
        e.preventDefault();
        return;
    }

    const target = e.target;

    const titleLink = target.closest('a');
    if (titleLink) {
        const inTitle = target.closest('.card-title, .subtask-title, #task-modal-title, .breadcrumb-item, .reminder-task-title');
        if (inTitle) {
            e.stopPropagation();
            const href = titleLink.getAttribute('href');
            if (href && href.startsWith('doe://task/')) {
                e.preventDefault();
                const taskId = parseInt(href.replace('doe://task/', ''));
                if (taskId && !isNaN(taskId)) {
                    closeAllDropdowns();
                    fetch(`${API_BASE}/tasks/${taskId}/context`)
                        .then(res => res.json())
                        .then(context => {
                            window.navigateToEntityGlobal(context.workspace_id, context.column_id, taskId, null, true);
                        })
                        .catch(err => {
                            console.error("Не удалось найти контекст задачи", err);
                            loadTaskIntoModal(taskId, true);
                            document.getElementById('task-modal').classList.add('show');
                        });
                }
            } else if (href && (href.startsWith('doe/') || href.startsWith('/doe/'))) {
                e.preventDefault();
                const cleanHref = href.startsWith('/') ? href.slice(1) : href;
                fetch(`${API_BASE}/system/open-file`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: decodeURIComponent(cleanHref)}) });
            } else if (href) {
                e.preventDefault();
                fetch(`${API_BASE}/system/open-link`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url: href}) })
                    .then(r => r.json())
                    .then(d => { if (d && d.success === false) window.showToast(t('alerts.error'), t('alerts.linkNotFound'), true); })
                    .catch(() => {});
            }
            return;
        }
    }

    const collapsedCol = target.closest('.column.collapsed');
    if (collapsedCol) {
        if (!target.closest('.menu-btn')) {
            onExpandColumn(collapsedCol);
            return;
        }
    }

    const titleEl = target.closest('.column:not(.collapsed) .column-title');
    if (titleEl) {
        const columnEl = titleEl.closest('.column');
        if (columnEl && !columnEl.classList.contains('is-renaming')) {
            const columnId = parseInt(columnEl.dataset.columnId);
            const column = state.columns.find(c => c.id === columnId);
            if (column) {
                startColumnRename(columnEl, column);
                return;
            }
        }
    }

    const tabNameEl = target.closest('.board-tab .tab-name');
    if (tabNameEl) {
        const tabEl = tabNameEl.closest('.board-tab');
        if (tabEl && !tabEl.classList.contains('is-renaming')) {
            const wsId = parseInt(tabEl.dataset.workspaceId);
            if (wsId === state.activeWorkspaceId) {
                const ws = state.workspaces.find(w => w.id === wsId);
                if (ws) {
                    startTabRename(tabEl, ws);
                    return;
                }
            }
        }
    }

    const modalTitleEl = target.closest('#task-modal-title');
    if (modalTitleEl) {
        startModalTaskRename(modalTitleEl);
        return;
    }

    const subtaskTitleEl = target.closest('.subtask-title');
    if (subtaskTitleEl) {
        const subtaskEl = subtaskTitleEl.closest('.subtask-item');
        if (subtaskEl && !subtaskEl.classList.contains('attachment-item') && !subtaskEl.classList.contains('is-renaming')) {
            startSubtaskRename(subtaskEl);
            return;
        }
    }

    const detachModalBtn = target.closest('.modal-detach');
    if (detachModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);

        detachModalBtn.style.transition = 'all 0.2s ease-in';
        detachModalBtn.style.opacity = '0';
        detachModalBtn.style.transform = 'translateY(-10px)';

        setTimeout(() => {
            detachModalBtn.style.display = 'none';
            detachModalBtn.style.opacity = '1';
            detachModalBtn.style.transform = 'none';
        }, 200);

        try {
            updateTask(taskId, { parent_ids: [], is_visible_on_board: true }).then(() => {
                bumpModalUpdatedDate();
                refreshBoard();

                renderGraphBreadcrumbs(taskId);
            });
        } catch (err) {
            console.error("Ошибка отвязки из модалки:", err);
            detachModalBtn.style.display = 'flex';
        }
        return;
    }

    const completeSubtaskBtn = target.closest('.modal-complete-subtask');
    if (completeSubtaskBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
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

        if (!currentTask) return;

        const isCurrentlyDone = !!currentTask.completed_at;

        (async () => {
            if (!isCurrentlyDone) {
                const isConfirmed = await showConfirmModal(t('modals.completeSubtaskTitle'), t('modals.completeSubtaskDesc'), t('modals.btnComplete'), false);
                if (!isConfirmed) return;
            }

            const timestamp = isCurrentlyDone ? null : new Date().toISOString();

            try {
                await updateTask(taskId, { completed_at: timestamp });
                currentTask.completed_at = timestamp;

                state.columns.forEach(col => {
                    col.tasks.forEach(task => {
                        if (task.subtasks) {
                            const subIndex = task.subtasks.findIndex(s => s.id === taskId);
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

                bumpModalUpdatedDate();

                if (timestamp) {
                    completeSubtaskBtn.title = t('modals.uncompleteSubtask');
                    completeSubtaskBtn.style.color = 'var(--success-done)';
                } else {
                    completeSubtaskBtn.title = t('modals.completeSubtask');
                    completeSubtaskBtn.style.color = '';
                }

            } catch (err) {
                console.error("Ошибка изменения статуса подзадачи:", err);
                window.showToast(t('alerts.error'), 'Не удалось обновить статус', true);
            }
        })();
        return;
    }

    const calMenuDeleteBtn = target.closest('#cal-menu-delete');
    if (calMenuDeleteBtn) {
        e.stopPropagation();
        const menu = document.getElementById('cal-context-menu');
        const eventId = menu.dataset.eventId;

        if (eventId) {
            let hiddenEvents = JSON.parse(localStorage.getItem('doe_hidden_cal_events') || '[]');
            if (!hiddenEvents.includes(eventId)) {
                hiddenEvents.push(eventId);
                localStorage.setItem('doe_hidden_cal_events', JSON.stringify(hiddenEvents));
            }

            Calendar.events = Calendar.events.filter(ev => ev.event_id !== eventId);

            closeAllDropdowns();

            Calendar.render();
        }
        return;
    }

    const searchModalBtn = target.closest('.modal-search');
    if (searchModalBtn) {
        e.stopPropagation();
        if (window.openLocalSearch) window.openLocalSearch();
        return;
    }

    const notifyModalBtn = target.closest('.modal-notify');
    if (notifyModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);

        const titleNode = document.getElementById('task-modal-title') || document.querySelector('.task-modal-title-input');
        const taskTitle = (titleNode.value !== undefined ? titleNode.value : (titleNode.dataset.rawTitle || titleNode.textContent)).trim();

        openNotifyModal(taskId, taskTitle);
        return;
    }

    const priorityModalBtn = target.closest('#modal-priority-btn');
    if (priorityModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
        openPriorityModal(taskId);
        return;
    }

    const deleteModalBtn = target.closest('.modal-delete-task');
    if (deleteModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);

        (async () => {
            const isConfirmed = await showConfirmModal(
                t('menu.deleteCard'),
                currentLang === 'ru' ? 'Карточка и все её подзадачи будут удалены.' : 'Card and all its subtasks will be deleted.'
            );
            if (!isConfirmed) return;

            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) closeBtn.click();

            const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
            if (cardEl) {
                animateCardDeletion(cardEl);
            }

            for (let col of state.columns) {
                col.tasks = col.tasks.filter(t => t.id !== taskId);
                col.tasks.forEach(parentTask => {
                    if (parentTask.subtasks) {
                        const originalLength = parentTask.subtasks.length;
                        parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== taskId);
                        if (parentTask.subtasks.length !== originalLength) {
                            const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                            if (parentCardEl) {
                                updateCardAppearance(parentCardEl, parentTask, col.mode);
                            }
                        }
                    }
                });
            }

            deleteTask(taskId).then(data => {
                const deletedIds = data.deleted_ids || [];
                const snapshot = data.snapshot;
                if (snapshot) pushBoardAction({ type: 'DELETE_CARD', taskData: snapshot });

                deletedIds.forEach(id => {
                    if (id === taskId) return;
                    const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                    if (boardCard) animateCardDeletion(boardCard);

                    for (let col of state.columns) {
                        col.tasks = col.tasks.filter(t => t.id !== id);
                        col.tasks.forEach(parentTask => {
                            if (parentTask.subtasks) {
                                const originalLength = parentTask.subtasks.length;
                                parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== id);
                                if (parentTask.subtasks.length !== originalLength) {
                                    const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                                    if (parentCardEl) updateCardAppearance(parentCardEl, parentTask, col.mode);
                                }
                            }
                        });
                    }
                });
            }).catch(err => {
                console.error(err);
                refreshBoard();
            });
        })();
        return;
    }

    if (target.closest('[data-action="confirm-cancel"]')) {
        if (activeConfirmResolve) { activeConfirmResolve(false); activeConfirmResolve = null; }
        document.getElementById('confirm-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="confirm-delete"]')) {
        if (activeConfirmResolve) { activeConfirmResolve(true); activeConfirmResolve = null; }
        document.getElementById('confirm-modal').classList.remove('show');
        return;
    }

    if (target.closest('[data-action="detach-cancel"]')) {
        if (activeDetachResolve) { activeDetachResolve(null); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="detach-current"]')) {
        if (activeDetachResolve) { activeDetachResolve('current'); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="detach-all"]')) {
        if (activeDetachResolve) { activeDetachResolve('all'); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }

    const bellTrigger = target.closest('#reminders-bell-trigger');
    if (bellTrigger) {
        e.stopPropagation();
        const menu = document.getElementById('reminders-dropdown');
        const isShowing = menu.classList.contains('show');
        closeAllDropdowns();
        if (!isShowing) {
            menu.classList.add('show');
            bellTrigger.classList.add('active');
            renderRemindersDropdown();
        }
        return;
    }

    const settingsTrigger = target.closest('.settings-trigger');
    if (settingsTrigger) {
        const wrapper = settingsTrigger.closest('.settings-wrapper');
        const menu = wrapper.querySelector('.dropdown-menu');

        const isShowing = menu.classList.contains('show');
        closeAllDropdowns();
        if (!isShowing) {
            menu.classList.add('show');
            settingsTrigger.classList.add('active');
        }
        return;
    }

    const cardMenuBtn = target.closest('.card-menu-btn');
    if (cardMenuBtn) {
        e.stopPropagation();
        const globalMenu = document.getElementById('global-card-menu');
        const cardEl = cardMenuBtn.closest('.card');

        closeAllDropdowns();

        globalMenu.dataset.activeCardId = cardEl.dataset.cardId;
        globalMenu.classList.add('show');
        cardMenuBtn.classList.add('active');
        cardEl.classList.add('has-open-menu');

        const taskId = parseInt(cardEl.dataset.cardId);
        const colId = parseInt(cardEl.closest('.column').dataset.columnId);
        const col = state.columns.find(c => c.id === colId);
        const task = col?.tasks.find(t => t.id === taskId);

        if (task && !cardEl.classList.contains('is-renaming')) {
            startCardRename(cardEl, task);
        } else {
            cardEl.querySelector('.card-title-input')?.focus({ preventScroll: true });
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            });
        });

        const updatePos = () => {
            if (!globalMenu.classList.contains('show') || globalMenu.dataset.activeCardId != cardEl.dataset.cardId) return;
            const cardRect = cardEl.getBoundingClientRect();

            const margin = 12;
            const menuHeight = globalMenu.offsetHeight;

            let top = cardRect.top;

            const maxTop = window.innerHeight - menuHeight - margin;
            if (top > maxTop) top = maxTop;

            if (top < margin) top = margin;

            globalMenu.style.top = `${top}px`;
            globalMenu.style.left = `${cardRect.right + 12}px`;
            requestAnimationFrame(updatePos);
        };
        updatePos();

        return;
    }

    const menuItem = target.closest('.menu-item');
    const actionElement = target.closest('[data-action]');
    const action = actionElement?.dataset.action;

    if (menuItem && action) {
        const globalCardMenu = document.getElementById('global-card-menu');
        const isCardMenu = menuItem.closest('#global-card-menu');
        const columnEl = menuItem.closest('.column');

        if (isCardMenu) {
            const activeCardId = globalCardMenu.dataset.activeCardId;
            const cardEl = document.querySelector(`.card[data-card-id="${activeCardId}"]`);
            if (cardEl) {
                const taskId = parseInt(activeCardId);
                const colEl = cardEl.closest('.column');

                if (action === 'open-card') {
                    const taskId = parseInt(activeCardId);

                    loadTaskIntoModal(taskId, true);

                    document.getElementById('task-modal').classList.add('show');
                }
                else if (action === 'delete-card') {
                    animateCardDeletion(cardEl);

                    for (let col of state.columns) {
                        col.tasks = col.tasks.filter(t => t.id !== taskId);

                        col.tasks.forEach(parentTask => {
                            if (parentTask.subtasks) {
                                const originalLength = parentTask.subtasks.length;
                                parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== taskId);

                                if (parentTask.subtasks.length !== originalLength) {
                                    const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                                    if (parentCardEl) {
                                        updateCardAppearance(parentCardEl, parentTask, col.mode);
                                    }
                                    const modal = document.getElementById('task-modal');
                                    if (modal && modal.classList.contains('show') && parseInt(modal.dataset.taskId) === parentTask.id) {
                                        const countEl = document.getElementById('subtasks-count');
                                        if (countEl) countEl.textContent = parentTask.subtasks.length;
                                    }
                                }
                            }
                        });
                    }

                    deleteTask(taskId).then(data => {
                        const deletedIds = data.deleted_ids || [];
                        const snapshot = data.snapshot;
                        if (snapshot) pushBoardAction({ type: 'DELETE_CARD', taskData: snapshot });

                        deletedIds.forEach(id => {
                            if (id === taskId) return;
                            const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                            if (boardCard) {
                                animateCardDeletion(boardCard);
                            }

                            for (let col of state.columns) {
                                col.tasks = col.tasks.filter(t => t.id !== id);

                                col.tasks.forEach(parentTask => {
                                    if (parentTask.subtasks) {
                                        const originalLength = parentTask.subtasks.length;
                                        parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== id);
                                        if (parentTask.subtasks.length !== originalLength) {
                                            const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                                            if (parentCardEl) updateCardAppearance(parentCardEl, parentTask, col.mode);
                                        }
                                    }
                                });
                            }
                        });

                    }).catch(err => {
                        console.error(err);
                        refreshBoard();
                    });
                }
                else if (action === 'clear-card-timer') {
                    clearTaskTimerAPI(taskId).then(updatedTask => {
                        const col = state.columns.find(c => c.id === parseInt(colEl.dataset.columnId));
                        if (col) {
                            const idx = col.tasks.findIndex(t => t.id === taskId);
                            if (idx !== -1) {
                                updatedTask.subtasks = col.tasks[idx].subtasks;
                                col.tasks[idx] = updatedTask;
                            }
                        }
                        updateCardAppearance(cardEl, updatedTask, col.mode);
                    });
                }
                else if (action === 'copy-card-link') {
                    const titleNode = cardEl.querySelector('.card-title') || cardEl.querySelector('.card-title-input');
                    const taskTitle = (titleNode.value !== undefined ? titleNode.value : titleNode.textContent).trim();
                    const link = `[${taskTitle}](doe://task/${taskId})`;

                    try {
                        if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(link);
                        } else {
                            const textArea = document.createElement("textarea");
                            textArea.value = link;
                            textArea.style.position = "fixed";
                            textArea.style.opacity = "0";
                            document.body.appendChild(textArea);
                            textArea.focus();
                            textArea.select();
                            document.execCommand('copy');
                            textArea.remove();
                        }

                        closeAllDropdowns();
                        return;
                    } catch (err) {
                        console.error("Failed to copy link: ", err);
                    }
                }
                else if (action === 'move-card-menu') {
                    openMoveTaskModal(taskId);
                }
                else if (action === 'notify-card') {
                    const task = state.columns.find(c => c.id === parseInt(colEl.dataset.columnId))?.tasks.find(t => t.id === taskId);
                    const taskTitle = task ? task.title : ((cardEl.querySelector('.card-title-input')?.value || cardEl.querySelector('.card-title')?.textContent).trim());

                    openNotifyModal(taskId, taskTitle);
                }
                else if (action === 'set-priority') {
                    openPriorityModal(taskId);
                }
            }
            closeAllDropdowns();
            return;
        }

        if (columnEl) {
            handleColumnMenu(action, columnEl, menuItem);
            closeAllDropdowns();
            return;
        }
    }

    if (action) {
        if (action === 'switch-workspace') {
            closeAllDropdowns();
            showVaultScreen();
        }
        else if (action === 'theme') {
            const currentTheme = document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light';
            document.querySelectorAll('#theme-list .lang-item').forEach(el => {
                el.classList.toggle('active', el.dataset.themeValue === currentTheme);
            });
            document.getElementById('theme-modal').classList.add('show');
            closeAllDropdowns();
        }
        else if (action === 'change-lang') {
            document.getElementById('lang-modal').classList.add('show');
            closeAllDropdowns();
        }
        else if (action === 'font-settings') {
            fetchSettings().then(data => {
                const uiFontInput = document.getElementById('ui-font-input');
                if (uiFontInput) {
                    uiFontInput.value = data.ui_font ? data.ui_font : `Inter (${t('modals.fontSystemDefault')})`;
                }

                const pathDisplay = document.getElementById('font-path-display');
                if (pathDisplay) {
                    if (data.custom_font) {
                        pathDisplay.textContent = data.custom_font.split('/').pop();
                    } else {
                        pathDisplay.textContent = t('modals.fontSelectCustom');
                    }
                }

                fetch(`${API_BASE}/system/fonts/available`).then(res => {
                    if (res.ok) return res.json();
                    return [];
                }).then(fonts => {
                    window.cachedSystemFonts = ["Inter", ...fonts];
                    if (uiFontInput) {
                        renderFontList(uiFontInput.value.trim());
                    }
                }).catch(err => {
                    console.error("Failed to load system fonts:", err);
                });

                document.getElementById('font-settings-modal').classList.add('show');
            }).catch(console.error);
            closeAllDropdowns();
        }
        else if (action === 'attachments-settings') {
            fetchSettings().then(data => {
                const pathBox = document.getElementById('att-path-display');
                const itemLocal = document.getElementById('setting-item-local');
                const itemExternal = document.getElementById('setting-item-external');

                if (data.global_attachments_path) {
                    pathBox.textContent = data.global_attachments_path;
                    itemLocal.classList.remove('active');
                    itemExternal.classList.add('active');
                } else {
                    pathBox.textContent = t('modals.attSelectBtn');
                    itemLocal.classList.add('active');
                    itemExternal.classList.remove('active');
                }
                document.getElementById('att-settings-modal').classList.add('show');
            }).catch(console.error);
            closeAllDropdowns();
        }
        else if (action === 'security-settings') {
            window.openSecuritySettings();
            closeAllDropdowns();
        }
        else if (action === 'extensions-settings') {
            fetchSettings().then(data => {
                window.applyExtensionsUI(data.extensions);
                document.getElementById('extensions-modal').classList.add('show');
            }).catch(console.error);
            closeAllDropdowns();
        }
        else if (action === 'priority-settings') {
            fetchSettings().then(data => {
                const ps = data.priority_settings || window.prioritySettings;

                document.getElementById('cfg-prio-show-always').checked = !!ps.show_always;

                document.getElementById('cfg-prio-e-none').value = ps.e_none || "❔";
                document.getElementById('cfg-prio-c-none').value = ps.c_none || "#828A80";

                document.getElementById('cfg-prio-t-low').value = ps.t_low;
                document.getElementById('cfg-prio-t-mid').value = ps.t_mid;

                document.getElementById('cfg-prio-e-low').value = ps.e_low;
                document.getElementById('cfg-prio-e-mid').value = ps.e_mid;
                document.getElementById('cfg-prio-e-high').value = ps.e_high;

                document.getElementById('cfg-prio-c-low').value = ps.c_low;
                document.getElementById('cfg-prio-c-mid').value = ps.c_mid;
                document.getElementById('cfg-prio-c-high').value = ps.c_high;

                document.getElementById('priority-settings-modal').classList.add('show');

                const defEmojis = { low: "😞", mid: "😐", high: "🤩", none: "?" };
                ['low', 'mid', 'high', 'none'].forEach(k => {
                    const inputEl = document.getElementById(`cfg-prio-e-${k}`);
                    if (inputEl) {
                        inputEl.onblur = () => {
                            if (!inputEl.value.trim()) inputEl.value = defEmojis[k];
                        };
                    }
                });

                const resetBtn = document.getElementById('btn-reset-prio-cfg');
                if (resetBtn) {
                    const newResetBtn = resetBtn.cloneNode(true);
                    resetBtn.replaceWith(newResetBtn);
                    newResetBtn.onclick = () => {
                        document.getElementById('cfg-prio-show-always').checked = false;
                        document.getElementById('cfg-prio-t-low').value = 40;
                        document.getElementById('cfg-prio-t-mid').value = 70;
                        document.getElementById('cfg-prio-e-low').value = "😞";
                        document.getElementById('cfg-prio-e-mid').value = "😐";
                        document.getElementById('cfg-prio-e-high').value = "🤩";
                        document.getElementById('cfg-prio-e-none').value = "?";
                        document.getElementById('cfg-prio-c-low').value = "#D35446";
                        document.getElementById('cfg-prio-c-mid').value = "#B3863A";
                        document.getElementById('cfg-prio-c-high').value = "#89A085";
                        document.getElementById('cfg-prio-c-none').value = "#7C5CB7";
                    };
                }

                const saveBtn = document.getElementById('btn-save-prio-cfg');
                const newSaveBtn = saveBtn.cloneNode(true);
                saveBtn.replaceWith(newSaveBtn);

                newSaveBtn.onclick = async () => {
                    const newPs = {
                        show_always: document.getElementById('cfg-prio-show-always').checked,
                        t_low: parseInt(document.getElementById('cfg-prio-t-low').value) || 40,
                        t_mid: parseInt(document.getElementById('cfg-prio-t-mid').value) || 70,
                        e_low: document.getElementById('cfg-prio-e-low').value || "😞",
                        e_mid: document.getElementById('cfg-prio-e-mid').value || "😐",
                        e_high: document.getElementById('cfg-prio-e-high').value || "🤩",
                        c_low: document.getElementById('cfg-prio-c-low').value || "#D35446",
                        c_mid: document.getElementById('cfg-prio-c-mid').value || "#B3863A",
                        c_high: document.getElementById('cfg-prio-c-high').value || "#89A085",
                        e_none: document.getElementById('cfg-prio-e-none').value || "❔",
                        c_none: document.getElementById('cfg-prio-c-none').value || "#828A80"
                    };

                    try {
                        await fetch(`${API_BASE}/system/settings`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ priority_settings: newPs })
                        });
                        applyPriorityStyles(newPs);
                        document.getElementById('priority-settings-modal').classList.remove('show');
                        refreshBoard();
                    } catch (e) { console.error("Error saving priority settings", e); }
                };
            }).catch(console.error);
            closeAllDropdowns();
        }
        else if (action === 'about') {
            document.getElementById('about-modal').classList.add('show');
            closeAllDropdowns();
        }
    }

    const themeItem = target.closest('#theme-list .lang-item');
    if (themeItem) {
        const theme = themeItem.dataset.themeValue;

        document.getElementById('theme-modal').classList.remove('show');

        setTimeout(() => {
            applyTheme(theme, true);
        }, 250);

        return;
    }

    const langItem = target.closest('#lang-list .lang-item');
    if (langItem) {
        const lang = langItem.dataset.value;
        applyLanguage(lang, true);
        setTimeout(() => document.getElementById('lang-modal').classList.remove('show'), 150);
        return;
    }

    const modalCloseBtn = target.closest('.modal-close');
    const isOverlayClick = target.classList.contains('modal-overlay');

    if (modalCloseBtn || isOverlayClick) {
        const modalToClose = modalCloseBtn ? modalCloseBtn.closest('.modal-overlay') : target;

        if (!modalToClose) return;

        const nonDismissibleModals = ['task-modal', 'font-settings-modal', 'notify-modal', 'priority-modal', 'priority-settings-modal', 'move-modal'];
        if (nonDismissibleModals.includes(modalToClose.id) && isOverlayClick) {
            return;
        }

        if (activeConfirmResolve && modalToClose.id === 'confirm-modal') {
            activeConfirmResolve(false);
            activeConfirmResolve = null;
        }
        if (activeDetachResolve && modalToClose.id === 'detach-modal') {
            activeDetachResolve(null);
            activeDetachResolve = null;
        }

        if (modalToClose.id === 'task-modal') {
            if (window.closeLocalSearch) window.closeLocalSearch();

            document.getElementById('modal-tools-wrapper')?.classList.remove('expanded');
            triggerGarbageCollector();

            const taskId = parseInt(modalToClose.dataset.taskId);
            const renderDiv = document.getElementById('task-desc-render');
            const detailBody = document.querySelector('.task-detail-body');
            for (let col of state.columns) {
                let t = col.tasks.find(t => t.id === taskId);
                if (t) {
                    if (renderDiv.style.display !== 'none') {
                        t._readScrollTop = renderDiv.scrollTop;
                        if (detailBody) t._modalScrollTop = detailBody.scrollTop;
                    }
                    break;
                }
            }

            const card = modalToClose.querySelector('.task-detail-card');
            const maximizeBtn = modalToClose.querySelector('.modal-maximize');

            if (card) {
                if(maximizeBtn) {
                    maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 6 18 6 18 10"></polyline><polyline points="10 18 6 18 6 14"></polyline><line x1="18" y1="6" x2="13" y2="11"></line><line x1="6" y1="18" x2="11" y2="13"></line></svg>`;
                }

                setTimeout(() => {
                    card.classList.remove('maximized', 'is-restoring');
                    card.style.transition = 'none';
                    card.style.position = '';
                    card.style.left = '';
                    card.style.top = '';
                    card.style.width = '';
                    card.style.height = '';
                    card.style.transform = '';
                    card.style.margin = '';

                    void card.offsetWidth;
                    card.style.transition = '';

                    if (renderDiv) renderDiv.innerHTML = '';

                    const subtasksList = document.getElementById('subtasks-list');
                    if (subtasksList) subtasksList.innerHTML = '';

                    const attachmentsList = document.getElementById('attachments-list');
                    if (attachmentsList) attachmentsList.innerHTML = '';

                    const breadcrumbs = document.getElementById('task-breadcrumbs');
                    if (breadcrumbs) breadcrumbs.innerHTML = '';
                }, 300);
            }
        }

        modalToClose.classList.remove('show');
    }

    const toolsTrigger = target.closest('.modal-tools-trigger');
    const toolsWrapper = document.getElementById('modal-tools-wrapper');
    if (toolsTrigger) {
        e.stopPropagation();
        toolsWrapper.classList.toggle('expanded');
        return;
    }
    if (toolsWrapper && toolsWrapper.classList.contains('expanded') && !target.closest('.modal-tools-wrapper')) {
        toolsWrapper.classList.remove('expanded');
    }

    if (
        !target.closest('.dropdown-menu') &&
        !target.closest('.menu-btn') &&
        !target.closest('.card-menu-btn') &&
        !target.closest('.card.has-open-menu') &&
        !target.closest('#ui-font-wrapper')
    ) {
        closeAllDropdowns();
    }
});

