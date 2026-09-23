async function openMoveTaskModal(taskId) {
    const modal = document.getElementById('move-modal');
    modal.dataset.taskId = taskId;
    const select = document.getElementById('move-column-select');

    if (select._customUI) {
        select._customUI.wrapper.remove();
        select._customUI = null;
        select.style.display = '';
    }

    select.innerHTML = `<option value="">${t('loading')}</option>`;
    modal.classList.add('show');

    try {
        let optionsHtml = '';
        for (const ws of state.workspaces) {
            const cols = await fetchColumns(ws.id);
            for (const col of cols) {
                optionsHtml += `<option value="${col.id}">${escapeHtml(ws.name)} → ${escapeHtml(col.title)}</option>`;
            }
        }
        select.innerHTML = optionsHtml;
        syncCustomSelect(select);
    } catch (e) {
        console.error(e);
        window.showToast(t('alerts.error'), currentLang === 'ru' ? 'Не удалось загрузить колонки' : 'Failed to load columns', true);
    }

    const applyBtn = document.getElementById('btn-apply-move');
    const newApplyBtn = applyBtn.cloneNode(true);
    applyBtn.replaceWith(newApplyBtn);

    newApplyBtn.onclick = async () => {
        const targetColId = parseInt(select.value);
        if (!targetColId || isNaN(targetColId)) return;

        newApplyBtn.disabled = true;
        newApplyBtn.style.opacity = '0.5';

        try {
            await moveTask(taskId, targetColId);
            modal.classList.remove('show');
            await refreshBoard();
            window.showToast(currentLang === 'ru' ? 'Успех' : 'Success', currentLang === 'ru' ? 'Карточка перемещена' : 'Card moved');
        } catch (e) {
            window.showToast(t('alerts.error'), currentLang === 'ru' ? 'Не удалось переместить' : 'Failed to move', true);
        } finally {
            newApplyBtn.disabled = false;
            newApplyBtn.style.opacity = '1';
        }
    };
}

function openSortModal(columnId) {
    const modal = document.getElementById('sort-modal');
    modal.dataset.columnId = columnId;

    const criteriaRows = modal.querySelectorAll('#sort-criteria-list .setting-row');
    criteriaRows.forEach(r => {
        r.onclick = () => {
            criteriaRows.forEach(rr => rr.classList.remove('active'));
            r.classList.add('active');
        };
    });

    const dirBtns = modal.querySelectorAll('#sort-modal .segmented-control .segmented-btn');
    dirBtns.forEach(b => {
        b.onclick = () => {
            dirBtns.forEach(bb => bb.classList.remove('active'));
            b.classList.add('active');
        };
    });

    const applyBtn = document.getElementById('btn-apply-sort');
    const newApplyBtn = applyBtn.cloneNode(true);
    applyBtn.replaceWith(newApplyBtn);

    newApplyBtn.onclick = async () => {
        const criteria = modal.querySelector('#sort-criteria-list .setting-row.active').dataset.sort;
        const dir = modal.querySelector('#sort-modal .segmented-control .segmented-btn.active').dataset.dir;
        modal.classList.remove('show');
        await applyColumnSort(columnId, criteria, dir);
    };

    modal.classList.add('show');
}

async function applyColumnSort(columnId, criteria, dir) {
    const column = state.columns.find(c => c.id === columnId);
    if (!column || !column.tasks || column.tasks.length === 0) return;

    const modifier = dir === 'asc' ? 1 : -1;

    column.tasks.sort((a, b) => {
        let valA, valB;
        let isNullA = false;
        let isNullB = false;

        if (criteria === 'priority') {
            valA = a.priority != null ? parseFloat(a.priority) : null;
            valB = b.priority != null ? parseFloat(b.priority) : null;
            isNullA = valA === null;
            isNullB = valB === null;
        } else if (criteria === 'created') {
            valA = new Date(a.created_at).getTime();
            valB = new Date(b.created_at).getTime();
        } else if (criteria === 'updated') {
            valA = new Date(a.updated_at).getTime();
            valB = new Date(b.updated_at).getTime();
        }

        if (isNullA && isNullB) return a.position - b.position;

        if (isNullA) return 1;
        if (isNullB) return -1;

        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;

        return a.position - b.position;
    });

    const orderedIds = column.tasks.map(t => t.id);
    column.tasks.forEach((t, i) => t.position = i);

    try {
        await saveTasksOrder(orderedIds);
        if (window.syncColumnDOM) {
            await window.syncColumnDOM(columnId);
        } else {
            renderBoard();
        }
    } catch (err) {
        console.error("Ошибка сортировки:", err);
        window.showToast(t('alerts.error'), 'Не удалось сохранить порядок', true);
    }
}

(() => {
    if (!document.documentElement.classList.contains('mac-os')) return;

    let dragging = false, rafScheduled = false;

    const NO_DRAG = 'button, input, textarea, select, a, [contenteditable="true"], [draggable="true"], [data-action],' +
        '.search-wrapper, .settings-wrapper, .tabs-wrapper, .board-tab, .card, .column, .card-list,' +
        '.subtask-item, .attachment-item, .vault-container, .vault-actions, .vault-create-form, .vault-history-section, .vault-history-list, .vault-history-item, .vault-action-card,' +
        '.modal-overlay, .modal-card, .dropdown-menu, .menu-btn, .card-menu-btn, .traffic-btn';

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (!e.target.closest('.app-header, .vault-screen')) return;
        if (e.target.closest(NO_DRAG)) return;
        try { window.pywebview?.api?.begin_window_drag?.(); } catch (err) {}
        dragging = true;
        e.preventDefault();
    }, true);

    document.addEventListener('mousemove', () => {
        if (!dragging || rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            if (dragging) { try { window.pywebview?.api?.drag_window?.(); } catch (err) {} }
        });
    });

    const stop = () => {
        if (!dragging) return;
        dragging = false;
        try { window.pywebview?.api?.end_window_drag?.(); } catch (err) {}
    };
    document.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);

    // Двойной клик по шапке = нативный zoom (как у любого окна macOS)
    document.addEventListener('dblclick', (e) => {
        if (!e.target.closest('.app-header')) return;
        if (e.target.closest(NO_DRAG)) return;
        try { window.pywebview?.api?.zoom_window?.(); } catch (err) {}
    });
})();

