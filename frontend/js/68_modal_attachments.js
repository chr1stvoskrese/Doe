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

