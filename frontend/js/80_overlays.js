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

let dpCurrentDate = new Date();
let dpSelectedDate = new Date();
let activeDatePickerTrigger = null;

function renderDatePicker() {
    const locale = dpLocales[currentLang];
    document.getElementById('dp-time-label').textContent = locale.time;

    const weekdaysEl = document.getElementById('dp-weekdays');
    weekdaysEl.innerHTML = locale.days.map(d => `<span>${d}</span>`).join('');

    const year = dpCurrentDate.getFullYear();
    const month = dpCurrentDate.getMonth();

    document.getElementById('dp-month-year').textContent = `${locale.months[month]} ${year}`;

    const grid = document.getElementById('dp-grid');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();

    for (let i = 0; i < startDay; i++) {
        const d = daysInPrevMonth - startDay + i + 1;
        const div = document.createElement('div');
        div.className = 'dp-cell empty';
        div.textContent = d;
        grid.appendChild(div);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const div = document.createElement('div');
        div.className = 'dp-cell';
        div.textContent = i;

        if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) {
            div.classList.add('today');
        }

        if (year === dpSelectedDate.getFullYear() && month === dpSelectedDate.getMonth() && i === dpSelectedDate.getDate()) {
            div.classList.add('selected');
        }

        div.onclick = (e) => {
            e.stopPropagation();
            dpSelectedDate.setFullYear(year, month, i);
            renderDatePicker();
            if (window.updateDatePickerTrigger) window.updateDatePickerTrigger();
        };
        grid.appendChild(div);
    }

    const totalCells = startDay + daysInMonth;
    const remaining = Math.ceil(totalCells / 7) * 7 - totalCells;
    for (let i = 1; i <= remaining; i++) {
        const div = document.createElement('div');
        div.className = 'dp-cell empty';
        div.textContent = i;
        grid.appendChild(div);
    }
}

window.updateDatePickerTrigger = function() {
    if (!activeDatePickerTrigger) return;
    const timeStr = dpSelectedDate.toLocaleTimeString(currentLang, {hour: '2-digit', minute: '2-digit'});
    const dateStr = dpSelectedDate.toLocaleDateString(currentLang, {day: 'numeric', month: 'short', year: 'numeric'});
    activeDatePickerTrigger.textContent = `${dateStr}, ${timeStr}`;
};

