function startDrag(element, type, e) {
    closeAllDropdowns();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    isDragging = true;
    dragType = type;
    draggedElement = element;

    if (dragType === 'card') {
        const taskId = parseInt(element.dataset.cardId);
        for (const col of state.columns) {
            const task = col.tasks.find(t => t.id === taskId);
            if (task) {
                draggedTaskObject = task;
                break;
            }
        }
    } else {
        draggedTaskObject = null;
    }

    originalWorkspaceId = state.activeWorkspaceId;
    isHoveringTabs = false;
    currentDragScale = 1;
    pendingSwitchTabId = null;
    clearTimeout(tabSwitchTimeout);

    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMouseX = mouseX;

    if (dragType === 'card') {
        draggedElement.dataset.sourceColumnId = draggedElement.closest('.column').dataset.columnId;
    }

    document.body.style.userSelect = 'none';
    document.body.classList.add(`is-dragging-${dragType}`);

    const rect = draggedElement.getBoundingClientRect();
    dragCloneWidth = rect.width;
    dragCloneHeight = rect.height;

    originalOffsetX = e.clientX - rect.left;
    originalOffsetY = e.clientY - rect.top;
    currentOriginX = originalOffsetX;
    currentOriginY = originalOffsetY;

    const sourceFooter = draggedElement.querySelector('.card-footer');
    if (sourceFooter) {
        const computedFooterHeight = window.getComputedStyle(sourceFooter).height;
        sourceFooter.style.maxHeight = computedFooterHeight;
    }

    dragClone = draggedElement.cloneNode(true);
    dragClone.classList.remove('is-ghost', 'is-calculating', 'is-expanding');
    dragClone.style.position = 'fixed';
    dragClone.style.width = `${rect.width}px`;
    dragClone.style.height = `${rect.height}px`;
    dragClone.style.top = '0';
    dragClone.style.left = '0';
    dragClone.style.margin = '0';
    dragClone.classList.add(`${dragType}-drag-clone`);

    dragClone.style.transformOrigin = '0 0';
    dragClone.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) scale(1) translate3d(${-currentOriginX}px, ${-currentOriginY}px, 0)`;

    document.body.appendChild(dragClone);
    draggedElement.classList.add('is-ghost');

    renderPhysics();
}

function autoExpandColumn(columnEl) {
    if (!columnEl.classList.contains('collapsed')) return;
    const columnId = parseInt(columnEl.dataset.columnId);
    const column = state.columns.find(c => c.id === columnId);
    if (!column) return;

    autoExpandedColumnId = columnId;
    columnEl.classList.remove('collapsed');
    columnEl.classList.add('auto-expanded-temp');

    columnEl.style.width = column.width ? column.width + 'px' : '';

    const titleEl = columnEl.querySelector('.column-title');
    if (titleEl) {
        titleEl.textContent = titleEl.dataset.fullTitle || titleEl.textContent;
        titleEl.dataset.clamped = "false";
        requestAnimationFrame(() => clampSingleTitle(titleEl));
    }
}

function revertAutoExpandedColumn() {
    if (autoExpandedColumnId === null) return;
    const columnEl = document.querySelector(`.column.auto-expanded-temp[data-column-id="${autoExpandedColumnId}"]`);
    if (columnEl) {
        columnEl.classList.add('collapsed');
        columnEl.classList.remove('auto-expanded-temp');
        adjustCollapsedColumnWidths();
    }
    autoExpandedColumnId = null;
}

function performHitTest() {
    const elemUnderMouse = document.elementFromPoint(mouseX, mouseY);
    if (!elemUnderMouse) return;

    const tabsWrapper = elemUnderMouse.closest('#tabs-wrapper');
    if (tabsWrapper && (dragType === 'card' || dragType === 'column')) {
        isHoveringTabs = true;
        const hoverTab = elemUnderMouse.closest('.board-tab:not(.active)');

        if (hoverTab) {
            const tabId = parseInt(hoverTab.dataset.workspaceId);
            if (pendingSwitchTabId !== tabId) {
                clearTimeout(tabSwitchTimeout);
                pendingSwitchTabId = tabId;

                if (window.pywebview && window.pywebview.api && window.pywebview.api.trigger_haptic) {
                    window.pywebview.api.trigger_haptic();
                }

                tabSwitchTimeout = setTimeout(async () => {
                    await switchToWorkspaceDuringDrag(tabId);
                }, 600);
            }
        } else {
            clearTimeout(tabSwitchTimeout);
            pendingSwitchTabId = null;
        }
        return;
    } else {
        isHoveringTabs = false;
        clearTimeout(tabSwitchTimeout);
        pendingSwitchTabId = null;
        document.querySelectorAll('.board-tab.is-blinking').forEach(el => el.classList.remove('is-blinking'));
    }

    if (dragType === 'tab') {
        const hoverTab = elemUnderMouse.closest('.board-tab:not(.is-ghost)');
        if (hoverTab && hoverTab !== draggedElement && hoverTab.closest('#tabs-container')) {
            const rect = hoverTab.getBoundingClientRect();
            if (mouseX > rect.left + rect.width / 2) {
                if (hoverTab.nextElementSibling !== draggedElement) hoverTab.after(draggedElement);
            } else {
                if (hoverTab.previousElementSibling !== draggedElement) hoverTab.before(draggedElement);
            }
        }
    }
    else if (dragType === 'column') {
        const hoverCol = elemUnderMouse.closest('.column:not(.is-ghost)');
        const board = document.getElementById('board');
        const boardContainer = elemUnderMouse.closest('.board-container');

        if (hoverCol && hoverCol !== draggedElement) {
            const rect = hoverCol.getBoundingClientRect();
            if (mouseX > rect.left + rect.width / 2) {
                if (hoverCol.nextElementSibling !== draggedElement) hoverCol.after(draggedElement);
            } else {
                if (hoverCol.previousElementSibling !== draggedElement) hoverCol.before(draggedElement);
            }
        }
        else if (boardContainer && board && !board.contains(draggedElement)) {
            const addBtn = board.querySelector('.new-column-btn');
            if (addBtn) {
                board.insertBefore(draggedElement, addBtn);
            } else {
                board.appendChild(draggedElement);
            }
        }
    }
    else if (dragType === 'card') {
        const hoverCard = elemUnderMouse.closest('.card:not(.is-ghost)');
        const hoverCol = elemUnderMouse.closest('.column:not(.is-ghost)');

        if (hoverCol) {
            const colId = parseInt(hoverCol.dataset.columnId);

            if (hoverCol.classList.contains('collapsed') && !hoverCol.classList.contains('auto-expanded-temp')) {
                if (autoExpandTimeoutColumnId !== colId) {
                    clearTimeout(autoExpandTimeout);
                    autoExpandTimeoutColumnId = colId;
                    autoExpandTimeout = setTimeout(() => {
                        autoExpandColumn(hoverCol);
                    }, 400);
                }
            } else if (colId === autoExpandedColumnId) {
                clearTimeout(autoExpandTimeout);
                autoExpandTimeoutColumnId = null;
            } else {
                if (autoExpandedColumnId && colId !== autoExpandedColumnId) {
                    revertAutoExpandedColumn();
                }
                clearTimeout(autoExpandTimeout);
                autoExpandTimeoutColumnId = null;
            }
        } else {
            if (autoExpandedColumnId) revertAutoExpandedColumn();
            clearTimeout(autoExpandTimeout);
            autoExpandTimeoutColumnId = null;
        }

        if (hoverCard && hoverCard !== draggedElement) {
            const rect = hoverCard.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverCard.nextElementSibling !== draggedElement) hoverCard.after(draggedElement);
            } else {
                if (hoverCard.previousElementSibling !== draggedElement) hoverCard.before(draggedElement);
            }
        }
        else {
            const hoverCol2 = elemUnderMouse.closest('.column:not(.is-ghost)');
            if (hoverCol2) {
                const cardList = hoverCol2.querySelector('.card-list');
                if (cardList && !cardList.contains(draggedElement)) {
                    const firstCard = cardList.firstElementChild;
                    if (firstCard && mouseY < firstCard.getBoundingClientRect().top) {
                        cardList.prepend(draggedElement);
                    } else {
                        cardList.appendChild(draggedElement);
                    }
                }
            }
        }
    }
    else if (dragType === 'subtask') {
        const hoverSub = elemUnderMouse.closest('.subtask-item:not(.is-ghost)');
        if (hoverSub && hoverSub !== draggedElement && hoverSub.closest('#subtasks-list')) {
            const rect = hoverSub.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverSub.nextElementSibling !== draggedElement) hoverSub.after(draggedElement);
            } else {
                if (hoverSub.previousElementSibling !== draggedElement) hoverSub.before(draggedElement);
            }
        }
    }
    else if (dragType === 'attachment') {
        const hoverAtt = elemUnderMouse.closest('.attachment-item:not(.is-ghost)');
        if (hoverAtt && hoverAtt !== draggedElement && hoverAtt.closest('#attachments-list')) {
            const rect = hoverAtt.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverAtt.nextElementSibling !== draggedElement) hoverAtt.after(draggedElement);
            } else {
                if (hoverAtt.previousElementSibling !== draggedElement) hoverAtt.before(draggedElement);
            }
        }
    }
    else if (dragType === 'vault-history') {
        const hoverHist = elemUnderMouse.closest('.vault-history-item:not(.is-ghost)');
        if (hoverHist && hoverHist !== draggedElement && hoverHist.closest('#vault-history-list')) {
            const rect = hoverHist.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverHist.nextElementSibling !== draggedElement) hoverHist.after(draggedElement);
            } else {
                if (hoverHist.previousElementSibling !== draggedElement) hoverHist.before(draggedElement);
            }
        }
    }
}

async function switchToWorkspaceDuringDrag(wsId) {
    document.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.querySelector(`.board-tab[data-workspace-id="${wsId}"]`);
    if (targetTab) {
        targetTab.classList.add('active');
        targetTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    if (window.pywebview && window.pywebview.api && window.pywebview.api.trigger_haptic) {
        window.pywebview.api.trigger_haptic();
    }

    state.activeWorkspaceId = wsId;
    updateSettings({ active_workspace_id: wsId }).catch(() => {});

    try {
        const columns = await fetchColumns(wsId);
        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
        renderBoard();
    } catch (err) {
        console.error('Ошибка смены вкладки при драге:', err);
    }
}

function handleEdgePanning() {
    if (!isDragging) return false;

    let containerX = null;
    let containerY = null;

    let scrollZoneX = 140;
    let maxSpeedX = 45;
    let scrollZoneY = 80;
    let maxSpeedY = 30;

    if (isHoveringTabs && (dragType === 'card' || dragType === 'column')) {
        containerX = document.getElementById('tabs-container');
        scrollZoneX = 60;
        maxSpeedX = 20;
    }
    else if (dragType === 'tab') {
        containerX = document.getElementById('tabs-container');
        scrollZoneX = 60;
        maxSpeedX = 20;
    }
    else if (dragType === 'column') {
        containerX = document.querySelector('.board-container');
    }
    else if (dragType === 'card') {
        containerX = document.querySelector('.board-container');

        const hoverCol = document.elementFromPoint(mouseX, mouseY)?.closest('.column:not(.is-ghost)');
        if (hoverCol) {
            containerY = hoverCol.querySelector('.card-list');
        }
    }
    else if (dragType === 'vault-history') {
        containerY = document.getElementById('vault-history-list');
    } else if (dragType === 'subtask' || dragType === 'attachment') {
        containerY = document.querySelector('.task-detail-body');
    }

    let targetSpeedX = 0;
    let targetSpeedY = 0;

    if (containerX) {
        const rectX = containerX.getBoundingClientRect();
        if (mouseX > rectX.right - scrollZoneX) {
            const intensity = Math.max(0, Math.min((mouseX - (rectX.right - scrollZoneX)) / scrollZoneX, 1));
            targetSpeedX = Math.pow(intensity, 3) * maxSpeedX;
        } else if (mouseX < rectX.left + scrollZoneX) {
            const intensity = Math.max(0, Math.min((rectX.left + scrollZoneX - mouseX) / scrollZoneX, 1));
            targetSpeedX = -(Math.pow(intensity, 3) * maxSpeedX);
        }
    }

    if (containerY) {
        const rectY = containerY.getBoundingClientRect();
        if (mouseY > rectY.bottom - scrollZoneY) {
            const intensity = Math.max(0, Math.min((mouseY - (rectY.bottom - scrollZoneY)) / scrollZoneY, 1));
            targetSpeedY = Math.pow(intensity, 3) * maxSpeedY;
        } else if (mouseY < rectY.top + scrollZoneY) {
            const intensity = Math.max(0, Math.min((rectY.top + scrollZoneY - mouseY) / scrollZoneY, 1));
            targetSpeedY = -(Math.pow(intensity, 3) * maxSpeedY);
        }
    }

    currentScrollSpeedX += (targetSpeedX - currentScrollSpeedX) * 0.15;
    currentScrollSpeedY += (targetSpeedY - currentScrollSpeedY) * 0.15;

    let didScroll = false;

    if (containerX && Math.abs(currentScrollSpeedX) > 0.1) {
        scrollAccumX += currentScrollSpeedX;
        const scrollStepX = Math.trunc(scrollAccumX);
        if (scrollStepX !== 0) {
            const prevScroll = containerX.scrollLeft;
            containerX.scrollLeft += scrollStepX;
            scrollAccumX -= scrollStepX;

            if (containerX.scrollLeft !== prevScroll) {
                didScroll = true;
                if (containerX.id === 'tabs-container' && window.updateTabsScrollbar) {
                    window.updateTabsScrollbar();
                }
            } else {
                currentScrollSpeedX = 0;
                scrollAccumX = 0;
            }
        }
    } else {
        scrollAccumX = 0;
        currentScrollSpeedX = 0;
    }

    if (containerY && Math.abs(currentScrollSpeedY) > 0.1) {
        scrollAccumY += currentScrollSpeedY;
        const scrollStepY = Math.trunc(scrollAccumY);
        if (scrollStepY !== 0) {
            const prevScroll = containerY.scrollTop;
            containerY.scrollTop += scrollStepY;
            scrollAccumY -= scrollStepY;

            if (containerY.scrollTop !== prevScroll) {
                didScroll = true;
            } else {
                currentScrollSpeedY = 0;
                scrollAccumY = 0;
            }
        }
    } else {
        scrollAccumY = 0;
        currentScrollSpeedY = 0;
    }

    return didScroll;
}

function renderPhysics() {
    if (!isDragging || !dragClone) return;

    const didScroll = handleEdgePanning();

    const deltaX = mouseX - lastMouseX;
    lastMouseX = mouseX;

    const maxRotation = (dragType === 'tab' || dragType === 'column') ? 3 : (dragType === 'vault-history' ? 5 : 12);
    targetRotation = Math.max(-maxRotation, Math.min(maxRotation, deltaX * 0.4));
    currentRotation += (targetRotation - currentRotation) * 0.15;

    let targetScale = (dragType === 'column' || dragType === 'tab') ? 1.02 : 1.04;

    let targetOriginX = originalOffsetX;
    let targetOriginY = originalOffsetY;

    if (isHoveringTabs) {
        targetScale = 0.20;
        dragClone.style.opacity = '0.7';
        targetOriginX = dragCloneWidth;
        targetOriginY = 0;
    } else {
        dragClone.style.opacity = '1';
    }

    currentDragScale += (targetScale - currentDragScale) * 0.15;
    currentOriginX += (targetOriginX - currentOriginX) * 0.15;
    currentOriginY += (targetOriginY - currentOriginY) * 0.15;

    dragClone.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) rotate(${currentRotation}deg) scale(${currentDragScale}) translate3d(${-currentOriginX}px, ${-currentOriginY}px, 0)`;

    const now = performance.now();
    if (didScroll) {
        if (now - lastHitTestTime > 50) {
            performHitTest();
            lastHitTestTime = now;
        }
        wasScrolling = true;
    } else {
        if (wasScrolling) {
            performHitTest();
            wasScrolling = false;
        }
        if (isHoveringTabs) {
            performHitTest();
        }
    }

    rafId = requestAnimationFrame(renderPhysics);
}

