function createCardFormElement() {
    const card = document.createElement('div');
    card.className = 'card card-entering';
    const placeholder = t('prompts.taskTitle').replace(/:$/, '');
    card.innerHTML = `
        <div class="card-input-wrapper">
            <textarea
                class="card-input"
                placeholder="${placeholder}"
                autocomplete="off"
                spellcheck="false"
                rows="1"
            ></textarea>
        </div>
    `;
    return card;
}

async function onAddCardInline(plusBtn) {
    const trigger = plusBtn.closest('.card-inline-trigger');
    const cardEl = trigger.closest('.card');
    const columnEl = cardEl.closest('.column');
    const columnId = parseInt(columnEl.dataset.columnId);
    const colState = state.columns.find(c => c.id === columnId);

    if (columnEl.dataset.ignoreNextAdd === 'true') return;

    closeAllOpenCardForms();

    columnEl.setAttribute('draggable', 'false');

    const formCard = createCardFormElement();

    cardEl.after(formCard);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            formCard.classList.add('entered');
        });
    });

    const input = formCard.querySelector('.card-input');
    const autoResize = () => {
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
        const maxHeight = 120;
        if (sh > maxHeight) {
            input.style.height = maxHeight + 'px';
            input.style.overflowY = 'auto';
        } else {
            input.style.height = sh + 'px';
            input.style.overflowY = 'hidden';
        }
    };

    input.addEventListener('input', autoResize);
    autoResize();
    input.focus();
    bindTitleFormattingShortcuts(input);

    let isResolved = false;

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;

        columnEl.setAttribute('draggable', 'true');
        input.blur();

        if (!animate) {
            formCard.remove();
            return;
        }

        formCard.classList.remove('entered');
        formCard.classList.add('is-exiting');

        const onTransitionEnd = (e) => {
            if (e.target === formCard && (e.propertyName === 'margin-top' || e.propertyName === 'grid-template-rows')) {
                formCard.remove();
                formCard.removeEventListener('transitionend', onTransitionEnd);
            }
        };
        formCard.addEventListener('transitionend', onTransitionEnd);
        setTimeout(() => { if (formCard.parentNode) formCard.remove(); }, 130);
    };

    formCard.cancelInline = cancel;

    const submit = async () => {
        const title = input.value.trim();
        if (!title) {
            cancel(true);
            return;
        }

        if (title.length > 1000) {
            formCard.classList.remove('is-error');
            void formCard.offsetWidth;
            formCard.classList.add('is-error');
            setTimeout(() => formCard.classList.remove('is-error'), 400);
            input.focus();
            return;
        }

        if (isResolved) return;
        isResolved = true;

        columnEl.setAttribute('draggable', 'true');
        input.disabled = true;
        formCard.classList.add('is-submitting');

        let nextPosition = null;
        let prevPosition = null;

        const currentCardId = parseInt(cardEl.dataset.cardId);
        const currentTask = colState.tasks.find(t => t.id === currentCardId);

        prevPosition = currentTask.position;
        const nextCardEl = cardEl.nextElementSibling;
        if (nextCardEl && nextCardEl.classList.contains('card') && !nextCardEl.classList.contains('card-entering')) {
            const nextCardId = parseInt(nextCardEl.dataset.cardId);
            const nextTask = colState.tasks.find(t => t.id === nextCardId);
            if (nextTask) nextPosition = nextTask.position;
        }

        let targetPosition = 0;
        if (prevPosition !== null && nextPosition !== null) {
            targetPosition = (prevPosition + nextPosition) / 2;
        } else if (prevPosition !== null) {
            targetPosition = prevPosition + 1.0;
        } else if (nextPosition !== null) {
            targetPosition = nextPosition - 1.0;
        } else {
            targetPosition = 1.0;
        }

        try {
            const res = await fetch(`${API_BASE}/tasks/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    column_id: columnId,
                    position: targetPosition
                })
            });
            if (!res.ok) throw new Error('Create failed');
            const newTask = await res.json();

            colState.tasks.push(newTask);
            colState.tasks.sort((a, b) => a.position - b.position);

            const realCardStr = generateCardHtml(newTask, colState.mode);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = realCardStr.trim();
            const realCard = tempDiv.firstChild;

            realCard.classList.add('card-birth');

            formCard.replaceWith(realCard);
            updateColumnCount(columnEl);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    realCard.classList.add('born');
                });
            });

            const cleanup = (e) => {
                if (e.propertyName === 'transform') {
                    realCard.classList.remove('card-birth', 'born');
                    realCard.removeEventListener('transitionend', cleanup);
                }
            };
            realCard.addEventListener('transitionend', cleanup);
            setTimeout(() => {
                realCard.classList.remove('card-birth', 'born');
                if (window.syncColumnDOM) window.syncColumnDOM(columnId);
            }, 500);

        } catch (err) {
            console.error('Task creation inline failed:', err);
            isResolved = false;
            input.disabled = false;
            formCard.classList.remove('is-submitting');
            formCard.classList.add('is-error');
            setTimeout(() => formCard.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(true); }
    });

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousemove', (e) => e.stopPropagation());
    input.addEventListener('touchstart', (e) => e.stopPropagation());

    input.addEventListener('blur', () => {
        if (isResolved) return;
        requestAnimationFrame(() => {
            if (isResolved) return;
            if (document.activeElement === input) return;
            if (input.value.trim()) {
                submit();
            } else {
                cancel(true);
            }
        });
    });
}

async function onAddTask(columnId) {
    const columnEl = document.querySelector(`.column[data-column-id="${columnId}"]`);
    if (!columnEl) return;

    if (columnEl.dataset.ignoreNextAdd === 'true') return;

    closeAllOpenCardForms(columnId);

    const exitingForm = columnEl.querySelector('.card-entering.is-exiting');
    if (exitingForm) exitingForm.remove();

    const existingForm = columnEl.querySelector('.card-entering:not(.is-exiting)');
    if (existingForm) {
        existingForm.querySelector('textarea')?.focus();
        return;
    }

    columnEl.setAttribute('draggable', 'false');

    const cardList = columnEl.querySelector('.card-list');
    const formCard = createCardFormElement();

    cardList.appendChild(formCard);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            formCard.classList.add('entered');
            cardList.scrollTo({ top: cardList.scrollHeight, behavior: 'smooth' });
        });
    });

    const input = formCard.querySelector('.card-input');

    const autoResize = () => {
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
        const maxHeight = 120;
        if (sh > maxHeight) {
            input.style.height = maxHeight + 'px';
            input.style.overflowY = 'auto';
        } else {
            input.style.height = sh + 'px';
            input.style.overflowY = 'hidden';
        }
    };

    input.addEventListener('input', autoResize);
    autoResize();
    input.focus();
    bindTitleFormattingShortcuts(input);

    let isResolved = false;

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;

        columnEl.setAttribute('draggable', 'true');

        input.blur();

        if (!animate) {
            formCard.remove();
            return;
        }

        formCard.classList.remove('entered');
        formCard.classList.add('is-exiting');

        const onTransitionEnd = (e) => {
            if (e.target === formCard && (e.propertyName === 'margin-top' || e.propertyName === 'grid-template-rows')) {
                formCard.remove();
                formCard.removeEventListener('transitionend', onTransitionEnd);
            }
        };
        formCard.addEventListener('transitionend', onTransitionEnd);
        setTimeout(() => { if (formCard.parentNode) formCard.remove(); }, 130);
    };

    formCard.cancelInline = cancel;

    const submit = async (reopen = false) => {
        const title = input.value.trim();
        if (!title) {
            cancel(true);
            return;
        }

        if (title.length > 1000) {
            formCard.classList.remove('is-error');
            void formCard.offsetWidth;
            formCard.classList.add('is-error');
            setTimeout(() => formCard.classList.remove('is-error'), 400);
            input.focus();
            return;
        }

        if (isResolved) return;
        isResolved = true;

        columnEl.setAttribute('draggable', 'true');

        input.disabled = true;
        formCard.classList.add('is-submitting');

        try {
            const newTask = await createTask(title, columnId);

            const columnState = state.columns.find(c => c.id === columnId);
            if (columnState) {
                columnState.tasks.push(newTask);
            }

            const realCardStr = generateCardHtml(newTask, columnState ? columnState.mode : 'default');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = realCardStr.trim();
            const realCard = tempDiv.firstChild;

            realCard.classList.add('card-birth');

            formCard.replaceWith(realCard);
            updateColumnCount(columnEl);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    realCard.classList.add('born');
                });
            });

            const cleanup = (e) => {
                if (e.propertyName === 'transform') {
                    realCard.classList.remove('card-birth', 'born');
                    realCard.removeEventListener('transitionend', cleanup);
                }
            };
            realCard.addEventListener('transitionend', cleanup);
            setTimeout(() => {
                realCard.classList.remove('card-birth', 'born');
                if (window.syncColumnDOM) window.syncColumnDOM(columnId);
            }, 500);

            if (reopen) {
                onAddTask(columnId);
            }

        } catch (err) {
            console.error('Task creation failed:', err);
            isResolved = false;
            columnEl.setAttribute('draggable', 'false');
            input.disabled = false;
            formCard.classList.remove('is-submitting');
            formCard.classList.add('is-error');
            setTimeout(() => formCard.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(true); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(true); }
    });

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousemove', (e) => e.stopPropagation());
    input.addEventListener('touchstart', (e) => e.stopPropagation());

    input.addEventListener('blur', () => {
        if (isResolved) return;

        requestAnimationFrame(() => {
            if (isResolved) return;

            const active = document.activeElement;
            if (active === input) return;
            const thisAddBtn = columnEl.querySelector('.btn-add-card');
            const isThisAddBtn = active === thisAddBtn;

            if (active && active.closest('.btn-add-card') && !isThisAddBtn) {
                cancel(false);
                return;
            }

            if (input.value.trim()) {
                submit();
            } else {
                if (isThisAddBtn) {
                    columnEl.dataset.ignoreNextAdd = 'true';
                    setTimeout(() => delete columnEl.dataset.ignoreNextAdd, 100);
                }
                cancel(true);
            }
        });
    });
}

function createColumnFormElement() {
    const col = document.createElement('div');
    col.className = 'column column-entering';
    const placeholder = t('prompts.columnTitle').replace(/:$/, '');
    col.innerHTML = `
        <div class="column-form-inner">
            <textarea
                class="column-input"
                placeholder="${placeholder}"
                autocomplete="off"
                spellcheck="false"
            ></textarea>
        </div>
    `;
    return col;
}

function closeAllOpenCardForms(excludeColumnId = null) {
    document.querySelectorAll('.card-entering').forEach(form => {
        const col = form.closest('.column');
        const colId = col ? parseInt(col.dataset.columnId) : null;
        if (excludeColumnId && colId === excludeColumnId) {
            return;
        }
        if (typeof form.cancelInline === 'function') {
            form.cancelInline(false);
        } else {
            form.remove();
        }
    });
}

function restoreAddButton() {
    const board = document.getElementById('board');
    if (board.querySelector('.new-column-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'new-column-btn';
    btn.textContent = t('newColumn');
    btn.addEventListener('click', onCreateColumn);
    board.appendChild(btn);
    return btn;
}

async function onCreateColumn() {
    const board = document.getElementById('board');
    const addBtn = board.querySelector('.new-column-btn');
    if (!addBtn) return;

    const formCol = createColumnFormElement();

    addBtn.replaceWith(formCol);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            formCol.classList.add('entered');
        });
    });

    const input = formCol.querySelector('.column-input');
    input.focus();

    let isResolved = false;

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;

        input.blur();

        if (!animate) {
            formCol.remove();
            restoreAddButton();
            return;
        }

        formCol.classList.remove('entered');
        formCol.classList.add('is-exiting');

        setTimeout(() => {
            if (formCol.parentNode) {
                const btn = restoreAddButton();
                if (btn && formCol.parentNode) {
                    formCol.replaceWith(btn);
                }
            }
        }, 120);
    };

    const autoResize = () => {
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
        const boardHeight = document.getElementById('board').clientHeight;

        const maxAllowedHeight = Math.max(60, boardHeight - 60);

        if (sh > maxAllowedHeight) {
            input.style.height = maxAllowedHeight + 'px';
            input.style.overflowY = 'auto';
        } else {
            input.style.height = sh + 'px';
            input.style.overflowY = 'hidden';
        }
    };

    input.addEventListener('input', autoResize);

    requestAnimationFrame(() => {
        autoResize();
    });

    const submit = async () => {
        const title = input.value.trim();
        if (!title) {
            cancel(true);
            return;
        }

        if (isResolved) return;
        isResolved = true;

        input.disabled = true;
        formCol.classList.add('is-submitting');

        try {
            const newColumn = await createColumn(title, 'default', state.activeWorkspaceId);

            state.columns.push({
                ...newColumn,
                collapsed: false,
                tasks: newColumn.tasks || []
            });

            const realCol = createColumnElement({
                ...newColumn,
                collapsed: false,
                tasks: newColumn.tasks || []
            });
            realCol.classList.add('column-birth');

            formCol.replaceWith(realCol);

            requestAnimationFrame(() => {
                const newTitle = realCol.querySelector('.column-title');
                clampSingleTitle(newTitle);
            });

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    realCol.classList.add('born');
                });
            });

            const cleanup = (e) => {
                if (e.propertyName === 'transform') {
                    realCol.classList.remove('column-birth', 'born');
                    realCol.removeEventListener('transitionend', cleanup);
                }
            };
            realCol.addEventListener('transitionend', cleanup);
            setTimeout(() => realCol.classList.remove('column-birth', 'born'), 500);

            restoreAddButton();

        } catch (err) {
            console.error('Column creation failed:', err);
            isResolved = false;
            input.disabled = false;
            formCol.classList.remove('is-submitting');
            formCol.classList.add('is-error');
            setTimeout(() => formCol.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            cancel(true);
        }
    });

    input.addEventListener('blur', () => {
        if (isResolved) return;

        requestAnimationFrame(() => {
            if (isResolved) return;

            const active = document.activeElement;
            if (active && active.closest('.new-column-btn')) {
                cancel(false);
                return;
            }

            if (input.value.trim()) {
                submit();
            } else {
                cancel(true);
            }
        });
    });
}

