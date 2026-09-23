async function transitionToApp() {
    // ⚠️ Класс vault-mode здесь НЕ снимаем: окно селектора живёт ещё ~0.4с,
    // пока pywebview создаёт окно доски, и зелёная кнопка fullscreen успевала
    // мелькнуть на экране выбора хранилищ. Доска всегда открывается свежей
    // страницей (новое окно или навигация), где светофор полный по умолчанию.
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_main_window) {
        window.pywebview.api.open_main_window();
    } else {
        // 🔒 Без сервера прямого URL /app нет; мост всегда пересоздаёт окно.
        window.location.reload();
    }
}

window.handleVaultAction = async (actionType) => {
    if (document.activeElement) {
        document.activeElement.blur();
    }

    const cardsContainer = document.getElementById('vault-actions-cards');
    const createForm = document.getElementById('vault-create-form');
    const nameInput = document.getElementById('new-vault-name');

    if (actionType === 'create') {
        if (cardsContainer && createForm) {
            cardsContainer.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            cardsContainer.style.opacity = '0';
            cardsContainer.style.transform = 'translateY(-4px) scale(0.98)';
            cardsContainer.style.pointerEvents = 'none';

            setTimeout(() => {
                cardsContainer.style.display = 'none';

                createForm.style.display = 'block';

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (nameInput) {
                            nameInput.value = '';
                            nameInput.focus();
                        }
                    });
                });
            }, 200);
        }
    } else if (actionType === 'open') {
        try {
            if (!window.pywebview || !window.pywebview.api) return;

            const selectedPath = await window.pywebview.api.choose_directory();
            if (!selectedPath) return;

            window.showVaultOpeningOverlay();
            let res = await fetch(`${API_BASE}/system/vault/switch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_path: selectedPath })
            });

            // 🔐 Хранилище защищено паролем — запрашиваем его и пробуем снова
            if (res.status === 423) {
                window.hideVaultOverlay();
                const vaultName = selectedPath.split(/[/\\]/).pop();
                const unlocked = await window.requestVaultUnlock(selectedPath, vaultName);
                if (!unlocked) return;
                window.showVaultOpeningOverlay();
                res = await fetch(`${API_BASE}/system/vault/switch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_path: selectedPath })
                });
            }

            if (res.ok) {
                const result = await res.json();

                updateVaultName(result.name);
                const settings = await fetchSettings().catch(() => ({}));
                state.activeWorkspaceId = settings.active_workspace_id || null;

                // Оверлей остаётся до подмены окна — этап продолжит окно доски
                await transitionToApp();
            } else if (res.status === 400) {
                window.hideVaultOverlay();
                const cards = document.querySelectorAll('.vault-action-card');
                const openCard = cards[1];
                if (openCard) {
                    openCard.classList.add('is-invalid');
                    let hint = openCard.querySelector('.vault-error-hint');
                    if (!hint) {
                        hint = document.createElement('div');
                        hint.className = 'vault-error-hint';
                        openCard.appendChild(hint);
                    }
                    hint.textContent = t('vault.errorInvalid');
                    void hint.offsetWidth;
                    hint.classList.add('visible');

                    setTimeout(() => {
                        openCard.classList.remove('is-invalid');
                        hint.classList.remove('visible');
                        setTimeout(() => { if (!hint.classList.contains('visible')) hint.remove(); }, 200);
                    }, 2200);
                }
            } else {
                window.hideVaultOverlay();
                if (window.showToast) window.showToast(t('alerts.error'), 'Не удалось открыть хранилище', true);
            }
        } catch (err) {
            console.error("Vault selection error:", err);
            window.hideVaultOverlay();
        }
    }
};

window.cancelVaultCreate = () => {
    const cardsContainer = document.getElementById('vault-actions-cards');
    const createForm = document.getElementById('vault-create-form');
    const nameInput = document.getElementById('new-vault-name');

    if (createForm && cardsContainer) {
        createForm.style.display = 'none';

        cardsContainer.style.display = 'flex';
        cardsContainer.style.opacity = '0';
        cardsContainer.style.transform = 'translateY(4px) scale(0.98)';

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardsContainer.style.transition = 'opacity 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
                cardsContainer.style.opacity = '1';
                cardsContainer.style.transform = 'translateY(0) scale(1)';
                cardsContainer.style.pointerEvents = 'auto';
            });
        });
    }

    if (nameInput) {
        nameInput.value = '';
    }
};

