let statsWeekOffset = 0;

document.getElementById('statistics-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    statsWeekOffset = 0;
    openStatisticsModal();
});

document.getElementById('stats-prev-btn')?.addEventListener('click', () => {
    statsWeekOffset++;
    openStatisticsModal();
});

document.getElementById('stats-next-btn')?.addEventListener('click', () => {
    if (statsWeekOffset > 0) {
        statsWeekOffset--;
        openStatisticsModal();
    }
});

async function openStatisticsModal() {
    const modal = document.getElementById('statistics-modal');
    const loading = document.getElementById('stats-loading');
    const content = document.getElementById('stats-content');

    modal.classList.add('show');

    const nextBtn = document.getElementById('stats-next-btn');
    if (statsWeekOffset === 0) {
        nextBtn.style.visibility = 'hidden';
    } else {
        nextBtn.style.visibility = 'visible';
    }

    if (content.style.display === 'flex') {
        content.style.opacity = '0.4';
        content.style.pointerEvents = 'none';
    } else {
        loading.style.display = 'block';
    }

    try {
        const res = await fetch(`${API_BASE}/system/statistics?offset_weeks=${statsWeekOffset}`);
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();

        document.getElementById('stats-date-label').textContent = data.date_range_label;

        document.getElementById('stat-val-done').textContent = data.total_done;

        let h = Math.floor(data.total_time / 3600);
        let m = Math.floor((data.total_time % 3600) / 60);
        document.getElementById('stat-val-time').textContent = h > 0 ? `${h}${t('timeUnits.h')} ${m}${t('timeUnits.m')}` : `${m}${t('timeUnits.m')}`;

        const applyTrend = (elId, pct) => {
            const el = document.getElementById(elId);
            if (!el) return;

            if (pct === 0) {
                el.style.display = 'none';
            } else {
                el.style.display = 'block';
                if (pct > 0) {
                    el.textContent = `+${pct}%`;
                    el.className = 'stats-trend positive';
                } else {
                    el.textContent = `${pct}%`;
                    el.className = 'stats-trend negative';
                }
            }
        };

        applyTrend('stat-trend-time', data.trend_time_pct);
        applyTrend('stat-trend-done', data.trend_done_pct);

        const insightEl = document.getElementById('stats-insight');
        const fullDayNamesRu = ['в <b>понедельник</b>', 'во <b>вторник</b>', 'в <b>среду</b>', 'в <b>четверг</b>', 'в <b>пятницу</b>', 'в <b>субботу</b>', 'в <b>воскресенье</b>'];
        const fullDayNamesEn = ['on <b>Monday</b>', 'on <b>Tuesday</b>', 'on <b>Wednesday</b>', 'on <b>Thursday</b>', 'on <b>Friday</b>', 'on <b>Saturday</b>', 'on <b>Sunday</b>'];
        const fullDayNames = currentLang === 'ru' ? fullDayNamesRu : fullDayNamesEn;

        if (data.total_time === 0) {
            insightEl.innerHTML = `<span>💡 ${t('stats.insightEmpty')}</span>`;
        } else {
            const bestDayName = data.best_day !== null ? fullDayNames[data.best_day] : '';
            if (data.trend_time_pct > 0) {
                insightEl.innerHTML = `<span>✨ ${t('stats.insightPositive', data.trend_time_pct, bestDayName)}</span>`;
            } else if (data.trend_time_pct < 0) {
                insightEl.innerHTML = `<span>📉 ${t('stats.insightNegative', data.trend_time_pct, bestDayName)}</span>`;
            } else {
                insightEl.innerHTML = `<span>⚖️ ${t('stats.insightNeutral', bestDayName)}</span>`;
            }
        }

        const topContainer = document.getElementById('stats-top-tasks');
        const topTitleEl = document.getElementById('stats-top-title-el');

        const renderTasksList = (title, tasks, emptyMsg) => {
            topTitleEl.textContent = title;
            topContainer.innerHTML = '';

            if (tasks.length === 0) {
                topContainer.innerHTML = `<div style="font-size: 13px; color: var(--text-secondary); opacity: 0.7; text-align: center; padding: 20px 16px 12px;">${emptyMsg}</div>`;
                return;
            }

            tasks.forEach(task => {
                const timeFormatted = formatDetailedDuration(task.time_spent);
                topContainer.innerHTML += `
                    <div class="stats-top-item" onclick="if(event.target.closest('a')) { document.getElementById('statistics-modal').classList.remove('show'); return; } document.getElementById('statistics-modal').classList.remove('show'); loadTaskIntoModal(${task.id}, true); document.getElementById('task-modal').classList.add('show');">
                        <div class="stats-top-header">
                            <div class="stats-top-title">${renderInlineMarkdown(task.title)}</div>
                            <div class="stats-top-time">${timeFormatted}</div>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px;">
                            <div class="stats-top-progress-bg">
                                <div class="stats-top-progress-fill" style="width: 0%;" data-target="${task.percentage}%"></div>
                            </div>
                            <div class="stats-top-pct" style="margin-left: auto;">${task.percentage}%</div>
                        </div>
                    </div>
                `;
            });

            setTimeout(() => {
                topContainer.querySelectorAll('.stats-top-progress-fill').forEach(fill => fill.style.width = fill.dataset.target);
            }, 50);
        };

        const chartContainer = document.getElementById('stats-activity-chart');
        chartContainer.innerHTML = '';

        let maxTime = Math.max(...data.chart_data.map(d => d.time_spent));
        if (maxTime === 0) maxTime = 1;

        const daysShort = currentLang === 'ru' ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

        data.chart_data.forEach((day, index) => {
            const pct = day.time_spent === 0 ? 0 : Math.max(2, Math.round((day.time_spent / maxTime) * 100));
            const timeFormatted = formatDetailedDuration(day.time_spent);
            const tooltipText = t('stats.tooltip', day.tasks_done, timeFormatted);
            const isBest = day.day_name === data.best_day;
            const dayNameStr = daysShort[day.day_name];

            const dateObj = new Date(day.date);
            const todayObj = new Date();
            const isToday = dateObj.getFullYear() === todayObj.getFullYear() &&
                            dateObj.getMonth() === todayObj.getMonth() &&
                            dateObj.getDate() === todayObj.getDate();

            const colDiv = document.createElement('div');
            colDiv.className = `stats-chart-col ${isBest ? 'is-best' : ''}`;
            colDiv.title = tooltipText;
            colDiv.innerHTML = `
                <div class="stats-chart-bar-bg">
                    <div class="stats-chart-bar-fill" style="height: 0%;" data-target="${pct}%"></div>
                </div>
                <div class="stats-chart-label-wrapper">
                    <div class="stats-chart-label">${dayNameStr}</div>
                    <div class="stats-chart-indicator ${isToday ? 'is-today' : ''}"></div>
                </div>
            `;

            colDiv.onclick = () => {
                const isAlreadySelected = colDiv.classList.contains('is-selected');

                chartContainer.querySelectorAll('.stats-chart-col').forEach(c => c.classList.remove('is-selected'));

                if (isAlreadySelected) {
                    renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));
                } else {
                    colDiv.classList.add('is-selected');
                    renderTasksList(t('stats.dayTasks', dayNameStr), day.tasks, t('stats.emptyDay'));
                }
            };

            chartContainer.appendChild(colDiv);
        });

        renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));

        const modalBody = modal.querySelector('.modal-body');
        modalBody.onclick = (e) => {
            if (!e.target.closest('.stats-chart-col') && !e.target.closest('.stats-top-item')) {
                const hasSelection = chartContainer.querySelector('.stats-chart-col.is-selected');
                if (hasSelection) {
                    chartContainer.querySelectorAll('.stats-chart-col').forEach(c => c.classList.remove('is-selected'));
                    renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));
                }
            }
        };

        loading.style.display = 'none';
        content.style.display = 'flex';
        content.style.opacity = '1';
        content.style.pointerEvents = 'auto';

        setTimeout(() => {
            const bars = chartContainer.querySelectorAll('.stats-chart-bar-fill');
            bars.forEach(bar => bar.style.height = bar.dataset.target);
        }, 50);

    } catch (e) {
        console.error("Stats loading error", e);
        loading.textContent = t('alerts.error');
        content.style.opacity = '1';
        content.style.pointerEvents = 'auto';
    }
}


