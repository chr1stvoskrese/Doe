document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const plusBtn = e.target.closest('.divider-plus-btn');
    if (plusBtn) {
        e.preventDefault();
        e.stopPropagation();

        if (plusBtn.closest('.card-inline-trigger')) {
            onAddCardInline(plusBtn);
        } else if (plusBtn.closest('.column-inline-trigger')) {
            onAddColumnInline(plusBtn);
        }
    }
}, { capture: true });

async function onAddColumnInline(plusBtn) {
    const trigger = plusBtn.closest('.column-inline-trigger');
    const columnEl = trigger.closest('.column');
    const columnId = parseInt(columnEl.dataset.columnId);

    const colIndex = state.columns.findIndex(c => c.id === columnId);
    if (colIndex === -1) return;

    const prevPos = state.columns[colIndex].position;
    let nextPos = prevPos + 1.0;
    if (colIndex + 1 < state.columns.length) {
        nextPos = state.columns[colIndex + 1].position;
    }
    const targetPosition = (prevPos + nextPos) / 2.0;

    const formCol = createColumnFormElement();
    columnEl.after(formCol);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            formCol.classList.add('entered');
        });
    });

    const input = formCol.querySelector('.column-input');
    input.focus();

    const autoResize = () => {
        const computed = window.getComputedStyle(input);
        const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
        input.style.height = '1px';
        const sh = input.scrollHeight + borders;
        const boardHeight = document.getElementById('board').clientHeight;
        const maxAllowedHeight = Math.max(60, boardHeight - 250);

        if (sh > maxAllowedHeight) {
            input.style.height = maxAllowedHeight + 'px';
            input.style.overflowY = 'auto';
        } else {
            input.style.height = sh + 'px';
            input.style.overflowY = 'hidden';
        }
    };

    input.addEventListener('input', autoResize);
    requestAnimationFrame(autoResize);

    let isResolved = false;

    const cancel = (animate = true) => {
        if (isResolved) return;
        isResolved = true;
        input.blur();

        if (!animate) {
            formCol.remove();
            return;
        }

        formCol.classList.remove('entered');
        formCol.classList.add('is-exiting');

        setTimeout(() => {
            if (formCol.parentNode) formCol.remove();
        }, 120);
    };

    const submit = async () => {
        const title = input.value.trim();
        if (!title) { cancel(true); return; }
        if (isResolved) return;
        isResolved = true;

        input.disabled = true;
        formCol.classList.add('is-submitting');

        try {
            const newColumn = await createColumn(title, 'default', state.activeWorkspaceId, targetPosition);

            state.columns.splice(colIndex + 1, 0, {
                ...newColumn,
                collapsed: false,
                tasks: newColumn.tasks || []
            });
            state.columns.sort((a, b) => a.position - b.position);

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

        } catch (err) {
            console.error('Column creation inline failed:', err);
            isResolved = false;
            input.disabled = false;
            formCol.classList.remove('is-submitting');
            formCol.classList.add('is-error');
            setTimeout(() => formCol.classList.remove('is-error'), 400);
            input.focus();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(true); }
    });

    input.addEventListener('blur', () => {
        if (isResolved) return;
        requestAnimationFrame(() => {
            if (isResolved) return;
            if (input.value.trim()) submit(); else cancel(true);
        });
    });
}

async function fetchActiveReminders() {
    try {
        const res = await fetch(`${API_BASE}/system/reminders?t=${Date.now()}`);
        if (res.ok) {
            const reminders = await res.json();
            // Двойная защита: сервер уже фильтрует по активному хранилищу,
            // но на всякий случай отсекаем чужие напоминания и на клиенте,
            // чтобы в колокольчике/бейдже не всплывали записи из других хранилищ.
            const currentVault = window.currentVaultPath;
            if (currentVault && Array.isArray(reminders)) {
                return reminders.filter(r => !r.vault_path || r.vault_path === currentVault);
            }
            return reminders;
        }
    } catch (e) {
        console.error("Failed to fetch reminders:", e);
    }
    return [];
}

