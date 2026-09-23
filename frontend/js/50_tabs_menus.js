function renderTabs(scrollToActive = false, newTabId = null) {
    const container = document.getElementById('tabs-container');
    const savedScroll = container.scrollLeft;
    container.innerHTML = '';

    state.workspaces.sort((a, b) => a.position - b.position);

    state.workspaces.forEach(ws => {
        const tab = document.createElement('div');
        tab.className = `board-tab ${ws.id === state.activeWorkspaceId ? 'active' : ''}`;

        if (ws.id === newTabId) {
            tab.classList.add('tab-birth');
        }

        tab.dataset.workspaceId = ws.id;

        const canDelete = state.workspaces.length > 1;
        tab.innerHTML = `
            <span class="tab-name" data-full-title="${escapeHtml(ws.name)}">${escapeHtml(ws.name)}</span>
            <button class="tab-close-btn ${!canDelete ? 'hidden' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        tab.addEventListener('click', async (e) => {
            if (e.target.closest('.tab-close-btn')) return;

            if (ws.id !== state.activeWorkspaceId) {
                e.stopPropagation();
                closeAllDropdowns();

                document.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                state.activeWorkspaceId = ws.id;
                updateSettings({ active_workspace_id: ws.id }).catch(console.error);

                try {
                    const columns = await fetchColumns(state.activeWorkspaceId);
                    state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
                    renderBoard();
                } catch (err) {
                    console.error('Ошибка загрузки колонок:', err);
                    refreshBoard();
                }
            }
        });

        if (canDelete) {
            tab.querySelector('.tab-close-btn').addEventListener('click', async (e) => {
                e.stopPropagation();

                const isConfirmed = await showConfirmModal(t('prompts.deleteTabConfirm'), t('prompts.deleteTabDesc'));
                if (!isConfirmed) return;

                const currentIndex = state.workspaces.findIndex(w => w.id === ws.id);
                const isActive = (ws.id === state.activeWorkspaceId);

                state.workspaces.splice(currentIndex, 1);

                if (isActive) {
                    const nextIndex = Math.min(currentIndex, state.workspaces.length - 1);
                    state.activeWorkspaceId = state.workspaces[nextIndex].id;

                    renderTabs(true);

                    try {
                        const columns = await fetchColumns(state.activeWorkspaceId);
                        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
                        renderBoard();
                        updateSettings({ active_workspace_id: state.activeWorkspaceId }).catch(() => {});
                    } catch (err) { console.error(err); }
                } else {
                    renderTabs(false);
                }

                deleteWorkspaceAPI(ws.id).catch(err => {
                    console.error("API Error:", err);
                });
            });
        }
        container.appendChild(tab);
    });

    const separator = document.createElement('div');
    separator.className = 'board-tab hb-separator';
    const hotkeyText = currentLang === 'ru' ? 'Скрыть/Показать вкладки (Cmd/Ctrl + \\)' : 'Toggle Tabs (Cmd/Ctrl + \\)';
    separator.title = hotkeyText;
    separator.innerHTML = `
        <svg class="hb-chevron" viewBox="0 0 12 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 4 3 12 8 20"></polyline></svg>
    `;

    separator.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        const willBeHidden = document.body.classList.toggle('tabs-hidden');

        if (window.appSettings) window.appSettings.tabs_hidden = willBeHidden;
        updateSettings({ tabs_hidden: willBeHidden }).catch(console.error);

        if (window.currentVaultPath) {
            localStorage.setItem(`doe-tabs-hidden_${window.currentVaultPath}`, willBeHidden);
        }
    });

    let hbIndex = window.appSettings?.hb_index;
    if (typeof hbIndex !== 'number' || isNaN(hbIndex)) {
        hbIndex = parseInt(localStorage.getItem(`doe-hb-index_${window.currentVaultPath}`));
        if (isNaN(hbIndex)) hbIndex = 999;
    }

    const currentTabs = Array.from(container.querySelectorAll('.board-tab:not(.hb-separator)'));
    if (hbIndex < currentTabs.length) {
        container.insertBefore(separator, currentTabs[hbIndex]);
    } else {
        container.appendChild(separator);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

    addBtn.addEventListener('click', onAddTabClick);

    container.appendChild(addBtn);

    if (scrollToActive) {
        requestAnimationFrame(() => {
            const activeTab = container.querySelector('.board-tab.active');
            if (activeTab) {
                const cRect = container.getBoundingClientRect();
                const tRect = activeTab.getBoundingClientRect();
                const targetLeft = container.scrollLeft + (tRect.left - cRect.left) - (cRect.width / 2) + (tRect.width / 2);
                container.scrollTo({ left: targetLeft, behavior: newTabId ? 'smooth' : 'auto' });
            }
            if (window.updateTabsScrollbar) window.updateTabsScrollbar();
        });
    } else {
        container.scrollLeft = savedScroll;
        requestAnimationFrame(() => {
            if (window.updateTabsScrollbar) window.updateTabsScrollbar();
        });
    }

    if (newTabId) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newTabEl = container.querySelector('.tab-birth');
                if (newTabEl) {
                    newTabEl.classList.add('born');
                    setTimeout(() => newTabEl.classList.remove('tab-birth', 'born'), 500);
                }
            });
        });
    }

}

function restoreTabAddButton(container, replaceElement = null) {
    if (container.querySelector('.add-tab-btn')) return;

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    addBtn.addEventListener('click', onAddTabClick);

    if (replaceElement && replaceElement.parentNode === container) {
        replaceElement.replaceWith(addBtn);
    } else {
        container.appendChild(addBtn);
    }

    if (window.updateTabsScrollbar) window.updateTabsScrollbar();
    return addBtn;
}

function onAddTabClick(e) {
    const container = document.getElementById('tabs-container');
    const addBtn = container.querySelector('.add-tab-btn');
    if (!addBtn) return;

    if (container.querySelector('.tab-entering:not(.is-exiting)')) return;

    const formTab = document.createElement('div');
    formTab.className = 'board-tab tab-entering';
    const placeholder = t('prompts.newTabTitle').replace(/:$/, '');
    formTab.innerHTML = `<input type="text" class="tab-input" placeholder="${placeholder}" autocomplete="off" spellcheck="false" />`;

    addBtn.replaceWith(formTab);

    const input = formTab.querySelector('.tab-input');
    const autoResize = () => {
        const span = document.createElement('span');
        span.style.font = window.getComputedStyle(input).font;
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.textContent = input.value || input.placeholder;
        document.body.appendChild(span);
        input.style.width = Math.max(100, span.getBoundingClientRect().width + 8) + 'px';
        document.body.removeChild(span);
    };

    input.addEventListener('input', autoResize);
    autoResize();
    input.focus({ preventScroll: true });

    requestAnimationFrame(() => {
        formTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        requestAnimationFrame(() => formTab.classList.add('entered'));
    });

    let isResolved = false;

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;
        input.blur();

        if (!animate) {
            formTab.remove();
            if (!container.querySelector('.add-tab-btn')) container.appendChild(addBtn);
            return;
        }

        const currentWidth = formTab.offsetWidth;

        const wrapper = document.createElement('div');
        wrapper.className = 'tab-spacer-wrapper';
        wrapper.style.width = `${currentWidth}px`;

        const newBtn = document.createElement('button');
        newBtn.className = 'add-tab-btn tab-btn-fade-in';
        newBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        newBtn.addEventListener('click', onAddTabClick);

        wrapper.appendChild(newBtn);
        formTab.replaceWith(wrapper);

        requestAnimationFrame(() => {
            wrapper.style.width = '32px';
        });

        const onEnd = (e) => {
            if (e.propertyName === 'width') {
                newBtn.classList.remove('tab-btn-fade-in');
                wrapper.replaceWith(newBtn);
                wrapper.removeEventListener('transitionend', onEnd);
                if (window.updateTabsScrollbar) window.updateTabsScrollbar();
            }
        };
        wrapper.addEventListener('transitionend', onEnd);
    };

    const submit = async () => {
        const name = input.value.trim();
        if (!name) { cancel(true); return; }
        if (isResolved) return;
        isResolved = true;
        input.disabled = true;
        formTab.classList.add('is-submitting');

        try {
            const newWs = await createWorkspaceAPI(name);
            state.workspaces.push(newWs);
            state.activeWorkspaceId = newWs.id;
            updateSettings({ active_workspace_id: newWs.id }).catch(console.error);
            await refreshBoard(true, newWs.id);
        } catch (err) {
            console.error(err);
            isResolved = false;
            input.disabled = false;
            formTab.classList.remove('is-submitting');
            formTab.classList.add('is-error');
            setTimeout(() => formTab.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
        if (ev.key === 'Escape') { ev.preventDefault(); cancel(true); }
    });

    input.addEventListener('blur', () => {
        if (isResolved) return;
        requestAnimationFrame(() => {
            if (isResolved) return;
            const active = document.activeElement;
            if (active && active.closest('.add-tab-btn')) { cancel(false); return; }
            if (input.value.trim()) submit(); else cancel(true);
        });
    });
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.menu-btn.active').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-trigger.active').forEach(b => b.classList.remove('active'));

    const bellTrigger = document.getElementById('reminders-bell-trigger');
    if (bellTrigger) bellTrigger.classList.remove('active');

    document.querySelectorAll('.card-menu-btn.active').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.card.has-open-menu').forEach(c => {
        c.classList.remove('has-open-menu');
    });
}

function toggleColumnMenu(e, columnEl) {
    e.stopPropagation();
    const menu = columnEl.querySelector('.dropdown-menu');
    const btn = columnEl.querySelector('.menu-btn');
    const isShowing = menu.classList.contains('show');

    closeAllDropdowns();

    if (!isShowing) {
        menu.classList.add('show');
        btn.classList.add('active');
    }
}

function showConfirmModal(title, message, confirmBtnText = t('menu.delete'), isDanger = true) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        modal.querySelector('.confirm-title').textContent = title;
        modal.querySelector('.confirm-text').textContent = message;

        modal.querySelector('.cancel-btn').textContent = t('cancel');

        const confirmBtn = modal.querySelector('[data-action="confirm-delete"]');
        if (isDanger) {
            confirmBtn.className = 'confirm-btn danger-btn';
            confirmBtn.style.color = '';
        } else {
            confirmBtn.className = 'confirm-btn vault-submit-btn';
            confirmBtn.style.color = 'white';
        }
        confirmBtn.textContent = confirmBtnText;

        activeConfirmResolve = resolve;
        modal.classList.add('show');
    });
}

async function onExpandColumn(columnEl) {
    const columnId = parseInt(columnEl.dataset.columnId);
    const column = state.columns.find(c => c.id === columnId);
    if (!column) return;

    columnEl.classList.remove('collapsed');
    column.collapsed = false;

    columnEl.style.width = column.width ? column.width + 'px' : '';
    columnEl.style.minWidth = '';

    const titleEl = columnEl.querySelector('.column-title');
    if (titleEl) {
        titleEl.textContent = titleEl.dataset.fullTitle || titleEl.textContent;
        titleEl.dataset.clamped = "false";

        requestAnimationFrame(() => clampSingleTitle(titleEl));
    }

    const menu = columnEl.querySelector('.dropdown-menu');
    if (menu) menu.style.display = '';

    try {
        await updateColumn(columnId, { collapsed: false });
    } catch (err) {
        console.error('Failed to save expanded state', err);
    }
}

function startColumnResize(colDiv, column, e) {
    const startX = e.clientX;
    const startWidth = colDiv.getBoundingClientRect().width;
    const MIN_WIDTH = 320;
    const MAX_WIDTH = 640;

    colDiv.style.transition = 'none';

        window._lastLocalEdit = Date.now();
        const syncLockInterval = setInterval(() => {
            window._lastLocalEdit = Date.now();
        }, 1000);

        const onMove = (e) => {
            const dx = e.clientX - startX;
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + dx));
            colDiv.style.width = newWidth + 'px';
        };

        const onUp = async (e) => {
            clearInterval(syncLockInterval);


        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        colDiv.style.transition = '';

        const finalWidth = colDiv.getBoundingClientRect().width;
        const savedWidth = column.width || MIN_WIDTH;
        if (Math.abs(finalWidth - savedWidth) > 1) {
            column.width = finalWidth;
            try {
                await updateColumn(column.id, { width: finalWidth });
            } catch (err) {
                console.error('Failed to save column width', err);
            }
        }
    };

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
}

async function handleColumnMenu(action, columnEl, menuItem) {
    const columnId = parseInt(columnEl.dataset.columnId);
    const column = state.columns.find(c => c.id === columnId);
    if (!column) return;

    if (action === 'set-mode') {
        const mode = menuItem.dataset.mode;
        try { await updateColumn(columnId, { mode }); await refreshBoard(); } catch (e) { }
    } else if (action === 'sort-column') {
        closeAllDropdowns();
        openSortModal(columnId);
    } else if (action === 'rename-column') {
        closeAllDropdowns();
        setTimeout(() => startColumnRename(columnEl, column), 50);
    } else if (action === 'collapse-column') {
        closeAllDropdowns();

        const menu = columnEl.querySelector('.dropdown-menu');
        if (menu) menu.style.display = 'none';

        column.collapsed = true;
        columnEl.classList.add('collapsed');

        const titleEl = columnEl.querySelector('.column-title');
        if (titleEl) {
            titleEl.style.display = '';
            titleEl.style.webkitLineClamp = '';
        }

        adjustCollapsedColumnWidths();

        updateColumn(columnId, { collapsed: true }).catch(err => {
            console.error('Failed to save collapsed state', err);
        });
    } else if (action === 'clear-column') {
        closeAllDropdowns();

        const isConfirmed = await showConfirmModal(
            t('prompts.clearConfirmTitle'),
            t('prompts.clearConfirmDesc'),
            t('menu.clear')
        );
        if (!isConfirmed) return;

        const cardList = columnEl.querySelector('.card-list');
        const cards = cardList.querySelectorAll('.card');

        cards.forEach(card => {
            card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
        });

        column.tasks = [];

        updateColumnCount(columnEl, 0);

        clearColumn(columnId).catch(async e => {
            console.error("Очистка колонки не удалась:", e);
            await refreshBoard();
            window.showToast(t('alerts.error'), 'Не удалось очистить колонку', true);
        });

        setTimeout(() => {
            if (cardList) cardList.innerHTML = '';
        }, 250);

    } else if (action === 'delete-column') {

        closeAllDropdowns();

        const isConfirmed = await showConfirmModal(
            t('prompts.deleteConfirmTitle'),
            t('prompts.deleteConfirmDesc')
        );

        if (!isConfirmed) return;

        const rect = columnEl.getBoundingClientRect();

        const clone = columnEl.cloneNode(true);
        clone.classList.add('column-deleting-clone');
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        document.body.appendChild(clone);

        const spacer = document.createElement('div');
        spacer.className = 'column-spacer';
        spacer.style.width = `${rect.width}px`;
        spacer.style.minWidth = `${rect.width}px`;

        columnEl.replaceWith(spacer);

        state.columns = state.columns.filter(c => c.id !== columnId);
        deleteColumn(columnId).catch(async e => {
            console.error("Delete column failed:", e);
            await refreshBoard();
            window.showToast(t('alerts.error'), 'Не удалось удалить колонку', true);
        });

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
}