document.addEventListener('DOMContentLoaded', () => {

    const uiFontInput = document.getElementById('ui-font-input');
    const uiFontDropdown = document.getElementById('ui-font-dropdown');

    if (uiFontInput && uiFontDropdown) {
        window.cachedSystemFonts = ["Inter"];

        const renderFontList = (query = '') => {
            uiFontDropdown.innerHTML = '';
            const lowerQuery = query.toLowerCase();

            const filtered = window.cachedSystemFonts.filter(f => {
                const text = f === "Inter" ? `Inter (${t('modals.fontSystemDefault')})` : f;
                return text.toLowerCase().includes(lowerQuery);
            });

            if (filtered.length === 0) {
                uiFontDropdown.innerHTML = `<div class="menu-item" style="opacity: 0.5; cursor: default; font-size: 12px; line-height: 1.3;">${t('modals.fontNotFound')}</div>`;
                return;
            }

            filtered.forEach(font => {
                const item = document.createElement('div');
                item.className = 'menu-item';

                const family = font === "Inter" ? "var(--font-main)" : `"${font}"`;
                item.style.setProperty('font-family', family, 'important');

                const displayText = font === "Inter" ? `Inter (${t('modals.fontSystemDefault')})` : font;
                item.textContent = displayText;

                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    uiFontInput.value = displayText;
                    applyAndSaveUiFont();
                    uiFontDropdown.classList.remove('show');
                    setTimeout(() => uiFontDropdown.style.display = 'none', 200);
                });

                uiFontDropdown.appendChild(item);
            });
        };

        uiFontInput.addEventListener('input', () => {
            renderFontList(uiFontInput.value.trim());
        });

        uiFontInput.addEventListener('focus', () => {
            const val = uiFontInput.value.trim();
            if (val === `Inter (${t('modals.fontSystemDefault')})` || val === "Inter") {
                uiFontInput.value = '';
            }
            renderFontList(uiFontInput.value.trim());

            uiFontDropdown.style.visibility = 'hidden';
            uiFontDropdown.style.display = 'block';
            uiFontDropdown.classList.add('show');
            const menuHeight = uiFontDropdown.offsetHeight;
            uiFontDropdown.classList.remove('show');
            uiFontDropdown.style.visibility = '';

            const rect = uiFontInput.getBoundingClientRect();
            if (rect.bottom + menuHeight + 10 > window.innerHeight) {
                uiFontDropdown.style.top = 'auto';
                uiFontDropdown.style.bottom = '100%';
                uiFontDropdown.style.transformOrigin = 'bottom center';
            } else {
                uiFontDropdown.style.bottom = 'auto';
                uiFontDropdown.style.top = '40px';
                uiFontDropdown.style.transformOrigin = 'top center';
            }

            setTimeout(() => uiFontDropdown.classList.add('show'), 10);
        });

        uiFontInput.addEventListener('blur', () => {
            uiFontDropdown.classList.remove('show');
            setTimeout(() => uiFontDropdown.style.display = 'none', 200);
            applyAndSaveUiFont();
        });

        const applyAndSaveUiFont = async () => {
            const val = uiFontInput.value.trim();

            const isDefault = !val || val === `Inter (${t('modals.fontSystemDefault')})` || val.toLowerCase() === "inter";
            const saveVal = isDefault ? "" : val;

            await updateSettings({ ui_font: saveVal });

            uiFontInput.value = isDefault ? `Inter (${t('modals.fontSystemDefault')})` : val;

            const settings = await fetchSettings().catch(() => ({}));
            updateAppFont(saveVal, settings.custom_font);
        };

        uiFontInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                uiFontInput.blur();
            }
        });
    }

    const amountInput = document.getElementById('notify-amount');
    if (amountInput) {
        amountInput.addEventListener('blur', () => {
            const rawValue = amountInput.value.trim();

            if (rawValue === '') {
                amountInput.value = '15';
                return;
            }

            const val = parseInt(rawValue);
            if (isNaN(val) || val <= 0) {
                amountInput.value = '15';
            }
        });
    }

    const trigger = document.getElementById('notify-unit-trigger');
    const menu = document.getElementById('notify-unit-menu');

    if (trigger && menu) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = menu.classList.contains('show');
            closeAllDropdowns();
            if (!isShowing) {
                menu.style.visibility = 'hidden';
                menu.style.display = 'block';
                menu.classList.add('show');
                const menuHeight = menu.offsetHeight;
                menu.classList.remove('show');
                menu.style.visibility = '';

                const rect = trigger.getBoundingClientRect();
                if (rect.bottom + menuHeight + 10 > window.innerHeight) {
                    menu.style.top = 'auto';
                    menu.style.bottom = '100%';
                    menu.style.transformOrigin = 'bottom center';
                } else {
                    menu.style.bottom = 'auto';
                    menu.style.top = '44px';
                    menu.style.transformOrigin = 'top center';
                }

                void menu.offsetWidth;
                menu.classList.add('show');
            }
        });

        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = item.dataset.value;
                const i18nKey = item.dataset.i18n;

                const labelSpan = document.getElementById('notify-unit-label');
                labelSpan.textContent = item.textContent;
                labelSpan.setAttribute('data-i18n', i18nKey);

                document.getElementById('notify-unit').value = val;

                menu.querySelectorAll('.menu-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                menu.classList.remove('show');
            });
        });
    }

    document.getElementById('dp-prev').onclick = (e) => {
        e.stopPropagation();
        dpCurrentDate.setMonth(dpCurrentDate.getMonth() - 1);
        renderDatePicker();
    };
    document.getElementById('dp-next').onclick = (e) => {
        e.stopPropagation();
        dpCurrentDate.setMonth(dpCurrentDate.getMonth() + 1);
        renderDatePicker();
    };

    document.getElementById('dp-prev-year').onclick = (e) => {
        e.stopPropagation();
        dpCurrentDate.setFullYear(dpCurrentDate.getFullYear() - 1);
        renderDatePicker();
    };
    document.getElementById('dp-next-year').onclick = (e) => {
        e.stopPropagation();
        dpCurrentDate.setFullYear(dpCurrentDate.getFullYear() + 1);
        renderDatePicker();
    };

    document.getElementById('datepicker-trigger').onclick = (e) => {
        e.stopPropagation();
        closeAllDropdowns();

        const trigger = e.currentTarget;
        const rect = trigger.getBoundingClientRect();
        const dropdown = document.getElementById('datepicker-dropdown');

        dropdown.style.visibility = 'hidden';
        dropdown.style.display = 'flex';
        dropdown.classList.add('show');
        const dropHeight = dropdown.offsetHeight;
        dropdown.classList.remove('show');
        dropdown.style.visibility = '';
        dropdown.style.display = '';

        let topPos = rect.bottom + 8;
        let transformOrigin = 'top center';

        if (topPos + dropHeight > window.innerHeight - 10) {
            topPos = rect.top - dropHeight - 8;
            transformOrigin = 'bottom center';
        }

        dropdown.style.top = `${topPos}px`;
        dropdown.style.left = `${rect.left + (rect.width / 2)}px`;
        dropdown.style.transformOrigin = transformOrigin;

        void dropdown.offsetWidth;

        dropdown.classList.add('show');
    };

    document.getElementById('datepicker-dropdown').onclick = (e) => {
        e.stopPropagation();
    };

    const hInput = document.getElementById('dp-hour');
    const mInput = document.getElementById('dp-minute');

    const handleTimeChange = () => {
        let h = parseInt(hInput.value) || 0;
        let m = parseInt(mInput.value) || 0;
        if (h < 0) h = 0; if (h > 23) h = 23;
        if (m < 0) m = 0; if (m > 59) m = 59;

        hInput.value = h.toString().padStart(2, '0');
        mInput.value = m.toString().padStart(2, '0');

        dpSelectedDate.setHours(h, m, 0, 0);
        if (window.updateDatePickerTrigger) window.updateDatePickerTrigger();
    };

    hInput.addEventListener('blur', handleTimeChange);
    mInput.addEventListener('blur', handleTimeChange);

    hInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleTimeChange(); });
    mInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleTimeChange(); });

    const autoHInput = document.getElementById('auto-hour');
    const autoMInput = document.getElementById('auto-minute');

    if (autoHInput && autoMInput) {
        const handleAutoTimeChange = () => {
            let h = parseInt(autoHInput.value) || 0;
            let m = parseInt(autoMInput.value) || 0;
            if (h < 0) h = 0; if (h > 23) h = 23;
            if (m < 0) m = 0; if (m > 59) m = 59;
            autoHInput.value = h.toString().padStart(2, '0');
            autoMInput.value = m.toString().padStart(2, '0');
        };
        autoHInput.addEventListener('blur', handleAutoTimeChange);
        autoMInput.addEventListener('blur', handleAutoTimeChange);
        autoHInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAutoTimeChange(); });
        autoMInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAutoTimeChange(); });
    }

    const togglePwdViz = (btnId, inputId) => {
        const btn = document.getElementById(btnId);
        const inp = document.getElementById(inputId);
        if(btn && inp) {
            btn.onclick = () => {
                const isText = inp.type === 'text';
                inp.type = isText ? 'password' : 'text';
                btn.innerHTML = isText
                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
            };
        }
    };

});