window.confirmVaultCreate = async () => {
    const nameInput = document.getElementById('new-vault-name');
    const vaultName = nameInput.value.trim();

    if (!vaultName) {
        nameInput.focus();
        nameInput.classList.add('is-error');
        setTimeout(() => nameInput.classList.remove('is-error'), 400);
        return;
    }

    if (!window.pywebview || !window.pywebview.api) return;

    const parentPath = await window.pywebview.api.choose_directory();
    if (!parentPath) return;

    try {
        window.showVaultOpeningOverlay();
        const res = await fetch(`${API_BASE}/system/vault/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_path: parentPath, name: vaultName })
        });

        if (!res.ok) throw new Error('Ошибка создания хранилища');
        const result = await res.json();

        updateVaultName(result.name);
        state.activeWorkspaceId = null;

        await transitionToApp();

        setTimeout(window.cancelVaultCreate, 500);

    } catch (err) {
        console.error(err);
        window.hideVaultOverlay();
        window.showToast(t('alerts.error'), 'Не удалось создать хранилище', true);
    }
};

document.getElementById('new-vault-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        window.confirmVaultCreate();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        window.cancelVaultCreate();
    }
});

function initGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-dropdown');
    const content = document.getElementById('search-results-content');
    const wrapper = document.getElementById('global-search-wrapper');

    if (!input) return;

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
            const taskModal = document.getElementById('task-modal');

            if (taskModal && taskModal.classList.contains('show')) {
                e.preventDefault();
                if (window.openLocalSearch) window.openLocalSearch();
                return;
            }

            if (wrapper && wrapper.style.display !== 'none') {
                e.preventDefault();
                input.focus();
                input.select();
            }
        }
    });

    let debounceTimer;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();

        if (query.length < 2) {
            dropdown.classList.remove('show');
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/system/search?q=${encodeURIComponent(query)}`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                renderSearchResults(data, query);
            } catch (err) {
                console.error("Search failed:", err);
            }
        }, 250);
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 2 && content.innerHTML !== '') {
            dropdown.classList.add('show');
        }
    });

    function renderSearchResults(data, query) {
        content.innerHTML = '';
        const isTagSearch = data.search_mode === 'tags';
        const attachments = Array.isArray(data.attachments) ? data.attachments : [];
        const hasResults = data.workspaces.length || data.columns.length || data.tasks.length || attachments.length;

        const highlightString = (text, q) => {
            if (!text) return "";
            if (isTagSearch) return escapeHtml(text);
            if (!q) return escapeHtml(text);
            const words = q.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length === 0) return escapeHtml(text);

            const regexWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regex = new RegExp(`(${regexWords.join('|')})`, 'gi');

            const parts = text.split(regex);
            return parts.map((part, i) => {
                if (i % 2 !== 0) {
                    return `<mark>${escapeHtml(part)}</mark>`;
                }
                return escapeHtml(part);
            }).join('');
        };

        if (!hasResults) {
            let emptyMsg = 'Ничего не найдено';
            if (isTagSearch && data.tags && data.tags.length) {
                const tagList = data.tags.map(t => `#${escapeHtml(t)}`).join(', ');
                emptyMsg = `Карточек с тегами ${tagList} не найдено`;
            }
            content.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 13px;">${emptyMsg}</div>`;
            dropdown.classList.add('show');
            return;
        }

        const createItem = (titleHtml, meta, descHtml, onClick) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `
                <div class="search-result-title">${titleHtml}</div>
                <div class="search-result-meta">${meta}</div>
                ${descHtml ? `<div class="search-result-desc">${descHtml}</div>` : ''}
            `;
            div.onclick = () => {
                dropdown.classList.remove('show');
                input.value = '';
                input.blur();
                onClick();
            };
            content.appendChild(div);
        };

        const wsIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
        const colIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`;
        const taskIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

        data.workspaces.forEach(w => {
            createItem(highlightString(w.name, query), `${wsIcon} Вкладка`, null, () => window.navigateToEntityGlobal(w.id, null, null));
        });

        data.columns.forEach(c => {
            createItem(highlightString(c.title, query), `${colIcon} Колонка &middot; ${c.workspace_name}`, null, () => window.navigateToEntityGlobal(c.workspace_id, c.id, null));
        });

        data.tasks.forEach(t => {
            let desc = null;
            if (!isTagSearch && t.snippet && t.snippet.trim()) {
                const safeSnippet = escapeHtml(t.snippet)
                    .replace(/&lt;mark&gt;/gi, '<mark>')
                    .replace(/&lt;\/mark&gt;/gi, '</mark>');
                desc = `...${safeSnippet}...`;
            }

            createItem(highlightString(t.title, query), `${taskIcon} Карточка &middot; ${t.workspace_name} / ${t.column_title}`, desc, () => window.navigateToEntityGlobal(t.workspace_id, t.column_id, t.id, isTagSearch ? null : query));
        });

        // Вложения — показываем всегда (все вложения хранилища), отдельной секцией.
        if (attachments.length && !isTagSearch) {
            const attIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
            const isRu = (typeof currentLang !== 'undefined' ? currentLang : 'ru') === 'ru';
            const secLabel = isRu ? 'Вложения' : 'Attachments';
            const fromLabel = isRu ? 'из карточки' : 'from card';

            const header = document.createElement('div');
            header.className = 'search-section-header';
            header.textContent = `${secLabel} (${attachments.length})`;
            content.appendChild(header);

            attachments.forEach(att => {
                const fname = att.name || att.label || att.path || '';
                const cardName = stripMarkdownToPlain ? stripMarkdownToPlain(att.task_title || '') : (att.task_title || '');
                const meta = `${attIcon} ${fromLabel}: ${escapeHtml(cardName)} &middot; ${escapeHtml(att.workspace_name || '')} / ${escapeHtml(att.column_title || '')}`;
                // Markdown-представление вложения (как оно записано в описании).
                const mdHtml = `<code class="search-att-md">${escapeHtml(att.markdown || '')}</code>`;
                createItem(highlightString(fname, query), meta, mdHtml, () => window.navigateToEntityGlobal(att.workspace_id, att.column_id, att.task_id, null));
            });
        }

        dropdown.classList.add('show');
    }
}

window.navigateToEntityGlobal = async function(wsId, colId, taskId, highlightQuery = null, keepStack = false, openModal = true) {
    closeAllDropdowns();

    if (wsId && wsId !== state.activeWorkspaceId) {
        document.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
        const targetTab = document.querySelector(`.board-tab[data-workspace-id="${wsId}"]`);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        state.activeWorkspaceId = wsId;
        updateSettings({ active_workspace_id: wsId }).catch(console.error);

        const columns = await fetchColumns(wsId);
        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
        renderBoard();
    }

    if (colId) {
        requestAnimationFrame(() => {
            const colEl = document.querySelector(`.column[data-column-id="${colId}"]`);
            if (colEl) {
                if (colEl.classList.contains('collapsed') && taskId) {
                    onExpandColumn(colEl);
                }
                colEl.scrollIntoView({ behavior: 'smooth', inline: 'center' });

                if (taskId) {
                    const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                    if (cardEl) {
                        cardEl.classList.add('is-highlighted');
                        setTimeout(() => cardEl.classList.remove('is-highlighted'), 2000);
                    }

                    if (openModal) {
                        loadTaskIntoModal(taskId, true, highlightQuery);
                        document.getElementById('task-modal').classList.add('show');
                    }
                }
            }
        });
    }
};

window.chooseCustomAttFolder = async () => {
    if (!window.pywebview || !window.pywebview.api) return;
    const path = await window.pywebview.api.choose_directory();
    if (path) {
        try {
            document.getElementById('setting-item-external').style.opacity = '0.5';

            await fetch(`${API_BASE}/system/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ global_attachments_path: path, reset_attachments: false })
            });

            document.getElementById('att-path-display').textContent = path;
            document.getElementById('setting-item-local').classList.remove('active');
            document.getElementById('setting-item-external').classList.add('active');
        } catch (e) {
            console.error(e);
        } finally {
            document.getElementById('setting-item-external').style.opacity = '1';
        }
    }
};

window.resetAttFolder = async () => {
    if (document.getElementById('setting-item-local').classList.contains('active')) return;

    try {
        document.getElementById('setting-item-local').style.opacity = '0.5';

        await fetch(`${API_BASE}/system/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset_attachments: true })
        });

        document.getElementById('att-path-display').textContent = t('modals.attSelectBtn');
        document.getElementById('setting-item-external').classList.remove('active');
        document.getElementById('setting-item-local').classList.add('active');
    } catch (e) {
        console.error(e);
    } finally {
        document.getElementById('setting-item-local').style.opacity = '1';
    }
};