async function endDrag() {
    isDragging = false;
    cancelAnimationFrame(rafId);
    clearTimeout(tabSwitchTimeout);

    clearTimeout(autoExpandTimeout);
    autoExpandTimeoutColumnId = null;

    lastHitTestTime = 0;
    wasScrolling = false;
    scrollAccumX = 0;
    scrollAccumY = 0;
    currentScrollSpeedX = 0;
    currentScrollSpeedY = 0;

    document.body.classList.remove(`is-dragging-${dragType}`);
    document.body.style.userSelect = '';

    let isInvalidDrop = false;
    if (dragType === 'card' && !draggedElement.closest('.column')) isInvalidDrop = true;
    if (dragType === 'column' && !draggedElement.closest('.board')) isInvalidDrop = true;

    if (isInvalidDrop && (dragType === 'card' || dragType === 'column')) {
        (async () => {
            if (state.activeWorkspaceId !== originalWorkspaceId) {
                state.activeWorkspaceId = originalWorkspaceId;
                document.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
                const tTab = document.querySelector(`.board-tab[data-workspace-id="${originalWorkspaceId}"]`);
                if (tTab) {
                    tTab.classList.add('active');
                    tTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
                updateSettings({ active_workspace_id: originalWorkspaceId }).catch(() => {});

                try {
                    const columns = await fetchColumns(originalWorkspaceId);
                    state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
                    renderBoard();

                    if (dragType === 'card') {
                        draggedElement = document.querySelector(`.card[data-card-id="${draggedElement.dataset.cardId}"]`);
                    } if (dragType === 'column') {
                        const currentColumns = Array.from(document.querySelectorAll('#board .column:not(.column-drag-clone)'));
                        const orderedIds = currentColumns.map(col => parseInt(col.dataset.columnId));
                        const colId = parseInt(draggedElement.dataset.columnId);

                        if (state.activeWorkspaceId !== originalWorkspaceId) {
                            try {
                                await updateColumn(colId, { workspace_id: state.activeWorkspaceId });
                            }
                            catch (e) { console.error("Не удалось сменить вкладку для колонки:", e); }
                        }

                        state.columns.forEach(c => {
                            const pos = orderedIds.indexOf(c.id);
                            if (pos !== -1) c.position = pos;
                        });
                        state.columns.sort((a, b) => a.position - b.position);

                        try { await saveColumnsOrder(orderedIds); } catch (e) {}
                    }
                    if (draggedElement) draggedElement.classList.add('is-ghost');
                } catch (e) {}
            }

            let targetRect = null;
            if (draggedElement && document.body.contains(draggedElement)) {
                targetRect = draggedElement.getBoundingClientRect();
            }

            if (dragClone) {
                dragClone.style.transition = 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
                if (targetRect) {
                    dragClone.style.transform = `translate3d(${targetRect.left}px, ${targetRect.top}px, 0) rotate(0deg) scale(1) translate3d(0px, 0px, 0)`;
                    dragClone.style.opacity = '1';
                } else {
                    dragClone.style.transform = `translate3d(${mouseX}px, -100px, 0) scale(0) translate3d(0px, 0px, 0)`;
                    dragClone.style.opacity = '0';
                }
            }

            setTimeout(() => {
                if (dragClone) dragClone.remove();
                dragClone = null;
                if (draggedElement) draggedElement.classList.remove('is-ghost');
                dragType = null;
                draggedElement = null;

                revertAutoExpandedColumn();
            }, 350);
        })();
        return;
    }

    if (dragType === 'subtask') {
        const currentSubtasks = Array.from(document.querySelectorAll('#subtasks-list .subtask-item:not(.subtask-drag-clone)'));
        const orderedIds = currentSubtasks.map(s => parseInt(s.dataset.subtaskId));
        try { await saveTasksOrder(orderedIds); } catch (e) { console.error(e); }
    }

    if (dragType === 'attachment') {
        const currentAttachments = Array.from(document.querySelectorAll('#attachments-list .attachment-item:not(.attachment-drag-clone)'));
        const orderedPaths = currentAttachments.map(el => el.dataset.path);
        const taskId = document.getElementById('task-modal').dataset.taskId;
        try {
            await updateTask(taskId, { attachments_order: orderedPaths });
            for (let col of state.columns) {
                let task = col.tasks.find(t => t.id == parseInt(taskId));
                if (task) { task.attachments_order = orderedPaths; break; }
            }
        } catch (e) { console.error(e); }
    }

    if (dragType === 'vault-history') {
        const currentItems = Array.from(document.querySelectorAll('#vault-history-list .vault-history-item:not(.vault-history-drag-clone)'));
        const orderedPaths = currentItems.map(el => el.dataset.path);
        try {
            await fetch(`${API_BASE}/system/vault/history/reorder`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ordered_paths: orderedPaths })
            });
        } catch (e) { console.error(e); }
    }

    if (dragClone) {
        dragClone.remove();
        dragClone = null;
    }

    revertAutoExpandedColumn();

    if (draggedElement) {
        if (dragType === 'card') {
            const newColumnEl = draggedElement.closest('.column');
            if (newColumnEl) {
                const newColumnId = parseInt(newColumnEl.dataset.columnId);
                const sourceColumnId = parseInt(draggedElement.dataset.sourceColumnId);
                const taskId = parseInt(draggedElement.dataset.cardId);
                const targetCol = state.columns.find(c => c.id === newColumnId);
                const sourceCol = state.columns.find(c => c.id === sourceColumnId);

                if (targetCol && newColumnId !== sourceColumnId) {
                    let optimisticTask = null;
                    if (sourceCol) {
                        const foundTask = sourceCol.tasks.find(t => t.id === taskId);
                        if (foundTask) optimisticTask = JSON.parse(JSON.stringify(foundTask));
                    }
                    if (!optimisticTask) optimisticTask = { id: taskId, title: draggedElement.querySelector('.card-title').textContent };

                    if (targetCol.mode === 'track_time') {
                        optimisticTask.completed_at = null;
                        optimisticTask.active_timer = { start_time: new Date().toISOString() };
                    } else if (targetCol.mode === 'completion') {
                        optimisticTask.completed_at = new Date().toISOString();
                        optimisticTask.active_timer = null;
                        }
                    } else {
                        optimisticTask.completed_at = null;
                        optimisticTask.active_timer = null;
                    }
                    updateCardAppearance(draggedElement, optimisticTask, targetCol.mode);
                }
            }
        }

        draggedElement.style.transition = 'none';
        draggedElement.classList.remove('is-ghost');
        void draggedElement.offsetWidth;
        draggedElement.style.transition = '';

        const droppedEl = draggedElement;
        const rect = droppedEl.getBoundingClientRect();

        if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
            droppedEl.classList.add('is-dropped-hover');
            const cleanupHover = () => {
                droppedEl.classList.remove('is-dropped-hover');
                document.removeEventListener('pointermove', cleanupHover);
            };
            setTimeout(() => document.addEventListener('pointermove', cleanupHover), 50);
        }

        if (dragType === 'tab') {
            const currentTabs = Array.from(document.querySelectorAll('#tabs-container .board-tab:not(.hb-separator)'));
            const orderedIds = currentTabs.map(tab => parseInt(tab.dataset.workspaceId));
            state.workspaces.forEach(ws => { ws.position = orderedIds.indexOf(ws.id); });
            state.workspaces.sort((a, b) => a.position - b.position);

            const allElements = Array.from(document.querySelectorAll('#tabs-container .board-tab'));
            const sepElement = document.querySelector('.hb-separator');
            if (sepElement) {
                const sepIndex = allElements.indexOf(sepElement);

                if (window.appSettings) window.appSettings.hb_index = sepIndex;
                updateSettings({ hb_index: sepIndex }).catch(console.error);

                if (window.currentVaultPath) {
                    localStorage.setItem(`doe-hb-index_${window.currentVaultPath}`, sepIndex);
                }
            }

            if (window.updateTabsScrollbar) window.updateTabsScrollbar();
            try { await saveWorkspacesOrder(orderedIds); } catch (e) {}
        }

        if (dragType === 'column') {
            const currentColumns = Array.from(document.querySelectorAll('#board .column:not(.column-drag-clone)'));
            const orderedIds = currentColumns.map(col => parseInt(col.dataset.columnId));
            const colId = parseInt(draggedElement.dataset.columnId);

            if (state.activeWorkspaceId !== originalWorkspaceId) {
                try { await updateColumn(colId, { workspace_id: state.activeWorkspaceId }); }
                catch (e) { console.error(e); }
            }

            state.columns.forEach(c => {
                const pos = orderedIds.indexOf(c.id);
                if (pos !== -1) c.position = pos;
            });
            state.columns.sort((a, b) => a.position - b.position);

            try {
                await saveColumnsOrder(orderedIds);

                if (state.activeWorkspaceId !== originalWorkspaceId) {
                    const freshColumns = await fetchColumns(state.activeWorkspaceId);
                    state.columns = freshColumns.map(c => ({ ...c, collapsed: c.collapsed || false }));
                }
            } catch (e) { console.error("Ошибка сохранения порядка колонок", e); }
        }

        if (dragType === 'card') {
            const newColumnEl = draggedElement.closest('.column');
            if (newColumnEl) {
                const newColumnId = parseInt(newColumnEl.dataset.columnId);
                const sourceColumnId = parseInt(draggedElement.dataset.sourceColumnId);
                const taskId = parseInt(draggedElement.dataset.cardId);

                const currentCards = Array.from(newColumnEl.querySelectorAll('.card:not(.card-drag-clone)'));
                const orderedIds = currentCards.map(c => parseInt(c.dataset.cardId));

                if (state.activeWorkspaceId === originalWorkspaceId) {
                    const sourceColumnEl = document.querySelector(`.column[data-column-id="${sourceColumnId}"]`);
                    if (sourceColumnEl) updateColumnCount(sourceColumnEl);
                }
                updateColumnCount(newColumnEl);

                try {
                    const targetCol = state.columns.find(c => c.id === newColumnId);
                    const sourceCol = state.columns.find(c => c.id === sourceColumnId);

                    if (newColumnId !== sourceColumnId) {
                        const updatedTask = await moveTask(taskId, newColumnId);
                        let taskForUI = updatedTask;

                        if (sourceCol && targetCol) {
                            const taskIndex = sourceCol.tasks.findIndex(t => t.id == taskId);
                            if (taskIndex !== -1) {
                                const [movedTask] = sourceCol.tasks.splice(taskIndex, 1);
                                movedTask.column_id = newColumnId;
                                movedTask.completed_at = updatedTask.completed_at;
                                movedTask.active_timer = updatedTask.active_timer;
                                movedTask.total_time_spent = updatedTask.total_time_spent;
                                targetCol.tasks.push(movedTask);
                                taskForUI = movedTask;
                            }
                        } else if (!sourceCol && targetCol) {
                            targetCol.tasks.push(updatedTask);
                        }

                        updateCardAppearance(draggedElement, taskForUI, targetCol.mode);
                        draggedElement.dataset.sourceColumnId = newColumnId;

                        if (updatedTask.parent_ids && updatedTask.parent_ids.length > 0) {
                            updatedTask.parent_ids.forEach(parentId => {
                                let parentTask = null;
                                let parentCol = null;

                                for (const col of state.columns) {
                                    parentTask = col.tasks.find(t => t.id === parentId);
                                    if (parentTask) {
                                        parentCol = col;
                                        break;
                                    }
                                }

                                if (parentTask && parentTask.subtasks) {
                                    const subtask = parentTask.subtasks.find(s => s.id === taskId);
                                    if (subtask) {
                                        subtask.completed_at = updatedTask.completed_at;
                                    }

                                    const parentCardEl = document.querySelector(`.card[data-card-id="${parentId}"]`);
                                    if (parentCardEl && parentCol) {
                                        updateCardAppearance(parentCardEl, parentTask, parentCol.mode);
                                    }
                                }
                            });
                        }
                    }

                    await saveTasksOrder(orderedIds);

                    if (window.syncColumnDOM) {
                        await window.syncColumnDOM(newColumnId);
                        if (sourceColumnId !== newColumnId) {
                            await window.syncColumnDOM(sourceColumnId);
                        }
                    } else {
                        if (targetCol) {
                            targetCol.tasks.forEach(t => { t.position = orderedIds.indexOf(t.id); });
                        }
                    }
                    updateTimers();

                } catch (error) {
                    console.error("Ошибка при перемещении", error);
                    await refreshBoard();
                }
            }
        }
    }

    dragType = null;
    draggedElement = null;
    currentRotation = targetRotation = 0;
}

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