async function cancelReminder(reminderId, event) {
    if (event) event.stopPropagation();
    try {
        const res = await fetch(`${API_BASE}/system/reminders/${reminderId}`, { method: 'DELETE' });
        if (res.ok) {
            renderRemindersDropdown();
            updateBellBadge();
        }
    } catch (e) {
        console.error("Failed to cancel reminder:", e);
    }
}

async function updateBellBadge() {
    // ЗАЩИТА: Не опрашиваем базу, если напоминания вырезаны
    if (window.appSettings && window.appSettings.extensions && window.appSettings.extensions.reminders === false) return;

    const badge = document.getElementById('bell-badge');
    if (!badge) return;
    const reminders = await fetchActiveReminders();
    if (reminders.length > 0) {
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

async function renderRemindersDropdown() {
    const list = document.getElementById('reminders-list');
    if (!list) return;
    list.innerHTML = '';

    const reminders = await fetchActiveReminders();
    if (reminders.length === 0) {
        list.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 13px;">${t('menu.remindersEmpty')}</div>`;
        return;
    }

    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    reminders.forEach(r => {
        const div = document.createElement('div');
        div.className = 'reminder-item';

        const dueTimeStr = formatDateTime(r.due_time);

        const plainTitle = escapeHtml(stripMarkdownToPlain(r.task_title));
        div.innerHTML = `
            <div class="reminder-info">
                <div class="reminder-task-title" title="${plainTitle}">${renderInlineMarkdown(r.task_title)}</div>
                <div class="reminder-time">${dueTimeStr}</div>
            </div>
            <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIcon}</button>
        `;

        div.addEventListener('click', async (e) => {
            if (e.target.closest('.subtask-delete-btn')) return;
            if (e.target.closest('a')) return;
            document.getElementById('reminders-dropdown').classList.remove('show');
            document.getElementById('reminders-bell-trigger').classList.remove('active');

            const vaultRes = await fetch(`${API_BASE}/system/vault`);
            const currentVault = await vaultRes.json();

            if (r.vault_path && r.vault_path !== currentVault.path) {
                await fetch(`${API_BASE}/system/vault/switch`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_path: r.vault_path })
                });
                localStorage.setItem('doe-pending-highlight', r.task_id);
                window.location.reload();
                return;
            }

            fetch(`${API_BASE}/tasks/${r.task_id}/context`)
                .then(res => res.json())
                .then(context => {
                    window.navigateToEntityGlobal(context.workspace_id, context.column_id, r.task_id, null, true);
                })
                .catch(() => {
                    loadTaskIntoModal(r.task_id, true);
                    document.getElementById('task-modal').classList.add('show');
                });
        });

        div.querySelector('.subtask-delete-btn').onclick = (e) => cancelReminder(r.reminder_id, e);

        list.appendChild(div);
    });
}

setInterval(() => { if (!document.hidden) updateBellBadge(); }, 3000);