function openNotifyModal(taskId, taskTitle) {
    const modal = document.getElementById('notify-modal');
    modal.dataset.taskId = taskId;
    modal.dataset.taskTitle = taskTitle;

    document.getElementById('notify-amount').value = 15;

    dpSelectedDate = new Date();
    dpSelectedDate.setMinutes(dpSelectedDate.getMinutes() + 1);
    dpSelectedDate.setSeconds(0);
    dpSelectedDate.setMilliseconds(0);
    dpCurrentDate = new Date(dpSelectedDate);

    document.getElementById('dp-hour').value = dpSelectedDate.getHours().toString().padStart(2, '0');
    document.getElementById('dp-minute').value = dpSelectedDate.getMinutes().toString().padStart(2, '0');

    activeDatePickerTrigger = document.getElementById('datepicker-trigger');
    renderDatePicker();
    updateDatePickerTrigger();

    const btns = modal.querySelectorAll('.segmented-btn');
    const contents = modal.querySelectorAll('.notify-tab-content');

    btns.forEach(btn => {
        btn.onclick = () => {
            btns.forEach(b => b.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        };
    });

    const confirmBtn = document.getElementById('btn-confirm-notify');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirmBtn);

    newConfirmBtn.onclick = async () => {
        let delaySeconds = 0;
        let timeText = '';
        const isRelative = modal.querySelector('.segmented-btn.active').dataset.target === 'notify-relative';

        if (isRelative) {
            const amount = parseInt(document.getElementById('notify-amount').value) || 0;
            const unitSelect = document.getElementById('notify-unit');
            const multiplier = parseInt(unitSelect.value) || 60;
            const unitText = document.getElementById('notify-unit-label').textContent;

            delaySeconds = amount * multiplier;
            timeText = currentLang === 'ru' ? `через ${amount} ${unitText}` : `in ${amount} ${unitText}`;
        } else {
            let targetTime = dpSelectedDate.getTime();
            const nowTime = Date.now();

            if (targetTime < nowTime && (nowTime - targetTime) < 300000) {
                dpSelectedDate = new Date(nowTime + 10000);
                targetTime = dpSelectedDate.getTime();
            }

            delaySeconds = Math.floor((targetTime - nowTime) / 1000);

            const timeStr = dpSelectedDate.toLocaleTimeString(currentLang, {hour: '2-digit', minute: '2-digit'});
            const dateStr = dpSelectedDate.toLocaleDateString(currentLang, {day: 'numeric', month: 'short'});
            timeText = currentLang === 'ru' ? `${dateStr} в ${timeStr}` : `on ${dateStr} at ${timeStr}`;
        }

        if (delaySeconds <= 0) {
            window.showToast(
                t('alerts.error'),
                currentLang === 'ru' ? 'Укажите время в будущем' : 'Please specify a future time',
                true
            );
            return;
        }

        newConfirmBtn.style.opacity = '0.5';
        newConfirmBtn.disabled = true;

        try {
            const plainTaskTitle = stripMarkdownToPlain(taskTitle);
            const notificationMsg = currentLang === 'ru'
                ? `Вы просили напомнить о карточке: "${plainTaskTitle}"`
                : `Reminder for card: "${plainTaskTitle}"`;

            const res = await fetch(`${API_BASE}/tasks/${taskId}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    delay_seconds: delaySeconds,
                    title: 'Doe',
                    message: notificationMsg
                })
            });

            if (!res.ok) throw new Error('Network response was not ok');

            window.showToast(
                currentLang === 'ru' ? 'Напоминание установлено' : 'Reminder set',
                `"${taskTitle}" сработает ${timeText}`
            );

            modal.classList.remove('show');

            updateBellBadge();

            const bellBtn = document.querySelector('.modal-notify');
            if (bellBtn) {
                bellBtn.style.color = 'var(--success-done)';
                setTimeout(() => bellBtn.style.color = '', 2000);
            }
        } catch (e) {
            console.error(e);
            window.showToast(t('alerts.error'), 'Не удалось установить напоминание', true);
        } finally {
            newConfirmBtn.style.opacity = '1';
            newConfirmBtn.disabled = false;
        }
    };

    modal.classList.add('show');
}

function openPriorityModal(taskId) {
    const modal = document.getElementById('priority-modal');
    modal.dataset.taskId = taskId;

    let currentPriority = null;
    let priorityData = null;
    for (const col of state.columns) {
        let task = col.tasks.find(t => t.id === taskId);
        if (!task) {
            for (let pt of col.tasks) {
                if (pt.subtasks) {
                    task = pt.subtasks.find(s => s.id === taskId);
                    if (task) break;
                }
            }
        }
        if (task) {
            currentPriority = task.priority;
            priorityData = task.priority_data;
            break;
        }
    }

    const els = {
        c: { r: document.getElementById('prio-slider-c'), n: document.getElementById('prio-val-c') },
        d: { r: document.getElementById('prio-slider-d'), n: document.getElementById('prio-val-d') },
        a: { r: document.getElementById('prio-slider-a'), n: document.getElementById('prio-val-a') },
        b: { r: document.getElementById('prio-slider-b'), n: document.getElementById('prio-val-b') },
        e: { r: document.getElementById('prio-slider-e'), n: document.getElementById('prio-val-e') },
        f: document.getElementById('prio-val-f'),
        p: { r: document.getElementById('prio-slider-p'), n: document.getElementById('prio-val-p') },
        s: { r: document.getElementById('prio-slider-s'), n: document.getElementById('prio-val-s') },
        h: { r: document.getElementById('prio-slider-h'), n: document.getElementById('prio-val-h') },
        total: document.getElementById('prio-total-val')
    };

    let isManualTotal = false;
    const btnClear = document.getElementById('btn-clear-priority');
    const fBtns = modal.querySelectorAll('.prio-segmented .prio-segmented-btn');

    const calcFormula = () => {
        const c = parseFloat(els.c.n.value) / 10 || 0;
        const d = parseFloat(els.d.n.value) / 10 || 0;
        const a = parseFloat(els.a.n.value) / 10 || 0;
        const b = parseFloat(els.b.n.value) / 10 || 0;
        const e = parseFloat(els.e.n.value) / 10 || 0;
        const f = parseFloat(els.f.value) || 0;
        const p = parseFloat(els.p.n.value) / 10 || 0;
        const s = parseFloat(els.s.n.value) / 10 || 0;
        const h = parseFloat(els.h.n.value) / 10 || 0;

        const d_eff = d * 0.85;
        const c_eff = Math.pow(c, 0.85);

        const value_base = c_eff * d_eff;
        const value = value_base * (1 + 0.35 * f) + 0.15 * p * d_eff;

        const relief_base = a * (0.10 + c_eff * (0.45 * d_eff + 0.50));
        const relief = relief_base + 0.40 * s;

        const friction = b * (0.62 + 0.42 * e);

        const base_score = 100 * (value + relief) / (1 + friction);
        const score = base_score * (1 - 0.75 * h);

        const finalScore = Math.min(100, Math.max(0, score));
        return Math.round(finalScore * 10) / 10;
    };

    const updateFromSliders = () => {
        if (!isManualTotal) {
            els.total.value = fmtPrio(calcFormula());
        }
    };

    ['c', 'd', 'a', 'b', 'e', 'p', 's', 'h'].forEach(k => {
        els[k].r.oninput = (ev) => {
            els[k].n.value = fmtPrio(ev.target.value);
            isManualTotal = false;
            updateFromSliders();
        };
        els[k].n.oninput = (ev) => {
            let cleanVal = ev.target.value.replace(/,/g, '.');
            let val = parseFloat(cleanVal);
            if (isNaN(val)) val = 0;
            if (val < 0) val = 0;
            if (val > 10) val = 10;
            els[k].r.value = val;
            isManualTotal = false;
            updateFromSliders();
        };
        els[k].n.onblur = (ev) => {
            let cleanVal = ev.target.value.replace(/,/g, '.');
            let val = parseFloat(cleanVal);
            if (isNaN(val) || val < 0) val = 0;
            if (val > 10) val = 10;
            ev.target.value = fmtPrio(val);
            els[k].r.value = val;
        };
    });

    const fmtPrio = (val) => Math.round(parseFloat(val) * 10) / 10;

    if (priorityData) {
        ['c', 'd', 'a', 'b', 'e', 'p', 's', 'h'].forEach(k => {
            const defVal = ['c', 'd', 'a', 'b', 'e'].includes(k) ? 5 : 0;
            const savedVal = priorityData[k] !== undefined ? parseFloat(priorityData[k]) : defVal;
            els[k].r.value = savedVal;
            els[k].n.value = fmtPrio(savedVal);
        });

        els.f.value = priorityData.f !== undefined ? parseFloat(priorityData.f) : 0;
        fBtns.forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.val) === parseFloat(els.f.value));
        });

        isManualTotal = !!priorityData.manual;
        els.total.value = currentPriority !== null ? fmtPrio(currentPriority) : 0;
        btnClear.style.display = 'block';
    } else {
        ['c', 'd', 'a', 'b', 'e'].forEach(k => {
            els[k].r.value = 5.0;
            els[k].n.value = 5;
        });
        ['p', 's', 'h'].forEach(k => {
            els[k].r.value = 0.0;
            els[k].n.value = 0;
        });

        els.f.value = 0;
        fBtns.forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.val) === 0);
        });

        isManualTotal = false;
        if (currentPriority !== null && currentPriority !== undefined) {
            els.total.value = fmtPrio(currentPriority);
            btnClear.style.display = 'block';
            isManualTotal = true;
        } else {
            btnClear.style.display = 'none';
        }
    }

    fBtns.forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            fBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            els.f.value = btn.dataset.val;
            isManualTotal = false;
            updateFromSliders();
        };
    });

    if (!isManualTotal) updateFromSliders();

    els.total.oninput = (ev) => {
        isManualTotal = true;
    };
    els.total.onblur = (ev) => {
        let cleanVal = ev.target.value.replace(/,/g, '.');
        let val = parseFloat(cleanVal);
        if (isNaN(val) || val < 0) val = 0;
        if (val > 100) val = 100;
        ev.target.value = fmtPrio(val);
    };

    const btnSet = document.getElementById('btn-set-priority');

    const newBtnSet = btnSet.cloneNode(true);
    btnSet.replaceWith(newBtnSet);
    const newBtnClear = btnClear.cloneNode(true);
    btnClear.replaceWith(newBtnClear);

    newBtnSet.onclick = async () => {
        const finalVal = parseFloat(els.total.value) || 0;
        const pData = {
            c: parseFloat(els.c.n.value) || 0,
            d: parseFloat(els.d.n.value) || 0,
            a: parseFloat(els.a.n.value) || 0,
            b: parseFloat(els.b.n.value) || 0,
            e: parseFloat(els.e.n.value) || 0,
            f: parseFloat(els.f.value) || 0,
            p: parseFloat(els.p.n.value) || 0,
            s: parseFloat(els.s.n.value) || 0,
            h: parseFloat(els.h.n.value) || 0,
            manual: isManualTotal
        };

        newBtnSet.style.opacity = '0.5';
        newBtnSet.disabled = true;

        try {
            await updateTask(taskId, { priority: finalVal, priority_data: pData });
            let updatedColId = null;
            for (let col of state.columns) {
                let t = col.tasks.find(task => task.id == taskId);
                if (!t) {
                    for (let pt of col.tasks) {
                        if (pt.subtasks) {
                            t = pt.subtasks.find(s => s.id == taskId);
                            if (t) break;
                        }
                    }
                }
                if (t) {
                    t.priority = finalVal;
                    t.priority_data = pData;
                    updatedColId = col.id;
                    const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                    if (cardEl) updateCardAppearance(cardEl, t, col.mode);
                    break;
                }
            }
            if (updatedColId) await syncColumnDOM(updatedColId);
            modal.classList.remove('show');
        } catch (err) {
            window.showToast(t('alerts.error'), 'Не удалось сохранить приоритет', true);
        } finally {
            newBtnSet.style.opacity = '1';
            newBtnSet.disabled = false;
        }
    };

    newBtnClear.onclick = async () => {
        newBtnClear.style.opacity = '0.5';
        newBtnClear.disabled = true;

        try {
            await updateTask(taskId, { priority: null, priority_data: null });
            let updatedColId = null;
            for (let col of state.columns) {
                let t = col.tasks.find(task => task.id == taskId);
                if (!t) {
                    for (let pt of col.tasks) {
                        if (pt.subtasks) {
                            t = pt.subtasks.find(s => s.id == taskId);
                            if (t) break;
                        }
                    }
                }
                if (t) {
                    t.priority = null;
                    t.priority_data = null;
                    updatedColId = col.id;
                    const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                    if (cardEl) updateCardAppearance(cardEl, t, col.mode);
                    break;
                }
            }
            if (updatedColId) await syncColumnDOM(updatedColId);
            modal.classList.remove('show');
        } catch (err) {
            window.showToast(t('alerts.error'), 'Не удалось очистить приоритет', true);
        } finally {
            newBtnClear.style.opacity = '1';
            newBtnClear.disabled = false;
        }
    };

    modal.classList.add('show');
}

document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.modal-copy-link');
    if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();

        const modal = document.getElementById('task-modal');
        const taskId = modal.dataset.taskId;
        const titleNode = document.getElementById('task-modal-title') || document.querySelector('.task-modal-title-input');
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

            copyBtn.classList.add('copied');
            setTimeout(() => copyBtn.classList.remove('copied'), 600);
        } catch (err) {
            console.error("Failed to copy link: ", err);
        }
    }
});

