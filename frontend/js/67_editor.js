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