const Calendar = {
    modal: null, body: null, titleLabel: null, zoomWrapper: null, zoomSlider: null,
    events: [],
    currentDate: new Date(),
    view: 'month',
    zoomHourHeight: 60,

    init() {
        this.modal = document.getElementById('calendar-modal');
        this.body = document.getElementById('cal-body');
        this.titleLabel = document.getElementById('cal-title-label');
        this.zoomWrapper = document.getElementById('cal-zoom-wrapper');
        this.zoomSlider = document.getElementById('cal-zoom-slider');

        document.getElementById('calendar-trigger').addEventListener('click', () => this.open());

        document.getElementById('cal-prev').addEventListener('click', () => this.navigate(-1));
        document.getElementById('cal-next').addEventListener('click', () => this.navigate(1));
        document.getElementById('cal-today').addEventListener('click', () => {
            this.currentDate = new Date();
            this.render();
        });

        const viewBtns = this.modal.querySelectorAll('.cal-controls-center .segmented-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.view = btn.dataset.view;
                this.zoomWrapper.style.display = this.view === 'month' ? 'none' : 'inline-flex';
                this.render();
            });
        });

        this.zoomSlider.addEventListener('input', (e) => {
            this.zoomHourHeight = parseInt(e.target.value);
            this.body.style.setProperty('--hour-height', `${this.zoomHourHeight}px`);
        });

        this.body.addEventListener('wheel', (e) => {
            if (e.ctrlKey && this.view !== 'month') {
                e.preventDefault();

                const zoomSpeed = 0.5;
                let newZoom = this.zoomHourHeight - (e.deltaY * zoomSpeed);

                newZoom = Math.max(30, Math.min(150, newZoom));

                if (newZoom !== this.zoomHourHeight) {
                    const scrollContainer = this.body.querySelector('.cal-time-scroll');

                    if (scrollContainer) {
                        const rect = scrollContainer.getBoundingClientRect();
                        const cursorY = e.clientY - rect.top;
                        const scrollY = scrollContainer.scrollTop;

                        const absoluteY = scrollY + cursorY;
                        const zoomRatio = newZoom / this.zoomHourHeight;

                        this.zoomHourHeight = newZoom;
                        this.body.style.setProperty('--hour-height', `${this.zoomHourHeight}px`);
                        this.zoomSlider.value = this.zoomHourHeight;

                        const newAbsoluteY = absoluteY * zoomRatio;
                        scrollContainer.scrollTop = newAbsoluteY - cursorY;
                    } else {
                        this.zoomHourHeight = newZoom;
                        this.body.style.setProperty('--hour-height', `${this.zoomHourHeight}px`);
                        this.zoomSlider.value = this.zoomHourHeight;
                    }
                }
            }
        }, { passive: false });
    },

    async open() {
        closeAllDropdowns();
        this.modal.classList.add('show');

        this.currentDate = new Date();
        this.body.innerHTML = `<div class="graph-empty" style="display:flex;">${t('calendar.loading')}</div>`;

        await this.syncData();
    },

    async syncData() {
        try {
            const res = await fetch(`${API_BASE}/system/calendar`);
            if (res.ok) {
                const data = await res.json();
                const hiddenEvents = JSON.parse(localStorage.getItem('doe_hidden_cal_events') || '[]');
                this.events = data
                    .filter(ev => !hiddenEvents.includes(ev.event_id))
                    .map(ev => ({
                        ...ev,
                        dateObj: new Date(ev.due_date)
                    }));
                this.render();
            }
        } catch (e) {
            console.error("Calendar fetch error:", e);
            if (!this.events || this.events.length === 0) {
                this.body.innerHTML = `<div class="graph-empty" style="display:flex;">${t('calendar.error')}</div>`;
            }
        }
    },

    navigate(dir) {
        if (this.view === 'month') {
            this.currentDate.setMonth(this.currentDate.getMonth() + dir);
        } else if (this.view === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() + (dir * 7));
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + dir);
        }
        this.render();
    },

    getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    },

    formatTimeText(ev, isCompact = false) {
        const start = ev.dateObj;
        const end = new Date(start.getTime() + ev.duration * 1000);
        const isActive = ev.is_active;
        const now = new Date();

        const h1 = start.getHours().toString().padStart(2, '0');
        const m1 = start.getMinutes().toString().padStart(2, '0');
        const t1 = `${h1}:${m1}`;

        const h2 = end.getHours().toString().padStart(2, '0');
        const m2 = end.getMinutes().toString().padStart(2, '0');
        const t2 = `${h2}:${m2}`;

        const isSameDay = start.getFullYear() === end.getFullYear() &&
                          start.getMonth() === end.getMonth() &&
                          start.getDate() === end.getDate();

        const isStartToday = start.getFullYear() === now.getFullYear() &&
                             start.getMonth() === now.getMonth() &&
                             start.getDate() === now.getDate();

        const formatDate = (d) => d.toLocaleDateString(currentLang, {day: 'numeric', month: 'short'}).replace(/\s*г\.?/, '').trim();

        const units = t('timeUnits');
        const sec = Math.max(0, ev.duration);
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);

        let durParts = [];
        if (d > 0) durParts.push(`${d}${units.d}`);
        if (h > 0 || d > 0) durParts.push(`${h}${units.h}`);
        if (m > 0 || h > 0 || d > 0) durParts.push(`${m}${units.m}`);
        durParts.push(`${s}${units.s}`);
        const durationStr = `(${durParts.join(' ')})`;

        if (!isActive) {
            if (isSameDay) {
                return `${t1} – ${t2} ${durationStr}`;
            } else {
                return `${formatDate(start)} ${t1} – ${formatDate(end)} ${t2} ${durationStr}`;
            }
        } else {
            const suffix = isCompact ? ' – ...' : ' –';
            if (isStartToday) {
                return `${t1}${suffix}`;
            } else {
                return `${formatDate(start)} ${t1}${suffix}`;
            }
        }
    },

    render() {
        const locale = dpLocales[currentLang];
        this.body.style.setProperty('--hour-height', `${this.zoomHourHeight}px`);

        if (this.view === 'month') {
            this.renderMonth(locale);
        } else {
            this.renderTimeView(locale, this.view === 'week');
        }
    },

    renderMonth(locale) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        this.titleLabel.textContent = `${locale.months[month]} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const startDay = firstDay === 0 ? 6 : firstDay - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        let html = `<div class="cal-month-view">`;
        html += `<div class="cal-weekdays">${locale.days.map(d => `<div class="cal-weekday">${d}</div>`).join('')}</div>`;
        html += `<div class="cal-month-grid">`;

        const today = new Date();
        const addCell = (dNum, isOther, curDateObj) => {
            const isToday = !isOther && year === today.getFullYear() && month === today.getMonth() && dNum === today.getDate();

            const dayEvents = this.events.filter(ev =>
                ev.dateObj.getFullYear() === curDateObj.getFullYear() &&
                ev.dateObj.getMonth() === curDateObj.getMonth() &&
                ev.dateObj.getDate() === curDateObj.getDate()
            ).sort((a,b) => a.dateObj - b.dateObj);

            let evHtml = dayEvents.map(ev => {
                const timeText = this.formatTimeText(ev, true);
                const fullText = `${timeText} ${ev.title}`;
                return `<div class="cal-event-chip ${ev.completed ? 'is-done' : ''}" data-id="${ev.id}" data-event-id="${ev.event_id}" data-ws="${ev.workspace_id}" data-col="${ev.column_id}" data-full-title="${escapeHtml(fullText)}">${timeText} ${escapeHtml(stripMarkdownToPlain(ev.title))}</div>`;
            }).join('');

            return `<div class="cal-day-cell ${isOther ? 'other-month' : ''} ${isToday ? 'is-today' : ''}">
                <div class="cal-day-number">${dNum}</div>
                ${evHtml}
            </div>`;
        };

        for (let i = 0; i < startDay; i++) {
            const d = daysInPrevMonth - startDay + i + 1;
            html += addCell(d, true, new Date(year, month - 1, d));
        }
        for (let i = 1; i <= daysInMonth; i++) {
            html += addCell(i, false, new Date(year, month, i));
        }
        const totalCells = startDay + daysInMonth;
        const remaining = Math.ceil(totalCells / 7) * 7 - totalCells;
        for (let i = 1; i <= remaining; i++) {
            html += addCell(i, true, new Date(year, month + 1, i));
        }

        html += `</div></div>`;
        this.body.innerHTML = html;
        this.attachEventClicks();
    },

    renderTimeView(locale, isWeek) {
        let startDate;
        if (isWeek) {
            startDate = this.getStartOfWeek(this.currentDate);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);

            let m1 = locale.months[startDate.getMonth()];
            let m2 = locale.months[endDate.getMonth()];
            if (startDate.getMonth() === endDate.getMonth()) {
                this.titleLabel.textContent = `${m1} ${startDate.getFullYear()}`;
            } else {
                this.titleLabel.textContent = `${m1} - ${m2} ${startDate.getFullYear()}`;
            }
        } else {
            startDate = new Date(this.currentDate);
            const monthName = locale.monthsGenitive ? locale.monthsGenitive[startDate.getMonth()] : locale.months[startDate.getMonth()];
            this.titleLabel.textContent = `${startDate.getDate()} ${monthName} ${startDate.getFullYear()}`;
        }

        const daysCount = isWeek ? 7 : 1;
        const today = new Date();

        let headerHtml = `<div class="cal-time-header"><div class="cal-time-zone"></div><div class="cal-time-days">`;
        const colDates = [];

        for (let i = 0; i < daysCount; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            colDates.push(d);
            const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
            const dayName = locale.days[d.getDay() === 0 ? 6 : d.getDay() - 1];

            headerHtml += `<div class="cal-time-day-hdr ${isToday ? 'is-today' : ''}">
                <span>${dayName}</span><span>${d.getDate()}</span>
            </div>`;
        }
        headerHtml += `</div><div class="cal-header-scrollbar-spacer"></div></div>`;

        let gridHtml = `<div class="cal-time-scroll" id="cal-time-scroll"><div class="cal-time-grid">`;

        gridHtml += `<div class="cal-time-labels">`;
        for (let h = 0; h < 24; h++) {
            gridHtml += `<div class="cal-time-label" style="top: calc(${h} * var(--hour-height))">${h}:00</div>`;
        }
        gridHtml += `</div>`;

        gridHtml += `<div class="cal-time-columns">`;

        let earliestEventHour = 24;

        for (let i = 0; i < daysCount; i++) {
            const curDate = colDates[i];
            const curDayStartTs = new Date(curDate.getFullYear(), curDate.getMonth(), curDate.getDate(), 0, 0, 0).getTime();
            const curDayEndTs = curDayStartTs + 24 * 3600 * 1000;

            gridHtml += `<div class="cal-time-col">`;

            const dayEvents = [];
            this.events.forEach(ev => {
                const origDurSec = ev.duration > 0 ? ev.duration : 3600;
                const evStartTs = ev.dateObj.getTime();
                const evEndTs = evStartTs + origDurSec * 1000;

                if (evStartTs < curDayEndTs && evEndTs > curDayStartTs) {
                    const effectiveStartTs = Math.max(evStartTs, curDayStartTs);
                    const effectiveEndTs = Math.min(evEndTs, curDayEndTs);
                    const effectiveDurSec = (effectiveEndTs - effectiveStartTs) / 1000;

                    dayEvents.push({
                        originalEv: ev,
                        dateObj: new Date(effectiveStartTs),
                        effectiveDurSec: effectiveDurSec,
                        origDurSec: origDurSec,
                        isContinuation: evStartTs < curDayStartTs
                    });
                }
            });

            dayEvents.sort((a,b) => a.dateObj.getTime() - b.dateObj.getTime());

            const groups = [];
            let currentGroup = [];
            let groupEnd = 0;

            dayEvents.forEach(mappedEv => {
                const start = mappedEv.dateObj.getTime();
                const end = start + Math.max(mappedEv.effectiveDurSec * 1000, 2400000);

                if (mappedEv.dateObj.getHours() < earliestEventHour) earliestEventHour = mappedEv.dateObj.getHours();

                if (currentGroup.length === 0) {
                    currentGroup.push({ mappedEv, start, end, colIndex: 0 });
                    groupEnd = end;
                } else if (start < groupEnd) {
                    let colIndex = 0;
                    while (currentGroup.some(item => item.colIndex === colIndex && item.end > start)) {
                        colIndex++;
                    }
                    currentGroup.push({ mappedEv, start, end, colIndex });
                    groupEnd = Math.max(groupEnd, end);
                } else {
                    groups.push(currentGroup);
                    currentGroup = [{ mappedEv, start, end, colIndex: 0 }];
                    groupEnd = end;
                }
            });
            if (currentGroup.length > 0) groups.push(currentGroup);

            groups.forEach(group => {
                const columnsCount = Math.max(...group.map(item => item.colIndex)) + 1;

                group.forEach(item => {
                    const mappedEv = item.mappedEv;
                    const ev = mappedEv.originalEv;
                    const hours = mappedEv.dateObj.getHours();
                    const mins = mappedEv.dateObj.getMinutes();

                    const startSecFromMidnight = (hours * 3600) + (mins * 60);
                    const secondsInDay = 24 * 3600;
                    const maxAllowedDurSec = secondsInDay - startSecFromMidnight;

                    const visDurSec = Math.min(Math.max(mappedEv.effectiveDurSec, 2400), maxAllowedDurSec);

                    const topPos = `calc((${hours} + ${mins}/60) * var(--hour-height))`;
                    const heightPos = `calc((${visDurSec}/3600) * var(--hour-height))`;

                    const widthPercent = 100 / columnsCount;
                    const leftPercent = item.colIndex * widthPercent;

                    const timeText = this.formatTimeText(ev, false);

                    const positionStyle = `top: ${topPos}; height: ${heightPos}; left: ${leftPercent}%; width: calc(${widthPercent}% - 2px);`;

                    const continuationClass = mappedEv.isContinuation ? 'is-continuation' : '';

                    gridHtml += `<div class="cal-abs-event ${ev.completed ? 'is-done' : ''} ${continuationClass}"
                                      data-id="${ev.id}" data-event-id="${ev.event_id}" data-ws="${ev.workspace_id}" data-col="${ev.column_id}"
                                      style="${positionStyle}">
                        <div class="cal-ev-title" data-full-title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>
                        <div class="cal-ev-time" data-full-title="${escapeHtml(timeText)}">${timeText}</div>
                    </div>`;
                });
            });

            if (curDate.getFullYear() === today.getFullYear() && curDate.getMonth() === today.getMonth() && curDate.getDate() === today.getDate()) {
                const nowH = today.getHours();
                const nowM = today.getMinutes();
                const nowTop = `calc((${nowH} + ${nowM}/60) * var(--hour-height))`;

                const timeStr = `${nowH.toString().padStart(2, '0')}:${nowM.toString().padStart(2, '0')}`;
                gridHtml += `<div class="cal-now-line" style="top: ${nowTop}" data-time="${timeStr}"></div>`;

                if (earliestEventHour === 24) earliestEventHour = Math.max(0, nowH - 1);
            }

            gridHtml += `</div>`;
        }

        gridHtml += `</div></div></div>`;

        this.body.innerHTML = `<div class="cal-time-view">${headerHtml}${gridHtml}</div>`;
        this.attachEventClicks();

        setTimeout(() => {
            const scrollEl = document.getElementById('cal-time-scroll');
            if (scrollEl) {
                let targetHour = earliestEventHour === 24 ? 8 : earliestEventHour - 1;
                targetHour = Math.max(0, targetHour);

                scrollEl.scrollTo({
                    top: targetHour * this.zoomHourHeight,
                    behavior: 'smooth'
                });
            }
        }, 100);
    },

    attachEventClicks() {
        this.body.querySelectorAll('.cal-event-chip, .cal-abs-event').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(el.dataset.id);
                const wsId = parseInt(el.dataset.ws);
                const colId = parseInt(el.dataset.col);

                this.modal.classList.remove('show');
                window.navigateToEntityGlobal(wsId, colId, id, null, true, true);
            });

            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const eventId = el.dataset.eventId;

                if (eventId) {
                    closeAllDropdowns();

                    const menu = document.getElementById('cal-context-menu');
                    menu.dataset.eventId = eventId;

                    menu.style.visibility = 'hidden';
                    menu.style.display = 'block';
                    menu.classList.add('show');

                    let left = e.clientX;
                    let top = e.clientY;
                    const rect = menu.getBoundingClientRect();

                    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
                    if (top + rect.height > window.innerHeight - 10) top = window.innerHeight - rect.height - 10;

                    menu.style.left = `${left}px`;
                    menu.style.top = `${top}px`;

                    menu.style.visibility = '';
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Calendar.init();
});