(function setupWindowsChrome() {
    if (!document.documentElement.classList.contains('win-os')) return;

    const isVault = new URLSearchParams(location.search).get('mode') === 'vault' || window.__doeLaunchMode === 'vault';
    const api = () => (window.pywebview && window.pywebview.api) || null;

    const style = document.createElement('style');
    style.textContent = `
      html.win-os .app-header { padding-right: 150px; }
      .win-controls { position: fixed; top: 0; right: 0; height: 40px; display: flex; z-index: 2147483647; user-select: none; -webkit-user-select: none; }
      .win-ctrl { width: 46px; height: 100%; border: none; background: transparent; display: flex; align-items: center; justify-content: center; cursor: default; color: #333; transition: background .12s; padding: 0; }
      .win-ctrl:hover { background: rgba(128,128,128,.18); }
      .win-ctrl.close:hover { background: #e81123; color: #fff; }
      .win-ctrl svg { width: 11px; height: 11px; }
      html[data-theme="dark"] .win-ctrl { color: #ddd; }
      .win-rh { position: fixed; z-index: 2147483646; }
      .win-rh-t{top:0;left:8px;right:8px;height:8px;cursor:ns-resize}
      .win-rh-b{bottom:0;left:8px;right:8px;height:8px;cursor:ns-resize}
      .win-rh-l{left:0;top:8px;bottom:8px;width:8px;cursor:ew-resize}
      .win-rh-r{right:0;top:8px;bottom:8px;width:8px;cursor:ew-resize}
      .win-rh-tl{top:0;left:0;width:12px;height:12px;cursor:nwse-resize}
      .win-rh-tr{top:0;right:0;width:12px;height:12px;cursor:nesw-resize}
      .win-rh-bl{bottom:0;left:0;width:12px;height:12px;cursor:nesw-resize}
      .win-rh-br{bottom:0;right:0;width:12px;height:12px;cursor:nwse-resize}
    `;
    document.head.appendChild(style);

    const controls = document.createElement('div');
    controls.className = 'win-controls';
    const maxBtn = isVault ? '' :
      `<button class="win-ctrl max" title="Развернуть"><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg></button>`;
    controls.innerHTML = `
      <button class="win-ctrl min" title="Свернуть"><svg viewBox="0 0 10 10"><rect x="0" y="5" width="10" height="1" fill="currentColor"/></svg></button>
      ${maxBtn}
      <button class="win-ctrl close" title="Закрыть"><svg viewBox="0 0 10 10"><path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" stroke-width="1.2"/></svg></button>
    `;
    document.body.appendChild(controls);
    controls.querySelector('.min').onclick = () => api()?.minimize_window?.();
    controls.querySelector('.close').onclick = () => window.appExit();
    controls.querySelector('.max')?.addEventListener('click', () => api()?.toggle_maximize_window?.());

    const endInteraction = () => {
        try { window.pywebview?.api?.end_win_move?.(); } catch (err) {}
        try { window.pywebview?.api?.end_win_resize?.(); } catch (err) {}
    };
    document.addEventListener('pointerup', endInteraction);
    window.addEventListener('blur', endInteraction);
    document.addEventListener('pointercancel', endInteraction);

    const htMap = { l: 10, r: 11, t: 12, tl: 13, tr: 14, b: 15, bl: 16, br: 17 };
    if (!isVault) {
        ['t','b','l','r','tl','tr','bl','br'].forEach((cls) => {
            const h = document.createElement('div');
            h.className = `win-rh win-rh-${cls}`;
            h.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                if (h.hasPointerCapture(e.pointerId)) h.releasePointerCapture(e.pointerId);

                if (window.pywebview && window.pywebview.api && window.pywebview.api.start_window_resize) {
                    window.pywebview.api.start_window_resize(htMap[cls]);
                }
            });
            document.body.appendChild(h);
        });
    }

    const allowedDragZones = [
        'app-header',
        'header-left-controls',
        'tabs-wrapper',
        'tabs-container',
        'vault-screen',
        'vault-container',
        'vault-hero'
    ];
    const isDragZone = (el) => allowedDragZones.some(cls => el.classList && el.classList.contains(cls));

    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;

        if (!isDragZone(e.target)) return;

        e.preventDefault();

        if (e.target.hasPointerCapture(e.pointerId)) e.target.releasePointerCapture(e.pointerId);

        if (window.pywebview && window.pywebview.api && window.pywebview.api.start_window_drag) {
            window.pywebview.api.start_window_drag();
        }
    }, true);

    // Двойной клик по шапке = развернуть/восстановить (как у любого окна Windows)
    document.addEventListener('dblclick', (e) => {
        if (isVault) return; // окно выбора хранилищ не разворачивается
        if (!isDragZone(e.target)) return;
        api()?.toggle_maximize_window?.();
    }, true);

})();
