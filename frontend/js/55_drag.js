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

