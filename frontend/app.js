let state = { columns: [], workspaces: [], activeWorkspaceId: null };
const API_BASE = '/api/v1';
window.prioritySettings = { 
    show_always: false,
    t_low: 40, t_mid: 70, 
    e_low: "😞", e_mid: "😐", e_high: "🤩", e_none: "?",
    c_low: "#D35446", "c_mid": "#B3863A", "c_high": "#89A085", c_none: "#7C5CB7"
};
if (navigator.userAgent.toLowerCase().includes('mac')) {
    document.documentElement.classList.add('mac-os');
}
let cmEditor = null;

if (navigator.userAgent.toLowerCase().includes('windows')) {
    document.documentElement.classList.add('win-os');
}

const translations = {
    ru: {
        searchPlaceholder: 'Поиск...',
        loading: 'Загрузка...',
        settings: 'Настройки', theme: 'Тема', language: 'Язык', about: 'О приложении', workspace: 'Doe Board', cancel: 'Отмена', close: 'Закрыть',
        newColumn: '+ Создать колонку', newTask: '+ Новая карточка', subtasks: 'Чек-лист',
        menu: { 
            mode: 'Режим колонки', collapse: 'Свернуть колонку', rename: 'Переименовать', 
            delete: 'Удалить', clear: 'Очистить', open: 'Открыть', 
            deleteCard: 'Удалить карточку', clearTimer: 'Очистить таймер',
            exportCard: 'Экспорт в Markdown', moveCard: 'Переместить...', attachmentsSettings: 'Хранилище вложений', fontSettings: 'Шрифт',
            exportJson: 'Экспорт в JSON', importJson: 'Импорт из JSON',
            copyCardLink: 'Скопировать ссылку', dueDate: 'Установить дедлайн', clearDueDate: 'Очистить дедлайн', notify: 'Напомнить',
            reminders: 'Активные напоминания', remindersEmpty: 'Нет активных напоминаний', extensions: 'Расширения',
            priority: 'Приоритетность', sort: 'Сортировка',
            prioritySettings: 'Приоритетность'
        },
        copied: 'Скопировано!',
        sort: { created: 'По дате создания', updated: 'По дате изменения', priority: 'По приоритетности', deadline: 'По дедлайну', asc: 'По возрастанию', desc: 'По убыванию', apply: 'Применить' },
        stats: {
            title: 'Статистика', tasksDone: 'Завершено', timeTracked: 'В фокусе', overdue: 'Просрочено',
            activityChart: 'Активность по дням', topTasks: 'Куда ушло время', dayTasks: (day) => `Куда ушло время (${day})`,
            emptyTop: 'На этой неделе вы еще не трекали время. Пора за работу!',
            emptyDay: 'В этот день активности не было',
            tooltip: (done, time) => `Завершено задач: ${done}\nВ фокусе: ${time}`,
            insightPositive: (pct, day) => `Отлично! Вы были на ${pct}% продуктивнее, чем на прошлой неделе. Самый мощный день — ${day}.`,
            insightNegative: (pct, day) => `Продуктивность снизилась на ${Math.abs(pct)}% по сравнению с прошлой неделей. Но ${day} вы поработали хорошо.`,
            insightNeutral: (day) => `Стабильная неделя. Больше всего времени вы были в фокусе в ${day}.`,
            insightEmpty: 'Трекайте время и закрывайте задачи, чтобы собрать аналитику.'
        },
        modals: { 
            extTitle: 'Расширения', extSearch: 'Поиск', extCalendar: 'Календарь', extReminders: 'Напоминания', extGraph: 'Граф связей', extTabs: 'Вкладки', extDeadlines: 'Дедлайны', extExport: 'Экспорт карточек', extPriority: 'Приоритетность', extAi: 'ИИ-ассистент', extStatistics: 'Статистика', sortTitle: 'Сортировка',
            priorityTitle: 'Приоритетность', prioC: 'Одобренная ценность (через год)', prioD: 'Шанс успеха', prioA: 'Фоновая грызня (висит грузом)', prioB: 'Боль процесса', prioE: 'Затянутость', prioResult: 'Итоговая приоритетность:', btnClear: 'Очистить',
            prioSettingsTitle: 'Приоритетность', // <--- ДОБАВЛЕНО
            prioSettingsDesc: 'Настройте границы, цвета и эмодзи', // <--- ДОБАВЛЕНО
            prioShowAlways: 'Показывать на всех карточках',
            prioShowAlwaysDesc: 'Отображать пустой приоритет, если он не задан',
            prioBound: 'Граница: до',
            prioNone: 'Не указан (если включено)',
            prioLvlLow: 'Низкий (< %)', // <--- ДОБАВЛЕНО
            prioLvlMid: 'Средний (< %)', // <--- ДОБАВЛЕНО
            prioLvlHigh: 'Высокий (Остальное)', // <--- ДОБАВЛЕНО
            prioSec1: 'Двигатели делания', prioSec2: 'Психоэмоциональный баланс', prioSec3: 'Издержки процесса',
            prioF: 'Нужно ли отчитываться за задачу в ближайшие 2 недели?', prioP: 'Лучше сделать данную задачу просто заранее?', prioS: 'Принесет ли выполнение спокойствие здесь и сейчас?', prioH: 'Способна ли задача навредить физически или ментально?',
            prioNo: 'Нет', prioMaybe: 'Хз', prioYes: 'Да',
            notifyTitle: 'Напомнить', notifyRelative: 'Через', notifyAbsolute: 'В точное время', btnSet: 'Установить',
            fontTitle: 'Шрифт приложения', fontInputLabel: 'Название системного шрифта', fontFileLabel: 'Шрифт хранилища (переносной)',
            fontWarning: 'Загружается в папку хранилища.', fontSearchPlaceholder: 'Поиск или ввод шрифта...',
            fontNotFound: 'Шрифт не найден. Нажмите Enter для применения.', fontSystemDefault: 'По умолчанию',
            fontSelectCustom: 'Выбрать .ttf / .otf ...',
            dueDateTitle: 'Установить дедлайн', dueDateSet: 'Установить дедлайн', dueDateClear: 'Очистить',
            themeTitle: 'Тема оформления', light: 'Светлая', dark: 'Тёмная', 
            langTitle: 'Выберите язык', aboutTitle: 'О приложении', 
            aboutDesc: 'Aesthetic. Local-first. Kanban sanctuary.',
            attTitle: 'Хранилище вложений', 
            attLocalTitle: 'Внутри хранилища',
            attLocalDesc: 'Файлы переносятся вместе с доской (По умолчанию)',
            attExternalTitle: 'Внешняя папка',
            attSelectBtn: 'Выбрать папку...',
            attWarning: 'При использовании внешней папки файлы не будут копироваться на флешку автоматически при переносе хранилища.',
            exportTitle: 'Экспорт карточки', exportIncludeAtt: 'Экспортировать с вложениями', exportIncludeCode: 'Экспортировать кодовую базу проекта', btnExport: 'Экспортировать',
            moveTitle: 'Перемещение карточки', moveSelectCol: 'Вкладка и колонка', btnMove: 'Переместить',
            detachTitle: 'Отвязать карточку?', detachDesc: 'Эта карточка привязана к нескольким карточкам.',
            detachCurrent: 'Только от текущей карточки', detachAll: 'От всех карточек (сделать независимой)',
            completeSubtask: 'Отметить как выполненную', uncompleteSubtask: 'Снять отметку о выполнении',
            completeSubtaskTitle: 'Выполнить подзадачу?', completeSubtaskDesc: 'Она будет отмечена как выполненная у всех родительских карточек.', btnComplete: 'Выполнить',
            // Автоматизации
            autoTitle: 'Автоматизации', autoEmpty: 'Нет автоматизаций. Нажмите «+» чтобы создать.',
            autoAddBtn: '+ Новая автоматизация',
            autoType: 'Тип автоматизации',
            autoTypeRecurring: '🔄 Повторяющаяся карточка',
            autoTypeSort: '↕️ Сортировка колонки',
            autoTypeClear: '🧹 Очистка колонки',
            autoNamePlaceholder: 'Название автоматизации...', autoColumn: 'Колонка',
            autoTitlePlaceholder: 'Шаблон заголовка, например: Обзор {date}',
            autoDescPlaceholder: 'Шаблон описания (опционально)...',
            autoVarsHint: 'Переменные: {date}, {date:формат}, {time}, {weekday}, {week_number}, {month_name}',
            autoSortBy: 'Сортировать по:', autoSortPosition: 'Позиции', autoSortTitle: 'Названию',
            autoSortCreated: 'Дате создания', autoSortPriority: 'Приоритету', autoSortDue: 'Сроку',
            autoSortOrder: 'Порядок:', autoSortAsc: 'По возрастанию', autoSortDesc: 'По убыванию',
            autoSortHint: 'Срабатывает автоматически при создании или перемещении карточки в эту колонку.',
            autoMaxAge: 'Удалять карточки старше:', autoMaxAgeUnit: 'мин.',
            autoClearHint: 'Карточки старше указанного времени будут удалены при следующей проверке по расписанию.',
            autoClearImmediateTitle: 'Мгновенное удаление',
            autoClearImmediateDesc: 'Удалять карточку сразу при её попадании в колонку',
            autoClearOlder: 'Старше', autoCheck: 'Проверка',
            autoSchedule: 'Расписание', autoHourly: 'Каждый час', autoDaily: 'Ежедневно', autoWeekdays: 'По будням',
            autoWeekly: 'Еженедельно', autoMonthly: 'Ежемесячно', autoTime: 'Время:',
            autoDayOfMonth: 'День месяца:', autoNextRun: 'След. запуск',
            autoOnEvent: 'По событию',
            autoRunNow: 'Запустить сейчас', autoRunDone: (id) => `Создана карточка #${id}`,
            autoRunDoneClear: (n) => `Удалено карточек: ${n}`,
            autoEdit: 'Редактировать', autoDelete: 'Удалить',
            autoDeleteTitle: 'Удалить автоматизацию?', autoDeleteConfirm: 'Автоматизация будет удалена безвозвратно.',
            autoValidationError: 'Заполните название и выберите колонку',
            autoNoDaysError: 'Выберите хотя бы один день недели',
            autoSaveError: 'Ошибка сохранения', autoNetworkError: 'Сетевая ошибка',
            autoRunError: 'Не удалось запустить',
            autoOrdinal: (n) => `${n}-е`,
            btnSave: 'Сохранить', btnCreate: 'Создать',
            extAutomations: 'Автоматизации',
        },
        copyLink: 'Копировать ссылку',
        detachSubtask: 'Отвязать от чек-листа (сделать независимой)',
        cyclicError: 'Нельзя привязать! Возникнет бесконечный цикл.',
        columnModes: { default: 'Стандартный', track_time: 'Учёт времени', completion: 'Результирующий' },
        defaultWorkspace: 'Начальная вкладка',
        attachments: 'Вложения', addAttachment: '+ Добавить вложение...',
        missingTooltip: 'Файл не найден. Нажмите, чтобы перепривязать',
        pendingTooltip: 'Ожидаемое вложение. Нажмите, чтобы привязать файл',
        pendingTitle: (name) => `Ожидание файла для [${name}](doe/)`,
        expectedFilename: 'Ожидаемое имя файла',
        vault: {
            subtitle: 'Aesthetic. Local-first. Kanban sanctuary.',
            createTitle: 'Создать хранилище',
            createDesc: 'Начните новое локальное хранилище на вашем устройстве',
            openTitle: 'Открыть хранилище',
            openDesc: 'Выберите существующее хранилище из вашего устройства',
            privacy: 'Все данные хранятся только на вашем устройстве.<br>Конфиденциальность. Без облака. Без компромиссов.',
            createPrompt: 'Введите название и выберите папку, где оно будет сохранено',
            namePlaceholder: 'Название нового хранилища...',
            selectFolder: 'Выбрать местоположение',
            errorInvalid: 'Папка не содержит данных Doe',
            recent: 'История хранилищ',
            recentEmpty: 'Ранее открытые хранилища появятся здесь'
        },
        card: { timeSpent: 'Времени потрачено:', unknownTime: 'неизвестно' },
        taskModal: {
            descPlaceholder: 'Кликните, чтобы добавить описание...',
            inputPlaceholder: 'Описание карточки...',
            subtasksPlaceholder: '+ Добавить пункт...',
            timerPlaceholder: '1ч 30м',
            created: 'Создано',
            updated: 'Изменено',
            uploading: (name) => `[⏳ Сохраняем ${name} in Vault...]`,
            uploadError: (name) => `[❌ Ошибка сохранения: ${name}]`,
            uploadNetworkError: (name) => `[❌ Ошибка сети: ${name}]`
        },
        timeUnits: { y: 'л', w: 'н', d: 'д', h: 'ч', m: 'м', s: 'с' },
        timeUnitsFull: { s: 'секунд', m: 'минут', h: 'часов', d: 'дней', w: 'недель', mo: 'месяцев', y: 'лет' },
        prompts: {
            taskTitle: 'Название карточки:', columnTitle: 'Название колонки:', renameColumn: 'Новое название:', 
            deleteConfirmTitle: 'Удалить колонку?', deleteConfirmDesc: 'Все карточки внутри будут потеряны.',
            clearConfirmTitle: 'Очистить колонку?', clearConfirmDesc: 'Все карточки внутри будут удалены безвозвратно.',
            newTabTitle: 'Название новой вкладки:', deleteTabConfirm: 'Удалить вкладку?',
            deleteTabDesc: 'Вкладка и все колонки в ней будут удалены навсегда.'
        },
        errors: { tooLong: 'Максимум 1000 символов' },
        graph: { title: 'Граф связей', empty: 'Карточек пока нет.\nСоздайте карточки на доске.', arrows: 'Стрелки' },
        calendar: { today: 'Сегодня', month: 'Месяц', week: 'Неделя', day: 'День', loading: 'Загрузка данных...', error: 'Ошибка загрузки' },
        cal: { dayMon: 'ПН', dayTue: 'ВТ', dayWed: 'СР', dayThu: 'ЧТ', dayFri: 'ПТ', daySat: 'СБ', daySun: 'ВС' },
        alerts: { loadError: 'Не удалось загрузить доску', error: 'Ошибка' },
        ai: {
            hardwareRam: 'Оперативная память',
            hardwareTier: 'Уровень',
            tierLight: 'Базовый',
            tierStandard: 'Стандарт',
            tierPro: 'Pro',
            statusInstalled: 'Установлено',
            statusRequiresDownload: 'Требуется загрузка',
            btnDownload: 'Скачать',
            btnDownloadSize: (size) => `Скачать (~${size} ГБ)`,
            toastReadyTitle: 'ИИ Готов',
            toastReadyMsg: (m) => `Модель ${m} успешно скачана`,
            toastErrTitle: 'Ошибка загрузки',
            toastErrUnknown: 'Неизвестная ошибка',
            toastCancelTitle: 'Загрузка прервана',
            toastCancelMsg: (m) => `Скачивание модели ${m} успешно отменено`,
            toastDeleted: 'Удалено',
            toastDeletedMsg: (m) => `Модель ${m} удалена`,
            toastDeleteErr: 'Не удалось удалить файл',
            toastUnsupportedTitle: 'Не поддерживается',
            toastUnsupportedMsg: 'Локальный ИИ-ассистент в данный момент доступен только для macOS',
            confirmDeleteTitle: 'Удалить модель?',
            confirmDeleteMsg: (m) => `Модель ${m} будет удалена с устройства.`,
            starting: 'Запуск...',
            errorText: 'Ошибка',
            btnDeleteTitle: 'Удалить модель с диска',
            btnCancelTitle: 'Отменить',
            gbSuffix: 'ГБ',
            hintText: 'Локальная нейросеть анализирует ваше состояние каждое утро и умно расставляет приоритеты задач. Не требует интернета.',
            analyzeAll: 'Анализировать все задачи',
            analyzeAllDesc: 'Если выкл — оценивает только видимые на доске',
            setupBtn: '✨ Настроить ИИ-ассистента',
            readyBtn: 'Готово',
            chatPlaceholder: 'Спроси меня о чём-нибудь...',
            sendAria: 'Отправить',
            floatingBtnTitle: 'ИИ-ассистент',
            searchModels: 'Поиск модели...',
            noCompatible: 'Совместимых моделей не найдено для вашего уровня ПК',
            toggleMenuTip: 'Включить / выключить AI в меню',
            // AI actions in journal
            actionsHeader: 'Я хочу выполнить следующие действия:',
            actionCreateTask: (title, colName) => `Создать задачу «${title}» в колонке «${colName}»`,
            actionMoveTask: (taskName, colName) => `Переместить «${taskName}» в колонку «${colName}»`,
            actionDeleteTask: (taskName) => `Удалить задачу «${taskName}»`,
            actionCreateColumn: (title) => `Создать колонку "${title}"`,
            actionDeleteColumn: (colName) => `Удалить колонку «${colName}»`,
            actionCreateWorkspace: (name) => `Создать вкладку "${name}"`,
            actionSetTheme: (theme) => `Сменить тему на ${theme}`,
            actionToggleExtOn: (ext) => `Включить расширение ${ext}`,
            actionToggleExtOff: (ext) => `Выключить расширение ${ext}`,
            actionPrioritizeAll: 'Пересчитать приоритеты',
            actionClearAllPriorities: 'Сбросить все приоритеты',
            actionSearchBoard: (q) => `Поиск: «${q}»`,
            actionGetTaskDetails: (name) => `Загрузить детали задачи «${name}»`,
            actionRememberFact: (fact) => `Запомнить факт: "${fact}"`,
            actionForgetFact: (fact) => `Забыть факт: "${fact}"`,
            actionChangeLang: (lang) => `Изменить язык на ${lang}`,
            actionSwitchWorkspace: (name) => `Переключиться на вкладку «${name}»`,
            actionOpenTask: (name) => `Открыть карточку «${name}»`,
            actionUpdateTask: (name) => `Изменить карточку «${name}»`,
            actionClearChat: 'Очистить историю диалога',
            actionSetReminders: (count) => `Установить напоминания (${count} шт.)`,
            actionDeleteReminder: (id) => `Отменить напоминание ${id.split('-')[0]}...`,
            btnConfirm: 'Разрешить',
            actionsCancelled: 'Действия отменены пользователем.',
            actionsExecuted: '✅ Действия выполнены!',
            actionsPartial: '⚠️ Часть действий не удалось:',
            actionsError: '❌ Ошибка выполнения. Проверьте правильность ID.',
            taskRef: (id) => `Задача #${id}`,
        }
    },
    en: {
        searchPlaceholder: 'Search...',
        loading: 'Loading...',
        settings: 'Settings', theme: 'Theme', language: 'Language', about: 'About', workspace: 'Doe Board', cancel: 'Cancel', close: 'Close',
        newColumn: '+ Create column', newTask: '+ New card', subtasks: 'Checklist',
        menu: { 
            mode: 'Column mode', collapse: 'Collapse column', rename: 'Rename', 
            delete: 'Delete', clear: 'Clear', open: 'Open', 
            deleteCard: 'Delete card', clearTimer: 'Clear timer',
            exportCard: 'Export to Markdown', moveCard: 'Move...', attachmentsSettings: 'Attachments Storage', fontSettings: 'Font',
            exportJson: 'Export to JSON', importJson: 'Import from JSON',
            copyCardLink: 'Copy link', dueDate: 'Set deadline', clearDueDate: 'Clear deadline', notify: 'Remind me',
            reminders: 'Active Reminders', remindersEmpty: 'No active reminders', extensions: 'Extensions',
            priority: 'Priority', sort: 'Sort',
            prioritySettings: 'Priority Settings'
        },
        copied: 'Copied!',
        sort: { created: 'By creation date', updated: 'By modification date', priority: 'By priority', deadline: 'By deadline', asc: 'Ascending', desc: 'Descending', apply: 'Apply' },
        stats: {
            title: 'Statistics', tasksDone: 'Done', timeTracked: 'In Focus', overdue: 'Overdue',
            activityChart: 'Daily Activity', topTasks: 'Where time went', dayTasks: (day) => `Where time went (${day})`,
            emptyTop: 'You haven\'t tracked any time this week. Let\'s get to work!',
            emptyDay: 'No activity on this day',
            tooltip: (done, time) => `Tasks done: ${done}\nTime spent: ${time}`,
            insightPositive: (pct, day) => `Great job! You were ${pct}% more productive than last week. Your best day was ${day}.`,
            insightNegative: (pct, day) => `Productivity dropped by ${Math.abs(pct)}% compared to last week. But you did well on ${day}.`,
            insightNeutral: (day) => `A stable week. You focused the most on ${day}.`,
            insightEmpty: 'Track your time and complete tasks to build analytics.'
        },
        modals: { 
            extTitle: 'Extensions', extSearch: 'Search', extCalendar: 'Calendar', extReminders: 'Reminders', extGraph: 'Connections Graph', extTabs: 'Tabs', extDeadlines: 'Deadlines', extExport: 'Card Export', extPriority: 'Priority', extAi: 'AI-assistant', extStatistics: 'Statistics', sortTitle: 'Sorting',
            priorityTitle: 'Priority', prioC: 'Approved value (in a year)', prioD: 'Chance of success', prioA: 'Background gnawing (weighs heavy)', prioB: 'Pain of the process', prioE: 'Protraction', prioResult: 'Total Priority:', btnClear: 'Clear',
            prioSettingsTitle: 'Priority',
            prioSettingsDesc: 'Configure thresholds, colors and emojis',
            prioShowAlways: 'Show on all cards',
            prioShowAlwaysDesc: 'Display empty priority if not set',
            prioLvlLow: 'Low (< %)',
            prioLvlMid: 'Mid (< %)',
            prioLvlHigh: 'High (rest)',
            prioBound: 'Threshold: up to',
            prioNone: 'None (if enabled)',
            prioSec1: 'Drivers of Doing', prioSec2: 'Psycho-Emotional Balance', prioSec3: 'Execution Costs',
            prioF: 'Do you need to report on this task within 2 weeks?', prioP: 'Is it better to do this task simply in advance?', prioS: 'Will execution bring tranquility right here and now?', prioH: 'Can the task cause physical or mental harm?',
            prioNo: 'No', prioMaybe: 'Dunno', prioYes: 'Yes',
            notifyTitle: 'Remind me', notifyRelative: 'In', notifyAbsolute: 'At exact time', btnSet: 'Set',
            fontTitle: 'App Font', fontInputLabel: 'System font name', fontFileLabel: 'Vault font (portable)',
            fontWarning: 'Saved inside the vault folder.', fontSearchPlaceholder: 'Search or type font name...',
            fontNotFound: 'Font not found. Press Enter to apply.', fontSystemDefault: 'Default',
            fontSelectCustom: 'Select .ttf / .otf ...',
            dueDateTitle: 'Due date', dueDateSet: 'Set deadline', dueDateClear: 'Clear',
            themeTitle: 'Theme', light: 'Light', dark: 'Dark', 
            langTitle: 'Select language', aboutTitle: 'About', 
            aboutDesc: 'Aesthetic. Local-first. Kanban sanctuary.',
            attTitle: 'Attachments Storage', 
            attLocalTitle: 'Inside vault',
            attLocalDesc: 'Files move together with the board (Default)',
            attExternalTitle: 'External folder',
            attSelectBtn: 'Choose folder...',
            attWarning: 'When using an external folder, files will not copy automatically if you move the vault to a USB drive.',
            exportTitle: 'Export Card', exportIncludeAtt: 'Export with attachments', exportIncludeCode: 'Export project codebase', btnExport: 'Export',
            moveTitle: 'Move Card', moveSelectCol: 'Tab and Column', btnMove: 'Move',
            detachTitle: 'Detach card?', detachDesc: 'This card is attached to multiple cards.',
            detachCurrent: 'Only from current card', detachAll: 'From all cards (make independent)',
            completeSubtask: 'Mark as completed', uncompleteSubtask: 'Mark as uncompleted',
            completeSubtaskTitle: 'Complete subtask?', completeSubtaskDesc: 'It will be marked as completed in all parent cards.', btnComplete: 'Complete',
            // Automations
            autoTitle: 'Automations', autoEmpty: 'No automations. Press «+» to create.',
            autoAddBtn: '+ New automation',
            autoType: 'Automation type',
            autoTypeRecurring: '🔄 Recurring card',
            autoTypeSort: '↕️ Column sort',
            autoTypeClear: '🧹 Column cleanup',
            autoNamePlaceholder: 'Automation name...', autoColumn: 'Column',
            autoTitlePlaceholder: 'Title template, e.g.: Review {date}',
            autoDescPlaceholder: 'Description template (optional)...',
            autoVarsHint: 'Variables: {date}, {date:format}, {time}, {weekday}, {week_number}, {month_name}',
            autoSortBy: 'Sort by:', autoSortPosition: 'Position', autoSortTitle: 'Title',
            autoSortCreated: 'Creation date', autoSortPriority: 'Priority', autoSortDue: 'Due date',
            autoSortOrder: 'Order:', autoSortAsc: 'Ascending', autoSortDesc: 'Descending',
            autoSortHint: 'Triggers automatically when a card is created or moved into this column.',
            autoMaxAge: 'Delete cards older than:', autoMaxAgeUnit: 'min',
            autoClearHint: 'Cards older than the specified time will be deleted on the next scheduled check.',
            autoClearImmediateTitle: 'Instant deletion',
            autoClearImmediateDesc: 'Delete a card as soon as it enters the column',
            autoClearOlder: 'Older than', autoCheck: 'Check',
            autoSchedule: 'Schedule', autoHourly: 'Hourly', autoDaily: 'Daily', autoWeekdays: 'Weekdays',
            autoWeekly: 'Weekly', autoMonthly: 'Monthly', autoTime: 'Time:',
            autoDayOfMonth: 'Day of month:', autoNextRun: 'Next run',
            autoOnEvent: 'On event',
            autoRunNow: 'Run now', autoRunDone: (id) => `Created card #${id}`,
            autoRunDoneClear: (n) => `Deleted cards: ${n}`,
            autoEdit: 'Edit', autoDelete: 'Delete',
            autoDeleteTitle: 'Delete automation?', autoDeleteConfirm: 'The automation will be permanently deleted.',
            autoValidationError: 'Fill in name and select a column',
            autoNoDaysError: 'Select at least one day of the week',
            autoSaveError: 'Save error', autoNetworkError: 'Network error',
            autoRunError: 'Failed to run',
            autoOrdinal: (n) => { const v = n % 100; if (v >= 11 && v <= 13) return 'th'; return ['th','st','nd','rd'][n % 10] || 'th'; },
            btnSave: 'Save', btnCreate: 'Create',
            extAutomations: 'Automations',
        },
        columnModes: { default: 'Standard', track_time: 'Track time', completion: 'Completed' },
        defaultWorkspace: 'Main Board',
        attachments: 'Attachments', addAttachment: '+ Add attachment...',
        missingTooltip: 'File not found. Click to relink',
        pendingTooltip: 'Pending attachment. Click to link a file',
        pendingTitle: (name) => `Waiting for file [${name}](doe/)`,
        expectedFilename: 'Expected filename',
        vault: {
            subtitle: 'Aesthetic. Local-first. Kanban sanctuary.',
            createTitle: 'Create Vault',
            createDesc: 'Start a new local vault on your device',
            openTitle: 'Open Vault',
            openDesc: 'Select an existing vault from your device',
            privacy: 'All data is stored locally on your device.<br>Privacy. No cloud. No compromises.',
            createPrompt: 'Enter a name and choose where to save your new vault',
            namePlaceholder: 'New vault name...',
            selectFolder: 'Browse location',
            errorInvalid: 'Folder is not a valid Doe Vault',
            recent: 'Recent Vaults',
            recentEmpty: 'Previously opened vaults will appear here'
        },
        card: { timeSpent: 'Time spent:', unknownTime: 'unknown' },
        taskModal: {
            descPlaceholder: 'Click to add description...',
            inputPlaceholder: 'Card description...',
            subtasksPlaceholder: '+ Add item...',
            timerPlaceholder: '1h 30m',
            created: 'Created',
            updated: 'Updated',
            uploading: (name) => `[⏳ Saving ${name} to Vault...]`,
            uploadError: (name) => `[❌ Error saving: ${name}]`,
            uploadNetworkError: (name) => `[❌ Network error: ${name}]`
        },
        timeUnits: { y: 'y', w: 'w', d: 'd', h: 'h', m: 'm', s: 's' },
        timeUnitsFull: { s: 'seconds', m: 'minutes', h: 'hours', d: 'days', w: 'weeks', mo: 'months', y: 'years' },
        prompts: {
            taskTitle: 'Card title:', columnTitle: 'Column title:', renameColumn: 'New name:', 
            deleteConfirmTitle: 'Delete column?', deleteConfirmDesc: 'All cards inside will be lost.',
            clearConfirmTitle: 'Clear column?', clearConfirmDesc: 'All cards inside will be permanently deleted.',
            newTabTitle: 'New tab name:', deleteTabConfirm: 'Delete tab?',
            deleteTabDesc: 'The tab and all its columns will be deleted permanently.'
        },
        errors: { tooLong: 'Maximum 1000 characters' },
        graph: { title: 'Connections Graph', empty: 'No cards yet.\nCreate cards on the board.', arrows: 'Arrows' },
        calendar: { today: 'Today', month: 'Month', week: 'Week', day: 'Day', loading: 'Loading data...', error: 'Load error' },
        cal: { dayMon: 'Mon', dayTue: 'Tue', dayWed: 'Wed', dayThu: 'Thu', dayFri: 'Fri', daySat: 'Sat', daySun: 'Sun' },
        alerts: { loadError: 'Failed to load board', error: 'Error' },
        ai: {
            hardwareRam: 'RAM',
            hardwareTier: 'Tier',
            tierLight: 'Light',
            tierStandard: 'Standard',
            tierPro: 'Pro',
            statusInstalled: 'Installed',
            statusRequiresDownload: 'Download required',
            btnDownload: 'Download',
            btnDownloadSize: (size) => `Download (~${size} GB)`,
            toastReadyTitle: 'AI Ready',
            toastReadyMsg: (m) => `Model ${m} downloaded successfully`,
            toastErrTitle: 'Download error',
            toastErrUnknown: 'Unknown error',
            toastCancelTitle: 'Download cancelled',
            toastCancelMsg: (m) => `Model ${m} download cancelled`,
            toastDeleted: 'Deleted',
            toastDeletedMsg: (m) => `Model ${m} removed`,
            toastDeleteErr: 'Failed to delete file',
            toastUnsupportedTitle: 'Not supported',
            toastUnsupportedMsg: 'Local AI assistant is currently available on macOS only',
            confirmDeleteTitle: 'Delete model?',
            confirmDeleteMsg: (m) => `Model ${m} will be removed from this device.`,
            starting: 'Starting...',
            errorText: 'Error',
            btnDeleteTitle: 'Delete model from disk',
            btnCancelTitle: 'Cancel',
            gbSuffix: 'GB',
            hintText: 'A local neural network analyzes your state every morning and intelligently prioritizes tasks. No internet required.',
            analyzeAll: 'Analyze all tasks',
            analyzeAllDesc: 'If off — only evaluates visible tasks on the board',
            setupBtn: '✨ Setup AI Assistant',
            readyBtn: 'Done',
            chatPlaceholder: 'Ask me anything...',
            sendAria: 'Send',
            floatingBtnTitle: 'AI Assistant',
            searchModels: 'Search models...',
            noCompatible: 'No compatible models found for your hardware tier',
            toggleMenuTip: 'Toggle AI in menu',
            // AI actions in journal
            actionsHeader: 'I want to perform the following actions:',
            actionCreateTask: (title, colName) => `Create task «${title}» in column «${colName}»`,
            actionMoveTask: (taskName, colName) => `Move «${taskName}» to column «${colName}»`,
            actionDeleteTask: (taskName) => `Delete task «${taskName}»`,
            actionCreateColumn: (title) => `Create column "${title}"`,
            actionDeleteColumn: (colName) => `Delete column «${colName}»`,
            actionCreateWorkspace: (name) => `Create tab "${name}"`,
            actionSetTheme: (theme) => `Change theme to ${theme}`,
            actionToggleExtOn: (ext) => `Enable extension ${ext}`,
            actionToggleExtOff: (ext) => `Disable extension ${ext}`,
            actionPrioritizeAll: 'Recalculate priorities',
            actionClearAllPriorities: 'Clear all priorities',
            actionSearchBoard: (q) => `Search: «${q}»`,
            actionGetTaskDetails: (name) => `Get details for «${name}»`,
            actionRememberFact: (fact) => `Remember fact: "${fact}"`,
            actionForgetFact: (fact) => `Forget fact: "${fact}"`,
            actionChangeLang: (lang) => `Change language to ${lang}`,
            actionSwitchWorkspace: (name) => `Switch to tab «${name}»`,
            actionOpenTask: (name) => `Open card «${name}»`,
            actionUpdateTask: (name) => `Update card «${name}»`,
            actionClearChat: 'Clear chat history',
            actionSetReminders: (count) => `Set reminders (${count})`,
            actionDeleteReminder: (id) => `Cancel reminder ${id.split('-')[0]}...`,
            btnConfirm: 'Allow',
            actionsCancelled: 'Actions cancelled by user.',
            actionsExecuted: '✅ Actions executed!',
            actionsPartial: '⚠️ Some actions failed:',
            actionsError: '❌ Execution error. Check ID correctness.',
            taskRef: (id) => `Task #${id}`,
        }
    }
};

const dpLocales = {
    ru: {
        months: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
        monthsGenitive: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
        days: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
        time: 'Время'
    },
    en: {
        months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
        monthsGenitive: ['January','February','March','April','May','June','July','August','September','October','November','December'],
        days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        time: 'Time'
    }
};

function applyPriorityStyles(ps) {
    window.prioritySettings = ps;
    let styleEl = document.getElementById('dynamic-priority-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-priority-styles';
        document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = `
        :root {
            --prio-low-color: ${ps.c_low};
            --prio-mid-color: ${ps.c_mid};
            --prio-high-color: ${ps.c_high};
            --prio-none-color: ${ps.c_none};
        }
    `;
}

function updateAppFont(uiFont, customFontPath) {
    let styleTag = document.getElementById('custom-font-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'custom-font-style';
        document.head.appendChild(styleTag);
    }

    // Базовый стек Apple/Windows
    let fontString = '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    if (customFontPath) {
        const url = `/${customFontPath}?t=${Date.now()}`;
        styleTag.innerHTML = `
            @font-face {
                font-family: 'DoeCustomFont';
                src: url('${url}');
                font-weight: normal;
                font-style: normal;
            }
        `;
        fontString = `'DoeCustomFont', ${fontString}`;
    } else {
        styleTag.innerHTML = '';
    }

    // Вписанный системный шрифт всегда применяется, если он есть
    if (uiFont && uiFont.trim() && uiFont.trim() !== "Inter") {
        fontString = `"${uiFont.trim()}", ${fontString}`;
    }

    // !important не даёт браузеру сбрасывать шрифт на кнопках
    document.documentElement.style.setProperty('--font-main', fontString, 'important');
}

window.chooseCustomFont = async () => {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
        const absPath = await window.pywebview.api.choose_file();
        if (absPath) {
            try {
                const res = await fetch(`${API_BASE}/system/font/set`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ absolute_path: absPath })
                });
                if (res.ok) {
                    const data = await res.json();
                    document.getElementById('font-path-display').textContent = data.path;
                    const settings = await fetchSettings();
                    updateAppFont(settings.ui_font, settings.custom_font);
                } else {
                    window.showToast(t('alerts.error'), 'Поддерживаются только .ttf, .otf, .woff, .woff2', true);
                }
            } catch(e) { console.error(e); }
        }
    }
};

window.resetCustomFont = async () => {
    try {
        const res = await fetch(`${API_BASE}/system/font/clear`, { method: 'POST' });
        if (res.ok) {
            document.getElementById('font-path-display').textContent = t('modals.fontSelectCustom');
            const settings = await fetchSettings();
            updateAppFont(settings.ui_font, settings.custom_font);
        }
    } catch(e) { console.error(e); }
};

window.applyExtensionsUI = (exts) => {
    if (!exts) exts = { search: true, calendar: true, reminders: true, graph: true, tabs: true, deadlines: true, export: true, priority: true, ai: true, automations: true, statistics: true };
    
    // Скрываем или показываем UI дедлайнов глобально через CSS-класс
    document.body.classList.toggle('ext-deadlines-hidden', !exts.deadlines);
    // Скрываем экспорт
    document.body.classList.toggle('ext-export-hidden', !exts.export);
    // Скрываем приоритетность
    document.body.classList.toggle('ext-priority-hidden', !exts.priority);
    // Скрываем AI
    document.body.classList.toggle('ext-ai-hidden', !exts.ai);
    document.body.classList.toggle('ext-automations-hidden', !exts.automations);
    document.body.classList.toggle('ext-statistics-hidden', !exts.statistics);
    
    const searchWrapper = document.getElementById('global-search-wrapper');
    const calendarBtn = document.getElementById('calendar-trigger');
    const statisticsBtn = document.getElementById('statistics-trigger');
    const remindersBtn = document.getElementById('reminders-bell-wrapper');
    const graphBtn = document.getElementById('graph-trigger');
    const tabsWrapper = document.getElementById('tabs-wrapper');

    if (searchWrapper) searchWrapper.style.display = exts.search ? '' : 'none';
    if (calendarBtn) calendarBtn.style.display = exts.calendar ? '' : 'none';
    if (statisticsBtn) statisticsBtn.style.display = exts.statistics ? '' : 'none';
    if (remindersBtn) remindersBtn.style.display = exts.reminders ? '' : 'none';
    if (graphBtn) graphBtn.style.display = exts.graph ? '' : 'none';
    if (tabsWrapper) tabsWrapper.style.display = exts.tabs ? '' : 'none';

    const automationsBtn = document.getElementById('automations-trigger');
    if (automationsBtn) automationsBtn.style.display = exts.automations ? '' : 'none';

    // Скрываем пункт в глобальном контекстном меню
    const notifyMenuItem = document.querySelector('.menu-item[data-action="notify-card"]');
    if (notifyMenuItem) {
        notifyMenuItem.style.display = exts.reminders ? '' : 'none';
    }

    // Скрываем кнопку "Напомнить" внутри открытой карточки
    const modalNotifyBtn = document.querySelector('.modal-notify');
    if (modalNotifyBtn) {
        modalNotifyBtn.style.display = exts.reminders ? '' : 'none';
    }

    const tSearch = document.getElementById('ext-toggle-search');
    const tCalendar = document.getElementById('ext-toggle-calendar');
    const tReminders = document.getElementById('ext-toggle-reminders');
    const tGraph = document.getElementById('ext-toggle-graph');
    const tTabs = document.getElementById('ext-toggle-tabs');
    const tDeadlines = document.getElementById('ext-toggle-deadlines');
    const tExport = document.getElementById('ext-toggle-export');
    const tPriority = document.getElementById('ext-toggle-priority');
    const tAi = document.getElementById('ext-toggle-ai');
    const tAutomations = document.getElementById('ext-toggle-automations');
    const tStatistics = document.getElementById('ext-toggle-statistics');

    if (tSearch) tSearch.checked = exts.search;
    if (tCalendar) tCalendar.checked = exts.calendar;
    if (tReminders) tReminders.checked = exts.reminders;
    if (tGraph) tGraph.checked = exts.graph;
    if (tTabs) tTabs.checked = exts.tabs;
    if (tDeadlines) tDeadlines.checked = exts.deadlines;
    if (tExport) tExport.checked = exts.export;
    if (tPriority) tPriority.checked = exts.priority;
    if (tAi) tAi.checked = exts.ai;
    if (tAutomations) tAutomations.checked = exts.automations;
    if (tStatistics) tStatistics.checked = exts.statistics;
};

window.toggleExtension = async (key, value) => {
    try {
        const payload = { extensions: {} };
        payload.extensions[key] = value;
        
        // Сразу получаем обновленные настройки из ответа PUT
        const res = await fetch(`${API_BASE}/system/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const updatedSettings = await res.json();
            window.applyExtensionsUI(updatedSettings.extensions);
        }
    } catch (e) {
        console.error("Ошибка переключения расширения:", e);
    }
};

// ----------------------

let toastTimeout;
window.showToast = (title, message, isError = false) => {
    const toast = document.getElementById('app-toast');
    if (!toast) return;

    const titleEl = document.getElementById('app-toast-title');
    const msgEl = document.getElementById('app-toast-message');
    const iconEl = document.querySelector('.app-toast-icon');

    titleEl.textContent = title;
    msgEl.textContent = message;

    if (isError) {
        iconEl.style.color = '#D35446';
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
        iconEl.style.color = 'var(--success-done)';
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    }

    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
};

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

let currentLang = 'ru';
let activeConfirmResolve = null; 
let activeDetachResolve = null;

function showDetachModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('detach-modal');
        activeDetachResolve = resolve;
        modal.classList.add('show');
    });
}

function applyTheme(theme, saveToBackend = false) {
    const updateDOM = () => {
        if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');

        document.querySelectorAll('#theme-list .lang-item').forEach(el => {
            el.classList.toggle('active', el.dataset.themeValue === theme);
        });

        localStorage.setItem('doe-theme', theme);
        if (saveToBackend) updateSettings({ theme }).catch(console.error);
    };

    if (saveToBackend && document.startViewTransition) {
        document.startViewTransition(updateDOM);
    } else {
        updateDOM();
    }
}

// ==========================================
// 🚀 WEB WORKER ДЛЯ ФОНОВОГО РЕНДЕРА MARKDOWN
// ==========================================
let markdownWorker = null;
let markdownRenderId = 0;
const markdownCallbacks = {};

function initMarkdownWorker() {
    if (markdownWorker) return;
    
    // Изолированный код потока. Никакого доступа к DOM, только вычисления.
    const workerCode = `
        // Загружаем библиотеки парсинга напрямую в поток
        self.importScripts(
            location.origin + '/static/marked.min.js',
            'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'
        );

        function escapeHtml(text) {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }

        // Копия вашего парсера, работающая в фоне
        function parseMarkdownWithMathWorker(text) {
            if (!text) return "";
            const mathBlocks = [];
            const codeBlocks = [];
            
            let processed = text.replace(/(\`\`\`[\\s\\S]*?\`\`\`|\`[^\`]*\`)/g, (match) => {
                codeBlocks.push(match);
                return \`DOECODEPLACEHOLDER\${codeBlocks.length - 1}END\`;
            });

            processed = processed.replace(/\\$\\$([\\s\\S]+?)\\$\\$/g, (match, math) => {
                mathBlocks.push({ math, displayMode: true });
                return \`DOEMATHPLACEHOLDER\${mathBlocks.length - 1}END\`;
            });

            processed = processed.replace(/\\$([^$\\n]+?)\\$/g, (match, math) => {
                mathBlocks.push({ math, displayMode: false });
                return \`DOEMATHPLACEHOLDER\${mathBlocks.length - 1}END\`;
            });

            processed = processed.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)(?:\\{(\\d+)\\s*,\\s*(\\d+)\\})?/g, (match, alt, url, w, h) => {
                const ext = url.split('.').pop().toLowerCase();
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
                
                if (!isImage) {
                    return \`[\${alt}](\${url})\`;
                }

                const safeMatch = escapeHtml(match);
                let style = '';
                let customClass = '';
                
                if (w && h) {
                    style = \`width: \${w}px; height: \${h}px;\`;
                    customClass = 'has-custom-size';
                }

                return \`<span class="image-resizer-wrapper \${customClass}" style="\${style}" data-md="\${safeMatch}"><img src="/\${url}" alt="\${alt}" draggable="false"><span class="image-resize-handle" title="Потяните для изменения размера"></span></span>\`;
            });

            codeBlocks.forEach((code, i) => {
                processed = processed.replace(\`DOECODEPLACEHOLDER\${i}END\`, () => code);
            });

            let html = marked.parse(processed, { breaks: true });

            if (self.katex) {
                mathBlocks.forEach((item, i) => {
                    try {
                        const rendered = katex.renderToString(item.math, {
                            displayMode: item.displayMode,
                            throwOnError: false,
                            output: 'html',
                            strict: false
                        });
                        html = html.replace(\`DOEMATHPLACEHOLDER\${i}END\`, () => rendered);
                    } catch (e) {
                        html = html.replace(\`DOEMATHPLACEHOLDER\${i}END\`, () => \`<code>\${item.math}</code>\`);
                    }
                });
            } else {
                mathBlocks.forEach((item, i) => {
                    html = html.replace(\`DOEMATHPLACEHOLDER\${i}END\`, () => \`<code>\${item.math}</code>\`);
                });
            }

            return html;
        }

        // Слушатель сообщений от главного потока
        self.onmessage = function(e) {
            const { id, text } = e.data;
            const html = parseMarkdownWithMathWorker(text);
            self.postMessage({ id, html }); // Возвращаем готовый HTML
        };
    `;

    // Компилируем и запускаем Web Worker из строки
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    markdownWorker = new Worker(URL.createObjectURL(blob));
    
    // Обрабатываем ответ от воркера
    markdownWorker.onmessage = function(e) {
        const { id, html } = e.data;
        if (markdownCallbacks[id]) {
            markdownCallbacks[id](html);
            delete markdownCallbacks[id]; // Очищаем память
        }
    };
}

function renderMarkdownProgressively(text, container, options) {
    window.isRenderingMarkdown = true;
    
    let onBeforeInsert = null;
    let onFirstScreen = null;
    let onComplete = null;

    if (typeof options === 'function') {
        onComplete = options;
    } else if (options) {
        onBeforeInsert = options.onBeforeInsert;
        onFirstScreen = options.onFirstScreen;
        onComplete = options.onComplete;
    }

    // Быстрый синхронный путь для маленьких текстов
    if (text.length < 5000) {
        container._renderToken = null;
        if (onBeforeInsert) onBeforeInsert();
        container.style.visibility = '';
        container.innerHTML = parseMarkdownWithMath(text);
        if (onFirstScreen) onFirstScreen();
        enhanceCodeBlocks(container);
        window.isRenderingMarkdown = false;
        if (onComplete) onComplete();
        return;
    }

    // Асинхронный путь с воркером: возвращаем надпись "Loading..."
    const token = Symbol();
    container._renderToken = token;
    
    container.style.visibility = '';
    container.innerHTML = `<span class="markdown-empty">${t('loading')}</span>`;

    initMarkdownWorker();
    markdownRenderId++;
    const currentId = markdownRenderId;
    
    markdownCallbacks[currentId] = (html) => {
        if (container._renderToken !== token) return;

        if (onBeforeInsert) onBeforeInsert();

        // Записываем весь HTML за один раз, чтобы избежать дробления высоты
        container.innerHTML = html;

        if (onFirstScreen) onFirstScreen();

        const nodes = Array.from(container.childNodes);
        for (const n of nodes) {
            if (n.nodeType === 1 && !/^H[1-6]$/.test(n.tagName) && !(n.querySelector && n.querySelector('img'))) {
                n.classList.add('md-deferred');
            }
        }

        requestAnimationFrame(() => {
            if (container._renderToken !== token) {
                window.isRenderingMarkdown = false;
                return;
            }
            if (onComplete) onComplete();
            enhanceCodeBlocks(container);
            window.isRenderingMarkdown = false;
        });
    };
    
    markdownWorker.postMessage({ id: currentId, text: text });
}

function formatExactTime(seconds) {
    if (!seconds) return "00:00:00";
    
    const MAX_SECONDS = 31536000000;
    if (seconds >= MAX_SECONDS) {
        return currentLang === 'ru' ? '1000+ лет' : '1000+ y';
    }
    
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    
    if (d === 0) {
        return `${h}:${m}:${s}`;
    }
    
    const units = t('timeUnits');
    return `${d}${units.d} ${h}:${m}:${s}`;
}

function parseTimeToSeconds(input) {
    input = input.trim().toLowerCase();
    if (!input) return null;

    let seconds = 0;
    let matchedAny = false;

    const timeMatch = input.match(/(?:^|\s)(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\s|$)/);
    if (timeMatch) {
        seconds += parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60;
        if (timeMatch[3]) seconds += parseInt(timeMatch[3]);
        matchedAny = true;
    }

    const matchUnit = (regex, multiplier) => {
        const match = input.match(regex);
        if (match) {
            seconds += parseFloat(match[1]) * multiplier;
            matchedAny = true;
        }
    };

    matchUnit(/(\d+(?:\.\d+)?)\s*(y|л|год|лет|года)/, 31536000);
    matchUnit(/(\d+(?:\.\d+)?)\s*(mo|мес)/, 2592000);
    matchUnit(/(\d+(?:\.\d+)?)\s*(w|н|нед)/, 604800);
    matchUnit(/(\d+(?:\.\d+)?)\s*(d|д|день|дней|дня)/, 86400);
    matchUnit(/(\d+(?:\.\d+)?)\s*(h|ч|hour|час|часов|часа)/, 3600);
    matchUnit(/(\d+(?:\.\d+)?)\s*(m(?!o)|м|min|мин)/, 60);
    matchUnit(/(\d+(?:\.\d+)?)\s*(s|с|sec|сек)/, 1);

    const MAX_SECONDS = 31536000000;

    if (matchedAny) return Math.min(Math.floor(seconds), MAX_SECONDS);

    if (/^\d+(?:\.\d+)?$/.test(input)) {
        return Math.min(Math.floor(parseFloat(input) * 60), MAX_SECONDS);
    }

    return null;
}

function applyLanguage(lang, saveToBackend = false) {
    currentLang = lang;
    localStorage.setItem('doe-lang', lang);
    if (saveToBackend) updateSettings({ language: lang }).catch(console.error);

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const translation = getNestedTranslation(lang, key);
        if (translation) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = translation;
            else if (key === 'modals.aboutDesc' || key === 'vault.privacy') el.innerHTML = translation;
            else el.textContent = translation;
        }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        const translation = getNestedTranslation(lang, key);
        if (translation) el.setAttribute('title', translation);
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.dataset.i18nAria;
        const translation = getNestedTranslation(lang, key);
        if (translation) el.setAttribute('aria-label', translation);
    });

    const langSpan = document.querySelector('[data-action="change-lang"] span');
    if (langSpan) langSpan.textContent = translations[lang].language;

    document.querySelectorAll('#lang-list .lang-item').forEach(el => {
        el.classList.toggle('active', el.dataset.value === lang);
    });

    document.querySelectorAll('.vault-history-date').forEach(el => {
        const ts = el.dataset.timestamp;
        if (ts) {
            el.textContent = formatDateTime(ts);
        } else {
            el.textContent = lang === 'ru' ? 'Ранее' : 'Earlier';
        }
    });

    if (state.columns.length > 0) renderBoard();
}

function getNestedTranslation(lang, path) { return path.split('.').reduce((obj, key) => obj?.[key], translations[lang]); }
function t(key, ...args) {
    const translation = getNestedTranslation(currentLang, key);
    if (typeof translation === 'function') return translation(...args);
    return translation || key;
}

async function saveWorkspacesOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/workspaces/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}

async function triggerGarbageCollector() {
    try {
        fetch(`${API_BASE}/system/cleanup-attachments`, { method: 'POST' }).catch(() => {});
    } catch (e) {
        console.error("Garbage Collector trigger failed:", e);
    }
}

async function fetchWorkspaces() { 
    const res = await fetch(`${API_BASE}/workspaces/`); 
    if (!res.ok) throw new Error('Error'); return res.json(); 
}
async function createWorkspaceAPI(name) { 
    const res = await fetch(`${API_BASE}/workspaces/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!res.ok) throw new Error('Error'); return res.json();
}
async function updateWorkspaceAPI(id, name) {
    const res = await fetch(`${API_BASE}/workspaces/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Error');
    return res.json();
}
async function deleteWorkspaceAPI(id) { 
    const res = await fetch(`${API_BASE}/workspaces/${id}`, { method: 'DELETE' }); 
    if (!res.ok) throw new Error('Error'); 
}

async function fetchVault() {
    const res = await fetch(`${API_BASE}/system/vault?t=${Date.now()}`, {
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });
    if (!res.ok) throw new Error('Error fetch vault');
    return res.json();
}

async function switchVault() {
    if (!window.pywebview || !window.pywebview.api) {
        throw new Error("Native API not ready");
    }

    const selectedPath = await window.pywebview.api.choose_directory();
    
    if (!selectedPath) {
        return { canceled: true };
    }

    const res = await fetch(`${API_BASE}/system/vault/switch`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_path: selectedPath })
    });
    
    if (!res.ok) throw new Error('Error switching vault');
    return res.json();
}

function updateVaultName(name) {
    const span = document.querySelector('.vault-name-text');
    if (span) {

        span.dataset.fullTitle = name;
        
        if (name.length > 30) {
            span.textContent = name.substring(0, 29) + '…';
        } else {
            span.textContent = name;
        }
        
        span.removeAttribute('data-i18n');
    }
}

async function saveTasksOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/tasks/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}

async function fetchColumns(workspaceId) { 
    const res = await fetch(`${API_BASE}/columns/?workspace_id=${workspaceId}`); 
    if (!res.ok) throw new Error('Error'); return res.json(); 
}

async function saveColumnsOrder(orderedIds) {
    const res = await fetch(`${API_BASE}/columns/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) throw new Error('Error');
}
async function createColumn(title, mode = 'default', workspaceId) {
    const res = await fetch(`${API_BASE}/columns/`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ title, mode, workspace_id: workspaceId }) 
    });
    if (!res.ok) throw new Error('Error'); return res.json();
}
async function updateColumn(id, data) {
    const res = await fetch(`${API_BASE}/columns/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Error'); return res.json();
}
function formatTotalTime(seconds) {
    if (seconds === 0) return t('card.unknownTime');

    const MAX_SECONDS = 31536000000;
    if (seconds >= MAX_SECONDS) {
        return currentLang === 'ru' ? '1000+ лет' : '1000+ y';
    }

    const YEAR = 31536000;
    const WEEK = 604800;
    const DAY = 86400;
    const HOUR = 3600;

    const y = Math.floor(seconds / YEAR);
    const w = Math.floor((seconds % YEAR) / WEEK);
    const d = Math.floor((seconds % WEEK) / DAY);
    const h = Math.floor((seconds % DAY) / HOUR);
    const m = Math.floor((seconds % HOUR) / 60);
    const s = Math.floor(seconds % 60);

    const units = t('timeUnits');
    const parts = [];

    if (y > 0) parts.push(`${y}${units.y}`);
    if (w > 0) parts.push(`${w}${units.w}`);
    if (d > 0) parts.push(`${d}${units.d}`);
    if (h > 0) parts.push(`${h}${units.h}`);
    if (m > 0) parts.push(`${m}${units.m}`);
    
    if (s > 0 || parts.length === 0) {
        parts.push(`${s}${units.s}`);
    }

    return parts.slice(0, 2).join(' ');
}

function formatExactDateTime(isoString) {
    if (!isoString) return '';
    let dateStr = isoString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) dateStr += 'Z';
    const date = new Date(dateStr);
    const d = date.getDate().toString().padStart(2, '0');
    const mo = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${d}.${mo}.${y}, ${h}:${m}:${s}`;
}

function formatDetailedDuration(seconds) {
    if (!seconds) return "0с";
    const Y = 31536000, M = 2592000, D = 86400, H = 3600, MIN = 60;
    let y = Math.floor(seconds / Y); seconds %= Y;
    let mo = Math.floor(seconds / M); seconds %= M;
    let d = Math.floor(seconds / D); seconds %= D;
    let h = Math.floor(seconds / H); seconds %= H;
    let m = Math.floor(seconds / MIN);
    let s = seconds % MIN;

    let parts = [];
    let started = false;
    
    if (y > 0) { parts.push(`${y}л`); started = true; }
    if (mo > 0 || started) { parts.push(`${mo}мес`); started = true; }
    if (d > 0 || started) { parts.push(`${d}д`); started = true; }
    if (h > 0 || started) { parts.push(`${h}ч`); started = true; }
    if (m > 0 || started) { parts.push(`${m}м`); started = true; }
    parts.push(`${s}с`); 
    
    return parts.join(' ');
}

function formatShortDate(isoString) {
    if (!isoString) return '';
    let dateStr = isoString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) dateStr += 'Z';
    const date = new Date(dateStr);
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleDateString(currentLang, options).replace(' г.', '');
}

async function deleteColumn(id) { const res = await fetch(`${API_BASE}/columns/${id}`, { method: 'DELETE' }); if (!res.ok) throw new Error('Error'); }
async function clearColumn(id) { 
    const res = await fetch(`${API_BASE}/columns/${id}/tasks`, { method: 'DELETE' }); 
    if (!res.ok) throw new Error('Error'); 
}
async function createTask(title, columnId) {
    const res = await fetch(`${API_BASE}/tasks/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, column_id: columnId }) });
    if (!res.ok) throw new Error('Error'); return res.json();
}
async function updateTask(id, data) {
    const res = await fetch(`${API_BASE}/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP Error ${res.status}`);
    }
    return res.json();
}

async function handleClearDueDate(taskId) {
    try {
        await updateTask(taskId, { due_date: null });
        
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
                t.due_date = null;
                updatedColId = col.id;
                const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                if (cardEl) updateCardAppearance(cardEl, t, col.mode);
                break;
            }
        }
        
        if (updatedColId) await syncColumnDOM(updatedColId); // Триггер анимации
        
        const taskModal = document.getElementById('task-modal');
        if (taskModal.classList.contains('show') && parseInt(taskModal.dataset.taskId) === taskId) {
            loadTaskIntoModal(taskId, false); 
        }
        
    } catch (e) {
        window.showToast(t('alerts.error'), 'Не удалось очистить срок', true);
    }
}

async function deleteTask(id) { 
    const res = await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' }); 
    if (!res.ok) throw new Error('Error'); 
    return res.json(); 
}

async function moveTask(taskId, targetColumnId) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_column_id: targetColumnId }) });
    if (!res.ok) throw new Error('Error'); return res.json();
}

async function fetchSettings() {
    const res = await fetch(`${API_BASE}/system/settings?t=${Date.now()}`, {
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });
    if (!res.ok) throw new Error('Error fetch settings');
    return res.json();
}

async function updateSettings(data) {
    const res = await fetch(`${API_BASE}/system/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error saving settings');
}

const _escapeDiv = document.createElement('div');
function escapeHtml(text) { _escapeDiv.textContent = text; return _escapeDiv.innerHTML; }
function renderInlineMarkdown(text) {
    if (!text) return '';

    // Шаг 0: Находим все doe://task/ ссылки (с bracket-counting) и заменяем на плейсхолдеры
    const doeLinks = [];
    const doePattern = /\]\(doe:\/\/task\/\d+\)/g;
    let match;
    let raw = text;
    while ((match = doePattern.exec(raw)) !== null) {
        const closePos = match.index;
        let depth = 1, openPos = -1;
        for (let i = closePos - 1; i >= 0; i--) {
            if (raw[i] === ']') depth++;
            else if (raw[i] === '[') { depth--; if (depth === 0) { openPos = i; break; } }
        }
        if (openPos >= 0) {
            const inner = raw.substring(openPos + 1, closePos);
            const taskId = match[0].match(/\d+/)[0];
            const placeholder = `\uE000DOE_${doeLinks.length}\uE000`;
            doeLinks.push({ inner, taskId, placeholder, start: openPos, end: match.index + match[0].length });
        }
    }
    for (let i = doeLinks.length - 1; i >= 0; i--) {
        const dl = doeLinks[i];
        raw = raw.substring(0, dl.start) + dl.placeholder + raw.substring(dl.end);
    }

    // Шаг 1: Escape HTML
    let html = escapeHtml(raw);
    // Шаг 1.5: Переносы строк
    html = html.replace(/\n/g, '<br>');
    // Шаг 2: <u>
    html = html.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');
    // Шаг 3: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Шаг 4: **bold**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Шаг 5: *italic*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Шаг 6: ~~strike~~
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    // Шаг 7: Оставшиеся ссылки [text](url) (не doe://, они уже в плейсхолдерах)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Шаг 8: Раскрываем плейсхолдеры — рендерим inner и оборачиваем в doe:// ссылку
    for (const dl of doeLinks) {
        // Убираем ссылочный синтаксис из inner (вложенные <a> невалидны)
        const innerClean = dl.inner.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
        const innerHtml = renderInlineMarkdown(innerClean);
        html = html.replace(dl.placeholder, `<a href="doe://task/${dl.taskId}" target="_blank" rel="noopener">${innerHtml}</a>`);
    }

    return html;
}
function unescapeHtml(html) { const div = document.createElement('div'); div.innerHTML = html; return div.textContent; }

// Вырезает [...](doe://task/NNN) из текста, оставляя только внутренний контент
// Работает с вложенными скобками (напр. [текст с [ссылкой](url)](doe://task/1) → текст с [ссылкой](url))
function stripDoeTaskLinks(text) {
    if (!text) return text;
    const pattern = /\]\(doe:\/\/task\/\d+\)/g;
    let match;
    const replacements = [];
    while ((match = pattern.exec(text)) !== null) {
        const closePos = match.index;
        let depth = 1, openPos = -1;
        for (let i = closePos - 1; i >= 0; i--) {
            if (text[i] === ']') depth++;
            else if (text[i] === '[') { depth--; if (depth === 0) { openPos = i; break; } }
        }
        if (openPos >= 0) {
            replacements.push({ start: openPos, end: match.index + match[0].length, inner: text.substring(openPos + 1, closePos) });
        }
    }
    for (let i = replacements.length - 1; i >= 0; i--) {
        const r = replacements[i];
        text = text.substring(0, r.start) + r.inner + text.substring(r.end);
    }
    return text;
}

function bindTitleFormattingShortcuts(inputEl) {
    const toggleFormat = (before, after) => {
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        const selected = inputEl.value.substring(start, end);
        if (selected) {
            if (selected.startsWith(before) && selected.endsWith(after)) {
                inputEl.setRangeText(selected.substring(before.length, selected.length - after.length), start, end, 'select');
            } else {
                inputEl.setRangeText(before + selected + after, start, end, 'select');
            }
        } else {
            inputEl.setRangeText(before + after, start, end, 'start');
            inputEl.setSelectionRange(start + before.length, start + before.length);
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const insertLink = () => {
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        const selected = inputEl.value.substring(start, end);
        if (selected) {
            inputEl.setRangeText(`[${selected}](url)`, start, end, 'end');
            const newEnd = start + selected.length + 7;
            inputEl.setSelectionRange(newEnd - 4, newEnd - 1);
        } else {
            inputEl.setRangeText('[](url)', start, end, 'start');
            inputEl.setSelectionRange(start + 1, start + 1);
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    };
    inputEl.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        const key = e.key.toLowerCase();
        if (key === 'b') { e.preventDefault(); toggleFormat('**', '**'); }
        else if (key === 'i') { e.preventDefault(); toggleFormat('*', '*'); }
        else if (key === 'u') { e.preventDefault(); toggleFormat('<u>', '</u>'); }
        else if (key === 'k') { e.preventDefault(); insertLink(); }
        else if (key === 'e') { e.preventDefault(); toggleFormat('`', '`'); }
        else if (e.shiftKey && (key === 'x')) { e.preventDefault(); toggleFormat('~~', '~~'); }
    });
}

// ── Состояние полноэкранного режима ──
let _isFullscreen = false;

window.toggleFullscreenState = (force) => {
    const lights = document.getElementById('mac-traffic-lights');
    if (!lights) return;

    if (typeof force === 'boolean') {
        _isFullscreen = force;
    } else {
        _isFullscreen = !_isFullscreen;
    }

    if (_isFullscreen) {
        lights.classList.add('is-fullscreen');
    } else {
        lights.classList.remove('is-fullscreen');
    }
};

function encodeMarkdownPath(path) {
    // encodeURI пропускает # и ?, которые (особенно #) ломают img-src и href
    // внутри описания. Используем encodeURIComponent и восстанавливаем слэши.
    return encodeURIComponent(path).replace(/%2F/g, '/');
}

function applyTextExpansion() {
    const renderDiv = document.getElementById('task-desc-render');
    if (!renderDiv) return;
    
    const images = renderDiv.querySelectorAll('.image-resizer-wrapper.has-custom-size');
    let maxWidth = 0;
    images.forEach(img => {
        const w = parseInt(img.style.width);
        if (w > maxWidth) maxWidth = w;
    });
    
    if (maxWidth > 0) {
        renderDiv.style.minWidth = (maxWidth + 24) + 'px';
    } else {
        renderDiv.style.minWidth = '100%';
    }
}

function formatTime(task) {
    let startStr = task.active_timer.start_time;
    if (!startStr.endsWith('Z')) startStr += 'Z'; 
    const start = new Date(startStr); 
    
    const activeSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const closedSeconds = task.total_time_spent || 0;
    
    const diff = activeSeconds + closedSeconds;
    
    const MAX_SECONDS = 31536000000;
    if (diff >= MAX_SECONDS) {
        return currentLang === 'ru' ? '1000+ лет' : '1000+ y';
    }
    
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(diff % 60).toString().padStart(2, '0');
    
    if (d === 0) {
        return `${h}:${m}:${s}`;
    }
    
    const units = t('timeUnits');
    return `${d}${units.d} ${h}:${m}:${s}`;
}

function bumpModalUpdatedDate() {
    const span = document.getElementById('task-updated-text');
    if (span) {
        const nowStr = formatDateTime(new Date().toISOString());
        span.innerHTML = `${t('taskModal.updated')}: ${nowStr}`;
    }
}

function formatDateTime(isoString) {
    if (!isoString) return '';
    
    let dateStr = isoString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        dateStr += 'Z';
    }
    
    const date = new Date(dateStr);
    
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    };
    
    return date.toLocaleDateString(currentLang, options);
}

function renderBoard() {
    const board = document.getElementById('board');
    const savedScroll = board.scrollLeft;

    // Сохраняем вертикальные позиции прокрутки каждой колонки,
    // иначе при пересборке DOM они сбросятся в 0 (баг потери позиции чтения).
    const savedColScrolls = {};
    board.querySelectorAll('.column[data-column-id]').forEach(colEl => {
        const listEl = colEl.querySelector('.card-list');
        if (listEl) savedColScrolls[colEl.dataset.columnId] = listEl.scrollTop;
    });

    board.innerHTML = '';
    const frag = document.createDocumentFragment();
    const sorted = [...state.columns].sort((a, b) => a.position - b.position);
    for (const col of sorted) frag.appendChild(createColumnElement(col));

    const addColBtn = document.createElement('button');
    addColBtn.className = 'new-column-btn';
    addColBtn.textContent = t('newColumn');
    addColBtn.addEventListener('click', onCreateColumn);
    frag.appendChild(addColBtn);
    board.appendChild(frag);

    // Восстанавливаем позиции прокрутки колонок по id.
    board.querySelectorAll('.column[data-column-id]').forEach(colEl => {
        const listEl = colEl.querySelector('.card-list');
        const saved = savedColScrolls[colEl.dataset.columnId];
        if (listEl && saved !== undefined) listEl.scrollTop = saved;
    });

    board.scrollLeft = savedScroll;

    if (isDragging && draggedElement) {
        if (dragType === 'card') {
            const id = draggedElement.dataset.cardId;
            const newEl = board.querySelector(`.card[data-card-id="${id}"]`);
            if (newEl) {
                draggedElement = newEl;
                draggedElement.classList.add('is-ghost');
            }
        } else if (dragType === 'column') {
            const id = draggedElement.dataset.columnId;
            const newEl = board.querySelector(`.column[data-column-id="${id}"]`);
            if (newEl) {
                draggedElement = newEl;
                draggedElement.classList.add('is-ghost');
            }
        }
    }

    requestAnimationFrame(() => {
        adjustCollapsedColumnWidths();
        clampExpandedTitles();
        if (window.updateBoardScrollbar) window.updateBoardScrollbar();
    });
}

window.syncColumnDOM = async function(columnId) {
    try {
        const freshCols = await fetchColumns(state.activeWorkspaceId);
        state.columns = freshCols.map(col => ({ ...col, collapsed: col.collapsed || false }));
        
        const colEl = document.querySelector(`.column[data-column-id="${columnId}"]`);
        if (!colEl) {
            renderBoard();
            return;
        }

        const colState = state.columns.find(c => c.id === columnId);
        if (!colState) return;

        const cardList = colEl.querySelector('.card-list');
        if (!cardList) return;

        const oldCards = Array.from(cardList.querySelectorAll('.card:not(.card-drag-clone)'));
        const newIds = new Set(colState.tasks.map(t => String(t.id)));

        // 1. Анимируем удаление карточек, которые исчезли (например, из-за автоматизаций)
        oldCards.forEach(card => {
            if (!newIds.has(card.dataset.cardId)) {
                // Функция animateCardDeletion превратит .card в плавно исчезающий .card-spacer
                animateCardDeletion(card); 
            }
        });

        // 2. Получаем геометрию оставшихся карточек для FLIP анимации
        const remainingCards = Array.from(cardList.querySelectorAll('.card:not(.card-drag-clone)'));
        const cardRects = new Map();
        remainingCards.forEach(c => cardRects.set(c.dataset.cardId, c.getBoundingClientRect()));

        // 3. Сохраняем спейсеры (от анимации удаления) и их позицию относительно следующих карточек,
        // чтобы они не уничтожились при перерисовке innerHTML и список не "прыгнул" вверх.
        const spacers = Array.from(cardList.querySelectorAll('.card-spacer'));
        const spacerMap = new Map();
        spacers.forEach(s => {
            let nextCard = s.nextElementSibling;
            // Ищем следующую реальную карточку после спейсера
            while (nextCard && !nextCard.classList.contains('card')) {
                nextCard = nextCard.nextElementSibling;
            }
            const nextId = nextCard ? nextCard.dataset.cardId : 'END';
            
            if (!spacerMap.has(nextId)) spacerMap.set(nextId, []);
            spacerMap.get(nextId).push(s);
            
            s.remove(); // Временно убираем из DOM
        });

        // 4. Очищаем список и строим заново
        cardList.innerHTML = '';
        const sortedTasks = [...colState.tasks].sort((a, b) => a.position - b.position);
        
        sortedTasks.forEach(task => {
            // Вставляем спейсеры, которые стояли ПЕРЕД этой карточкой (чтобы пустота сжималась там, где нужно)
            if (spacerMap.has(String(task.id))) {
                spacerMap.get(String(task.id)).forEach(s => cardList.appendChild(s));
            }

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generateCardHtml(task, colState.mode).trim();
            const newCard = tempDiv.firstChild;
            cardList.appendChild(newCard);

            // FLIP Анимация перестроения (для карточек, которые сдвинулись)
            const oldRect = cardRects.get(String(task.id));
            if (oldRect) {
                requestAnimationFrame(() => {
                    const newRect = newCard.getBoundingClientRect();
                    const deltaY = oldRect.top - newRect.top;
                    if (deltaY !== 0) {
                        newCard.style.transform = `translateY(${deltaY}px)`;
                        newCard.style.transition = 'none';
                        requestAnimationFrame(() => {
                            newCard.style.transform = '';
                            newCard.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
                        });
                    }
                });
            }
        });

        // Вставляем спейсеры, которые были в самом конце колонки
        if (spacerMap.has('END')) {
            spacerMap.get('END').forEach(s => cardList.appendChild(s));
        }

        updateColumnCount(colEl, sortedTasks.length);
    } catch (e) {
        console.error("Ошибка синхронизации колонки:", e);
        renderBoard(); // Fallback на полную перерисовку при сбоях
    }
};

function updateCardAppearance(cardElement, task, columnMode) {
    if (task.completed_at) cardElement.classList.add('is-completed');
    else cardElement.classList.remove('is-completed');

    const subtasks = task.subtasks || [];
    const hasChecklist = subtasks.length > 0;
    const isTimerColumn = (columnMode === 'track_time');
    const isCompletionTime = (columnMode === 'completion' && task.total_time_spent !== undefined);
    
    cardElement.classList.toggle('has-unknown-time', isCompletionTime && task.total_time_spent === 0);

    let footer = cardElement.querySelector('.card-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'card-footer';
        cardElement.appendChild(footer);
    }

    let newContent = '';

    if (hasChecklist) {
        const total = subtasks.length;
        const done = subtasks.filter(s => s.completed_at).length;
        const allDone = done === total ? 'all-done' : '';
        newContent += `<div class="checklist-meta ${allDone}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg><span>${done}/${total}</span></div>`;
    }

    // --- ЛОГИКА ПРИОРИТЕТНОСТИ ---
    const ps = window.prioritySettings;
    const hasPriority = task.priority !== null && task.priority !== undefined;
    
    if (hasPriority || ps.show_always) {
        let levelClass = 'level-high';
        let emoji = ps.e_high;
        let displayValue = '';

        if (!hasPriority) {
            levelClass = 'level-none';
            emoji = ps.e_none || '?';
            displayValue = '—';
        } else {
            if (task.priority < ps.t_low) { levelClass = 'level-low'; emoji = ps.e_low; }
            else if (task.priority < ps.t_mid) { levelClass = 'level-mid'; emoji = ps.e_mid; }
            displayValue = (Math.round(parseFloat(task.priority) * 10) / 10) + '%';
        }
        
        newContent += `<div class="priority-pill ${levelClass} clickable" onclick="openPriorityModal(${task.id})"><span>${displayValue}</span><span>${emoji}</span></div>`;
    }
    // ----------------------------

    if (task.due_date) {
        const dateStr = task.due_date + (task.due_date.endsWith('Z') || task.due_date.includes('+') ? '' : 'Z');
        const dueDate = new Date(dateStr);
        const now = new Date();
        const isOverdue = dueDate < now;

        let icon;
        let overdueClass = '';
        if (task.completed_at) {
            const completedDate = new Date(task.completed_at + (task.completed_at.endsWith('Z') || task.completed_at.includes('+') ? '' : 'Z'));
            if (completedDate > dueDate) {
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="7.5" y1="7.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="7.5" x2="7.5" y2="10.5"/><line x1="13.5" y1="7.5" x2="16.5" y2="10.5"/><line x1="16.5" y1="7.5" x2="13.5" y2="10.5"/><line x1="9" y1="16" x2="15" y2="16"/></svg>'; // просрочен + завершён
                overdueClass = 'overdue';
            } else {
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><polyline points="7,12 11,16 17,8"/></svg>'; // завершён вовремя
            }
        } else {
            if (isOverdue) {
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="7.5" y1="7.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="7.5" x2="7.5" y2="10.5"/><line x1="13.5" y1="7.5" x2="16.5" y2="10.5"/><line x1="16.5" y1="7.5" x2="13.5" y2="10.5"/><line x1="9" y1="16" x2="15" y2="16"/></svg>'; // просрочен
                overdueClass = 'overdue';
            } else {
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4.42 0-8-3.58-8-8 0-3.1 1.76-5.8 4.36-7.14.33-.17.7-.06.88.24.41.69 1.05 1.34 1.7 1.15.65-.19.96-1.55 1.4-3.13C12.8 3.42 13.5 2 14.5 2c.28 0 .54.12.72.32 1.41 1.6 3.1 3.96 4.13 6.08C20.44 10.64 20 12.3 20 14c0 4.42-3.58 8-8 8z"></path></svg>'; // активный дедлайн
            }
        }

        newContent += `<div class="due-date-pill ${overdueClass} clickable" onclick="openDueDateModal(${task.id}, '${task.due_date}')"><span class="due-icon">${icon}</span><span>${formatShortDate(task.due_date)}</span></div>`;
    }

    if (isTimerColumn) {
        const displayTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        newContent += `<div class="card-timer" data-task-id="${task.id}">${displayTime}</div>`;
    }

    if (isCompletionTime) {
        newContent += `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
    }

    if (footer.innerHTML !== newContent) {
        footer.innerHTML = newContent;
    }
}

function generateCardHtml(task, columnMode) {
    let extraClasses = [];
    if (task.completed_at) extraClasses.push('is-completed');

    let checklistHtml = '';
    const subtasks = task.subtasks || [];
    if (subtasks.length > 0) {
        const total = subtasks.length;
        const done = subtasks.filter(s => s.completed_at).length;
        checklistHtml = `<div class="checklist-meta ${done === total ? 'all-done' : ''}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg><span>${done}/${total}</span></div>`;
    }

    // --- ЛОГИКА ПРИОРИТЕТНОСТИ ---
    let priorityHtml = ''; // Обязательно объявляем переменную!
    const ps = window.prioritySettings;
    const hasPriority = task.priority !== null && task.priority !== undefined;

    if (hasPriority || ps.show_always) {
        let levelClass = 'level-high';
        let emoji = ps.e_high;
        let displayValue = '';

        if (!hasPriority) {
            levelClass = 'level-none';
            emoji = ps.e_none || '?';
            displayValue = '—';
        } else {
            if (task.priority < ps.t_low) { levelClass = 'level-low'; emoji = ps.e_low; }
            else if (task.priority < ps.t_mid) { levelClass = 'level-mid'; emoji = ps.e_mid; }
            displayValue = (Math.round(parseFloat(task.priority) * 10) / 10) + '%';
        }
        
        priorityHtml = `<div class="priority-pill ${levelClass} clickable" onclick="openPriorityModal(${task.id})"><span>${displayValue}</span><span>${emoji}</span></div>`;
    }
    // ----------------------------

    let dueDateHtml = '';
    if (task.due_date) {
        const dateStr = task.due_date + (task.due_date.endsWith('Z') || task.due_date.includes('+') ? '' : 'Z');
        const dueDate = new Date(dateStr);
        const now = new Date();
        const isOverdue = dueDate < now;

        let icon;
        let overdueClass = '';
        if (task.completed_at) {
            const completedDate = new Date(task.completed_at + (task.completed_at.endsWith('Z') || task.completed_at.includes('+') ? '' : 'Z'));
            if (completedDate > dueDate) {
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="7.5" y1="7.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="7.5" x2="7.5" y2="10.5"/><line x1="13.5" y1="7.5" x2="16.5" y2="10.5"/><line x1="16.5" y1="7.5" x2="13.5" y2="10.5"/><line x1="9" y1="16" x2="15" y2="16"/></svg>'; // просрочен + завершён
                overdueClass = 'overdue';
            } else {
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><polyline points="7,12 11,16 17,8"/></svg>'; // завершён вовремя
            }
        } else {
            if (isOverdue) {
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="7.5" y1="7.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="7.5" x2="7.5" y2="10.5"/><line x1="13.5" y1="7.5" x2="16.5" y2="10.5"/><line x1="16.5" y1="7.5" x2="13.5" y2="10.5"/><line x1="9" y1="16" x2="15" y2="16"/></svg>'; // просрочен
                overdueClass = 'overdue';
            } else {
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4.42 0-8-3.58-8-8 0-3.1 1.76-5.8 4.36-7.14.33-.17.7-.06.88.24.41.69 1.05 1.34 1.7 1.15.65-.19.96-1.55 1.4-3.13C12.8 3.42 13.5 2 14.5 2c.28 0 .54.12.72.32 1.41 1.6 3.1 3.96 4.13 6.08C20.44 10.64 20 12.3 20 14c0 4.42-3.58 8-8 8z"></path></svg>'; // активный дедлайн
            }
        }

        dueDateHtml = `<div class="due-date-pill ${overdueClass} clickable" onclick="openDueDateModal(${task.id}, '${task.due_date}')"><span class="due-icon">${icon}</span><span>${formatShortDate(task.due_date)}</span></div>`;
    }

    let timerHtml = '';
    if (columnMode === 'track_time') {
        const displayTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        timerHtml = `<div class="card-timer" data-task-id="${task.id}">${displayTime}</div>`;
    }

    let spentTimeHtml = '';
    if (columnMode === 'completion' && task.total_time_spent !== undefined) {
        if (task.first_start && task.last_end && task.total_time_spent > 0) {
            const startStr = formatExactDateTime(task.first_start);
            const endStr = formatExactDateTime(task.last_end);
            const durStr = formatDetailedDuration(task.total_time_spent);
            spentTimeHtml = `
                <div class="card-time-details">
                    <div class="time-row"><span class="time-label">Начало:</span> <span>${startStr}</span></div>
                    <div class="time-row"><span class="time-label">Конец:</span> <span>${endStr}</span></div>
                    <div class="time-row"><span class="time-label">Затрачено:</span> <span>${durStr}</span></div>
                </div>
            `;
        } else {
            spentTimeHtml = `<div class="subtask-meta">${t('card.timeSpent')} ${formatTotalTime(task.total_time_spent)}</div>`;
        }
        if (task.total_time_spent === 0) extraClasses.push('has-unknown-time');
    } 

    let footerHtml = '';
    if (checklistHtml || priorityHtml || dueDateHtml || timerHtml || spentTimeHtml) {
        footerHtml = `<div class="card-footer">${checklistHtml}${priorityHtml}${dueDateHtml}${timerHtml}${spentTimeHtml}</div>`;
    }
    
    return `
        <div class="card ${extraClasses.join(' ')}" data-card-id="${task.id}">
            <div class="card-title-wrapper">
                <svg class="completed-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <div class="card-title">${renderInlineMarkdown(task.title)}</div>
                <div class="card-menu-wrapper">
                    <button class="card-menu-btn" title="Редактировать">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                </div>
            </div>
            ${footerHtml}
            <!-- Инлайн триггер создания новой карточки под текущей -->
            <div class="card-inline-trigger">
                <button class="divider-plus-btn">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>
        </div>
    `;
}

function createColumnElement(column) {
    const colDiv = document.createElement('div');
    colDiv.className = 'column';
    colDiv.dataset.columnId = column.id;
    
    if (column.collapsed) colDiv.classList.add('collapsed');

    let pillClass = 'meta-pill default';
    let modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>';
    if (column.mode === 'track_time') {
        pillClass = 'meta-pill track-time';
        modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    } else if (column.mode === 'completion') {
        pillClass = 'meta-pill completion';
        modeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    }

    const sortedTasks = [...column.tasks].sort((a, b) => a.position - b.position);
    
    let tasksHtml = '';
    sortedTasks.forEach((task) => {
        tasksHtml += generateCardHtml(task, column.mode);
    });

    colDiv.innerHTML = `
        <div class="column-header">
            <span class="column-title" data-full-title="${escapeHtml(column.title)}">${escapeHtml(column.title)}</span>
            <div class="column-actions">
                <div class="${pillClass}">
                    <span class="card-count">${column.tasks.length}</span>
                    ${modeIcon}
                </div>
                <button class="menu-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></button>
            </div>
        </div>
        <div class="dropdown-menu">
            <div class="menu-label">${t('menu.mode')}</div>
            <div class="menu-item ${column.mode === 'default' ? 'selected' : ''}" data-action="set-mode" data-mode="default">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                <span>${t('columnModes.default')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-item ${column.mode === 'track_time' ? 'selected' : ''}" data-action="set-mode" data-mode="track_time">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${t('columnModes.track_time')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-item ${column.mode === 'completion' ? 'selected' : ''}" data-action="set-mode" data-mode="completion">
                <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${t('columnModes.completion')}</span>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="menu-divider"></div>
            <div class="menu-item" data-action="collapse-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg><span>${t('menu.collapse')}</span></div>
            <div class="menu-item" data-action="sort-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg><span>${t('menu.sort')}</span></div>
            <div class="menu-item" data-action="rename-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>${t('menu.rename')}</span></div>
            <div class="menu-item danger" data-action="clear-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M19 10l-4 4"/><path d="M15 10l4 4"/></svg><span>${t('menu.clear')}</span></div>
            <div class="menu-item danger" data-action="delete-column"><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>${t('menu.delete')}</span></div>
        </div>
        <div class="card-list">${tasksHtml}</div>
        <button class="btn-add-card">${t('newTask')}</button>
    `;

    if (column.width && !column.collapsed) {
        colDiv.style.width = column.width + 'px';
    }

    // Resize handle (invisible, right edge)
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'column-resize-handle';
    resizeHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        startColumnResize(colDiv, column, e);
    });
    colDiv.appendChild(resizeHandle);

    const addBtn = colDiv.querySelector('.btn-add-card');
    addBtn.addEventListener('click', () => onAddTask(column.id));

    const menuBtn = colDiv.querySelector('.menu-btn');
    menuBtn.addEventListener('click', (e) => toggleColumnMenu(e, colDiv));

    return colDiv;
}

async function clearTaskTimerAPI(taskId) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/clear-timer`, { method: 'POST' });
    if (!res.ok) throw new Error('Error');
    return res.json();
}

async function refreshBoard(scrollToActive = false, newTabId = null) {
    try {
        const _prefetchWsId = state.activeWorkspaceId;
        const [_wsList, _prefetchedColumns] = await Promise.all([
            fetchWorkspaces(),
            _prefetchWsId ? fetchColumns(_prefetchWsId).catch(() => null) : Promise.resolve(null)
        ]);
        state.workspaces = _wsList;
        
        if (state.workspaces.length === 0) {
            const ws = await createWorkspaceAPI(t('defaultWorkspace'));
            state.workspaces.push(ws);
        }

        if (!state.activeWorkspaceId || !state.workspaces.find(w => w.id === state.activeWorkspaceId)) {
            state.activeWorkspaceId = state.workspaces[0].id;
        }

        renderTabs(scrollToActive, newTabId);

        const columns = (_prefetchedColumns !== null && state.activeWorkspaceId === _prefetchWsId)
            ? _prefetchedColumns
            : await fetchColumns(state.activeWorkspaceId);
        state.columns = columns.map(col => ({ ...col, collapsed: col.collapsed || false }));
        renderBoard();
        
        const calModal = document.getElementById('calendar-modal');
        if (calModal && calModal.classList.contains('show') && Calendar.syncData) {
            Calendar.syncData();
        }
        
    } catch (e) { 
        console.error(e); 
    }
}

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
            const pinStart = performance.now();
            const pinToBottom = () => {
                if (!formCard.isConnected) return;
                cardList.scrollTop = cardList.scrollHeight;
                if (performance.now() - pinStart < 260) requestAnimationFrame(pinToBottom);
            };
            pinToBottom();
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

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    
    addBtn.addEventListener('click', onAddTabClick);
    
    container.appendChild(addBtn);

    if (scrollToActive) {
        requestAnimationFrame(() => {
            const activeTab = container.querySelector('.board-tab.active');
            if (activeTab) {
                activeTab.scrollIntoView({ 
                    behavior: newTabId ? 'smooth' : 'auto', 
                    block: 'nearest', 
                    inline: 'center' 
                });
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
        
        // Находим кнопку по атрибуту (т.к. классы могут меняться туда-сюда)
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

    // Архитектурно чистая блокировка: имитируем "локальное редактирование".
        // Вебсокет будет игнорировать внешние изменения БД, пока интервал обновляет таймер.
        // Это никак не влияет на Drag&Drop или локальные таймеры карточек.
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
            clearInterval(syncLockInterval); // Снимаем блокировку фоновой синхронизации
    
        
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

function startTabRename(tabEl, ws) {
    const titleSpan = tabEl.querySelector('.tab-name');
    if (!titleSpan || tabEl.classList.contains('is-renaming')) return;

    const initialTextWidth = titleSpan.getBoundingClientRect().width;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-name-input';
    input.value = ws.name;
    input.spellcheck = false;
    input.autocomplete = "off";

    titleSpan.replaceWith(input);
    tabEl.setAttribute('draggable', 'false');
    tabEl.classList.add('is-renaming');

    const autoResize = () => {
        if (input.value === ws.name) {
            input.style.width = `${initialTextWidth + 8}px`;
            return;
        }

        const span = document.createElement('span');
        span.style.font = window.getComputedStyle(input).font;
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.textContent = input.value || ' ';
        document.body.appendChild(span);
        
        input.style.width = Math.max(20, span.getBoundingClientRect().width + 9) + 'px';
        document.body.removeChild(span);
        
        if (window.updateTabsScrollbar) window.updateTabsScrollbar();
    };

    input.addEventListener('input', autoResize);
    autoResize();
    
    input.focus({ preventScroll: true }); 
    input.setSelectionRange(input.value.length, input.value.length);

    let committed = false;

    const restore = (title) => {
        const span = document.createElement('span');
        span.className = 'tab-name';
        span.textContent = title;
        span.dataset.fullTitle = title;
        
        if (input.parentNode) input.replaceWith(span);
        
        tabEl.setAttribute('draggable', 'true');
        tabEl.classList.remove('is-renaming');
        
        if (window.updateTabsScrollbar) window.updateTabsScrollbar();
    };

    const commit = async () => {
        if (committed) return;
        committed = true;
        
        const newName = input.value.trim();
        const finalName = newName || ws.name;
        
        restore(finalName);

        if (newName && newName !== ws.name) {
            try {
                await updateWorkspaceAPI(ws.id, newName);
                ws.name = newName;
            } catch (err) {
                console.error("Ошибка при переименовании вкладки:", err);
                const span = tabEl.querySelector('.tab-name');
                if (span) {
                    span.textContent = ws.name;
                    span.dataset.fullTitle = ws.name;
                }
            }
        }
    };

    const cancel = () => {
        if (committed) return;
        committed = true;
        restore(ws.name);
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey)  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { if (!committed) commit(); }, 120);
    });
}

function startColumnRename(columnEl, column) {
    const titleSpan = columnEl.querySelector('.column-title');
    if (!titleSpan || columnEl.classList.contains('is-renaming')) return;

    const input = document.createElement('textarea');
    input.className = 'column-title-input';
    input.value = column.title;
    input.rows = 1;
    input.spellcheck = false;

    titleSpan.replaceWith(input);
    columnEl.setAttribute('draggable', 'false');
    columnEl.classList.add('is-renaming');

    let lastValidValue = input.value;
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

    autoResize(); 
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let committed = false;

    const restore = (title) => {
        const span = document.createElement('span');
        span.className = 'column-title';
        span.textContent = title;
        span.dataset.fullTitle = title;
        if (input.parentNode) input.replaceWith(span);
        columnEl.setAttribute('draggable', 'true');
        columnEl.classList.remove('is-renaming');
        requestAnimationFrame(clampExpandedTitles);
    };

    const commit = async () => {
        if (committed) return;
        committed = true;
        const newTitle = input.value.trim();
        const finalTitle = newTitle || column.title;
        restore(finalTitle);
        if (newTitle && newTitle !== column.title) {
            try {
                await updateColumn(column.id, { title: newTitle });
                column.title = newTitle;
            } catch (_) {
                const span = columnEl.querySelector('.column-title');
                if (span) span.textContent = column.title;
            }
        }
        requestAnimationFrame(() => {
            const titleEl = columnEl.querySelector('.column-title');
            clampSingleTitle(titleEl);
        });
    };

    const cancel = () => {
        if (committed) return;
        committed = true;
        restore(column.title);
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click',     (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey)  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { if (!committed) commit(); }, 120);
    });
}

function startCardRename(cardEl, task) {
    const titleDiv = cardEl.querySelector('.card-title');
    if (!titleDiv || cardEl.classList.contains('is-renaming')) return;

    const input = document.createElement('textarea');
    input.className = 'card-title-input';
    input.value = task.title;
    input.rows = 1;
    input.spellcheck = false;

    titleDiv.replaceWith(input);
    cardEl.classList.add('is-renaming');

    const autoResize = () => {
        const scrollParent = cardEl.closest('.card-list');
        const currentScroll = scrollParent ? scrollParent.scrollTop : 0;

        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        input.style.height = (input.scrollHeight + offset) + 'px';
        
        if (scrollParent) scrollParent.scrollTop = currentScroll;
        
        if (input.value.trim().length <= 1000) {
            cardEl.classList.remove('is-error');
        }
    };
    
    input.addEventListener('input', () => {
        autoResize();
        
        const globalMenu = document.getElementById('global-card-menu');
        if (globalMenu.classList.contains('show') && globalMenu.dataset.activeCardId == task.id) {
            closeAllDropdowns();
        }
    });
    autoResize();
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length); 
    bindTitleFormattingShortcuts(input);

    let committed = false;

    const validateAndShake = () => {
        const val = input.value.trim();
        if (val.length > 1000) {
            let hint = cardEl.querySelector('.card-error-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');
                
                const wrapper = input.closest('.card-title-wrapper');
                if (wrapper) {
                    wrapper.after(hint);
                } else {
                    input.after(hint);
                }
            }

            cardEl.classList.remove('is-error');
            void cardEl.offsetWidth;
            cardEl.classList.add('is-error');
            
            return false;
        }
        return true;
    };

    const restore = (title) => {
        const div = document.createElement('div');
        div.className = 'card-title';
        div.innerHTML = renderInlineMarkdown(title);
        
        const hint = cardEl.querySelector('.card-error-hint');
        if (hint) hint.remove();
        
        if (input.parentNode) input.replaceWith(div);
        cardEl.classList.remove('is-renaming', 'is-error');
    };

    const commit = async () => {
        if (committed) return;

        if (!validateAndShake()) {
            input.focus();
            return; 
        }

        committed = true;
        
        closeAllDropdowns();

        const newTitle = input.value.trim();
        const finalTitle = newTitle || task.title;
        
        restore(finalTitle);

        if (newTitle && newTitle !== task.title) {
            try {
                const subtaskTitleEl = document.querySelector(`.subtask-item[data-subtask-id="${task.id}"] .subtask-title`);
                if (subtaskTitleEl) {
                    subtaskTitleEl.innerHTML = renderInlineMarkdown(newTitle);
                    subtaskTitleEl.dataset.rawTitle = newTitle;
                }

                await updateTask(task.id, { title: newTitle });
                task.title = newTitle;
                
                // На случай если стоит авто-сортировка по алфавиту
                const colEl = cardEl.closest('.column');
                if (colEl) await syncColumnDOM(parseInt(colEl.dataset.columnId));
            } catch (_) {
                cardEl.classList.add('is-error');
                const div = cardEl.querySelector('.card-title');
                if (div) div.innerHTML = renderInlineMarkdown(task.title);
                
                const subtaskTitleEl = document.querySelector(`.subtask-item[data-subtask-id="${task.id}"] .subtask-title`);
                if (subtaskTitleEl) {
                    subtaskTitleEl.innerHTML = renderInlineMarkdown(task.title);
                    subtaskTitleEl.dataset.rawTitle = task.title;
                }
            }
        }
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (validateAndShake()) commit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            committed = true;
            
            closeAllDropdowns();
            
            restore(task.title);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { 
            if (!committed) commit(); 
        }, 120);
    });
}

function startModalTaskRename(titleEl) {
    const modal = document.getElementById('task-modal');
    if (modal.classList.contains('is-renaming')) return;

    const taskId = parseInt(modal.dataset.taskId);
    const originalTitle = titleEl.dataset.rawTitle || titleEl.textContent;

    const input = document.createElement('textarea');
    input.className = 'task-modal-title-input';
    input.value = originalTitle;
    input.rows = 1;
    input.spellcheck = false;

    titleEl.replaceWith(input);
    modal.classList.add('is-renaming');

    const autoResize = () => {
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        input.style.height = (input.scrollHeight + offset) + 'px';
    };
    input.addEventListener('input', () => {
        autoResize();
        if (input.value.trim().length <= 1000) {
            const header = input.closest('.modal-header');
            if (header) header.classList.remove('is-error');
        }
    });
    autoResize();
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    bindTitleFormattingShortcuts(input);

    let committed = false;

    const restore = (title) => {
        const span = document.createElement('span');
        span.className = 'modal-title';
        span.id = 'task-modal-title';
        span.innerHTML = renderInlineMarkdown(title);
        span.dataset.rawTitle = title;

        const header = input.closest('.modal-header');
        if (header) {
            header.classList.remove('is-error');
            const hint = header.querySelector('.card-error-hint');
            if (hint) hint.remove();
        }

        if (input.parentNode) input.replaceWith(span);
        modal.classList.remove('is-renaming');
    };

    const commit = async () => {
        if (committed) return;
        
        const newTitle = input.value.trim();
        if (newTitle.length > 1000) {
            const header = input.closest('.modal-header');
            if (header) {
                if (!header.querySelector('.card-error-hint')) {
                    const hint = document.createElement('div');
                    hint.className = 'card-error-hint';
                    hint.textContent = t('errors.tooLong');
                    header.appendChild(hint);
                }
                header.classList.remove('is-error');
                void header.offsetWidth;
                header.classList.add('is-error');
            }
            input.focus();
            return;
        }

        committed = true;
        const finalTitle = newTitle || originalTitle;
        restore(finalTitle);

        if (newTitle && newTitle !== originalTitle) {
            try {
                const boardCardTitle = document.querySelector(`.card[data-card-id="${taskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.innerHTML = renderInlineMarkdown(newTitle);
                }

                await updateTask(taskId, { title: newTitle });
                
                bumpModalUpdatedDate();
                
                let taskUpdated = false;
                for (let col of state.columns) {
                    let t = col.tasks.find(t => t.id === taskId);
                    if (!t) {
                        for (let pt of col.tasks) {
                            if (pt.subtasks) {
                                t = pt.subtasks.find(s => s.id === taskId);
                                if (t) break;
                            }
                        }
                    }
                    if (t) {
                        t.title = newTitle;
                        taskUpdated = true;
                        break;
                    }
                }
                refreshBoard();
                
                renderGraphBreadcrumbs(taskId);
            } catch (e) {
                console.error("Ошибка при переименовании задачи", e);
                restore(originalTitle);
                
                const boardCardTitle = document.querySelector(`.card[data-card-id="${taskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.innerHTML = renderInlineMarkdown(originalTitle);
                }
            }
        }
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); committed = true; restore(originalTitle); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!committed) commit(); }, 120));
}

function startSubtaskRename(subtaskEl) {
    const titleDiv = subtaskEl.querySelector('.subtask-title');
    if (!titleDiv || subtaskEl.classList.contains('is-renaming')) return;

    const subtaskId = parseInt(subtaskEl.dataset.subtaskId);
    const originalTitle = titleDiv.dataset.rawTitle || titleDiv.textContent;

    const input = document.createElement('textarea');
    input.className = 'subtask-title-input';
    input.value = originalTitle;
    input.rows = 1;
    input.spellcheck = false;

    titleDiv.replaceWith(input);
    subtaskEl.classList.add('is-renaming');

    const autoResize = () => {
        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px';
        input.style.height = (input.scrollHeight + offset) + 'px';
    };
    input.addEventListener('input', () => {
        if (input.value.trim().length <= 1000) {
            subtaskEl.classList.remove('is-error');
            const hint = subtaskEl.querySelector('.card-error-hint');
            if (hint) hint.remove();
        }
        autoResize();
    });
    autoResize();
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    bindTitleFormattingShortcuts(input);

    let committed = false;

    const restore = (title) => {
        const div = document.createElement('div');
        div.className = 'subtask-title';
        div.innerHTML = renderInlineMarkdown(title);
        div.dataset.rawTitle = title;

        const hint = subtaskEl.querySelector('.card-error-hint');
        if (hint) hint.remove();

        if (input.parentNode) input.replaceWith(div);
        subtaskEl.classList.remove('is-renaming', 'is-error');
    };

    const commit = async () => {
        if (committed) return;
        
        const newTitle = stripDoeTaskLinks(input.value.trim());
        
        if (newTitle.length > 1000) {
            if (!subtaskEl.querySelector('.card-error-hint')) {
                const hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');
                subtaskEl.appendChild(hint);
            }
            subtaskEl.classList.remove('is-error');
            void subtaskEl.offsetWidth;
            subtaskEl.classList.add('is-error');
            input.focus();
            return;
        }

        committed = true;
        const finalTitle = newTitle || originalTitle;
        restore(finalTitle);

        if (newTitle && newTitle !== originalTitle) {
            try {
                const boardCardTitle = document.querySelector(`.card[data-card-id="${subtaskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.innerHTML = renderInlineMarkdown(newTitle);
                }

                for (let col of state.columns) {
                    let t = col.tasks.find(taskItem => taskItem.id === subtaskId);
                    if (t) {
                        t.title = newTitle;
                        break;
                    }
                }

                const modal = document.getElementById('task-modal');
                const parentTaskId = parseInt(modal.dataset.taskId);
                for (let col of state.columns) {
                    let parentTask = col.tasks.find(taskItem => taskItem.id === parentTaskId);
                    if (parentTask && parentTask.subtasks) {
                        let subtaskObj = parentTask.subtasks.find(s => s.id === subtaskId);
                        if (subtaskObj) {
                            subtaskObj.title = newTitle;
                        }
                        break;
                    }
                }

                await updateTask(subtaskId, { title: newTitle });
                
                refreshBoard(); 
            } catch (e) {
                console.error("Ошибка при переименовании подзадачи", e);
                restore(originalTitle);
                
                const boardCardTitle = document.querySelector(`.card[data-card-id="${subtaskId}"] .card-title`);
                if (boardCardTitle) {
                    boardCardTitle.innerHTML = renderInlineMarkdown(originalTitle);
                }
            }
        }
    };

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); committed = true; restore(originalTitle); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!committed) commit(); }, 120));
}

function adjustCollapsedColumnWidths() {
    const CHAR_HEIGHT = 18.2;
    const MAX_LINES = 5;
    const PADDING = 32;
    const CHAR_WIDTH = 22;

    document.querySelectorAll('#board .column.collapsed').forEach(colEl => {
        const titleEl = colEl.querySelector('.column-title');
        if (!titleEl) return;

        const fullTitle = titleEl.dataset.fullTitle || titleEl.textContent;
        const colHeight = colEl.getBoundingClientRect().height - 24;
        if (colHeight < 10) return;

        titleEl.style.maxHeight = colHeight + 'px';

        const charsPerLine = Math.max(1, Math.floor(colHeight / CHAR_HEIGHT));
        const maxChars = charsPerLine * MAX_LINES;

        if (!titleEl.dataset.fullTitle) {
            titleEl.dataset.fullTitle = fullTitle;
        }

        const isClamped = fullTitle.length > maxChars;

        if (isClamped) {
            const visibleChars = maxChars - 1;
            titleEl.textContent = fullTitle.substring(0, visibleChars) + '…';
            titleEl.dataset.clamped = 'true';
        } else {
            titleEl.textContent = fullTitle;
            titleEl.dataset.clamped = 'false';
        }

        const actualLines = Math.min(MAX_LINES, Math.ceil(fullTitle.length / charsPerLine));
        const colWidth = Math.max(60, PADDING + actualLines * CHAR_WIDTH);

        colEl.style.width = colWidth + 'px';
        colEl.style.minWidth = colWidth + 'px';
    });
}

let isDragging = false;
let dragType = null;
let draggedElement = null;
let dragClone = null;
let mouseX = 0, mouseY = 0, lastMouseX = 0;
let currentRotation = 0, targetRotation = 0;
let rafId = null;

let startX = 0, startY = 0;
let isPointerDown = false;
let potentialDragTarget = null;
let potentialDragType = null;

// Переменные для плавного скролла и устранения Layout Thrashing
let lastHitTestTime = 0;
let wasScrolling = false;

// Плавный скролл с ускорением (Enterprise Edge Panning)
let scrollAccumX = 0;
let scrollAccumY = 0;
let currentScrollSpeedX = 0;
let currentScrollSpeedY = 0;

let originalWorkspaceId = null;
let isHoveringTabs = false;
let draggedTaskObject = null; 
let currentDragScale = 1;
let dragCloneWidth = 0;
let dragCloneHeight = 0;
let pendingSwitchTabId = null;
let tabSwitchTimeout = null;

let originalOffsetX = 0;
let originalOffsetY = 0;
let currentOriginX = 0;
let currentOriginY = 0;

document.addEventListener('dragstart', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;

    if (e.target.closest('button, input, textarea, .menu-btn, .card-menu-btn, .tab-close-btn, .column.is-renaming, .board-tab.is-renaming, .card.is-renaming, .card-entering, .column-entering, .description-wrapper, .column-resize-handle')) return;
    const vaultHistory = e.target.closest('.vault-history-item');
    const subtask = e.target.closest('.subtask-item');
    const attachment = e.target.closest('.attachment-item');
    const card = e.target.closest('.card');
    const column = e.target.closest('.column');
    const tab = e.target.closest('.board-tab');

    if (vaultHistory) {
        potentialDragType = 'vault-history';
        potentialDragTarget = vaultHistory;
    }
    else if (attachment) {
        potentialDragType = 'attachment';
        potentialDragTarget = attachment;
    }
    else if (subtask) { 
        potentialDragType = 'subtask';
        potentialDragTarget = subtask;
    }
    else if (card) {
        potentialDragType = 'card';
        potentialDragTarget = card;
    } else if (column) {
        potentialDragType = 'column';
        potentialDragTarget = column;
    } else if (tab) {
        potentialDragType = 'tab';
        potentialDragTarget = tab;
    } else {
        return;
    }

    isPointerDown = true;
    startX = e.clientX;
    startY = e.clientY;
});

document.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;

    if (!isDragging) {
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
            startDrag(potentialDragTarget, potentialDragType, e);
        } else {
            return;
        }
    }

    e.preventDefault();
    mouseX = e.clientX;
    mouseY = e.clientY;

    performHitTest();
});

document.addEventListener('pointerup', async (e) => {
    isPointerDown = false;
    potentialDragTarget = null;
    
    if (isDragging) {
        window._isAfterDrag = true;
        setTimeout(() => window._isAfterDrag = false, 50);
        await endDrag();
    }
});

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
        if (hoverCard && hoverCard !== draggedElement) {
            const rect = hoverCard.getBoundingClientRect();
            if (mouseY > rect.top + rect.height / 2) {
                if (hoverCard.nextElementSibling !== draggedElement) hoverCard.after(draggedElement);
            } else {
                if (hoverCard.previousElementSibling !== draggedElement) hoverCard.before(draggedElement);
            }
        } 
        else {
            const hoverCol = elemUnderMouse.closest('.column:not(.is-ghost)');
            if (hoverCol) {
                const cardList = hoverCol.querySelector('.card-list');
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
        // КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Доска ВСЕГДА может скроллиться по X при перетаскивании карточки!
        containerX = document.querySelector('.board-container');
        
        // А если мы над колонкой — добавляем независимую возможность скроллить её по Y
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

    // Инерция (Ease-out). Плавно разгоняемся и плавно останавливаемся
    currentScrollSpeedX += (targetSpeedX - currentScrollSpeedX) * 0.15;
    currentScrollSpeedY += (targetSpeedY - currentScrollSpeedY) * 0.15;

    let didScroll = false;

    // Применяем скролл по X
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

    // Применяем скролл по Y
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
        // Дросселируем (throttle) тяжелый расчет коллизий во время автоскролла до 50мс (20fps),
        // предотвращая Layout Thrashing и высвобождая ресурсы процессора для плавных 60fps анимации.
        if (now - lastHitTestTime > 50) {
            performHitTest();
            lastHitTestTime = now;
        }
        wasScrolling = true;
    } else {
        if (wasScrolling) {
            // Выполняем один финальный расчет коллизий сразу после остановки скролла,
            // чтобы карточка мгновенно примагнитилась на свое итоговое место.
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
    
    // Сброс скоростей автоскролла и таймера коллизий
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

                        // Смена иконки дедлайна при завершении
                        if (optimisticTask.due_date) {
                            const dueDate = new Date(optimisticTask.due_date + (optimisticTask.due_date.endsWith('Z') || optimisticTask.due_date.includes('+') ? '' : 'Z'));
                            const completedDate = new Date();
                            const isOverdue = completedDate > dueDate;
                            const ddPill = draggedElement.querySelector('.due-date-pill');
                            if (ddPill) {
                                const iconEl = ddPill.querySelector('.due-icon');
                                if (iconEl) {
                                    iconEl.innerHTML = isOverdue ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="7.5" y1="7.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="7.5" x2="7.5" y2="10.5"/><line x1="13.5" y1="7.5" x2="16.5" y2="10.5"/><line x1="16.5" y1="7.5" x2="13.5" y2="10.5"/><line x1="9" y1="16" x2="15" y2="16"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><polyline points="7,12 11,16 17,8"/></svg>';
                                }
                                if (isOverdue) {
                                    ddPill.classList.add('overdue');
                                } else {
                                    ddPill.classList.remove('overdue');
                                }
                            }
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
            const currentTabs = Array.from(document.querySelectorAll('#tabs-container .board-tab'));
            const orderedIds = currentTabs.map(tab => parseInt(tab.dataset.workspaceId));
            state.workspaces.forEach(ws => { ws.position = orderedIds.indexOf(ws.id); });
            state.workspaces.sort((a, b) => a.position - b.position);
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
                    
                    // Синхронизируем DOM с сервером (включая работу автоматизаций)
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

document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.card-menu-btn')) {
        e.preventDefault(); 
    }
});

document.addEventListener('click', async (e) => {
    if (window._isAfterDrag) {
        e.stopPropagation();
        e.preventDefault();
        return;
    }

    const target = e.target;

    // Обработка ссылок внутри заголовков (Markdown)
    const titleLink = target.closest('a');
    if (titleLink) {
        const inTitle = target.closest('.card-title, .subtask-title, #task-modal-title, .breadcrumb-item');
        if (inTitle) {
            e.stopPropagation(); // Предотвращаем переименование / другие действия
            const href = titleLink.getAttribute('href');
            if (href && href.startsWith('doe://task/')) {
                e.preventDefault();
                const taskId = parseInt(href.replace('doe://task/', ''));
                if (taskId && !isNaN(taskId)) {
                    closeAllDropdowns();
                    fetch(`${API_BASE}/tasks/${taskId}/context`)
                        .then(res => res.json())
                        .then(context => {
                            window.navigateToEntityGlobal(context.workspace_id, context.column_id, taskId, null, true);
                        })
                        .catch(err => {
                            console.error("Не удалось найти контекст задачи", err);
                            loadTaskIntoModal(taskId, true);
                            document.getElementById('task-modal').classList.add('show');
                        });
                }
            } else if (href && (href.startsWith('doe/') || href.startsWith('/doe/'))) {
                e.preventDefault();
                const cleanHref = href.startsWith('/') ? href.slice(1) : href;
                fetch(`${API_BASE}/system/open-file`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: decodeURIComponent(cleanHref)}) });
            } else if (href) {
                e.preventDefault();
                fetch(`${API_BASE}/system/open-link`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url: href}) });
            }
            return;
        }
    }

    const collapsedCol = target.closest('.column.collapsed');
    if (collapsedCol) {
        if (!target.closest('.menu-btn')) {
            onExpandColumn(collapsedCol);
            return;
        }
    }

    const titleEl = target.closest('.column:not(.collapsed) .column-title');
    if (titleEl) {
        const columnEl = titleEl.closest('.column');
        if (columnEl && !columnEl.classList.contains('is-renaming')) {
            const columnId = parseInt(columnEl.dataset.columnId);
            const column = state.columns.find(c => c.id === columnId);
            if (column) {
                startColumnRename(columnEl, column);
                return;
            }
        }
    }

    const tabNameEl = target.closest('.board-tab .tab-name');
    if (tabNameEl) {
        const tabEl = tabNameEl.closest('.board-tab');
        if (tabEl && !tabEl.classList.contains('is-renaming')) {
            const wsId = parseInt(tabEl.dataset.workspaceId);
            if (wsId === state.activeWorkspaceId) {
                const ws = state.workspaces.find(w => w.id === wsId);
                if (ws) {
                    startTabRename(tabEl, ws);
                    return;
                }
            }
        }
    }

    const modalTitleEl = target.closest('#task-modal-title');
    if (modalTitleEl) {
        startModalTaskRename(modalTitleEl);
        return;
    }

    const subtaskTitleEl = target.closest('.subtask-title');
    if (subtaskTitleEl) {
        const subtaskEl = subtaskTitleEl.closest('.subtask-item');
        if (subtaskEl && !subtaskEl.classList.contains('attachment-item') && !subtaskEl.classList.contains('is-renaming')) {
            startSubtaskRename(subtaskEl);
            return;
        }
    }

    const detachModalBtn = target.closest('.modal-detach');
    if (detachModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
        
        detachModalBtn.style.transition = 'all 0.2s ease-in';
        detachModalBtn.style.opacity = '0';
        detachModalBtn.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            detachModalBtn.style.display = 'none';
            detachModalBtn.style.opacity = '1';
            detachModalBtn.style.transform = 'none';
        }, 200);

        try {
            updateTask(taskId, { parent_ids: [], is_visible_on_board: true }).then(() => {
                bumpModalUpdatedDate();
                refreshBoard();
                
                renderGraphBreadcrumbs(taskId);
            });
        } catch (err) {
            console.error("Ошибка отвязки из модалки:", err);
            detachModalBtn.style.display = 'flex';
        }
        return;
    }

    const completeSubtaskBtn = target.closest('.modal-complete-subtask');
    if (completeSubtaskBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
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

        if (!currentTask) return;

        const isCurrentlyDone = !!currentTask.completed_at;

        (async () => {
            // Выдаем окно подтверждения только при отметке "Выполнено"
            if (!isCurrentlyDone) {
                const isConfirmed = await showConfirmModal(t('modals.completeSubtaskTitle'), t('modals.completeSubtaskDesc'), t('modals.btnComplete'), false);
                if (!isConfirmed) return;
            }

            const timestamp = isCurrentlyDone ? null : new Date().toISOString();

            try {
                await updateTask(taskId, { completed_at: timestamp });
                currentTask.completed_at = timestamp;

                // Обновляем визуальное состояние (счетчики) у родительских карточек на доске
                state.columns.forEach(col => {
                    col.tasks.forEach(task => {
                        if (task.subtasks) {
                            const subIndex = task.subtasks.findIndex(s => s.id === taskId);
                            if (subIndex !== -1) {
                                task.subtasks[subIndex].completed_at = timestamp;
                                const cardEl = document.querySelector(`.card[data-card-id="${task.id}"]`);
                                if (cardEl) {
                                    updateCardAppearance(cardEl, task, col.mode);
                                }
                            }
                        }
                    });
                });

                bumpModalUpdatedDate();
                
                // Обновляем саму кнопку
                if (timestamp) {
                    completeSubtaskBtn.title = t('modals.uncompleteSubtask');
                    completeSubtaskBtn.style.color = 'var(--success-done)';
                } else {
                    completeSubtaskBtn.title = t('modals.completeSubtask');
                    completeSubtaskBtn.style.color = '';
                }

            } catch (err) {
                console.error("Ошибка изменения статуса подзадачи:", err);
                window.showToast(t('alerts.error'), 'Не удалось обновить статус', true);
            }
        })();
        return;
    }

    const calMenuDeleteBtn = target.closest('#cal-menu-delete');
    if (calMenuDeleteBtn) {
        e.stopPropagation();
        const menu = document.getElementById('cal-context-menu');
        const eventId = menu.dataset.eventId;

        if (eventId) {
            let hiddenEvents = JSON.parse(localStorage.getItem('doe_hidden_cal_events') || '[]');
            if (!hiddenEvents.includes(eventId)) {
                hiddenEvents.push(eventId);
                localStorage.setItem('doe_hidden_cal_events', JSON.stringify(hiddenEvents));
            }

            Calendar.events = Calendar.events.filter(ev => ev.event_id !== eventId);

            closeAllDropdowns();

            Calendar.render();
        }
        return;
    }

    const searchModalBtn = target.closest('.modal-search');
    if (searchModalBtn) {
        e.stopPropagation();
        if (window.openLocalSearch) window.openLocalSearch();
        return;
    }

    const exportModalBtn = target.closest('.modal-export');
    if (exportModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
        const exportModal = document.getElementById('export-modal');
        exportModal.dataset.taskId = taskId;
        exportModal.classList.add('show');
        
        const confirmBtn = document.getElementById('btn-confirm-export');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.replaceWith(newConfirmBtn);
        
        newConfirmBtn.onclick = async () => {
            const includeAtt = document.getElementById('export-include-att').checked;
            exportModal.classList.remove('show');
            
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
                const exportDir = await window.pywebview.api.choose_directory();
                if (exportDir) {
                    exportModalBtn.style.opacity = '0.5';
                    fetch(`${API_BASE}/tasks/${taskId}/export`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            export_path: exportDir, 
                            include_attachments: includeAtt
                        })
                    }).then(res => {
                        exportModalBtn.style.opacity = '1';
                        if (!res.ok) {
                            window.showToast(t('alerts.error'), 'Ошибка при экспорте', true);
                        } else {
                            window.showToast('Экспорт завершён', 'Карточка успешно сохранена');
                        }
                    }).catch(err => {
                        exportModalBtn.style.opacity = '1';
                        console.error(err);
                        window.showToast(t('alerts.error'), 'Сетевая ошибка при экспорте', true);
                    });
                }
            } else {
                window.showToast(t('alerts.error'), 'Экспорт работает только в десктопном приложении Doe', true);
            }
        };
        return;
    }

    const notifyModalBtn = target.closest('.modal-notify');
    if (notifyModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
        
        const titleNode = document.getElementById('task-modal-title') || document.querySelector('.task-modal-title-input');
        const taskTitle = (titleNode.value !== undefined ? titleNode.value : titleNode.textContent).trim();
        
        openNotifyModal(taskId, taskTitle);
        return;
    }

    const priorityModalBtn = target.closest('#modal-priority-btn');
    if (priorityModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);
        openPriorityModal(taskId);
        return;
    }

    const deleteModalBtn = target.closest('.modal-delete-task');
    if (deleteModalBtn) {
        e.stopPropagation();
        const modal = document.getElementById('task-modal');
        const taskId = parseInt(modal.dataset.taskId);

        (async () => {
            const isConfirmed = await showConfirmModal(
                t('menu.deleteCard'), 
                currentLang === 'ru' ? 'Карточка и все её подзадачи будут удалены.' : 'Card and all its subtasks will be deleted.'
            );
            if (!isConfirmed) return;

            // Корректно закрываем модалку со всеми ее очистками
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) closeBtn.click();

            // Находим карточку на доске и запускаем анимацию удаления
            const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
            if (cardEl) {
                animateCardDeletion(cardEl);
            }

            // Вычищаем из локального стейта, чтобы счетчики и связи корректно отработали
            for (let col of state.columns) {
                col.tasks = col.tasks.filter(t => t.id !== taskId);
                col.tasks.forEach(parentTask => {
                    if (parentTask.subtasks) {
                        const originalLength = parentTask.subtasks.length;
                        parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== taskId);
                        if (parentTask.subtasks.length !== originalLength) {
                            const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                            if (parentCardEl) {
                                updateCardAppearance(parentCardEl, parentTask, col.mode);
                            }
                        }
                    }
                });
            }

            // Удаляем через бэкенд
            deleteTask(taskId).then(data => {
                const deletedIds = data.deleted_ids || [];
                deletedIds.forEach(id => {
                    if (id === taskId) return;
                    // Рекурсивное удаление подзадач, если они тоже на доске
                    const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                    if (boardCard) animateCardDeletion(boardCard);
                    
                    for (let col of state.columns) {
                        col.tasks = col.tasks.filter(t => t.id !== id);
                        col.tasks.forEach(parentTask => {
                            if (parentTask.subtasks) {
                                const originalLength = parentTask.subtasks.length;
                                parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== id);
                                if (parentTask.subtasks.length !== originalLength) {
                                    const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                                    if (parentCardEl) updateCardAppearance(parentCardEl, parentTask, col.mode);
                                }
                            }
                        });
                    }
                });
            }).catch(err => {
                console.error(err);
                refreshBoard();
            });
        })();
        return;
    }

    if (target.closest('[data-action="confirm-cancel"]')) {
        if (activeConfirmResolve) { activeConfirmResolve(false); activeConfirmResolve = null; }
        document.getElementById('confirm-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="confirm-delete"]')) {
        if (activeConfirmResolve) { activeConfirmResolve(true); activeConfirmResolve = null; }
        document.getElementById('confirm-modal').classList.remove('show');
        return;
    }
    
    if (target.closest('[data-action="detach-cancel"]')) {
        if (activeDetachResolve) { activeDetachResolve(null); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="detach-current"]')) {
        if (activeDetachResolve) { activeDetachResolve('current'); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }
    if (target.closest('[data-action="detach-all"]')) {
        if (activeDetachResolve) { activeDetachResolve('all'); activeDetachResolve = null; }
        document.getElementById('detach-modal').classList.remove('show');
        return;
    }

    const bellTrigger = target.closest('#reminders-bell-trigger');
    if (bellTrigger) {
        e.stopPropagation();
        const menu = document.getElementById('reminders-dropdown');
        const isShowing = menu.classList.contains('show');
        closeAllDropdowns();
        if (!isShowing) {
            menu.classList.add('show');
            bellTrigger.classList.add('active');
            renderRemindersDropdown();
        }
        return;
    }

    const settingsTrigger = target.closest('.settings-trigger');
    if (settingsTrigger) {
        const wrapper = settingsTrigger.closest('.settings-wrapper');
        const menu = wrapper.querySelector('.dropdown-menu');
        
        const isShowing = menu.classList.contains('show');
        closeAllDropdowns(); 
        if (!isShowing) { 
            menu.classList.add('show');
            settingsTrigger.classList.add('active');
        }
        return; 
    }

    const cardMenuBtn = target.closest('.card-menu-btn');
    if (cardMenuBtn) {
        e.stopPropagation();
        const globalMenu = document.getElementById('global-card-menu');
        const cardEl = cardMenuBtn.closest('.card');
        
        closeAllDropdowns();

        globalMenu.dataset.activeCardId = cardEl.dataset.cardId;
        globalMenu.classList.add('show');
        cardMenuBtn.classList.add('active');
        cardEl.classList.add('has-open-menu');
        
        const taskId = parseInt(cardEl.dataset.cardId);
        const colId = parseInt(cardEl.closest('.column').dataset.columnId);
        const col = state.columns.find(c => c.id === colId);
        const task = col?.tasks.find(t => t.id === taskId);
        
        if (task && !cardEl.classList.contains('is-renaming')) {
            startCardRename(cardEl, task);
        } else {
            cardEl.querySelector('.card-title-input')?.focus({ preventScroll: true });
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardEl.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest', 
                    inline: 'center' 
                });
            });
        });

        const updatePos = () => {
            if (!globalMenu.classList.contains('show') || globalMenu.dataset.activeCardId != cardEl.dataset.cardId) return;
            const cardRect = cardEl.getBoundingClientRect();

            const margin = 12;
            const menuHeight = globalMenu.offsetHeight;

            let top = cardRect.top;

            const maxTop = window.innerHeight - menuHeight - margin;
            if (top > maxTop) top = maxTop;

            if (top < margin) top = margin;

            globalMenu.style.top = `${top}px`;
            globalMenu.style.left = `${cardRect.right + 12}px`;
            requestAnimationFrame(updatePos);
        };
        updatePos();

        const menuSetDueDate = document.getElementById('menu-set-due-date');
        const menuClearDueDate = document.getElementById('menu-clear-due-date');
        if (task && task.due_date) {
            menuSetDueDate.style.display = 'none';
            menuClearDueDate.style.display = 'flex';
        } else {
            menuSetDueDate.style.display = 'flex';
            menuClearDueDate.style.display = 'none';
        }

        return;
    }

    const menuItem = target.closest('.menu-item');
    const actionElement = target.closest('[data-action]');
    const action = actionElement?.dataset.action;

    if (menuItem && action) {
        const globalCardMenu = document.getElementById('global-card-menu');
        const isCardMenu = menuItem.closest('#global-card-menu');
        const columnEl = menuItem.closest('.column');

        if (isCardMenu) {
            const activeCardId = globalCardMenu.dataset.activeCardId;
            const cardEl = document.querySelector(`.card[data-card-id="${activeCardId}"]`);
            if (cardEl) {
                const taskId = parseInt(activeCardId);
                const colEl = cardEl.closest('.column');

                if (action === 'open-card') {
                    const taskId = parseInt(activeCardId);
                    
                    loadTaskIntoModal(taskId, true); 
                    
                    document.getElementById('task-modal').classList.add('show');
                }
                else if (action === 'delete-card') {
                    animateCardDeletion(cardEl);
                    
                    for (let col of state.columns) {
                        col.tasks = col.tasks.filter(t => t.id !== taskId);
                        
                        col.tasks.forEach(parentTask => {
                            if (parentTask.subtasks) {
                                const originalLength = parentTask.subtasks.length;
                                parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== taskId);
                                
                                if (parentTask.subtasks.length !== originalLength) {
                                    const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                                    if (parentCardEl) {
                                        updateCardAppearance(parentCardEl, parentTask, col.mode);
                                    }
                                    const modal = document.getElementById('task-modal');
                                    if (modal && modal.classList.contains('show') && parseInt(modal.dataset.taskId) === parentTask.id) {
                                        const countEl = document.getElementById('subtasks-count');
                                        if (countEl) countEl.textContent = parentTask.subtasks.length;
                                    }
                                }
                            }
                        });
                    }
                    
                    deleteTask(taskId).then(data => {
                        const deletedIds = data.deleted_ids || [];
                        
                        deletedIds.forEach(id => {
                            if (id === taskId) return;
                            const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                            if (boardCard) {
                                animateCardDeletion(boardCard);
                            }
                            
                            for (let col of state.columns) {
                                col.tasks = col.tasks.filter(t => t.id !== id);
                                
                                col.tasks.forEach(parentTask => {
                                    if (parentTask.subtasks) {
                                        const originalLength = parentTask.subtasks.length;
                                        parentTask.subtasks = parentTask.subtasks.filter(s => s.id !== id);
                                        if (parentTask.subtasks.length !== originalLength) {
                                            const parentCardEl = document.querySelector(`.card[data-card-id="${parentTask.id}"]`);
                                            if (parentCardEl) updateCardAppearance(parentCardEl, parentTask, col.mode);
                                        }
                                    }
                                });
                            }
                        });
                        
                    }).catch(err => { 
                        console.error(err); 
                        refreshBoard();
                    });
                }
                else if (action === 'clear-card-timer') {
                    clearTaskTimerAPI(taskId).then(updatedTask => {
                        const col = state.columns.find(c => c.id === parseInt(colEl.dataset.columnId));
                        if (col) {
                            const idx = col.tasks.findIndex(t => t.id === taskId);
                            if (idx !== -1) {
                                updatedTask.subtasks = col.tasks[idx].subtasks;
                                col.tasks[idx] = updatedTask;
                            }
                        }
                        updateCardAppearance(cardEl, updatedTask, col.mode);
                    });
                }
                else if (action === 'copy-card-link') {
                    const titleNode = cardEl.querySelector('.card-title') || cardEl.querySelector('.card-title-input');
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

                        closeAllDropdowns();
                        return;
                    } catch (err) {
                        console.error("Failed to copy link: ", err);
                    }
                }
                else if (action === 'move-card-menu') {
                    openMoveTaskModal(taskId);
                }
                else if (action === 'export-card') {
                    if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
                        const exportModal = document.getElementById('export-modal');
                        exportModal.dataset.taskId = taskId;
                        exportModal.classList.add('show');
                        
                        const confirmBtn = document.getElementById('btn-confirm-export');
                        const newConfirmBtn = confirmBtn.cloneNode(true);
                        confirmBtn.replaceWith(newConfirmBtn);
                        
                        newConfirmBtn.onclick = async () => {
                            const includeAtt = document.getElementById('export-include-att').checked;
                            exportModal.classList.remove('show');
                            
                            const exportDir = await window.pywebview.api.choose_directory();
                            if (exportDir) {
                                fetch(`${API_BASE}/tasks/${taskId}/export`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ 
                                        export_path: exportDir, 
                                        include_attachments: includeAtt
                                    })
                                }).then(res => {
                                    if (!res.ok) {
                                        window.showToast(t('alerts.error'), 'Ошибка при экспорте', true);
                                    } else {
                                        window.showToast('Экспорт завершён', 'Карточка успешно сохранена');
                                    }
                                }).catch(err => {
                                    console.error(err);
                                    window.showToast(t('alerts.error'), 'Сетевая ошибка при экспорте', true);
                                });
                            }
                        };
                    } else {
                        window.showToast(t('alerts.error'), 'Экспорт работает только в десктопном приложении Doe', true);
                    }
                }
                else if (action === 'notify-card') {
                    const titleNode = cardEl.querySelector('.card-title') || cardEl.querySelector('.card-title-input');
                    const taskTitle = (titleNode.value !== undefined ? titleNode.value : titleNode.textContent).trim();
                    
                    openNotifyModal(taskId, taskTitle);
                }
                else if (action === 'set-due-date') {
                    const task = state.columns.find(c => c.id === parseInt(colEl.dataset.columnId))?.tasks.find(t => t.id === taskId);
                    openDueDateModal(taskId, task?.due_date);
                }
                else if (action === 'clear-due-date') {
                    await handleClearDueDate(taskId);
                }
                else if (action === 'set-priority') {
                    openPriorityModal(taskId);
                }
            }
            closeAllDropdowns();
            return;
        }

        if (columnEl) {
            handleColumnMenu(action, columnEl, menuItem);
            closeAllDropdowns();
            return;
        }
    }

    if (action) {
        if (action === 'switch-workspace') {
            closeAllDropdowns();
            showVaultScreen();
        }
        else if (action === 'theme') {
            const currentTheme = document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light';
            document.querySelectorAll('#theme-list .lang-item').forEach(el => {
                el.classList.toggle('active', el.dataset.themeValue === currentTheme);
            });
            document.getElementById('theme-modal').classList.add('show');
            closeAllDropdowns();
        }
        else if (action === 'change-lang') {
            document.getElementById('lang-modal').classList.add('show');
            closeAllDropdowns();
        }
        else if (action === 'font-settings') {
            fetchSettings().then(data => {
                const uiFontInput = document.getElementById('ui-font-input');
                if (uiFontInput) {
                    uiFontInput.value = data.ui_font ? data.ui_font : `Inter (${t('modals.fontSystemDefault')})`;
                }
                
                const pathDisplay = document.getElementById('font-path-display');
                if (pathDisplay) {
                    if (data.custom_font) {
                        pathDisplay.textContent = data.custom_font.split('/').pop();
                    } else {
                        pathDisplay.textContent = t('modals.fontSelectCustom');
                    }
                }
                
                // Асинхронно сканируем систему на шрифты и кэшируем результат
                fetch(`${API_BASE}/system/fonts/available`).then(res => {
                    if (res.ok) return res.json();
                    return [];
                }).then(fonts => {
                    window.cachedSystemFonts = ["Inter", ...fonts];
                    if (uiFontInput) {
                        renderFontList(uiFontInput.value.trim());
                    }
                }).catch(err => {
                    console.error("Failed to load system fonts:", err);
                });

                document.getElementById('font-settings-modal').classList.add('show');
            }).catch(console.error);
            closeAllDropdowns();
        }
        else if (action === 'attachments-settings') {
            fetchSettings().then(data => {
                const pathBox = document.getElementById('att-path-display');
                const itemLocal = document.getElementById('setting-item-local');
                const itemExternal = document.getElementById('setting-item-external');

                if (data.global_attachments_path) {
                    pathBox.textContent = data.global_attachments_path;
                    itemLocal.classList.remove('active');
                    itemExternal.classList.add('active');
                } else {
                    pathBox.textContent = t('modals.attSelectBtn');
                    itemLocal.classList.add('active');
                    itemExternal.classList.remove('active');
                }
                document.getElementById('att-settings-modal').classList.add('show');
            }).catch(console.error);
            closeAllDropdowns();
        }
        else if (action === 'extensions-settings') {
            fetchSettings().then(data => {
                window.applyExtensionsUI(data.extensions);
                document.getElementById('extensions-modal').classList.add('show');
            }).catch(console.error);
            closeAllDropdowns();
        }
        else if (action === 'priority-settings') {
            fetchSettings().then(data => {
                const ps = data.priority_settings || window.prioritySettings;
                
                // Заполняем поля модалки
                document.getElementById('cfg-prio-show-always').checked = !!ps.show_always;

                document.getElementById('cfg-prio-e-none').value = ps.e_none || "❔";
                document.getElementById('cfg-prio-c-none').value = ps.c_none || "#828A80";
                
                document.getElementById('cfg-prio-t-low').value = ps.t_low;
                document.getElementById('cfg-prio-t-mid').value = ps.t_mid;
                
                document.getElementById('cfg-prio-e-low').value = ps.e_low;
                document.getElementById('cfg-prio-e-mid').value = ps.e_mid;
                document.getElementById('cfg-prio-e-high').value = ps.e_high;
                
                document.getElementById('cfg-prio-c-low').value = ps.c_low;
                document.getElementById('cfg-prio-c-mid').value = ps.c_mid;
                document.getElementById('cfg-prio-c-high').value = ps.c_high;
                
                document.getElementById('priority-settings-modal').classList.add('show');

                // Логика автовосстановления смайлов при потере фокуса (если поле пустое)
                const defEmojis = { low: "😞", mid: "😐", high: "🤩", none: "?" };
                ['low', 'mid', 'high', 'none'].forEach(k => {
                    const inputEl = document.getElementById(`cfg-prio-e-${k}`);
                    if (inputEl) {
                        inputEl.onblur = () => {
                            if (!inputEl.value.trim()) inputEl.value = defEmojis[k];
                        };
                    }
                });

                // Логика кнопки Сбросить
                const resetBtn = document.getElementById('btn-reset-prio-cfg');
                if (resetBtn) {
                    const newResetBtn = resetBtn.cloneNode(true);
                    resetBtn.replaceWith(newResetBtn);
                    newResetBtn.onclick = () => {
                        document.getElementById('cfg-prio-show-always').checked = false;
                        document.getElementById('cfg-prio-t-low').value = 40;
                        document.getElementById('cfg-prio-t-mid').value = 70;
                        document.getElementById('cfg-prio-e-low').value = "😞";
                        document.getElementById('cfg-prio-e-mid').value = "😐";
                        document.getElementById('cfg-prio-e-high').value = "🤩";
                        document.getElementById('cfg-prio-e-none').value = "?";
                        document.getElementById('cfg-prio-c-low').value = "#D35446";
                        document.getElementById('cfg-prio-c-mid').value = "#B3863A";
                        document.getElementById('cfg-prio-c-high').value = "#89A085";
                        document.getElementById('cfg-prio-c-none').value = "#7C5CB7";
                    };
                }
                
                // Логика кнопки Сохранить
                const saveBtn = document.getElementById('btn-save-prio-cfg');
                const newSaveBtn = saveBtn.cloneNode(true);
                saveBtn.replaceWith(newSaveBtn);
                
                newSaveBtn.onclick = async () => {
                    const newPs = {
                        show_always: document.getElementById('cfg-prio-show-always').checked,
                        t_low: parseInt(document.getElementById('cfg-prio-t-low').value) || 40,
                        t_mid: parseInt(document.getElementById('cfg-prio-t-mid').value) || 70,
                        e_low: document.getElementById('cfg-prio-e-low').value || "😞",
                        e_mid: document.getElementById('cfg-prio-e-mid').value || "😐",
                        e_high: document.getElementById('cfg-prio-e-high').value || "🤩",
                        c_low: document.getElementById('cfg-prio-c-low').value || "#D35446",
                        c_mid: document.getElementById('cfg-prio-c-mid').value || "#B3863A",
                        c_high: document.getElementById('cfg-prio-c-high').value || "#89A085",
                        e_none: document.getElementById('cfg-prio-e-none').value || "❔",
                        c_none: document.getElementById('cfg-prio-c-none').value || "#828A80"
                    };
                    
                    try {
                        await fetch(`${API_BASE}/system/settings`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ priority_settings: newPs })
                        });
                        applyPriorityStyles(newPs);
                        document.getElementById('priority-settings-modal').classList.remove('show');
                        refreshBoard(); // Перерендерим доску, чтобы обновились эмодзи и видимость
                    } catch (e) { console.error("Error saving priority settings", e); }
                };
            }).catch(console.error);
            closeAllDropdowns();
        }
        else if (action === 'ai-settings') {
            closeAllDropdowns();
            window.openAiSettingsModal();
        }
        else if (action === 'export-json') {
            closeAllDropdowns();
            
            const jsonModal = document.getElementById('export-json-modal');
            jsonModal.classList.add('show');
            
            const confirmBtn = document.getElementById('btn-confirm-json-export');
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.replaceWith(newConfirmBtn);
            
            newConfirmBtn.onclick = async () => {
                const includeCode = document.getElementById('export-json-include-code').checked;
                jsonModal.classList.remove('show');
                
                if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
                    // Задержка в 50мс гарантирует завершение браузерной анимации скрытия модалки
                    setTimeout(() => {
                        window.pywebview.api.choose_directory().then(async dir => {
                            if (dir) {
                                try {
                                    const res = await fetch(`${API_BASE}/system/export-json`, {
                                        method: 'POST', headers: {'Content-Type': 'application/json'},
                                        body: JSON.stringify({ path: dir, include_codebase: includeCode })
                                    });
                                    if (res.ok) window.showToast(currentLang === 'ru' ? 'Успех' : 'Success', currentLang === 'ru' ? 'Бэкап сохранен в выбранную папку' : 'Backup saved to selected folder');
                                    else window.showToast(t('alerts.error'), currentLang === 'ru' ? 'Не удалось экспортировать данные' : 'Failed to export data', true);
                                } catch(e) { window.showToast(t('alerts.error'), 'Network Error', true); }
                            }
                        });
                    }, 50);
                } else {
                    window.showToast(t('alerts.error'), currentLang === 'ru' ? 'Только для десктопной версии' : 'Only available on Desktop', true);
                }
            };
        }
        else if (action === 'import-json') {
            closeAllDropdowns();
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
                setTimeout(() => {
                    window.pywebview.api.choose_file().then(async file => {
                        if (file) {
                            if (!file.toLowerCase().endsWith('.json')) {
                                window.showToast(t('alerts.error'), currentLang === 'ru' ? 'Выберите файл .json' : 'Please select a .json file', true);
                                return;
                            }
                            try {
                                const res = await fetch(`${API_BASE}/system/import-json`, {
                                    method: 'POST', headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify({ path: file })
                                });
                                if (res.ok) {
                                    const data = await res.json();
                                    window.showToast(currentLang === 'ru' ? 'Импорт' : 'Import', currentLang === 'ru' ? 'Данные успешно импортированы' : 'Data imported successfully');
                                    
                                    if (data.new_workspace_id) {
                                        state.activeWorkspaceId = data.new_workspace_id;
                                        await updateSettings({ active_workspace_id: data.new_workspace_id });
                                    }
                                    await refreshBoard(true, data.new_workspace_id);
                                    
                                } else {
                                    const errData = await res.json().catch(() => ({}));
                                    const errMsg = errData.detail || (currentLang === 'ru' ? 'Неверный формат файла' : 'Invalid file format');
                                    window.showToast(t('alerts.error'), errMsg, true);
                                }
                            } catch(e) { window.showToast(t('alerts.error'), 'Network Error', true); }
                        }
                    });
                }, 50);
            } else {
                window.showToast(t('alerts.error'), currentLang === 'ru' ? 'Только для десктопной версии' : 'Only available on Desktop', true);
            }
        }
        else if (action === 'about') {
            document.getElementById('about-modal').classList.add('show');
            closeAllDropdowns();
        }
    }

    const themeItem = target.closest('#theme-list .lang-item');
    if (themeItem) {
        const theme = themeItem.dataset.themeValue;
        
        document.getElementById('theme-modal').classList.remove('show');
        
        setTimeout(() => {
            applyTheme(theme, true);
        }, 250);
        
        return;
    }

    const langItem = target.closest('#lang-list .lang-item');
    if (langItem) {
        const lang = langItem.dataset.value;
        applyLanguage(lang, true);
        setTimeout(() => document.getElementById('lang-modal').classList.remove('show'), 150);
        return;
    }

    const modalCloseBtn = target.closest('.modal-close');
    const isOverlayClick = target.classList.contains('modal-overlay');

    if (modalCloseBtn || isOverlayClick) {
        const modalToClose = modalCloseBtn ? modalCloseBtn.closest('.modal-overlay') : target;
        
        if (!modalToClose) return;

        // Запрещаем закрывать по клику на фон все модалки с формами ввода
        const nonDismissibleModals = ['task-modal', 'font-settings-modal', 'due-date-modal', 'notify-modal', 'priority-modal', 'priority-settings-modal', 'move-modal'];
        if (nonDismissibleModals.includes(modalToClose.id) && isOverlayClick) {
            return; 
        }

        if (activeConfirmResolve && modalToClose.id === 'confirm-modal') {
            activeConfirmResolve(false);
            activeConfirmResolve = null;
        }
        if (activeDetachResolve && modalToClose.id === 'detach-modal') {
            activeDetachResolve(null);
            activeDetachResolve = null;
        }
        
        if (modalToClose.id === 'task-modal') {
            if (window.closeLocalSearch) window.closeLocalSearch();
            
            document.getElementById('modal-tools-wrapper')?.classList.remove('expanded');
            triggerGarbageCollector();

            const taskId = parseInt(modalToClose.dataset.taskId);
            const renderDiv = document.getElementById('task-desc-render');
            const detailBody = document.querySelector('.task-detail-body');
            for (let col of state.columns) {
                let t = col.tasks.find(t => t.id === taskId);
                if (t) {
                    if (renderDiv.style.display !== 'none') {
                        t._readScrollTop = renderDiv.scrollTop;
                        if (detailBody) t._modalScrollTop = detailBody.scrollTop;
                    }
                    break;
                }
            }
            
            const card = modalToClose.querySelector('.task-detail-card');
            const maximizeBtn = modalToClose.querySelector('.modal-maximize');
            
            if (card) {
                if(maximizeBtn) {
                    maximizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 6 18 6 18 10"></polyline><polyline points="10 18 6 18 6 14"></polyline><line x1="18" y1="6" x2="13" y2="11"></line><line x1="6" y1="18" x2="11" y2="13"></line></svg>`;
                }

                setTimeout(() => {
                    card.classList.remove('maximized', 'is-restoring');
                    card.style.transition = 'none';
                    card.style.position = '';
                    card.style.left = '';
                    card.style.top = '';
                    card.style.width = '';
                    card.style.height = '';
                    card.style.transform = '';
                    card.style.margin = '';
                    
                    void card.offsetWidth; 
                    card.style.transition = '';

                    if (renderDiv) renderDiv.innerHTML = '';
                    
                    const subtasksList = document.getElementById('subtasks-list');
                    if (subtasksList) subtasksList.innerHTML = '';
                    
                    const attachmentsList = document.getElementById('attachments-list');
                    if (attachmentsList) attachmentsList.innerHTML = '';
                    
                    const breadcrumbs = document.getElementById('task-breadcrumbs');
                    if (breadcrumbs) breadcrumbs.innerHTML = '';
                }, 300);
            }
        }

        // Если пользователь просто закрыл чат с ИИ (на крестик или по фону) - фиксируем дату
        if (modalToClose.id === 'ai-journal-modal') {
            localStorage.setItem('doe-ai-last-check', new Date().toDateString());
        }

        modalToClose.classList.remove('show');
    }

    const toolsTrigger = target.closest('.modal-tools-trigger');
    const toolsWrapper = document.getElementById('modal-tools-wrapper');
    if (toolsTrigger) {
        e.stopPropagation();
        toolsWrapper.classList.toggle('expanded');
        return;
    }
    if (toolsWrapper && toolsWrapper.classList.contains('expanded') && !target.closest('.modal-tools-wrapper')) {
        toolsWrapper.classList.remove('expanded');
    }

    if (
        !target.closest('.dropdown-menu') && 
        !target.closest('.menu-btn') && 
        !target.closest('.card-menu-btn') &&
        !target.closest('.card.has-open-menu') &&
        !target.closest('#ui-font-wrapper') // Игнорируем клики внутри контейнера поиска шрифтов
    ) {
        closeAllDropdowns();
    }
});

function applyHighlight(container, query) {
    if (!query || !CSS.highlights) return;
    const words = query.trim().split(/\s+/).filter(w => w.length > 0).map(w => w.toLowerCase());
    if (words.length === 0) return;

    const fullText = container.textContent.toLowerCase();
    if (!words.some(w => fullText.includes(w))) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const ranges = [];
    let node;

    while ((node = walker.nextNode())) {
        const nodeText = node.nodeValue.toLowerCase();
        if (!nodeText.trim()) continue;

        for (const word of words) {
            if (!nodeText.includes(word)) continue;
            let pos = 0;
            while ((pos = nodeText.indexOf(word, pos)) !== -1) {
                const range = new Range();
                range.setStart(node, pos);
                range.setEnd(node, pos + word.length);
                ranges.push(range);
                pos += word.length;
            }
        }
        if (ranges.length > 5000) break;
    }

    if (ranges.length === 0) return;

    const highlight = new Highlight(...ranges);
    CSS.highlights.set('global-search-highlight', highlight);

    setTimeout(() => {
        const firstMatch = ranges[0];
        let block = firstMatch.startContainer.parentElement;
        
        while (block && block !== container) {
            if (block.classList.contains('is-hidden-by-fold')) {
                let prev = block.previousElementSibling;
                while (prev) {
                    if (prev.classList.contains('foldable-heading') && prev.classList.contains('is-folded')) {
                        prev.click();
                    }
                    prev = prev.previousElementSibling;
                }
            }
            block = block.parentElement;
        }

        const rect = firstMatch.getBoundingClientRect();
        if (rect.top === 0) return; 

        const scrollParent = document.querySelector('.task-detail-body');
        if (scrollParent) {
            const parentRect = scrollParent.getBoundingClientRect();
            const relativeTop = rect.top - parentRect.top + scrollParent.scrollTop;
            scrollParent.scrollTo({
                top: relativeTop - (parentRect.height / 2),
                behavior: 'smooth'
            });
        }

        setTimeout(() => {
            if (CSS.highlights.has('global-search-highlight')) {
                CSS.highlights.delete('global-search-highlight');
            }
        }, 2500);

    }, 50);
}

async function loadTaskIntoModal(taskId, pushToStack = true, highlightQuery = null) {
    try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (!res.ok) return;
        const task = await res.json();

        let localTask = null;
        for (let col of state.columns) {
            localTask = col.tasks.find(t => t.id === taskId);
            if (!localTask) {
                for (let pt of col.tasks) {
                    if (pt.subtasks) {
                        localTask = pt.subtasks.find(s => s.id === taskId);
                        if (localTask) break;
                    }
                }
            }
            if (localTask) break;
        }

        const modal = document.getElementById('task-modal');
        const titleEl = document.getElementById('task-modal-title');
        const renderDiv = document.getElementById('task-desc-render');
        const inputArea = document.getElementById('task-desc-input');
        const subtasksList = document.getElementById('subtasks-list');
        const subtasksCount = document.getElementById('subtasks-count');
        const formContainer = document.getElementById('subtask-form-container');

        const descWrapper = document.querySelector('.description-wrapper');
        if (descWrapper) descWrapper.style.height = '';

        const bodyEl = document.querySelector('.task-detail-body');
        if (bodyEl) bodyEl.scrollTop = 0;
        if (renderDiv) renderDiv.scrollTop = 0;
        if (inputArea) inputArea.scrollTop = 0;

        renderGraphBreadcrumbs(task.id);

        modal.dataset.taskId = task.id;
        modal.dataset.columnId = task.column_id;
        titleEl.innerHTML = renderInlineMarkdown(task.title);
        titleEl.dataset.rawTitle = task.title;
        
        const detachBtn = modal.querySelector('.modal-detach');
        if (detachBtn) {
            detachBtn.style.display = (task.parent_ids && task.parent_ids.length > 0) ? 'flex' : 'none';
            detachBtn.title = t('detachSubtask');
        }

        const completeSubtaskBtn = modal.querySelector('.modal-complete-subtask');
        if (completeSubtaskBtn) {
            // Кнопка появляется только если есть родители И карточка скрыта с доски
            if (task.parent_ids && task.parent_ids.length > 0 && !task.is_visible_on_board) {
                completeSubtaskBtn.style.display = 'flex';
                if (task.completed_at) {
                    completeSubtaskBtn.title = t('modals.uncompleteSubtask');
                    completeSubtaskBtn.style.color = 'var(--success-done)';
                } else {
                    completeSubtaskBtn.title = t('modals.completeSubtask');
                    completeSubtaskBtn.style.color = '';
                }
            } else {
                completeSubtaskBtn.style.display = 'none';
            }
        }

        const datesMetaEl = document.getElementById('task-dates-meta');
        if (datesMetaEl) {
            const createdStr = formatDateTime(task.created_at);
            const updatedStr = formatDateTime(task.updated_at);
            
            let datesHtml = `<div><span>${t('taskModal.created')}: ${createdStr}</span><span id="task-updated-text">${t('taskModal.updated')}: ${updatedStr}</span>`;
            
            if (task.due_date) {
                const dateStr = task.due_date + (task.due_date.endsWith('Z') || task.due_date.includes('+') ? '' : 'Z');
                const isOverdue = !task.completed_at && new Date(dateStr) < new Date();
                const overdueStyle = isOverdue ? 'style="color: #D35446; font-weight: 700;"' : '';
                
                datesHtml += `<span> &middot; </span><span ${overdueStyle} id="task-due-text">Срок: ${formatShortDate(task.due_date)}</span>`;
            }
            datesHtml += `</div>`;
            datesMetaEl.innerHTML = datesHtml;
        }
        
        const modalDueDateBtn = document.getElementById('modal-due-date');
        if (modalDueDateBtn) {
            const newBtn = modalDueDateBtn.cloneNode(true);
            modalDueDateBtn.replaceWith(newBtn);

            newBtn.innerHTML = '';

            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("fill", "none");
            svg.setAttribute("stroke", "currentColor");
            svg.setAttribute("stroke-width", "2");
            svg.setAttribute("stroke-linecap", "round");
            svg.setAttribute("stroke-linejoin", "round");

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M12 22c-4.42 0-8-3.58-8-8 0-3.1 1.76-5.8 4.36-7.14.33-.17.7-.06.88.24.41.69 1.05 1.34 1.7 1.15.65-.19.96-1.55 1.4-3.13C12.8 3.42 13.5 2 14.5 2c.28 0 .54.12.72.32 1.41 1.6 3.1 3.96 4.13 6.08C20.44 10.64 20 12.3 20 14c0 4.42-3.58 8-8 8z");
            svg.appendChild(path);

            if (task.due_date) {
                newBtn.title = t('menu.clearDueDate');
                
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", "21");
                line.setAttribute("y1", "3");
                line.setAttribute("x2", "3");
                line.setAttribute("y2", "21");
                svg.appendChild(line);

                newBtn.onclick = (e) => {
                    e.stopPropagation();
                    handleClearDueDate(task.id);
                };
            } else {
                newBtn.title = t('modals.dueDateSet');
                
                newBtn.onclick = (e) => {
                    e.stopPropagation();
                    openDueDateModal(task.id, task.due_date);
                };
            }

            newBtn.appendChild(svg);
        }

        inputArea.value = task.description || "";
        if (typeof cmEditor !== 'undefined' && cmEditor) {
            cmEditor.setValue(task.description || "");
            cmEditor.getWrapperElement().style.display = 'none';
        }
        
        const attachmentsList = document.getElementById('attachments-list');
        const attachmentsCount = document.getElementById('attachments-count');
        
        if (task.description) {
            let extracted = extractAttachments(task.description, task.attachments_order || []);
            extracted = await enrichAttachments(extracted);
            
            attachmentsCount.textContent = extracted.length;
            attachmentsList.innerHTML = '';
            extracted.forEach(att => attachmentsList.appendChild(createAttachmentElement(att)));

            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
            let readModeText = task.description.replace(cleanRegex, '');
            
            const applyScroll = () => {
                if (localTask && localTask._readScrollTop !== undefined) {
                    renderDiv.scrollTop = localTask._readScrollTop;
                } else {
                    renderDiv.scrollTop = 0;
                }
                if (localTask && localTask._modalScrollTop !== undefined) {
                    const detailBody = document.querySelector('.task-detail-body');
                    if (detailBody) detailBody.scrollTop = localTask._modalScrollTop;
                }
            };

            renderMarkdownProgressively(readModeText, renderDiv, {
                preserveScroll: (localTask && localTask._readScrollTop !== undefined),
                onFirstScreen: () => {
                    applyScroll();
                },
                onComplete: () => {
                    if (highlightQuery) {
                        applyHighlight(renderDiv, highlightQuery);
                        applyHighlight(titleEl, highlightQuery);
                    }
                    initHeadingFolding(renderDiv, task.folded_headings || []);
                    applyTextExpansion();
                    applyScroll();
                }
            });

        } else {
            attachmentsCount.textContent = '0';
            attachmentsList.innerHTML = '';
            renderDiv.innerHTML = `<span class="markdown-empty">${t('taskModal.descPlaceholder')}</span>`;
            if (highlightQuery) applyHighlight(titleEl, highlightQuery);
        }
        
        renderDiv.style.display = 'block';

        subtasksList.innerHTML = '';
        subtasksCount.textContent = task.subtasks.length;
        
        const parentColumn = state.columns.find(c => c.id === task.column_id);
        const parentMode = parentColumn ? parentColumn.mode : 'default';
        
        task.subtasks.sort((a, b) => a.position - b.position).forEach(sub => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generateSubtaskHtml(sub, parentMode).trim();
            const subItem = tempDiv.firstChild;
            
            bindSubtaskEvents(subItem, sub, task, parentMode);
            
            subtasksList.appendChild(subItem);
        });

        renderSubtaskAddButton(formContainer);

        const modalTimeTracker = document.getElementById('modal-time-tracker');
        const modalTimerPill = document.getElementById('modal-task-timer');
        const modalTimerInput = document.getElementById('modal-task-timer-input');
        
        modalTimeTracker.style.display = 'flex';
        
        modalTimerPill.dataset.taskId = task.id;
        
        const exactTime = task.active_timer ? formatTime(task) : formatExactTime(task.total_time_spent || 0);
        modalTimerPill.textContent = exactTime;

        const newPill = modalTimerPill.cloneNode(true);
        const newInput = modalTimerInput.cloneNode(true);
        modalTimerPill.replaceWith(newPill);
        modalTimerInput.replaceWith(newInput);

        let timerCommitted = false;

        newPill.addEventListener('click', (e) => {
            e.stopPropagation();
            timerCommitted = false;
            newPill.style.display = 'none';
            newInput.style.display = 'block';
            newInput.value = newPill.textContent;
            newInput.focus();
            newInput.select();
        });

        const commitTimer = async () => {
            if (timerCommitted) return;
            timerCommitted = true;
            
            const seconds = parseTimeToSeconds(newInput.value);
            
            if (seconds === null) {
                newInput.style.display = 'none';
                newPill.style.display = 'block';
                return;
            }

            newInput.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/tasks/${task.id}/set-time`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ total_seconds: seconds })
                });

                if (res.ok) {
                    const updatedTask = await res.json();
                    const col = state.columns.find(c => c.id === updatedTask.column_id);
                    if (col) {
                        const idx = col.tasks.findIndex(t => t.id === updatedTask.id);
                        if (idx !== -1) {
                            updatedTask.subtasks = col.tasks[idx].subtasks;
                            col.tasks[idx] = updatedTask;
                        }
                    }
                    
                    const displayTime = updatedTask.active_timer ? formatTime(updatedTask) : formatExactTime(updatedTask.total_time_spent || 0);
                    newPill.textContent = displayTime;
                    
                    const boardCard = document.querySelector(`.card[data-card-id="${task.id}"]`);
                    if (boardCard) {
                        updateCardAppearance(boardCard, updatedTask, col.mode);
                    }
                    
                    if (col && window.syncColumnDOM) {
                        await window.syncColumnDOM(col.id);
                    } else {
                        refreshBoard();
                    }
                }
            } catch (err) {
                console.error("Ошибка сохранения времени:", err);
            } finally {
                newInput.disabled = false;
                newInput.style.display = 'none';
                newPill.style.display = 'block';
            }
        };

        newInput.addEventListener('mousedown', (e) => e.stopPropagation());
        newInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitTimer();
            if (e.key === 'Escape') {
                timerCommitted = true;
                newInput.style.display = 'none';
                newPill.style.display = 'block';
            }
        });
        newInput.addEventListener('blur', commitTimer);

    } catch (err) {
        console.error("Ошибка загрузки карточки:", err);
    }
}

async function renderGraphBreadcrumbs(taskId) {
    const container = document.getElementById('task-breadcrumbs');
    container.innerHTML = '';
    
    try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/paths`);
        if (!res.ok) return;
        const paths = await res.json();
        
        if (paths.length === 0 || (paths.length === 1 && paths[0].length === 1)) {
            return;
        }

        let html = '<div class="task-graph-breadcrumbs">';
        paths.forEach(path => {
            html += '<div class="breadcrumb-path">';
            path.forEach((node, index) => {
                const isLast = index === path.length - 1;
                
                const rawTitle = node.title || "";
                // Многострочные: берём только первую строку
                const firstLine = rawTitle.includes('\n') ? rawTitle.split('\n')[0] : rawTitle;
                const isMultiLine = rawTitle.includes('\n');
                // Обрезаем по длине и/или по строкам
                let displayTitle = firstLine;
                if (firstLine.length > 15) {
                    displayTitle = firstLine.substring(0, 14) + '…';
                } else if (isMultiLine) {
                    displayTitle = firstLine + '…';
                }

                html += `<div class="breadcrumb-node">`;
                
                html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" 
                               data-id="${node.id}" 
                               data-full-title="${escapeHtml(rawTitle)}">${renderInlineMarkdown(displayTitle)}</span>`;
                
                if (!isLast) {
                    html += '<span class="breadcrumb-separator"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></span>';
                }
                
                html += `</div>`;
            });
            html += '</div>';
        });
        html += '</div>';
        
        container.innerHTML = html;

        container.querySelectorAll('.breadcrumb-item:not(.active)').forEach(el => {
            el.onclick = () => {
                const id = parseInt(el.dataset.id);
                fetch(`${API_BASE}/tasks/${id}/context`)
                    .then(res => res.json())
                    .then(context => {
                        window.navigateToEntityGlobal(context.workspace_id, context.column_id, id, null, true);
                    })
                    .catch(err => {
                        console.error("Не удалось найти контекст задачи", err);
                        loadTaskIntoModal(id, true);
                    });
            };
        });
    } catch (e) {
        console.error("Failed to render graph breadcrumbs", e);
    }
}

const _visibleTimerEls = new Set();
let _timerIO = null;

function _buildTaskIndex() {
    const map = new Map();
    for (const col of state.columns) {
        for (const t of col.tasks) map.set(String(t.id), t);
    }
    return map;
}

function _refreshTimerEl(el, index) {
    const task = index.get(String(el.dataset.taskId));
    if (task?.active_timer) {
        const newText = formatTime(task);
        if (el.textContent !== newText) el.textContent = newText;
    }
}

function _collectTimerEls(node, out) {
    if (node.nodeType !== 1) return;
    if (node.classList && node.classList.contains('card-timer')) out.push(node);
    if (node.querySelectorAll) {
        node.querySelectorAll('.card-timer').forEach(t => out.push(t));
    }
}

function initTimerCulling() {
    if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
    const board = document.getElementById('board');
    if (!board) return;

    _timerIO = new IntersectionObserver((entries) => {
        let index = null;
        for (const en of entries) {
            if (en.isIntersecting) {
                _visibleTimerEls.add(en.target);
                if (!index) index = _buildTaskIndex();
                _refreshTimerEl(en.target, index);
            } else {
                _visibleTimerEls.delete(en.target);
            }
        }
    }, { root: null, rootMargin: '256px' });

    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                const added = [];
                _collectTimerEls(n, added);
                for (const t of added) _timerIO.observe(t);
            }
            for (const n of m.removedNodes) {
                const removed = [];
                _collectTimerEls(n, removed);
                for (const t of removed) {
                    _timerIO.unobserve(t);
                    _visibleTimerEls.delete(t);
                }
            }
        }
    });
    mo.observe(board, { childList: true, subtree: true });

    board.querySelectorAll('.card-timer').forEach(t => _timerIO.observe(t));
}

function updateTimers() {
    if (document.hidden) return;

    const modalTimerPill = document.getElementById('modal-task-timer');
    const modalActive = !!(modalTimerPill && modalTimerPill.dataset.taskId && modalTimerPill.style.display !== 'none');
    const dragActive = !!(isDragging && dragType === 'card' && draggedTaskObject?.active_timer);

    if (_timerIO && _visibleTimerEls.size === 0 && !modalActive && !dragActive) return;

    let _taskIndex = null;
    const _getTask = (id) => {
        if (!_taskIndex) _taskIndex = _buildTaskIndex();
        return _taskIndex.get(String(id));
    };

    if (_timerIO) {
        for (const el of _visibleTimerEls) {
            if (!el.isConnected) { _visibleTimerEls.delete(el); continue; }
            const task = _getTask(el.dataset.taskId);
            if (task?.active_timer) {
                const newText = formatTime(task);
                if (el.textContent !== newText) el.textContent = newText;
            }
        }
    } else {
        document.querySelectorAll('.card-timer').forEach(el => {
            if (el.closest('.card-drag-clone')) return;
            const task = _getTask(el.dataset.taskId);
            if (task?.active_timer) {
                const newText = formatTime(task);
                if (el.textContent !== newText) el.textContent = newText;
            }
        });
    }

    if (dragActive) {
        const newTime = formatTime(draggedTaskObject);
        
        if (dragClone) {
            const timerEl = dragClone.querySelector('.card-timer');
            if (timerEl) timerEl.textContent = newTime;
        }
        if (draggedElement) {
            const timerEl = draggedElement.querySelector('.card-timer');
            if (timerEl) timerEl.textContent = newTime;
        }
    }

    if (modalActive) {
        const taskId = modalTimerPill.dataset.taskId;
        
        let task = _getTask(taskId) || null;
        
        if (!task && draggedTaskObject && draggedTaskObject.id == taskId) {
            task = draggedTaskObject;
        }

        if (task && task.active_timer) {
            const newText = formatTime(task);
            if (modalTimerPill.textContent !== newText) modalTimerPill.textContent = newText;
        }
    }
}

function updateColumnCount(columnEl, count = null) {
    const pill = columnEl.querySelector('.meta-pill .card-count');
    if (pill) {
        const tasks = columnEl.querySelectorAll('.card').length;
        pill.textContent = count !== null ? count : tasks;
    }
}

function animateCardDeletion(boardCard) {
    if (!boardCard || !boardCard.parentNode) return;
    
    const rect = boardCard.getBoundingClientRect();
    
    const clone = boardCard.cloneNode(true);
    clone.classList.add('card-deleting-clone');
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.removeAttribute('id');
    clone.removeAttribute('data-card-id');
    document.body.appendChild(clone);
    
    const spacer = document.createElement('div');
    spacer.className = 'card-spacer';
    spacer.style.height = `${rect.height}px`;
    
    const parentCol = boardCard.closest('.column');
    boardCard.replaceWith(spacer);
    
    if (parentCol) {
        updateColumnCount(parentCol, parentCol.querySelectorAll('.card:not(.card-drag-clone)').length);
    }
    
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

function clampSingleTitle(titleEl) {
    if (!titleEl) return;
    
    const MAX_ALLOWED_HEIGHT = window.innerHeight * 0.25; 

    const fullTitle = titleEl.dataset.fullTitle || titleEl.textContent;

    titleEl.style.webkitLineClamp = 'unset';
    titleEl.style.maxHeight = 'none';

    const computedStyle = window.getComputedStyle(titleEl);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 21.75;

    if (titleEl.scrollHeight > MAX_ALLOWED_HEIGHT) {
        const maxLines = Math.max(2, Math.floor((MAX_ALLOWED_HEIGHT - 2) / lineHeight));

        titleEl.style.webkitLineClamp = String(maxLines);
        
        titleEl.style.maxHeight = (maxLines * lineHeight) + "px";

        titleEl.dataset.fullTitle = fullTitle;
        titleEl.dataset.clamped = 'true';
    } else {
        titleEl.style.webkitLineClamp = 'unset';
        titleEl.style.maxHeight = 'none';
        titleEl.dataset.clamped = 'false';
    }
}

function clampExpandedTitles() {
    document.querySelectorAll('.column:not(.collapsed) .column-title').forEach(clampSingleTitle);
}

function initTabsScrollbar() {
    const wrapper = document.getElementById('tabs-wrapper');
    const container = document.getElementById('tabs-container');
    const scrollbar = document.getElementById('tabs-scrollbar');
    const thumb = document.getElementById('tabs-thumb');
    
    if (!wrapper || !container || !scrollbar || !thumb) return;

    let hideTimeout;
    let isDraggingThumb = false;
    let startX = 0;
    let startScrollLeft = 0;

    function updateThumb() {
        const scrollRatio = container.clientWidth / container.scrollWidth;
        if (scrollRatio >= 1) {
            scrollbar.classList.remove('visible');
            return;
        }
        
        const thumbWidth = Math.max(container.clientWidth * scrollRatio, 40);
        thumb.style.width = `${thumbWidth}px`;
        
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        let scrollPercent = container.scrollLeft / maxScrollLeft;
        
        scrollPercent = Math.max(0, Math.min(1, scrollPercent));
        
        const maxThumbLeft = container.clientWidth - thumbWidth;
        
        thumb.style.transform = `translateX(${scrollPercent * maxThumbLeft}px)`;
    }

    function showScrollbar() {
        const scrollRatio = container.clientWidth / container.scrollWidth;
        if (scrollRatio < 1) {
            scrollbar.classList.add('visible');
        }
        
        clearTimeout(hideTimeout);
        if (!wrapper.matches(':hover') && !isDraggingThumb) {
            hideTimeout = setTimeout(() => {
                scrollbar.classList.remove('visible');
            }, 800);
        }
    }

    container.addEventListener('scroll', () => {
        updateThumb();
        showScrollbar();
        
        if (container.scrollLeft > 2) {
            container.classList.add('is-scrolled');
        } else {
            container.classList.remove('is-scrolled');
        }
    });

    wrapper.addEventListener('mouseenter', showScrollbar);
    wrapper.addEventListener('mouseleave', () => {
        if (!isDraggingThumb) {
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                scrollbar.classList.remove('visible');
            }, 400);
        }
    });

    window.addEventListener('resize', updateThumb);
    window.updateTabsScrollbar = updateThumb;

    thumb.addEventListener('mousedown', (e) => {
        isDraggingThumb = true;
        startX = e.clientX;
        startScrollLeft = container.scrollLeft;
        thumb.classList.add('is-dragging');
        document.body.style.userSelect = 'none';
        e.preventDefault();
        e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDraggingThumb) return;
        const deltaX = e.clientX - startX;
        
        const scrollRatio = container.clientWidth / container.scrollWidth;
        const thumbWidth = Math.max(container.clientWidth * scrollRatio, 40);
        const maxThumbLeft = container.clientWidth - thumbWidth;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        
        if (maxThumbLeft > 0) {
            const scrollPerPixel = maxScrollLeft / maxThumbLeft;
            container.scrollLeft = startScrollLeft + deltaX * scrollPerPixel;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingThumb) {
            isDraggingThumb = false;
            thumb.classList.remove('is-dragging');
            document.body.style.userSelect = '';
            
            if (!wrapper.matches(':hover')) {
                hideTimeout = setTimeout(() => {
                    scrollbar.classList.remove('visible');
                }, 1200);
            }
        }
    });
}

function initBoardScrollbar() {
    const wrapper = document.getElementById('board-wrapper');
    const container = document.querySelector('.board-container');
    const scrollbar = document.getElementById('board-scrollbar');
    const thumb = document.getElementById('board-thumb');
    const board = document.getElementById('board');

    if (!wrapper || !container || !scrollbar || !thumb) return;

    let hideTimeout;
    let isDraggingThumb = false;
    let startX = 0;
    let startScrollLeft = 0;

    function updateThumb() {
        const scrollRatio = container.clientWidth / container.scrollWidth;
        if (scrollRatio >= 1) {
            scrollbar.classList.remove('visible');
            return;
        }

        const trackWidth = scrollbar.clientWidth;
        const thumbWidth = Math.max(trackWidth * scrollRatio, 40);
        thumb.style.width = `${thumbWidth}px`;

        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        let scrollPercent = container.scrollLeft / maxScrollLeft;

        scrollPercent = Math.max(0, Math.min(1, scrollPercent));

        const maxThumbLeft = trackWidth - thumbWidth;
        thumb.style.transform = `translateX(${scrollPercent * maxThumbLeft}px)`;
    }

    function showScrollbar() {
        const scrollRatio = container.clientWidth / container.scrollWidth;
        if (scrollRatio < 1) {
            scrollbar.classList.add('visible');
        }

        clearTimeout(hideTimeout);
        if (!wrapper.matches(':hover') && !isDraggingThumb) {
            hideTimeout = setTimeout(() => {
                scrollbar.classList.remove('visible');
            }, 800);
        }
    }

    container.addEventListener('scroll', () => {
        updateThumb();
        showScrollbar();
    });

    wrapper.addEventListener('mouseenter', showScrollbar);
    wrapper.addEventListener('mouseleave', () => {
        if (!isDraggingThumb) {
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                scrollbar.classList.remove('visible');
            }, 400);
        }
    });

    window.addEventListener('resize', updateThumb);
    window.updateBoardScrollbar = updateThumb;

    if (board && window.ResizeObserver) {
        const ro = new ResizeObserver(() => updateThumb());
        ro.observe(board);
    }

    thumb.addEventListener('mousedown', (e) => {
        isDraggingThumb = true;
        startX = e.clientX;
        startScrollLeft = container.scrollLeft;
        thumb.classList.add('is-dragging');
        document.body.style.userSelect = 'none';
        e.preventDefault();
        e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDraggingThumb) return;
        const deltaX = e.clientX - startX;

        const trackWidth = scrollbar.clientWidth;
        const scrollRatio = container.clientWidth / container.scrollWidth;
        const thumbWidth = Math.max(trackWidth * scrollRatio, 40);
        const maxThumbLeft = trackWidth - thumbWidth;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;

        if (maxThumbLeft > 0) {
            const scrollPerPixel = maxScrollLeft / maxThumbLeft;
            container.scrollLeft = startScrollLeft + deltaX * scrollPerPixel;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingThumb) {
            isDraggingThumb = false;
            thumb.classList.remove('is-dragging');
            document.body.style.userSelect = '';

            if (!wrapper.matches(':hover')) {
                hideTimeout = setTimeout(() => {
                    scrollbar.classList.remove('visible');
                }, 1200);
            }
        }
    });
}

function initTooltip() {
    const tooltip = document.createElement('div');
    tooltip.id = 'tooltip';
    tooltip.className = 'custom-tooltip';
    
    const tooltipInner = document.createElement('div');
    tooltipInner.className = 'tooltip-inner';
    tooltip.appendChild(tooltipInner);
    
    document.body.appendChild(tooltip);

    let activeTitle = null;

    function updateTooltipPosition(e) {
        if (!activeTitle) return;

        const tooltipRect = tooltip.getBoundingClientRect();
        
        let left = e.clientX + 14; 
        let top = e.clientY + 14;

        if (left + tooltipRect.width > window.innerWidth - 8) {
            left = e.clientX - tooltipRect.width - 14;
        }
        if (left < 8) left = 8;

        const fitsBelow = (e.clientY + 14 + tooltipRect.height) <= (window.innerHeight - 8);
        const fitsAbove = (e.clientY - 14 - tooltipRect.height) >= 8;

        if (!fitsBelow && fitsAbove) {
            top = e.clientY - tooltipRect.height - 14;
        } else if (!fitsBelow && !fitsAbove) {
            top = 8;
        }
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    document.addEventListener('mouseover', (e) => {
        if (typeof isDragging !== 'undefined' && isDragging) return;

        // Добавили .cal-event-chip, .cal-ev-title, .cal-ev-time
        const titleEl = e.target.closest('.column-title, .tab-name, .breadcrumb-item, .vault-name-text, .vault-history-name, .cal-event-chip, .cal-ev-title, .cal-ev-time');
        if (!titleEl) return;

        let isActuallyClamped = false;
        
        if (titleEl.classList.contains('tab-name') || 
            titleEl.classList.contains('breadcrumb-item') || 
            titleEl.classList.contains('vault-name-text') ||
            titleEl.classList.contains('vault-history-name') ||
            titleEl.classList.contains('cal-event-chip') ||
            titleEl.classList.contains('cal-ev-title') ||
            titleEl.classList.contains('cal-ev-time')) {
            
            isActuallyClamped = titleEl.textContent.trim().endsWith('…') || titleEl.scrollWidth > titleEl.clientWidth;
        } else if (titleEl.closest('.column.collapsed')) {
            isActuallyClamped = titleEl.dataset.clamped === 'true';
        } else {
            isActuallyClamped = titleEl.scrollHeight > (titleEl.clientHeight + 2);
        }

        if (!isActuallyClamped) return;

        activeTitle = titleEl;
        
        tooltipInner.style.maxHeight = 'none';
        tooltipInner.innerHTML = renderInlineMarkdown(titleEl.dataset.fullTitle || titleEl.textContent);
        
        const paddingY = 16; 
        const safeMarginY = 32; 
        const maxAvailableHeight = window.innerHeight - paddingY - safeMarginY;
        
        const computedStyle = window.getComputedStyle(tooltipInner);
        const lineHeight = parseFloat(computedStyle.lineHeight) || 19.5;
        
        const maxLines = Math.max(1, Math.floor(maxAvailableHeight / lineHeight));
        
        tooltipInner.style.maxHeight = (maxLines * lineHeight) + 'px';

        tooltip.classList.add('visible');
        updateTooltipPosition(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (activeTitle) {
            if (!document.body.contains(activeTitle)) {
                activeTitle = null;
                tooltip.classList.remove('visible');
                return;
            }
            updateTooltipPosition(e);
        }
    });

    document.addEventListener('mouseout', (e) => {
        // Добавили .cal-event-chip, .cal-ev-title, .cal-ev-time
        const titleEl = e.target.closest('.column-title, .tab-name, .breadcrumb-item, .vault-name-text, .vault-history-name, .cal-event-chip, .cal-ev-title, .cal-ev-time');
        if (titleEl && titleEl === activeTitle) {
            activeTitle = null;
            tooltip.classList.remove('visible');
        }
    });

    const hideTooltip = () => {
        if (activeTitle) {
            activeTitle = null;
            tooltip.classList.remove('visible');
        }
    };
    
    document.addEventListener('mousedown', hideTooltip);
    
    document.addEventListener('wheel', hideTooltip, { passive: true });
}

let isRevealed = false;
const triggerReveal = () => {
    if (isRevealed) return;
    if (window.pywebview && window.pywebview.api) {
        isRevealed = true;
        document.body.classList.remove('preload');
        try {
            const call = window.pywebview.api.reveal_window();
            if (call && call.catch) call.catch(() => {});
        } catch (e) {}
    }
};

window.addEventListener('pywebviewready', triggerReveal);

const checkApi = () => {
    if (isRevealed) return;
    if (window.pywebview && window.pywebview.api) {
        triggerReveal();
    } else {
        setTimeout(checkApi, 50);
    }
};

function initHeadingFolding(container, foldedHeadings = []) {
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
        if (heading.querySelector('.heading-fold-arrow')) return;

        const arrow = document.createElement('span');
        arrow.className = 'heading-fold-arrow';
        arrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        
        heading.prepend(arrow);
        heading.classList.add('foldable-heading');

        const headingText = heading.textContent.replace(arrow.textContent || '', '').trim();

        if (foldedHeadings.includes(headingText)) {
            heading.classList.add('is-folded');
            const level = parseInt(heading.tagName.substring(1));
            let next = heading.nextElementSibling;
            while (next) {
                if (next.tagName.match(/^H[1-6]$/)) {
                    const nextLevel = parseInt(next.tagName.substring(1));
                    if (nextLevel <= level) {
                        break;
                    }
                }
                next.classList.add('is-hidden-by-fold');
                next = next.nextElementSibling;
            }
        }

        heading.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;

            const isFolded = heading.classList.toggle('is-folded');
            const level = parseInt(heading.tagName.substring(1));

            let next = heading.nextElementSibling;
            while (next) {
                if (next.tagName.match(/^H[1-6]$/)) {
                    const nextLevel = parseInt(next.tagName.substring(1));
                    if (nextLevel <= level) {
                        break;
                    }
                }

                if (isFolded) {
                    next.classList.add('is-hidden-by-fold');
                } else {
                    next.classList.remove('is-hidden-by-fold');
                    
                    if (next.tagName.match(/^H[1-6]$/) && next.classList.contains('is-folded')) {
                        const skipLevel = parseInt(next.tagName.substring(1));
                        let skipNext = next.nextElementSibling;
                        while (skipNext) {
                            if (skipNext.tagName.match(/^H[1-6]$/)) {
                                const skipNextLevel = parseInt(skipNext.tagName.substring(1));
                                if (skipNextLevel <= skipLevel) {
                                    break;
                                }
                            }
                            skipNext = skipNext.nextElementSibling;
                        }
                        next = skipNext ? skipNext.previousElementSibling : null;
                    }
                }
                if (next) next = next.nextElementSibling;
            }

            const taskId = document.getElementById('task-modal').dataset.taskId;
            if (taskId) {
                const currentFolded = [];
                container.querySelectorAll('.foldable-heading.is-folded').forEach(h => {
                    const cleanText = h.textContent.replace(h.querySelector('.heading-fold-arrow')?.textContent || '', '').trim();
                    currentFolded.push(cleanText);
                });

                fetch(`${API_BASE}/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folded_headings: currentFolded })
                }).then(res => {
                    if (res.ok) {
                        for (let col of state.columns) {
                            let t = col.tasks.find(taskItem => taskItem.id === parseInt(taskId));
                            if (t) {
                                t.folded_headings = currentFolded;
                                break;
                            }
                        }
                    }
                }).catch(console.error);
            }
        });
    });
}

function enhanceCodeBlocks(container) {
    const codeBlocks = Array.from(container.querySelectorAll('pre code'));
    
    codeBlocks.forEach(block => {
        if (!block.className || block.className === "") {
            block.classList.add('language-python');
        }
    });

    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-copy-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        btn.onclick = async (e) => {
            e.stopPropagation();
            const code = pre.querySelector('code').innerText;
            await navigator.clipboard.writeText(code);
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => {
                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            }, 2000);
        };
        pre.appendChild(btn);
    });

    if (!window.Prism || codeBlocks.length === 0) return;

    const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));
    let prismIndex = 0;
    
    const highlightNextChunk = () => {
        const sliceStart = performance.now();
        while (prismIndex < codeBlocks.length && (performance.now() - sliceStart) < 16) {
            const block = codeBlocks[prismIndex++];
            if (block.isConnected) {
                if (block.textContent.length > 20000) {
                    block.className = 'language-plain';
                }
                Prism.highlightElement(block);
            }
        }
        if (prismIndex < codeBlocks.length) {
            scheduleIdle(highlightNextChunk);
        }
    };
    scheduleIdle(highlightNextChunk);
}

function generateSubtaskHtml(sub, parentMode = 'default') {
    const trashIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const openIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const eyeOpenSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosedSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    
    const currentEyeSvg = sub.is_visible_on_board ? eyeOpenSvg : eyeClosedSvg;
    const eyeClass = sub.is_visible_on_board ? 'active-eye' : '';
    
    const isAgent = sub.is_visible_on_board;
    const isLocked = isAgent;
    const isDone = sub.completed_at;

    const checkIcon = isAgent 
        ? (isDone 
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>` 
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`)
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>`;

    let titleAttr = '';
    if (isAgent) titleAttr = 'title="Статус управляется на доске"';

    return `
        <div class="subtask-item ${isDone ? 'is-done' : ''} ${isAgent ? 'is-board-agent' : ''}" data-subtask-id="${sub.id}">
            <div class="subtask-checkbox ${isLocked ? 'locked' : ''}" ${titleAttr}>
                ${checkIcon}
            </div>
            
            <!-- Группируем левые кнопки точно так же, как правые -->
            <div class="subtask-left-actions">
                <button class="subtask-eye-btn ${eyeClass}" title="Показывать на доске как карточку">${currentEyeSvg}</button>
                <button class="subtask-detach-btn" title="${t('detachSubtask')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m18.84 12.25 1.72-1.71h-.01a5.001 5.001 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="m5.17 11.67-1.71 1.71a5.001 5.001 0 0 0 7.07 7.07l1.71-1.71"></path>
                        <line x1="8" y1="2" x2="8" y2="5"></line>
                        <line x1="2" y1="8" x2="5" y2="8"></line>
                        <line x1="16" y1="22" x2="16" y2="19"></line>
                        <line x1="22" y1="16" x2="19" y2="16"></line>
                    </svg>
                </button>
            </div>
            
            <div class="subtask-title" data-raw-title="${escapeHtml(sub.title)}">${renderInlineMarkdown(sub.title)}</div>
            
            <div class="subtask-actions">
                <button class="subtask-open-btn" title="${t('menu.open')}">${openIconSvg}</button>
                <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIconSvg}</button>
            </div>
        </div>
    `;
}

async function onAddSubtask() {
    const container = document.getElementById('subtask-form-container');
    const subtasksList = document.getElementById('subtasks-list');
    const addBtn = container.querySelector('.btn-add-subtask');
    const modal = document.getElementById('task-modal');
    const parentId = parseInt(modal.dataset.taskId);
    const columnId = parseInt(modal.dataset.columnId);

    if (!addBtn) return;

    const formItem = document.createElement('div');
    formItem.className = 'subtask-item subtask-entering';
    formItem.innerHTML = `
        <textarea class="subtask-inline-input" placeholder="${t('taskModal.subtasksPlaceholder').replace(/^\+ /, '')}" spellcheck="false" rows="1"></textarea>
    `;

    addBtn.replaceWith(formItem);
    const input = formItem.querySelector('textarea');
    
    const autoResize = () => {
        const scrollParent = formItem.closest('.task-detail-body');
        const currentScroll = scrollParent ? scrollParent.scrollTop : 0;

        const offset = input.offsetHeight - input.clientHeight;
        input.style.height = '1px'; 
        input.style.height = (input.scrollHeight + offset) + 'px';
        
        if (scrollParent) scrollParent.scrollTop = currentScroll;
    };

    input.addEventListener('input', () => {
        formItem.classList.remove('is-error');
        const hint = formItem.querySelector('.card-error-hint');
        if (hint) {
            hint.remove();
        }
        autoResize();
    });
    
    autoResize();
    input.focus({ preventScroll: true });
    bindTitleFormattingShortcuts(input);

    requestAnimationFrame(() => {
        formItem.classList.add('entered');
        formItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    let isResolved = false;

    const cancel = () => {
        if (isResolved) return;
        isResolved = true;
        formItem.style.opacity = '0';
        setTimeout(() => renderSubtaskAddButton(container), 200);
    };

    const submit = async () => {
        const rawTitle = input.value.trim();
        if (!rawTitle) { cancel(); return; }

        // Чистая ссылка на карточку — привязываем существующую задачу как подзадачу
        const linkMatch = rawTitle.match(/^\[(.*?)\]\(doe:\/\/task\/(\d+)\)$/) || rawTitle.match(/^doe:\/\/task\/(\d+)$/);
        if (linkMatch) {
            const linkedTaskId = parseInt(linkMatch[2] || linkMatch[1]);
            
            const isDuplicate = !!subtasksList.querySelector(`.subtask-item[data-subtask-id="${linkedTaskId}"]`);

            if (linkedTaskId === parentId || isDuplicate) {
                input.disabled = false; 
                formItem.classList.remove('is-error');
                void formItem.offsetWidth;
                formItem.classList.add('is-error');
                
                setTimeout(() => formItem.classList.remove('is-error'), 400);

                input.focus({ preventScroll: true });
                return;
            }

            if (isResolved) return;
            isResolved = true;
            input.disabled = true;

            try {
                const linkedTaskRes = await fetch(`${API_BASE}/tasks/${linkedTaskId}`);
                if (!linkedTaskRes.ok) throw new Error("Task not found");
                
                const linkedTask = await linkedTaskRes.json();
                
                const safeOldParents = Array.isArray(linkedTask.parent_ids) ? linkedTask.parent_ids : [];
                const newParents = [...new Set([...safeOldParents, parentId])];
                
                await updateTask(linkedTaskId, { 
                    parent_ids: newParents, 
                    is_visible_on_board: true 
                });
                
                bumpModalUpdatedDate();
                formItem.remove();
                renderSubtaskAddButton(container);
                
                await loadTaskIntoModal(parentId, false);
                refreshBoard();
                return;
            } catch (err) {
                isResolved = false;
                input.disabled = false;
                
                let hint = formItem.querySelector('.card-error-hint');
                if (!hint) {
                    hint = document.createElement('div');
                    hint.className = 'card-error-hint';
                    formItem.appendChild(hint);
                }
                
                if (err.message && (err.message.includes('цикл') || err.message.includes('самой себя'))) {
                     hint.textContent = t('cyclicError');
                } else {
                     hint.textContent = t('alerts.error');
                }

                formItem.classList.remove('is-error');
                void formItem.offsetWidth;
                formItem.classList.add('is-error');
                
                setTimeout(() => formItem.classList.remove('is-error'), 400);
                input.focus({ preventScroll: true });
                return;
            }
        }

        // Убираем обрамляющие doe:// ссылки — в подзадачах они не нужны
        const title = stripDoeTaskLinks(rawTitle);

        if (title.length > 1000) {
            if (!formItem.querySelector('.card-error-hint')) {
                const hint = document.createElement('div');
                hint.className = 'card-error-hint';
                hint.textContent = t('errors.tooLong');
                formItem.appendChild(hint);
            }
            formItem.classList.remove('is-error');
            void formItem.offsetWidth;
            formItem.classList.add('is-error');
            autoResize(); 
            input.focus({ preventScroll: true });
            return;
        }

        if (isResolved) return;
        isResolved = true;
        input.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/tasks/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, column_id: columnId, parent_ids: [parentId] })
            });

            if (!res.ok) throw new Error();
            const newSub = await res.json();
            
            bumpModalUpdatedDate();

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generateSubtaskHtml(newSub).trim();
            const realSub = tempDiv.firstChild;
            realSub.classList.add('subtask-birth');
            
            subtasksList.appendChild(realSub);
            bindSubtaskEvents(realSub, newSub, parentId);

            formItem.remove();
            renderSubtaskAddButton(container);

            requestAnimationFrame(() => {
                realSub.classList.add('born');
                realSub.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });

            setTimeout(() => realSub.classList.remove('subtask-birth', 'born'), 500);
            document.getElementById('subtasks-count').textContent = parseInt(document.getElementById('subtasks-count').textContent) + 1;
            refreshBoard();
        } catch (err) {
            isResolved = false;
            input.disabled = false;
            formItem.classList.add('is-error');
            setTimeout(() => formItem.classList.remove('is-error'), 400);
            input.focus({ preventScroll: true });
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    input.addEventListener('blur', () => {
        if (!isResolved) { 
            if (input.value.trim()) submit(); 
            else cancel(); 
        }
    });
}

function renderSubtaskAddButton(container) {
    container.innerHTML = `<button class="btn-add-subtask">${t('taskModal.subtasksPlaceholder')}</button>`;
    container.querySelector('.btn-add-subtask').onclick = onAddSubtask;
}

function bindSubtaskEvents(el, sub, parentTaskOrId, parentMode = 'default') {
    let parentTask = null;
    let parentId = null;
    if (typeof parentTaskOrId === 'object' && parentTaskOrId !== null) {
        parentTask = parentTaskOrId;
        parentId = parentTask.id;
    } else {
        parentId = parseInt(parentTaskOrId);
        for (const col of state.columns) {
            parentTask = col.tasks.find(t => t.id === parentId);
            if (parentTask) break;
        }
    }

    el.querySelector('.subtask-checkbox').onclick = (e) => {
        e.stopPropagation();

        if (sub.is_visible_on_board) {
            el.classList.remove('is-error');
            void el.offsetWidth;
            el.classList.add('is-error');
            setTimeout(() => el.classList.remove('is-error'), 400);
            return;
        }

        const isDone = !el.classList.contains('is-done');
        
        el.classList.toggle('is-done', isDone);
        
        const timestamp = isDone ? new Date().toISOString() : null;
        const previousTimestamp = sub.completed_at;
        sub.completed_at = timestamp;

        state.columns.forEach(col => {
            col.tasks.forEach(task => {
                if (task.subtasks) {
                    const subIndex = task.subtasks.findIndex(s => s.id === sub.id);
                    if (subIndex !== -1) {
                        task.subtasks[subIndex].completed_at = timestamp;
                        
                        const cardEl = document.querySelector(`.card[data-card-id="${task.id}"]`);
                        if (cardEl) {
                            updateCardAppearance(cardEl, task, col.mode);
                        }
                    }
                }
            });
        });

        updateTask(sub.id, { completed_at: timestamp }).catch((err) => {
            console.error("Failed to update subtask status:", err);
            
            el.classList.toggle('is-done', !isDone);
            sub.completed_at = previousTimestamp;
            
            state.columns.forEach(col => {
                col.tasks.forEach(task => {
                    if (task.subtasks) {
                        const subIndex = task.subtasks.findIndex(s => s.id === sub.id);
                        if (subIndex !== -1) {
                            task.subtasks[subIndex].completed_at = previousTimestamp;
                            
                            const cardEl = document.querySelector(`.card[data-card-id="${task.id}"]`);
                            if (cardEl) {
                                updateCardAppearance(cardEl, task, col.mode);
                            }
                        }
                    }
                });
            });
            
            window.showToast(t('alerts.error'), 'Не удалось сохранить статус подзадачи', true);
        });
    };

    el.querySelector('.subtask-delete-btn').onclick = async (e) => {
        e.stopPropagation();

        const parents = sub.parent_ids || [];

        el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px) scale(0.95)';
        
        setTimeout(() => {
            if (el.parentNode) el.remove();
            const countEl = document.getElementById('subtasks-count');
            countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
        }, 250);

        try {
            if (parents.length > 1) {
                const newParentIds = parents.filter(id => id !== parentId);
                await updateTask(sub.id, { parent_ids: newParentIds });
                
                bumpModalUpdatedDate();
                sub.parent_ids = newParentIds;
                refreshBoard();
            } else {
                const data = await deleteTask(sub.id);
                
                bumpModalUpdatedDate();
                
                const deletedIds = data.deleted_ids || [];
                
                deletedIds.forEach(id => {
                    const boardCard = document.querySelector(`.card[data-card-id="${id}"]`);
                    if (boardCard) {
                        animateCardDeletion(boardCard);
                    }
                    
                    for (let col of state.columns) {
                        const taskIndex = col.tasks.findIndex(t => t.id === id);
                        if (taskIndex !== -1) col.tasks.splice(taskIndex, 1);
                    }
                });
                refreshBoard(); 
            }
        } catch(err) {
            console.error("Ошибка при удалении пункта:", err);
        }
    };

    el.querySelector('.subtask-open-btn').onclick = (e) => {
        e.stopPropagation();

        if (!sub.is_visible_on_board) {
            loadTaskIntoModal(sub.id, true);
            return;
        }
        
        fetch(`${API_BASE}/tasks/${sub.id}/context`)
            .then(res => res.json())
            .then(context => {
                window.navigateToEntityGlobal(context.workspace_id, context.column_id, sub.id, null, true);
            })
            .catch(err => {
                console.error("Не удалось найти контекст задачи", err);
                loadTaskIntoModal(sub.id, true);
            });
    };

    el.querySelector('.subtask-eye-btn').onclick = (e) => {
        e.stopPropagation();
        const eyeBtn = e.currentTarget;
        const checkbox = el.querySelector('.subtask-checkbox');
        
        sub.is_visible_on_board = !sub.is_visible_on_board;

        const eyeOpenSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        const eyeClosedSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        const checkIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>`;
        const boardIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;

        eyeBtn.innerHTML = sub.is_visible_on_board ? eyeOpenSvg : eyeClosedSvg;
        eyeBtn.classList.toggle('active-eye', sub.is_visible_on_board);
        el.classList.toggle('is-board-agent', sub.is_visible_on_board);
        
        updateTask(sub.id, { 
            is_visible_on_board: sub.is_visible_on_board
        }).then(updatedSub => {
            sub.completed_at = updatedSub.completed_at;
            
            const isDone = sub.completed_at;
            const isLocked = sub.is_visible_on_board;

            checkbox.classList.toggle('locked', isLocked);
            el.classList.toggle('is-done', !!isDone);
            
            if (sub.is_visible_on_board) {
                checkbox.setAttribute('title', 'Статус управляется на доске');
                checkbox.innerHTML = isDone ? checkIconSvg : boardIconSvg;
            } else {
                checkbox.removeAttribute('title');
                checkbox.innerHTML = checkIconSvg;
            }
            
            refreshBoard();
        }).catch(console.error);
    };

    const detachBtn = el.querySelector('.subtask-detach-btn');
    if (detachBtn) {
        detachBtn.onclick = async (e) => {
            e.stopPropagation();

            let parents = sub.parent_ids || [];
            let detachType = 'all';

            if (parents.length > 1) {
                detachType = await showDetachModal();
                if (!detachType) return;
            }

            el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px) scale(0.95)';
            
            setTimeout(() => {
                if (el.parentNode) el.remove();
                const countEl = document.getElementById('subtasks-count');
                countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
            }, 250);

            try {
                let newParentIds = [];
                if (detachType === 'current') {
                    newParentIds = parents.filter(id => id !== parentId);
                } else if (detachType === 'all') {
                    newParentIds = [];
                }

                await updateTask(sub.id, { parent_ids: newParentIds, is_visible_on_board: true });
                bumpModalUpdatedDate();
                refreshBoard();
            } catch(err) {
                console.error("Ошибка при отвязке задачи:", err);
            }
        };
    }
}

function initTaskDescriptionLogic() {
    const renderDiv = document.getElementById('task-desc-render');
    const inputArea = document.getElementById('task-desc-input');
    const descWrapper = document.querySelector('.description-wrapper');
    const modal = document.getElementById('task-modal');

    let lastSavedValue = "";

    const toggleFormat = (cm, syntaxBefore, syntaxAfter) => {
        const selection = cm.getSelection();
        if (selection) {
            // Если выделение уже обёрнуто в этот синтаксис, удаляем его (Unwrap)
            if (selection.startsWith(syntaxBefore) && selection.endsWith(syntaxAfter)) {
                const unwrapped = selection.substring(syntaxBefore.length, selection.length - syntaxAfter.length);
                cm.replaceSelection(unwrapped);
            } else {
                // Иначе оборачиваем выделенный фрагмент (Wrap)
                cm.replaceSelection(syntaxBefore + selection + syntaxAfter);
            }
        } else {
            // Если ничего не выделено, вставляем пустые маркеры и ставим курсор между ними
            const cursor = cm.getCursor();
            cm.replaceSelection(syntaxBefore + syntaxAfter);
            cm.setCursor({ line: cursor.line, ch: cursor.ch + syntaxBefore.length });
        }
    };

    const insertLink = (cm) => {
        const selection = cm.getSelection();
        if (selection) {
            // Оборачиваем выделенный текст в ссылку с плейсхолдером (url)
            cm.replaceSelection(`[${selection}](url)`);
            const cursor = cm.getCursor();
            const endCh = cursor.ch;
            // Автоматически выделяем слово "url", чтобы его можно было сразу заменить вставкой ссылки (Ctrl+V)
            cm.setSelection(
                { line: cursor.line, ch: endCh - 4 },
                { line: cursor.line, ch: endCh - 1 }
            );
        } else {
            // Если ничего не выделено, вставляем пустой шаблон ссылки и ставим курсор в скобки названия
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
            // Перехватываем Cmd+F / Ctrl+F внутри редактора
            extraKeys: {
                "Cmd-F": (cm) => { if (window.openLocalSearch) window.openLocalSearch(); },
                "Ctrl-F": (cm) => { if (window.openLocalSearch) window.openLocalSearch(); },
                
                // Жирный текст (Bold)
                "Cmd-B": (cm) => toggleFormat(cm, "**", "**"),
                "Ctrl-B": (cm) => toggleFormat(cm, "**", "**"),
                
                // Курсив (Italic)
                "Cmd-I": (cm) => toggleFormat(cm, "*", "*"),
                "Ctrl-I": (cm) => toggleFormat(cm, "*", "*"),
                
                // Подчеркивание (Underline через HTML тег <u>)
                "Cmd-U": (cm) => toggleFormat(cm, "<u>", "</u>"),
                "Ctrl-U": (cm) => toggleFormat(cm, "<u>", "</u>"),
                
                // Зачеркнутый (Strikethrough)
                "Shift-Cmd-X": (cm) => toggleFormat(cm, "~~", "~~"),
                "Shift-Ctrl-X": (cm) => toggleFormat(cm, "~~", "~~"),
                
                // Моноширинный (Monospace / Inline code)
                "Cmd-E": (cm) => toggleFormat(cm, "`", "`"),
                "Ctrl-E": (cm) => toggleFormat(cm, "`", "`"),
                
                // Ссылка (Link)
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

    const processFileForDescription = async (file) => {
        const isEditMode = renderDiv.style.display === 'none';

        let fileName = file.name;
        if (!fileName || fileName === 'image.png') {
            const dateStr = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15);
            fileName = `Скриншот_${dateStr}.png`;
        }

        const ext = fileName.split('.').pop().toLowerCase();
        const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
        const prefix = isImg ? '!' : '';
        const placeholder = `${prefix}[⏳ Загрузка ${fileName}...]()`;

        // Диапазон вставленного placeholder в координатах документа.
        // Заменяем результат через replaceRange, а не setValue(replace(...)):
        // это сохраняет undo-историю и не уводит курсор в конец документа.
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

            // insertPos — снимок позиции до вставки; indexFromPos корректно
            // отображает его на уже расширенный документ.
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

            // Превью на время загрузки — та же связка, что и в основном рендере:
            // формулы (KaTeX), обёртки изображений и подсветка кода.
            // Путь вложений — doe/ (как отдаёт бэкенд), не attachments/.
            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
            const tempText = cmEditor.getValue().replace(cleanRegex, '');
            renderDiv.innerHTML = parseMarkdownWithMath(tempText);
            enhanceCodeBlocks(renderDiv);
        }

        const formData = new FormData();
        formData.append('file', file, fileName);

        try {
            const res = await fetch(`${API_BASE}/system/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();
            const encodedPath = encodeMarkdownPath(data.path);
            const finalMarkdown = `${prefix}[${data.name}](${encodedPath})`;
            
            if (placeholderRange) {
                cmEditor.replaceRange(finalMarkdown, placeholderRange.from, placeholderRange.to);
            }
            refreshAttachmentsList();
        } catch (err) {
            if (placeholderRange) {
                cmEditor.replaceRange(`${prefix}[❌ Ошибка: ${fileName}]()`, placeholderRange.from, placeholderRange.to);
            }
        }

        if (isEditMode) {
            cmEditor.focus();
        } else {
            lastSavedValue = null; 
            await switchToReadMode();
        }
    };

    const handleFileDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragEnterCount = 0;
        descWrapper.classList.remove('is-drag-over');

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;
        // Обрабатываем файлы последовательно: cmEditor — разделяемое состояние,
        // при параллельной вставке диапазоны placeholder наложились бы друг на друга.
        for (const file of files) {
            await processFileForDescription(file);
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

    // Подсветка drop-зоны через счётчик enter/leave, чтобы бордюр не мигал
    // при переходе курсора на дочерние элементы (img, p внутри описания).
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

        // Переключаем видимость сразу, чтобы пользователь увидел плашку "Loading..."
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
            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
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
            
            wrapper.classList.add('is-resizing');
            wrapper.classList.add('has-custom-size'); 
            document.body.style.userSelect = 'none'; 
            
            const onMouseMove = (moveEvent) => {
                let newWidth = Math.max(50, startWidth + (moveEvent.clientX - startX));
                let newHeight = Math.max(50, startHeight + (moveEvent.clientY - startY));
                
                if (moveEvent.shiftKey) newHeight = newWidth / aspectRatio;
                
                wrapper.style.width = newWidth + 'px';
                wrapper.style.height = newHeight + 'px';
                applyTextExpansion();
            };
            
            const onMouseUp = async () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.userSelect = '';
                wrapper.classList.remove('is-resizing');
                
                const finalWidth = Math.round(wrapper.offsetWidth);
                const finalHeight = Math.round(wrapper.offsetHeight);
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
        switchToEditMode();
    });

    renderDiv.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link) {
            e.preventDefault();
            e.stopPropagation();
            const href = link.getAttribute('href');
            if (!href) return;
            if (href.startsWith('doe/') || href.startsWith('/doe/')) {
                const cleanHref = href.startsWith('/') ? href.slice(1) : href;
                fetch(`${API_BASE}/system/open-file`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: decodeURIComponent(cleanHref)}) });
                return;
            }
            if (href.startsWith('doe://task/')) {
                const targetTaskId = parseInt(href.split('/').pop());
                fetch(`${API_BASE}/tasks/${targetTaskId}/context`)
                    .then(res => res.json())
                    .then(context => { window.navigateToEntityGlobal(context.workspace_id, context.column_id, targetTaskId, null, true); })
                    .catch(err => console.error("Не удалось найти карточку", err));
                return;
            }
            fetch(`${API_BASE}/system/open-link`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url: href}) });
            return;
        }
        
        if (!cmEditor.getValue().trim()) {
            switchToEditMode();
        }
    });

    let preventBlurExit = false;
    let shouldRefocusCM = false;

    // 1. Клик внутри самого описания удерживает фокус в редакторе
    descWrapper.addEventListener('mousedown', (e) => {
        if (cmEditor && cmEditor.getWrapperElement().style.display === 'block') {
            preventBlurExit = true;
            shouldRefocusCM = true;
        }
    });

    // 2. Клик по виджету поиска, группе инструментов или кнопкам шапки НЕ закрывает редактирование
    const taskModal = document.getElementById('task-modal');
    taskModal.addEventListener('mousedown', (e) => {
        if (cmEditor && cmEditor.getWrapperElement().style.display === 'block') {
            const isSearch = e.target.closest('#local-search-widget');
            const isTools = e.target.closest('#modal-tools-wrapper');
            const isHeaderActions = e.target.closest('.modal-header-actions');
            const isDatePicker = e.target.closest('#datepicker-dropdown') || e.target.closest('.datepicker-dropdown');

            if (isSearch || isTools || isHeaderActions || isDatePicker) {
                preventBlurExit = true;
                shouldRefocusCM = false; // Разрешаем фокусу уйти на кнопки/инпуты
            }
        }
    });

    window.addEventListener('mouseup', () => {
        // Фокусируем редактор мгновенно, чтобы не было задержек при вводе
        if (shouldRefocusCM) {
            shouldRefocusCM = false;
            if (cmEditor && cmEditor.getWrapperElement().style.display === 'block') {
                cmEditor.focus();
            }
        }
        
        // Задерживаем сброс флага блокировки, чтобы асинхронный blur в ОС успел его прочитать
        setTimeout(() => {
            preventBlurExit = false;
        }, 150);
    });

    // 3. Умная обработка события потери фокуса
    cmEditor.on('blur', () => {
        setTimeout(() => {
            if (preventBlurExit) return;

            // Фолбэк-проверка на случай перехода по Tab или горячим клавишам (Cmd+F)
            const activeEl = document.activeElement;
            if (activeEl) {
                if (activeEl.closest('#local-search-widget') || activeEl.closest('#modal-tools-wrapper')) {
                    return; // Блокируем выход, если фокус ушел в поиск или инструменты
                }
            }

            switchToReadMode();
        }, 120); // Задержка дает браузеру обновить activeElement
    });
}

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
            '.due-date-pill'
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
                setTimeout(() => window._isAfterDrag = false, 50);
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

    const regex = /(!?)\[([^\]]+)\]\((doe\/[^)]*)\)(?:\{[^}]+\})?(!?)/g;
    let match;
    const attachments = [];
    
    while ((match = regex.exec(cleanDesc)) !== null) {
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
                            const formData = new FormData();
                            formData.append('file', input.files[0]);
                            const res = await fetch(`${API_BASE}/system/upload`, { method: 'POST', body: formData });
                            if(res.ok) {
                                const data = await res.json();
                                replaceBrokenAttachment(att, data);
                            }
                        }
                        resolve();
                    };
                    input.click();
                });
            }

            if (newAbsPath) {
                const res = await fetch(`${API_BASE}/system/import-file`, {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ absolute_path: newAbsPath })
                });
                if(res.ok) {
                    const data = await res.json();
                    replaceBrokenAttachment(att, data);
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
                    // Режим чтения: сохраняем описание и перерендериваем.
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

                        const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
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
        // Режим чтения: сохраняем и перерендериваем
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
            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
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

            // Сохраняем и обновляем UI (read-режим)
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

            const cleanRegex = /(!?)\[[^\]]+\]\(doe\/[^)]+\)!\s*/g;
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
        if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
            const absPath = await window.pywebview.api.choose_file();
            if (absPath) {
                const res = await fetch(`${API_BASE}/system/import-file`, {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ absolute_path: absPath })
                });
                if(res.ok) {
                    const data = await res.json();
                    appendAttachmentToDescription(data.name, data.path);
                }
            }
        } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async () => {
                if (input.files.length > 0) {
                    const formData = new FormData();
                    formData.append('file', input.files[0]);
                    const res = await fetch(`${API_BASE}/system/upload`, {
                        method: 'POST', body: formData
                    });
                    if(res.ok) {
                        const data = await res.json();
                        appendAttachmentToDescription(data.name, data.path);
                    }
                }
            };
            input.click();
        }
    }
});

async function showVaultScreen() {
    // Останавливаем генерацию ИИ перед уходом
    if (window.aiAbortController) {
        window.aiAbortController.abort();
        window.aiAbortController = null;
    }
    if (window.aiState) window.aiState.isTyping = false;
    if (typeof setAiBtnState === 'function') setAiBtnState(false);

    const lights = document.getElementById('mac-traffic-lights');
    if (lights) lights.classList.add('vault-mode');

    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_vault_window) {
        window.pywebview.api.open_vault_window();
    } else {
        window.location.href = "/app?mode=vault";
    }
}

async function fetchVaultHistory() {
    try {
        const res = await fetch(`${API_BASE}/system/vault/history?t=${Date.now()}`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        if (res.ok) return await res.json();
    } catch (e) { console.error(e); }
    return [];
}

function updateVaultHistoryScrollState() {
    const list = document.getElementById('vault-history-list');
    if (!list) return;
    if (list.scrollHeight > list.clientHeight) {
        list.classList.add('is-scrollable');
    } else {
        list.classList.remove('is-scrollable');
    }
}

async function renderVaultHistory() {
    const list = document.getElementById('vault-history-list');
    if (!list) return;
    list.innerHTML = '';
    
    const history = await fetchVaultHistory();
    
    if (history.length === 0) {
        list.innerHTML = `
            <div style="text-align:center; padding: 24px; color: var(--text-secondary); font-size: 13px; opacity: 0.6;" data-i18n="vault.recentEmpty">
                ${t('vault.recentEmpty')}
            </div>`;
        return;
    }

    const folderIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const revealIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const missingIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

    history.forEach(item => {
        const div = document.createElement('div');
        const isMissing = item.exists === false;
        div.className = `subtask-item vault-history-item${isMissing ? ' is-missing' : ''}`;
        div.dataset.path = item.path;
        
        let dateStr = '';
        if (item.last_opened) {
            dateStr = formatDateTime(item.last_opened);
        } else {
            dateStr = currentLang === 'ru' ? 'Ранее' : 'Earlier';
        }

        const missingTooltip = currentLang === 'ru' ? 'Хранилище не найдено. Нажмите, чтобы перепривязать' : 'Vault not found. Click to relink';

        div.innerHTML = `
            <div class="subtask-checkbox ${isMissing ? 'missing' : ''}" style="border:none; color: var(--brand-pine); opacity: 0.8; cursor: inherit;" ${isMissing ? `title="${missingTooltip}"` : ''}>
                ${isMissing ? missingIcon : folderIcon}
            </div>
            <div class="vault-history-info">
                <div class="vault-history-name ${isMissing ? 'missing-text' : ''}" data-full-title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                <div class="vault-history-meta">
                    <div class="vault-history-path ${isMissing ? 'missing-text' : ''}" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
                    <!-- Теперь блок даты есть в DOM всегда, поэтому он без проблем копируется в Drag&Drop клон -->
                    <div class="vault-history-date" data-timestamp="${item.last_opened || ''}">${dateStr}</div>
                </div>
            </div>
            <div class="subtask-actions">
                <button class="subtask-open-btn vault-hist-reveal" title="${currentLang === 'ru' ? 'Показать в папке' : 'Reveal in folder'}" style="${isMissing ? 'display: none;' : ''}">${revealIcon}</button>
                <button class="subtask-delete-btn vault-hist-del" title="${t('menu.delete')}">${trashIcon}</button>
            </div>
        `;

        div.querySelector('.vault-hist-reveal').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                if (window.pywebview && window.pywebview.api && window.pywebview.api.reveal_local_path) {
                    await window.pywebview.api.reveal_local_path(item.path);
                } else {
                    await fetch(`${API_BASE}/system/reveal-folder`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({path: item.path})
                    });
                }
            } catch (err) {
                console.error("Failed to reveal folder:", err);
            }
        });

        div.addEventListener('click', async (e) => {
            if (window._isAfterDrag) return; 
            if (e.target.closest('.vault-hist-del')) return;
            if (e.target.closest('.vault-hist-reveal')) return;
            
            const currentlyMissing = div.querySelector('.subtask-checkbox').classList.contains('missing');
            
            if (currentlyMissing) {
                try {
                    let newPath = null;
                    if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
                        newPath = await window.pywebview.api.choose_directory();
                    }
                    if (!newPath) return;

                    const res = await fetch(`${API_BASE}/system/vault/history/relink`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ old_path: item.path, new_path: newPath })
                    });

                    if (res.ok) {
                        renderVaultHistory();
                    } else {
                        div.classList.remove('is-error');
                        void div.offsetWidth;
                        div.classList.add('is-error');
                        setTimeout(() => div.classList.remove('is-error'), 400);
                    }
                } catch (err) {
                    console.error(err);
                }
                return;
            }

            try {
                div.style.opacity = '0.5';
                div.style.pointerEvents = 'none';

                const res = await fetch(`${API_BASE}/system/vault/switch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_path: item.path })
                });
                
                if (res.ok) {
                    const result = await res.json();
                    updateVaultName(result.name);
                    const settings = await fetchSettings().catch(() => ({}));
                    state.activeWorkspaceId = settings.active_workspace_id || null;
                    await transitionToApp();
                } else if (res.status === 400) {
                    div.style.opacity = '1';
                    div.style.pointerEvents = 'auto';
                    div.classList.add('is-error');
                    setTimeout(() => {
                        div.classList.remove('is-error');
                        renderVaultHistory(); 
                    }, 400);
                }
            } catch (err) {
                console.error(err);
                div.style.opacity = '1';
                div.style.pointerEvents = 'auto';
            }
        });

        div.querySelector('.vault-hist-del').addEventListener('click', async (e) => {
            e.stopPropagation();
            
            const rect = div.getBoundingClientRect();
            
            const clone = div.cloneNode(true);
            clone.classList.add('vault-deleting-clone');
            clone.style.left = `${rect.left}px`;
            clone.style.top = `${rect.top}px`;
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            document.body.appendChild(clone);
            
            const spacer = document.createElement('div');
            spacer.className = 'vault-history-spacer';
            spacer.style.height = `${rect.height}px`;
            
            div.replaceWith(spacer);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    clone.classList.add('is-animating');
                    spacer.classList.add('is-shrinking');
                });
            });

            setTimeout(() => {
                if (clone.parentNode) clone.remove();
                if (spacer.parentNode) spacer.remove();
                
                updateVaultHistoryScrollState();
                
                if (list.querySelectorAll('.vault-history-item').length === 0) {
                    renderVaultHistory();
                }
            }, 450);

            try {
                await fetch(`${API_BASE}/system/vault/history/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: item.path })
                });
            } catch (err) {
                console.error("Ошибка удаления из истории:", err);
            }
        });

        list.appendChild(div);
    });
    
    requestAnimationFrame(updateVaultHistoryScrollState);
}

async function transitionToApp() {
    const lights = document.getElementById('mac-traffic-lights');
    if (lights) lights.classList.remove('vault-mode');

    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_main_window) {
        window.pywebview.api.open_main_window();
    } else {
        window.location.href = "/app"; 
    }
}

window.handleVaultAction = async (actionType) => {
    const cards = document.querySelectorAll('.vault-action-card');
    const targetCard = (actionType === 'create') ? cards[0] : cards[1];
    
    if (actionType === 'create') {
        document.getElementById('vault-actions-cards').style.display = 'none';
        document.getElementById('vault-create-form').style.display = 'block';
        document.getElementById('new-vault-name').focus();
    } else {
        try {
            if (!window.pywebview || !window.pywebview.api) return;
            
            const selectedPath = await window.pywebview.api.choose_directory();
            if (!selectedPath) return;

            const res = await fetch(`${API_BASE}/system/vault/switch`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_path: selectedPath })
            });

            if (res.ok) {
                const result = await res.json();
                updateVaultName(result.name);
                const settings = await fetchSettings().catch(() => ({}));
                state.activeWorkspaceId = settings.active_workspace_id || null;
                
                await transitionToApp();
            } 
            else if (res.status === 400) {
                targetCard.classList.add('is-invalid');
                let hint = targetCard.querySelector('.vault-error-hint');
                if (!hint) {
                    hint = document.createElement('div');
                    hint.className = 'vault-error-hint';
                    targetCard.appendChild(hint);
                }
                hint.textContent = t('vault.errorInvalid');
                void hint.offsetWidth; 
                hint.classList.add('visible');

                setTimeout(() => {
                    targetCard.classList.remove('is-invalid');
                    hint.classList.remove('visible');
                    setTimeout(() => {
                        if (!hint.classList.contains('visible')) hint.remove();
                    }, 200); 
                }, 2200);
            }
        } catch (err) {
            console.error("Vault selection error:", err);
        }
    }
};

window.cancelVaultCreate = () => {
    document.getElementById('vault-actions-cards').style.display = 'flex';
    document.getElementById('vault-create-form').style.display = 'none';
    document.getElementById('new-vault-name').value = '';
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
            
            // Если карточка открыта — всегда открываем ЛОКАЛЬНЫЙ поиск, 
            // даже если глобальный поиск отключен в расширениях
            if (taskModal && taskModal.classList.contains('show')) {
                e.preventDefault(); 
                if (window.openLocalSearch) window.openLocalSearch();
                return;
            }
            
            // Проверяем, не скрыт ли wrapper глобального поиска
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
        const hasResults = data.workspaces.length || data.columns.length || data.tasks.length;

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

    // Выбор системного шрифта с выпадающим списком (Obsidian style)
    const uiFontInput = document.getElementById('ui-font-input');
    const uiFontDropdown = document.getElementById('ui-font-dropdown');

    if (uiFontInput && uiFontDropdown) {
        // Динамический кэш системных шрифтов
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
                
                // Пробиваем CSS-правило !important с помощью setProperty
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

        // Live-Preview: ТОЛЬКО фильтруем список визуально. Никаких запросов к бэкенду на каждый чих!
        uiFontInput.addEventListener('input', () => {
            renderFontList(uiFontInput.value.trim());
        });

        uiFontInput.addEventListener('focus', () => {
            const val = uiFontInput.value.trim();
            // Если там дефолтный текст, очищаем поле для удобного ввода новой строки
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
            
            // Если введено/выбрано дефолтное значение, сохраняем пустую строку в БД
            const isDefault = !val || val === `Inter (${t('modals.fontSystemDefault')})` || val.toLowerCase() === "inter";
            const saveVal = isDefault ? "" : val;
            
            await updateSettings({ ui_font: saveVal });
            
            // В самом инпуте визуально оставляем красивый локализованный плейсхолдер
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
});

let aiState = {
    supported: false,
    availableModels: [],
    downloadedModels: [],
    selectedModel: localStorage.getItem('doe-ai-model') || null,
    onlyVisible: localStorage.getItem('doe-ai-visible') !== 'false',
    chatHistory: [],
    isTyping: false,
    // Характеристики железа для отображения в UI
    hardwareTier: null,
    ramGb: null,
    // Метаданные моделей: {name: {family, params, min_tier, size_gb, downloaded}}
    modelsInfo: {}
};

async function checkAiStatus() {
    try {
        const res = await fetch(`${API_BASE}/ai/status`);
        if (res.ok) {
            const data = await res.json();
            aiState.supported = data.supported;
            if (data.available_models) aiState.availableModels = data.available_models;
            if (data.downloaded_models) aiState.downloadedModels = data.downloaded_models;
            if (data.hardware) {
                aiState.hardwareTier = data.hardware.tier;
                aiState.ramGb = data.hardware.ram_gb;
            }
            if (data.models_info) aiState.modelsInfo = data.models_info;
            
            // === АВТОВЫБОР МОДЕЛИ (ЛОГИКА ИИ) ===
            const downloaded = aiState.downloadedModels || [];
            const savedModel = localStorage.getItem('doe-ai-model');

            if (downloaded.length === 1) {
                // Если на диске ровно 1 модель — всегда выбираем её по умолчанию
                aiState.selectedModel = downloaded[0];
                localStorage.setItem('doe-ai-model', downloaded[0]);
            } else if (downloaded.length >= 2) {
                // Если скачано две или более
                if (savedModel && downloaded.includes(savedModel)) {
                    // Возвращаем ту, что была в предыдущем сеансе работы
                    aiState.selectedModel = savedModel;
                } else {
                    // Если сохраненной нет или она удалена — берем первую из доступных
                    aiState.selectedModel = downloaded[0];
                    localStorage.setItem('doe-ai-model', downloaded[0]);
                }
            } else {
                // Если моделей на диске нет вообще — сбрасываем выбор
                aiState.selectedModel = null;
                localStorage.removeItem('doe-ai-model');
            }
            // =====================================
            
            const menuBtn = document.getElementById('menu-ai-settings');
            if (menuBtn) {
                if (!aiState.supported) {
                    menuBtn.style.opacity = '0.5';
                    menuBtn.title = "Требуется macOS для локальной LLM";
                } else {
                    menuBtn.style.opacity = '1';
                    menuBtn.title = "";
                    checkDailyJournal();
                }
            }
            
            const fab = document.getElementById('ai-floating-btn');
            if (fab) {
                if (aiState.supported && aiState.downloadedModels.length > 0) {
                    fab.classList.add('show');
                } else {
                    fab.classList.remove('show');
                }
            }
        }
    } catch (e) {
        console.error("AI Status Check failed", e);
    }
}

// Запускаем проверку при загрузке
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkAiStatus, 1000);
});


function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 MB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Превращает имя модели в безопасный слаг для использования в DOM id и ключах.
// Имена вроде "Gemma 4 26B (A4B MoE)" содержат пробелы и скобки, которые
// ломают getElementById и data-атрибуты.
function modelSlug(model) {
    return model.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Вспомогательная функция для запуска поллинга прогресса ИИ
function startAiDownloadPolling(model) {
    const slug = modelSlug(model);
    if (window[`ai_interval_${slug}`]) return; // Уже опрашиваем

    window[`ai_interval_${slug}`] = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/ai/download-progress?model_name=${encodeURIComponent(model)}`);
            if (res.ok) {
                const data = await res.json();

                // Ищем активный элемент в открытой модалке (если она открыта)
                const pctSpan = document.getElementById(`ai-pct-${slug}`);
                const sizeSpan = document.getElementById(`ai-size-${slug}`);
                const cancelBtn = document.getElementById(`ai-cancel-btn-${slug}`);

                if (data.status === 'downloading') {
                    if (pctSpan) pctSpan.textContent = `${data.progress}%`;
                    if (sizeSpan && data.total_bytes) {
                        sizeSpan.textContent = `${formatBytes(data.downloaded_bytes)} / ${formatBytes(data.total_bytes)}`;
                    }
                } else if (data.status === 'completed') {
                    clearInterval(window[`ai_interval_${slug}`]);
                    delete window[`ai_interval_${slug}`];

                    if (!aiState.downloadedModels.includes(model)) {
                        aiState.downloadedModels.push(model);
                    }
                    aiState.selectedModel = model;
                    localStorage.setItem('doe-ai-model', model);

                    window.showToast(t('ai.toastReadyTitle'), t('ai.toastReadyMsg', model));

                    // Показываем плавающую кнопку ИИ
                    const fab = document.getElementById('ai-floating-btn');
                    if (fab) fab.classList.add('show');

                    if (document.getElementById('ai-settings-modal').classList.contains('show')) {
                        window.openAiSettingsModal(); // Перерисовываем UI
                    }
                } else if (data.status === 'error') {
                    clearInterval(window[`ai_interval_${slug}`]);
                    delete window[`ai_interval_${slug}`];

                    window.showToast(t('ai.toastErrTitle'), data.error || t('ai.toastErrUnknown'), true);
                    if (document.getElementById('ai-settings-modal').classList.contains('show')) {
                        window.openAiSettingsModal(); // Перерисовываем UI
                    }
                } else if (data.status === 'cancelled' || data.status === 'idle') {
                    clearInterval(window[`ai_interval_${slug}`]);
                    delete window[`ai_interval_${slug}`];

                    if (document.getElementById('ai-settings-modal').classList.contains('show')) {
                        window.openAiSettingsModal(); // Перерисовываем UI
                    }
                }
            }
        } catch (e) { console.error(e); }
    }, 1000);
}

window.openAiSettingsModal = async () => {
    if (!aiState.supported) {
        window.showToast(t('ai.toastUnsupportedTitle'), t('ai.toastUnsupportedMsg'), true);
        return;
    }

    // Автовосстановление прогресса и синхронизация списка моделей
    try {
        const statusRes = await fetch(`${API_BASE}/ai/status`);
        if (statusRes.ok) {
            const statusData = await statusRes.json();
            aiState.downloadedModels = statusData.downloaded_models || [];
            if (statusData.hardware) {
                aiState.hardwareTier = statusData.hardware.tier;
                aiState.ramGb = statusData.hardware.ram_gb;
            }
            if (statusData.models_info) aiState.modelsInfo = statusData.models_info;

            // === СИНХРОНИЗАЦИЯ ВЫБОРА ПРИ ОТКРЫТИИ НАСТРОЕК ===
            const downloaded = aiState.downloadedModels || [];
            const savedModel = localStorage.getItem('doe-ai-model');

            if (downloaded.length === 1) {
                aiState.selectedModel = downloaded[0];
                localStorage.setItem('doe-ai-model', downloaded[0]);
            } else if (downloaded.length >= 2) {
                if (savedModel && downloaded.includes(savedModel)) {
                    aiState.selectedModel = savedModel;
                } else if (!aiState.selectedModel || !downloaded.includes(aiState.selectedModel)) {
                    aiState.selectedModel = downloaded[0];
                    localStorage.setItem('doe-ai-model', downloaded[0]);
                }
            } else {
                aiState.selectedModel = null;
                localStorage.removeItem('doe-ai-model');
            }
            // ===========================================
        }
    } catch(e) {}

    // Для каждой модели проверяем, не идет ли фоновая загрузка прямо сейчас
    await Promise.all(aiState.availableModels.map(async (model) => {
        try {
            const pRes = await fetch(`${API_BASE}/ai/download-progress?model_name=${encodeURIComponent(model)}`);
            if (pRes.ok) {
                const pData = await pRes.json();
                if (pData.status === 'downloading') {
                    startAiDownloadPolling(model); // Восстанавливаем интервал в фоне
                }
            }
        } catch(e) {}
    }));

    const list = document.getElementById('ai-models-list');
    list.innerHTML = '';

    // Заголовок с характеристиками железа
    const tierLabels = { light: t('ai.tierLight'), standard: t('ai.tierStandard'), pro: t('ai.tierPro') };
    if (aiState.ramGb) {
        const hwDiv = document.createElement('div');
        hwDiv.className = 'ai-hardware-info';
        hwDiv.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 6px; padding: 8px 12px; margin-bottom: 8px; border-radius: 8px; background: var(--bg-secondary, rgba(128,128,128,0.08));';
        hwDiv.innerHTML = `<span style="color: var(--text-secondary); font-size: 12px;">${t('ai.hardwareRam')}: <b style="color: var(--text-primary);">${aiState.ramGb} ${t('ai.gbSuffix')}</b> · ${t('ai.hardwareTier')}: <b style="color: var(--text-primary);">${tierLabels[aiState.hardwareTier] || aiState.hardwareTier}</b></span>`;
        list.appendChild(hwDiv);
    }

    aiState.availableModels.forEach(model => {
        const info = aiState.modelsInfo[model] || {};
        const isDownloaded = aiState.downloadedModels.includes(model);
        const isSelected = aiState.selectedModel === model;
        const slug = modelSlug(model);
        const isPolling = !!window[`ai_interval_${slug}`];

        const div = document.createElement('div');
        div.className = `setting-row ${isSelected ? 'active' : ''}`;

        let controlsHtml = '';
        const trashIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        const closeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

        if (isDownloaded) {
            controlsHtml = `
                <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0; pointer-events: auto;">
                    <button class="icon-btn danger-icon ai-delete-btn" data-model="${escapeHtml(model)}" title="${t('ai.btnDeleteTitle')}" style="color: #D35446; width: 28px; height: 28px; margin: 0; z-index: 2;">
                        ${trashIcon}
                    </button>
                    <div class="setting-check" style="margin-left: 0; width: 16px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                </div>`;
        } else if (isPolling) {
            controlsHtml = `
                <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0; pointer-events: auto;">
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                        <span id="ai-pct-${slug}" style="font-size: 13px; font-weight: 700; color: var(--brand-pine); line-height: 1.2;">0%</span>
                        <span id="ai-size-${slug}" style="font-size: 11px; color: var(--text-secondary); font-family: var(--font-mono); line-height: 1.2; letter-spacing: -0.02em;">0 MB / 0 GB</span>
                    </div>
                    <button class="icon-btn danger-icon ai-cancel-btn" id="ai-cancel-btn-${slug}" data-model="${escapeHtml(model)}" title="${t('ai.btnCancelTitle')}" style="color: #D35446; width: 28px; height: 28px; margin: 0; z-index: 2; display: flex; align-items: center; justify-content: center;">
                        ${closeIcon}
                    </button>
                </div>
            `;
        } else {
            const sizeText = info.size_gb ? t('ai.btnDownloadSize', info.size_gb.toFixed(1)) : t('ai.btnDownload');
            controlsHtml = `
                <button class="confirm-btn cancel-btn ai-download-btn" data-model="${escapeHtml(model)}" style="padding: 6px 12px; font-size: 12px; flex: none; width: auto; font-weight: 600; z-index: 2; margin: 0;">${sizeText}</button>
            `;
        }

        // Описание модели: параметры + размер
        const descParts = [];
        if (info.params) descParts.push(info.params);
        if (info.size_gb) descParts.push(`${info.size_gb.toFixed(1)} ${t('ai.gbSuffix')}`);
        const descText = isDownloaded ? t('ai.statusInstalled') : (descParts.join(' · ') || t('ai.statusRequiresDownload'));

        div.innerHTML = `
            <div class="setting-text-box">
                <div class="setting-title">${escapeHtml(model)}</div>
                <div class="setting-desc">${descText}</div>
            </div>
            ${controlsHtml}
        `;
        
        // Вешаем событие на выбор модели (только если она скачана и неактивна)
        if (isDownloaded && !isSelected) {
            div.onclick = () => {
                aiState.selectedModel = model;
                localStorage.setItem('doe-ai-model', model);
                window.openAiSettingsModal();
            };
        }

        // Обработчик удаления
        const deleteBtn = div.querySelector('.ai-delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                
                const isConfirmed = await showConfirmModal(t('ai.confirmDeleteTitle'), t('ai.confirmDeleteMsg', model));
                if (!isConfirmed) return;

                deleteBtn.disabled = true;
                deleteBtn.style.opacity = '0.5';
                try {
                    const res = await fetch(`${API_BASE}/ai/delete`, {
                        method: 'DELETE', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({model_name: model})
                    });
                    if (res.ok) {
                        aiState.downloadedModels = aiState.downloadedModels.filter(m => m !== model);
                        if (aiState.selectedModel === model) {
                            aiState.selectedModel = null;
                            localStorage.removeItem('doe-ai-model');
                        }
                        window.showToast(t('ai.toastDeleted'), t('ai.toastDeletedMsg', model));
                        window.openAiSettingsModal();
                    } else {
                        throw new Error();
                    }
                } catch(err) {
                    window.showToast(t('alerts.error'), t('ai.toastDeleteErr'), true);
                    deleteBtn.disabled = false;
                    deleteBtn.style.opacity = '1';
                }
            };
        }

        // Клик по кнопке Скачать
        const downloadBtn = div.querySelector('.ai-download-btn');
        if (downloadBtn) {
            downloadBtn.onclick = async (e) => {
                e.stopPropagation();
                downloadBtn.textContent = t('ai.starting');
                downloadBtn.disabled = true;
                try {
                    const res = await fetch(`${API_BASE}/ai/download`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({model_name: model})
                    });
                    if (res.ok) {
                        startAiDownloadPolling(model);
                        window.openAiSettingsModal(); // Перерисовываем, чтобы показать кнопку отмены
                    } else {
                        throw new Error();
                    }
                } catch (err) {
                    downloadBtn.textContent = t('ai.errorText');
                    downloadBtn.disabled = false;
                }
            };
        }

        // Клик по кнопке Отмена
        const cancelBtn = div.querySelector('.ai-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = async (e) => {
                e.stopPropagation();
                cancelBtn.style.opacity = '0.5';
                cancelBtn.disabled = true;
                try {
                    const res = await fetch(`${API_BASE}/ai/cancel`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({model_name: model})
                    });
                    if (res.ok) {
                        window.showToast(t('ai.toastCancelTitle'), t('ai.toastCancelMsg', model));
                    }
                } catch (err) {
                    cancelBtn.style.opacity = '1';
                    cancelBtn.disabled = false;
                }
            };
        }
        
        list.appendChild(div);
    });


    document.getElementById('ai-settings-modal').classList.add('show');
};

function checkDailyJournal() {
    // Не открываем ИИ-панель, если расширение ИИ выключено
    const aiEnabled = document.getElementById('ext-toggle-ai')?.checked !== false;
    if (!aiEnabled) return;

    const today = new Date().toDateString();
    const lastCheck = localStorage.getItem('doe-ai-last-check');

    if (aiState.selectedModel && aiState.downloadedModels.includes(aiState.selectedModel)) {
        if (lastCheck !== today) {
            // Если доска загрузилась, показываем журнал
            if (state.columns.length > 0) {
                openDailyJournal();
            }
        }
    }
}

// Обработчик клика по плавающей кнопке
document.getElementById('ai-floating-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openDailyJournal();
});

function openDailyJournal() {
    // Защита: не открываем панель, если расширение ИИ выключено
    const aiEnabled = document.getElementById('ext-toggle-ai')?.checked !== false;
    if (!aiEnabled) return;

    // Если диалог пуст И ИИ прямо сейчас НЕ генерирует приветствие (защита от спама)
    if (aiState.chatHistory.length === 0 && !aiState.isTyping) {
        const chatBox = document.getElementById('ai-chat-history');
        chatBox.innerHTML = '';
        
        const greeting = "What to Doe today? ☕️";
        appendAiMessage(greeting);
    }
    
    document.getElementById('ai-journal-modal').classList.add('show');
    setTimeout(() => {
        document.getElementById('ai-chat-input').focus();
    }, 50);
}

function appendUserMessage(text) {
    const row = document.createElement('div');
    row.className = 'ai-msg-row';

    const bubble = document.createElement('div');
    bubble.className = 'ai-msg user';
    bubble.textContent = text;
    row.appendChild(bubble);

    // Футер: кнопки справа (для user-сообщений)
    const footer = document.createElement('div');
    footer.className = 'ai-msg-footer';
    footer.style.justifyContent = 'flex-end';
    footer.innerHTML = `<div class="ai-msg-actions"><button class="ai-act-btn" data-action="copy" title="Копировать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="ai-act-btn" data-action="edit" title="Редактировать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg></button><button class="ai-act-btn danger" data-action="delete" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div>`;
    row.appendChild(footer);

    document.getElementById('ai-chat-history').appendChild(row);
    row.scrollIntoView({behavior: 'smooth'});
    aiState.chatHistory.push({role: "user", content: text});
}

function appendAiMessage(text, elapsedMs) {
    const div = document.createElement('div');
    div.className = 'ai-msg ai';
    
    // --- ФОЛБЭК ДЛЯ ЛОКАЛЬНЫХ LLM (ПОДГОТОВКА) ---
    // Если ИИ забыл сделать Markdown-ссылку и написал "Задача ID:26 'Название'",
    // мы конвертируем это в сырой Markdown
    // Модель может поставить пробел между ] и ( — чиним перед парсингом
    let safeText = text.replace(/\]\s+\(doe:\/\/task\//gi, '](doe://task/');
    safeText = safeText.replace(/(?:Задача|Task|Карточка|Карточку)\s*(?:ID:?|#)?\s*(\d+)(?:\s*['"«](.*?)['"»])?/gi, (match, id, title) => {
        const linkText = title ? title : t('ai.taskRef', id);
        return `[${linkText}](doe://task/${id})`;
    });

    // --- СИСТЕМА АВТОРЕМОНТА ССЫЛОК (LINK REPAIR SYSTEM) ---
    // Из-за ограничений контекста ИИ может привязать разные задачи к одному ID или вписать маркер списка внутрь ссылки.
    // Мы находим все ссылки [Название](doe://task/ID), очищаем текст от маркеров списков,
    // ищем реальную задачу с таким названием (или его частью) на доске и подставляем её настоящий ID.
    safeText = safeText.replace(/\[(.*?)\]\(doe:\/\/task\/(\d+)\)/gi, (match, title, id) => {
        // Очищаем текст ссылки от маркеров списков: "1. Задача" -> "Задача", "- Задача" -> "Задача"
        const cleanTitle = title.trim().toLowerCase().replace(/^(?:\d+[\.)]\s*|[-•*]\s*)/, '').trim();
        let realId = id;
        let foundTask = null;
        
        // Этап 1: Ищем точное совпадение названий (без учета маркеров списков)
        for (const col of state.columns) {
            foundTask = col.tasks.find(t => {
                const boardTitle = t.title.trim().toLowerCase().replace(/^(?:\d+[\.)]\s*|[-•*]\s*)/, '').trim();
                return boardTitle === cleanTitle;
            });
            if (foundTask) break;
        }
        
        // Этап 2: Если точное совпадение не найдено, делаем нестрогий поиск по взаимному вхождению
        if (!foundTask && cleanTitle.length > 3) {
            for (const col of state.columns) {
                foundTask = col.tasks.find(t => {
                    const boardTitle = t.title.trim().toLowerCase().replace(/^(?:\d+[\.)]\s*|[-•*]\s*)/, '').trim();
                    return boardTitle.includes(cleanTitle) || cleanTitle.includes(boardTitle);
                });
                if (foundTask) break;
            }
        }
        
        if (foundTask) {
            realId = foundTask.id;
        }
        return `[${title}](doe://task/${realId})`;
    });
    // --------------------------------------------------------

    // Используем наш нативный парсер, чтобы рендерить жирный текст, списки и ссылки!
    div.innerHTML = parseMarkdownWithMath(safeText);

    // Оборачиваем в .ai-msg-row ДО вставки в DOM (без flicker)
    const row = document.createElement('div');
    row.className = 'ai-msg-row';
    row.appendChild(div);

    // Панель действий + время ответа в одной строке
    const footer = document.createElement('div');
    footer.className = 'ai-msg-footer';
    footer.innerHTML = `<div class="ai-msg-actions"><button class="ai-act-btn" data-action="copy" title="Копировать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="ai-act-btn danger" data-action="delete" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div>`;
    if (elapsedMs) {
        const s = (elapsedMs / 1000).toFixed(1);
        const unit = (typeof currentLang !== 'undefined' ? currentLang : 'ru') === 'ru' ? 'с' : 's';
        footer.innerHTML += `<div class="ai-msg-time"><svg class="ai-timer-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${s}${unit}</div>`;
    }
    row.appendChild(footer);

    document.getElementById('ai-chat-history').appendChild(row);
    div.scrollIntoView({behavior: 'smooth'});
    aiState.chatHistory.push({role: "assistant", content: text}); // В историю пушим оригинал
}

// Панель действий под сообщениями (edit — только user, copy/delete — все)
document.getElementById('ai-chat-history')?.addEventListener('click', (e) => {
    const actBtn = e.target.closest('.ai-act-btn');
    if (!actBtn) return;
    const action = actBtn.dataset.action;

    const row = actBtn.closest('.ai-msg-row');
    if (!row) return;
    const msgDiv = row.querySelector('.ai-msg');
    if (!msgDiv) return;

    // Индекс среди всех .ai-msg-rows (не .ai-msg — typing-indicator тоже .ai-msg!)
    const allRows = Array.from(document.getElementById('ai-chat-history').querySelectorAll('.ai-msg-row'));
    const idx = allRows.indexOf(row);

    if (action === 'copy') {
        // В режиме редактирования — только текст из поля, не кнопки
        const editArea = msgDiv.querySelector('.ai-msg-edit');
        let text;
        if (editArea) {
            text = editArea.querySelector('.ai-edit-textarea').value.trim();
        } else {
            // Клонируем и вырезаем кнопки действий (Отмена/Разрешить), чтобы не копировались
            const clone = msgDiv.cloneNode(true);
            const actionBtns = clone.querySelector('.ai-actions-btns');
            if (actionBtns) actionBtns.remove();
            text = clone.textContent.trim();
        }
        if (text) {
            navigator.clipboard.writeText(text).catch(() => {});
            actBtn.style.color = 'var(--success-done)';
            setTimeout(() => { actBtn.style.color = ''; }, 800);
        }
        return;
    }

    if (action === 'delete') {
        row.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        row.style.opacity = '0';
        row.style.transform = 'scaleY(0.8)';
        row.style.pointerEvents = 'none';
        row.style.transformOrigin = 'top';
        setTimeout(() => row.remove(), 220);
        if (idx !== -1 && idx < aiState.chatHistory.length) {
            aiState.chatHistory.splice(idx, 1);
        }
        return;
    }

    if (action === 'edit') {
        if (idx === -1 || idx >= aiState.chatHistory.length) return;

        // Останавливаем текущую генерацию, если ИИ печатает
        if (aiAbortController) {
            aiAbortController.abort();
            aiAbortController = null;
        }
        if (aiState.isTyping) {
            aiState.isTyping = false;
            setAiBtnState(false);
            const typingEl = document.querySelector('.typing-indicator');
            if (typingEl) typingEl.remove();
        }

        const entry = aiState.chatHistory[idx];
        const origText = entry.content;

        // Заменяем содержимое bubble на поле редактирования
        const editArea = document.createElement('div');
        editArea.className = 'ai-msg-edit';
        editArea.innerHTML = `<textarea class="ai-edit-textarea" rows="3">${escapeHtml(origText)}</textarea><div class="ai-edit-btns"><button class="ai-edit-cancel" title="Отмена"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><button class="ai-edit-send" title="Отправить"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button></div>`;
        msgDiv.innerHTML = '';
        msgDiv.appendChild(editArea);

        const textarea = editArea.querySelector('.ai-edit-textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        // Авто-рост
        const autoGrow = () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.max(44, textarea.scrollHeight) + 'px';
        };
        textarea.addEventListener('input', autoGrow);
        autoGrow();

        // Enter = отправить, Shift+Enter = перенос строки
        textarea.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter' && !ke.shiftKey) {
                ke.preventDefault();
                editArea.querySelector('.ai-edit-send').click();
            }
        });

        // Отмена — восстанавливаем исходный текст
        editArea.querySelector('.ai-edit-cancel').onclick = () => {
            msgDiv.innerHTML = entry.role === 'assistant'
                ? parseMarkdownWithMath(origText)
                : escapeHtml(origText);
        };

        // Отправить (как в AI Studio: обрезает историю ниже, отправляет заново)
        editArea.querySelector('.ai-edit-send').onclick = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;

            // Обрезаем историю до этого сообщения включительно (с новым текстом)
            const role = entry.role;
            aiState.chatHistory = aiState.chatHistory.slice(0, idx);
            aiState.chatHistory.push({role, content: newText});

            // Убираем все DOM-строки после текущей (пересчитываем на момент отправки)
            const liveRows = Array.from(document.getElementById('ai-chat-history').querySelectorAll('.ai-msg-row'));
            const curIdx = liveRows.indexOf(row);
            if (curIdx !== -1) {
                liveRows.slice(curIdx + 1).forEach(r => r.remove());
            }

            // Обновляем текущий bubble
            msgDiv.innerHTML = role === 'assistant'
                ? parseMarkdownWithMath(newText)
                : escapeHtml(newText);

            // Отправляем запрос на продолжение
            aiState.isTyping = true;
            setAiBtnState(true);
            const typingEl = showAiTyping();
            aiAbortController = new AbortController();

            const aiStart = Date.now();
            try {
                const res = await fetch(`${API_BASE}/ai/chat`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({model_name: aiState.selectedModel, messages: aiState.chatHistory}),
                    signal: aiAbortController.signal
                });
                if (!res.ok) throw new Error("Backend error");
                const data = await res.json();
                if (typingEl._timerStop) typingEl._timerStop();
                typingEl.remove();
                if (data.reply) appendAiMessage(data.reply, Date.now() - aiStart);
                if (data.proposed_actions && data.proposed_actions.length > 0) appendAiActions(data.proposed_actions);
            } catch (err) {
                if (err.name !== 'AbortError') { if (typingEl._timerStop) typingEl._timerStop(); typingEl.remove(); }
            } finally {
                aiAbortController = null;
                aiState.isTyping = false;
                setAiBtnState(false);
            }
        };
        return;
    }
});

// Глобальный перехватчик кликов по сгенерированным ссылкам внутри чата
document.getElementById('ai-chat-history')?.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && href.startsWith('doe://task/')) {
            const targetTaskId = parseInt(href.split('/').pop());
            fetch(`${API_BASE}/tasks/${targetTaskId}/context`)
                .then(res => res.json())
                .then(context => {
                    document.getElementById('ai-journal-modal').classList.remove('show');
                    window.navigateToEntityGlobal(context.workspace_id, context.column_id, targetTaskId, null, true, true);
                })
                .catch(err => console.error(err));
        }
    }
});

function showAiTyping() {
    const div = document.createElement('div');
    div.className = 'ai-msg ai typing-indicator';
    div.innerHTML = `<div class="ai-loading-dots"><span></span><span></span><span></span></div><div class="ai-typing-time"><svg class="ai-timer-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> 0.0s</div>`;
    document.getElementById('ai-chat-history').appendChild(div);
    div.scrollIntoView({behavior: 'smooth'});

    // Живой таймер (60 fps)
    const start = Date.now();
    const timeEl = div.querySelector('.ai-typing-time');
    let _raf;
    const _tick = () => {
        const s = ((Date.now() - start) / 1000).toFixed(1);
        const unit = (typeof currentLang !== 'undefined' ? currentLang : 'ru') === 'ru' ? 'с' : 's';
        timeEl.innerHTML = `<svg class="ai-timer-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${s}${unit}`;
        _raf = requestAnimationFrame(_tick);
    };
    _raf = requestAnimationFrame(_tick);
    div._timerStop = () => { cancelAnimationFrame(_raf); };

    return div;
}

function appendAiActions(actions) {
    const div = document.createElement('div');
    div.className = 'ai-msg ai ai-actions-box';

    // Хелперы для получения имён по ID из текущего состояния
    const taskName = (id) => {
        for (const col of state.columns) {
            const t = col.tasks?.find(t => t.id === id);
            if (t) return t.title;
        }
        return `#${id}`;
    };
    const colName = (id) => {
        const c = state.columns.find(c => c.id === id);
        return c ? c.title : `#${id}`;
    };
    const wsName = (id) => {
        const w = state.workspaces.find(w => w.id === id);
        return w ? w.name : `#${id}`;
    };

    let html = `<div style="font-weight: 600; margin-bottom: 8px;">${t('ai.actionsHeader')}</div>`;
    actions.forEach(a => {
        const p = a.params || {};
        let text = a.action;
        if (a.action === 'create_task') text = t('ai.actionCreateTask', p.title ?? '—', colName(p.column_id));
        else if (a.action === 'move_task') text = t('ai.actionMoveTask', taskName(p.task_id), colName(p.target_column_id));
        else if (a.action === 'delete_task') text = t('ai.actionDeleteTask', taskName(p.task_id));
        else if (a.action === 'create_column') text = t('ai.actionCreateColumn', p.title ?? '—');
        else if (a.action === 'delete_column') text = t('ai.actionDeleteColumn', colName(p.column_id));
        else if (a.action === 'create_workspace') text = t('ai.actionCreateWorkspace', p.name ?? '—');
        else if (a.action === 'set_theme') text = t('ai.actionSetTheme', p.theme ?? '—');
        else if (a.action === 'toggle_extension') text = (p.state ? t('ai.actionToggleExtOn', p.ext_name ?? '—') : t('ai.actionToggleExtOff', p.ext_name ?? '—'));
        else if (a.action === 'prioritize_all') text = t('ai.actionPrioritizeAll');
        else if (a.action === 'clear_all_priorities') text = t('ai.actionClearAllPriorities');
        else if (a.action === 'remember_fact') text = t('ai.actionRememberFact', p.fact ?? '—');
        else if (a.action === 'forget_fact') text = t('ai.actionForgetFact', p.fact ?? '—');
        else if (a.action === 'change_language') text = t('ai.actionChangeLang', p.language ?? '—');
        else if (a.action === 'switch_workspace') text = t('ai.actionSwitchWorkspace', wsName(p.workspace_id));
        else if (a.action === 'open_task') text = t('ai.actionOpenTask', taskName(p.task_id));
        else if (a.action === 'update_task') text = t('ai.actionUpdateTask', taskName(p.task_id));
        else if (a.action === 'clear_chat_context') text = t('ai.actionClearChat');
        else if (a.action === 'set_reminders') text = t('ai.actionSetReminders', p.reminders?.length ?? 0);
        else if (a.action === 'delete_reminder') text = t('ai.actionDeleteReminder', p.reminder_id ?? '—');
        else if (a.action === 'search_board') text = t('ai.actionSearchBoard', p.query ?? '—');
        else if (a.action === 'get_task_details') text = t('ai.actionGetTaskDetails', taskName(p.task_id));
        html += `<div class="ai-action-item">- ${escapeHtml(text)}</div>`;
    });
    
    html += `
        <div class="ai-actions-btns">
            <button class="ai-btn-cancel">${t('cancel')}</button>
            <button class="ai-btn-confirm">${t('ai.btnConfirm')}</button>
        </div>
    `;
    div.innerHTML = html;
    
    const cancelBtn = div.querySelector('.ai-btn-cancel');
    const confirmBtn = div.querySelector('.ai-btn-confirm');
    
    cancelBtn.onclick = () => {
        div.innerHTML = `<div style="opacity: 0.6; font-style: italic;">${t('ai.actionsCancelled')}</div>`;
    };
    
    confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.textContent = "Выполняю...";
        
        try {
            const res = await fetch(`${API_BASE}/ai/execute`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    actions: actions,
                    model_name: aiState.selectedModel
                })
            });
            const data = await res.json();

            // Различаем три исхода: всё ОК / часть упала / всё упало.
            const failed = Array.isArray(data.failed_actions) ? data.failed_actions : [];
            if (data.success && failed.length === 0) {
                div.innerHTML = `<div style="color: var(--brand-pine); font-weight: 600;">${t('ai.actionsExecuted')}</div>`;
            } else if (data.actions_executed && failed.length > 0) {
                // Частичный успех: что-то выполнилось, что-то нет.
                const failList = failed.map(f => `<div class="ai-action-item">— ${escapeHtml(f.action)}: ${escapeHtml(f.reason || '')}</div>`).join('');
                div.innerHTML = `<div style="color: var(--brand-pine); font-weight: 600;">${t('ai.actionsPartial')}</div>${failList}`;
            } else {
                const failList = failed.map(f => `<div class="ai-action-item">— ${escapeHtml(f.action)}: ${escapeHtml(f.reason || '')}</div>`).join('');
                div.innerHTML = `<div style="color: #D35446; font-weight: 600;">${t('ai.actionsError')}</div>${failList}`;
            }

            if (data.actions_executed) refreshBoard();
            if (data.open_task_id) {
                loadTaskIntoModal(data.open_task_id, true);
                document.getElementById('task-modal').classList.add('show');
            }
            if (data.clear_chat) {
                aiState.chatHistory = [];
                openDailyJournal(); // Перерисует чат с чистого листа
            }
            // Обновляем колокольчик, если ИИ ставил или удалял напоминания
            if (actions.some(act => act.action === 'set_reminders' || act.action === 'delete_reminder')) {
                updateBellBadge();
            }
            if (data.settings_changed) {
                fetchSettings().then(d => {
                    window.applyExtensionsUI(d.extensions);
                    if (d.theme) {
                        if (document.startViewTransition) {
                            document.startViewTransition(() => applyTheme(d.theme, false));
                        } else {
                            applyTheme(d.theme, false);
                        }
                    }
                });
            }
        } catch(e) {
            div.innerHTML = `<div style="color: #D35446; font-weight: 600;">${t('ai.actionsError')}</div>`;
        }
    };
    
    // Оборачиваем в .ai-msg-row + кнопки снизу
    const row = document.createElement('div');
    row.className = 'ai-msg-row';
    row.appendChild(div);
    const actionsBar = document.createElement('div');
    const footer = document.createElement('div');
    footer.className = 'ai-msg-footer';
    footer.innerHTML = `<div class="ai-msg-actions"><button class="ai-act-btn" data-action="copy" title="Копировать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="ai-act-btn danger" data-action="delete" title="Удалить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div>`;
    row.appendChild(footer);
    document.getElementById('ai-chat-history').appendChild(row);
    row.scrollIntoView({behavior: 'smooth'});
}

let aiAbortController = null;

function setAiBtnState(typing) {
    const btn = document.getElementById('ai-send-btn');
    if (!btn) return;
    const sendIcon = btn.querySelector('.ai-icon-send');
    const stopIcon = btn.querySelector('.ai-icon-stop');
    if (typing) {
        btn.classList.add('stop');
        if (sendIcon) sendIcon.style.display = 'none';
        if (stopIcon) stopIcon.style.display = '';
    } else {
        btn.classList.remove('stop');
        if (sendIcon) sendIcon.style.display = '';
        if (stopIcon) stopIcon.style.display = 'none';
    }
}

document.getElementById('ai-send-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('ai-chat-input');

    // Стоп: отменяем текущую генерацию
    if (aiState.isTyping) {
        if (aiAbortController) {
            aiAbortController.abort();
            aiAbortController = null;
        }
        aiState.isTyping = false;
        setAiBtnState(false);
        const typingEl = document.querySelector('.typing-indicator');
        if (typingEl) {
            if (typingEl._timerStop) typingEl._timerStop();
            typingEl.remove();
        }
        return;
    }

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = '';
    appendUserMessage(text);
    
    aiState.isTyping = true;
    setAiBtnState(true);
    const typingEl = showAiTyping();
    
    aiAbortController = new AbortController();

    const aiStart2 = Date.now();
    try {
        const res = await fetch(`${API_BASE}/ai/chat`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                model_name: aiState.selectedModel,
                messages: aiState.chatHistory
            }),
            signal: aiAbortController.signal
        });
        if (!res.ok) throw new Error("Backend error");
        
        const data = await res.json();
        if (typingEl._timerStop) typingEl._timerStop();
        typingEl.remove();
        
        if (data.reply) {
            appendAiMessage(data.reply, Date.now() - aiStart2);
        }
        
        if (data.proposed_actions && data.proposed_actions.length > 0) {
            appendAiActions(data.proposed_actions);
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            // Пользователь сам остановил — просто убираем индикатор
        } else {
            typingEl.remove();
            
            const div = document.createElement('div');
            div.className = 'ai-msg ai';
            div.style.color = '#D35446';
            div.style.background = 'rgba(211, 84, 70, 0.1)';
            div.textContent = "Произошла техническая заминка. Пожалуйста, отправьте сообщение еще раз.";
            document.getElementById('ai-chat-history').appendChild(div);
            div.scrollIntoView({behavior: 'smooth'});
            
            aiState.chatHistory.pop(); 
            input.value = text;
        }
    } finally {
        aiAbortController = null;
        aiState.isTyping = false;
        setAiBtnState(false);
        input.focus();
    }
});

// Авто-ресайз поля ввода в ИИ-чате
const aiChatInput = document.getElementById('ai-chat-input');
if (aiChatInput) {
    aiChatInput.addEventListener('input', function() {
        this.style.height = '22px'; // Сброс для пересчета
        this.style.height = (this.scrollHeight) + 'px';
    });
}

document.getElementById('ai-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('ai-send-btn').click();
    }
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
            const notificationMsg = currentLang === 'ru' 
                ? `Вы просили напомнить о карточке: "${taskTitle}"` 
                : `Reminder for card: "${taskTitle}"`;

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

    // Ищем текущий приоритет и данные ползунков
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

    // Элементы управления
    const els = {
        c: { r: document.getElementById('prio-slider-c'), n: document.getElementById('prio-val-c') },
        d: { r: document.getElementById('prio-slider-d'), n: document.getElementById('prio-val-d') },
        a: { r: document.getElementById('prio-slider-a'), n: document.getElementById('prio-val-a') },
        b: { r: document.getElementById('prio-slider-b'), n: document.getElementById('prio-val-b') },
        e: { r: document.getElementById('prio-slider-e'), n: document.getElementById('prio-val-e') },
        f: document.getElementById('prio-val-f'), // Скрытый инпут для отчётности F
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
        return Math.round(finalScore * 10) / 10; // Округляем до 1 знака
    };

    const updateFromSliders = () => {
        if (!isManualTotal) {
            els.total.value = fmtPrio(calcFormula());
        }
    };

    // Привязка событий для ползунков и полей ввода (C, D, A, B, E, P, S, H)
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

    // Если данные сохранены — восстанавливаем
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
        // Сброс на дефолты (5 для базовых, 0 для новых)
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

    // Привязка событий к segmented control (F)
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
    
    // Пересоздаем кнопки чтобы убить старые слушатели
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
            if (updatedColId) await syncColumnDOM(updatedColId); // Триггер анимации перестроения
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
            if (updatedColId) await syncColumnDOM(updatedColId); // Триггер анимации
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

function openDueDateModal(taskId, currentDueDate) {
    const modal = document.getElementById('due-date-modal');
    modal.dataset.taskId = taskId;
    
    if (currentDueDate) {
        const dateStr = currentDueDate + (currentDueDate.endsWith('Z') || currentDueDate.includes('+') ? '' : 'Z');
        dpSelectedDate = new Date(dateStr);
    } else {
        dpSelectedDate = new Date();
        dpSelectedDate.setMinutes(dpSelectedDate.getMinutes() + 1);
        dpSelectedDate.setSeconds(0);
        dpSelectedDate.setMilliseconds(0);
    }
    dpCurrentDate = new Date(dpSelectedDate);
    
    document.getElementById('dp-hour').value = dpSelectedDate.getHours().toString().padStart(2, '0');
    document.getElementById('dp-minute').value = dpSelectedDate.getMinutes().toString().padStart(2, '0');
    
    activeDatePickerTrigger = document.getElementById('due-datepicker-trigger');
    const trigger = activeDatePickerTrigger;
    
    trigger.onclick = (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        
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

    renderDatePicker();
    updateDatePickerTrigger();

    const confirmBtn = document.getElementById('btn-confirm-due-date');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirmBtn);
    
    newConfirmBtn.onclick = async () => {
        newConfirmBtn.style.opacity = '0.5';
        newConfirmBtn.disabled = true;
        try {
            const isoString = dpSelectedDate.toISOString();
            await updateTask(taskId, { due_date: isoString });
            
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
                    t.due_date = isoString;
                    updatedColId = col.id;
                    const cardEl = document.querySelector(`.card[data-card-id="${taskId}"]`);
                    if (cardEl) updateCardAppearance(cardEl, t, col.mode);
                    break;
                }
            }
            
            if (updatedColId) await syncColumnDOM(updatedColId); // Триггер анимации
            
            loadTaskIntoModal(taskId, false);
            modal.classList.remove('show');
        } catch (e) {
            window.showToast(t('alerts.error'), 'Не удалось установить срок', true);
        } finally {
            newConfirmBtn.style.opacity = '1';
            newConfirmBtn.disabled = false;
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

function parseMarkdownWithMath(text) {
    if (!text) return "";
    const mathBlocks = [];
    const codeBlocks = [];
    
    let processed = text.replace(/(```[\s\S]*?```|`[^`]*`)/g, (match) => {
        codeBlocks.push(match);
        return `DOECODEPLACEHOLDER${codeBlocks.length - 1}END`;
    });

    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
        mathBlocks.push({ math, displayMode: true });
        return `DOEMATHPLACEHOLDER${mathBlocks.length - 1}END`;
    });

    processed = processed.replace(/\$([^$\n]+?)\$/g, (match, math) => {
        mathBlocks.push({ math, displayMode: false });
        return `DOEMATHPLACEHOLDER${mathBlocks.length - 1}END`;
    });

    processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{(\d+)\s*,\s*(\d+)\})?/g, (match, alt, url, w, h) => {
        const ext = url.split('.').pop().toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
        
        if (!isImage) {
            return `[${alt}](${url})`;
        }

        const safeMatch = escapeHtml(match);
        let style = '';
        let customClass = '';
        
        if (w && h) {
            style = `width: ${w}px; height: ${h}px;`;
            customClass = 'has-custom-size';
        }

        return `<span class="image-resizer-wrapper ${customClass}" style="${style}" data-md="${safeMatch}"><img src="/${url}" alt="${alt}" draggable="false"><span class="image-resize-handle" title="Потяните для изменения размера"></span></span>`;
    });

    codeBlocks.forEach((code, i) => {
        processed = processed.replace(`DOECODEPLACEHOLDER${i}END`, () => code);
    });

    let html = marked.parse(processed, { breaks: true });

    if (window.katex) {
        mathBlocks.forEach((item, i) => {
            try {
                const rendered = katex.renderToString(item.math, {
                    displayMode: item.displayMode,
                    throwOnError: false,
                    output: 'html',
                    strict: false
                });
                html = html.replace(`DOEMATHPLACEHOLDER${i}END`, () => rendered);
            } catch (e) {
                html = html.replace(`DOEMATHPLACEHOLDER${i}END`, () => `<code>${item.math}</code>`);
            }
        });
    } else {
        mathBlocks.forEach((item, i) => {
            html = html.replace(`DOEMATHPLACEHOLDER${i}END`, () => `<code>${item.math}</code>`);
        });
    }

    return html;
}

function initLocalSearchLogic() {
    const widget = document.getElementById('local-search-widget');
    const input = document.getElementById('local-search-input');
    const countEl = document.getElementById('local-search-count');
    const btnNext = document.getElementById('local-search-next');
    const btnPrev = document.getElementById('local-search-prev');
    const btnClose = document.getElementById('local-search-close');
    const renderDiv = document.getElementById('task-desc-render');
    const scrollParent = document.querySelector('.task-detail-body');

    // Режим чтения
    let matchRanges = [];
    let cachedTextNodes = null;
    
    // Режим редактирования
    let cmMatches = [];
    let cmMarkers = [];
    let cmActiveMarker = null;

    let currentMatchIndex = -1;
    let searchId = 0;
    let searchDebounce = null;

    const isEditMode = () => {
        return !!(cmEditor && cmEditor.getWrapperElement().style.display !== 'none');
    };

    window.openLocalSearch = () => {
        widget.classList.add('show');
        setTimeout(() => { input.focus(); input.select(); }, 50);
        
        if (isEditMode()) {
            cachedTextNodes = null;
        } else {
            cachedTextNodes = [];
            const walker = document.createTreeWalker(renderDiv, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                const text = node.nodeValue.toLowerCase();
                if (text.trim()) {
                    cachedTextNodes.push({ node, text });
                }
            }
        }

        if (input.value.trim()) performLocalSearch(input.value);
    };

    window.closeLocalSearch = () => {
        widget.classList.remove('show');
        clearLocalSearch();
        input.value = '';
        cachedTextNodes = null;
        searchId++;
        if (isEditMode() && cmEditor) {
            cmEditor.focus();
        }
    };

    function clearLocalSearch() {
        if (CSS.highlights) {
            CSS.highlights.clear();
        }
        matchRanges = [];
        
        if (cmEditor) {
            cmEditor.operation(() => {
                cmMarkers.forEach(m => m.clear());
                if (cmActiveMarker) {
                    cmActiveMarker.clear();
                    cmActiveMarker = null;
                }
            });
        }
        cmMatches = [];
        cmMarkers = [];
        
        currentMatchIndex = -1;
        countEl.textContent = '0/0';
    }

    function performLocalSearch(query) {
        clearLocalSearch();
        const textLower = query.trim().toLowerCase();
        if (!textLower) return;

        const currentSearchId = ++searchId;

        if (isEditMode()) {
            // Быстрый синхронный поиск внутри CodeMirror API
            cmEditor.operation(() => {
                const lineCount = cmEditor.lineCount();
                for (let line = 0; line < lineCount; line++) {
                    const text = cmEditor.getLine(line).toLowerCase();
                    let pos = 0;
                    while ((pos = text.indexOf(textLower, pos)) !== -1) {
                        const from = { line, ch: pos };
                        const to = { line, ch: pos + textLower.length };
                        cmMatches.push({ from, to });
                        
                        const marker = cmEditor.markText(from, to, { className: 'local-search-highlight' });
                        cmMarkers.push(marker);
                        
                        pos += textLower.length;
                    }
                }
            });

            if (cmMatches.length > 0) {
                currentMatchIndex = 0;
                updateLocalSearchUI();
            } else {
                countEl.textContent = '0/0';
            }
        } else {
            // Поиск во вьювере Markdown (DOM)
            if (!renderDiv.textContent.toLowerCase().includes(textLower)) {
                countEl.textContent = '0/0';
                return;
            }

            function searchNextChunk(startIndex) {
                if (currentSearchId !== searchId) return;
                
                const startTime = performance.now();
                let i = startIndex;
                
                for (; i < cachedTextNodes.length; i++) {
                    if (performance.now() - startTime > 12) break;
                    
                    const item = cachedTextNodes[i];
                    if (!item.text.includes(textLower)) continue;
                    
                    let pos = 0;
                    while ((pos = item.text.indexOf(textLower, pos)) !== -1) {
                        const range = new Range();
                        range.setStart(item.node, pos);
                        range.setEnd(item.node, pos + query.length);
                        matchRanges.push(range);
                        pos += query.length;
                    }
                    
                    if (matchRanges.length >= 10000) break;
                }

                if (i < cachedTextNodes.length && matchRanges.length < 10000) {
                    requestAnimationFrame(() => searchNextChunk(i));
                } else {
                    if (matchRanges.length > 0) {
                        currentMatchIndex = 0;
                        if (CSS.highlights) {
                            CSS.highlights.set('local-search', new Highlight(...matchRanges));
                        }
                        updateLocalSearchUI();
                        
                        if (matchRanges.length >= 10000) {
                            countEl.textContent = `1/10000+`;
                        }
                    } else {
                        countEl.textContent = '0/0';
                    }
                }
            }
            requestAnimationFrame(() => searchNextChunk(0));
        }
    }

    function updateLocalSearchUI() {
        if (isEditMode()) {
            if (cmActiveMarker) {
                cmActiveMarker.clear();
                cmActiveMarker = null;
            }
            if (cmMatches.length === 0 || currentMatchIndex < 0) return;

            const activeMatch = cmMatches[currentMatchIndex];
            cmActiveMarker = cmEditor.markText(activeMatch.from, activeMatch.to, { className: 'local-search-highlight active' });
            
            cmEditor.scrollIntoView(activeMatch.from, 150);
            countEl.textContent = `${currentMatchIndex + 1}/${cmMatches.length}`;
        } else {
            if (matchRanges.length === 0 || currentMatchIndex < 0) return;

            const activeRange = matchRanges[currentMatchIndex];

            if (CSS.highlights) {
                const highlightActive = new Highlight(activeRange);
                CSS.highlights.set('local-search-active', highlightActive);
            }

            let block = activeRange.startContainer.parentElement;
            while (block && block !== renderDiv) {
                if (block.classList.contains('is-hidden-by-fold')) {
                    let prev = block.previousElementSibling;
                    while (prev) {
                        if (prev.classList.contains('foldable-heading') && prev.classList.contains('is-folded')) {
                            prev.click(); 
                        }
                        prev = prev.previousElementSibling;
                    }
                }
                block = block.parentElement;
            }

            requestAnimationFrame(() => {
                const innerScroll = renderDiv;
                const outerScroll = scrollParent;
                const descWrapper = document.querySelector('.description-wrapper');

                let rangeRect = activeRange.getBoundingClientRect();

                if (rangeRect.top === 0 || rangeRect.height === 0) {
                    const parentEl = activeRange.startContainer.parentElement;
                    if (parentEl) {
                        rangeRect = parentEl.getBoundingClientRect();
                    }
                }

                if (rangeRect.top === 0) return;

                if (innerScroll) {
                    const innerRect = innerScroll.getBoundingClientRect();
                    const relativeTop = rangeRect.top - innerRect.top + innerScroll.scrollTop;
                    innerScroll.scrollTo({
                        top: relativeTop - (innerRect.height / 2),
                        behavior: 'auto'
                    });
                }

                if (outerScroll && descWrapper) {
                    const wrapperRect = descWrapper.getBoundingClientRect();
                    const outerRect = outerScroll.getBoundingClientRect();

                    if (wrapperRect.top < outerRect.top + 16 || wrapperRect.bottom > outerRect.bottom - 16) {
                        const relativeWrapperTop = wrapperRect.top - outerRect.top + outerScroll.scrollTop;
                        outerScroll.scrollTo({
                            top: relativeWrapperTop - 16,
                            behavior: 'auto'
                        });
                    }
                }
            });

            if (matchRanges.length < 10000) {
                countEl.textContent = `${currentMatchIndex + 1}/${matchRanges.length}`;
            }
        }
    }

    function nextMatch() {
        const length = isEditMode() ? cmMatches.length : matchRanges.length;
        if (length === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % length;
        updateLocalSearchUI();
    }

    function prevMatch() {
        const length = isEditMode() ? cmMatches.length : matchRanges.length;
        if (length === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + length) % length;
        updateLocalSearchUI();
    }

    input.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => performLocalSearch(input.value), 120);
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prevMatch() : nextMatch(); }
        if (e.key === 'Escape') { e.preventDefault(); window.closeLocalSearch(); }
    });
    
    btnNext.addEventListener('click', nextMatch);
    btnPrev.addEventListener('click', prevMatch);
    btnClose.addEventListener('click', window.closeLocalSearch);
}

initTaskDescriptionLogic();
initLocalSearchLogic();

const G = {
    nodes: [], edges: [], nodeMap: {},
    scale: 1, offsetX: 0, offsetY: 0,
    W: 0, H: 0, dpr: 1,
    hoverNode: null, dragNode: null, isPanning: false,
    mouseDownPos: null, lastX: 0, lastY: 0,
    running: false,
    showArrows: false,
    repulsionForce: 9000,
    nodeAt: null, graphNodeRadius: null
};

function resizeGraphCanvas() {
    const canvas = document.getElementById('graph-canvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    G.W = rect.width;
    G.H = rect.height;
    G.dpr = dpr;
}

function initGraphModal() {
    const canvas = document.getElementById('graph-canvas');
    const modal = document.getElementById('graph-modal');
    const tooltip = document.getElementById('graph-tooltip');
    if (!canvas || !modal || !tooltip) return;
    const tooltipInner = tooltip.querySelector('.tooltip-inner');

    function screenToWorld(mx, my) {
        return { x: (mx - G.offsetX) / G.scale, y: (my - G.offsetY) / G.scale };
    }
    function graphNodeRadius(n) {
        return 5 + Math.min(n.degree || 0, 12) * 1.6;
    }
    function nodeAt(mx, my) {
        const w = screenToWorld(mx, my);
        for (let i = G.nodes.length - 1; i >= 0; i--) {
            const n = G.nodes[i];
            const r = graphNodeRadius(n) + 4 / G.scale;
            const dx = n.x - w.x, dy = n.y - w.y;
            if (dx * dx + dy * dy <= r * r) return n;
        }
        return null;
    }
    G.nodeAt = nodeAt;
    G.graphNodeRadius = graphNodeRadius;

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const w = screenToWorld(mx, my);
        let ns = G.scale * (1 - e.deltaY * 0.0015);
        ns = Math.max(0.15, Math.min(6, ns));
        G.scale = ns;
        G.offsetX = mx - w.x * G.scale;
        G.offsetY = my - w.y * G.scale;
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        G.mouseDownPos = { x: e.clientX, y: e.clientY };
        const n = nodeAt(mx, my);
        if (n) {
            G.dragNode = n;
        } else {
            G.isPanning = true;
            canvas.style.cursor = 'grabbing';
        }
        G.lastX = e.clientX; G.lastY = e.clientY;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;

        if (G.dragNode) {
            const w = screenToWorld(mx, my);
            G.dragNode.x = w.x; G.dragNode.y = w.y;
            G.dragNode.vx = 0; G.dragNode.vy = 0;
        } else if (G.isPanning) {
            G.offsetX += e.clientX - G.lastX;
            G.offsetY += e.clientY - G.lastY;
            G.lastX = e.clientX; G.lastY = e.clientY;
        } else {
            G.hoverNode = nodeAt(mx, my);
            if (G.hoverNode) {
                canvas.style.cursor = 'pointer';
                tooltipInner.innerHTML = renderInlineMarkdown(G.hoverNode.title || '');
                tooltip.classList.add('visible');
            } else {
                canvas.style.cursor = 'grab';
                tooltip.classList.remove('visible');
            }
        }
    });

    const endPointer = (e) => {
        if (G.mouseDownPos &&
            Math.abs(e.clientX - G.mouseDownPos.x) < 5 &&
            Math.abs(e.clientY - G.mouseDownPos.y) < 5) {
            const rect = canvas.getBoundingClientRect();
            const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (n) {
                G.running = false;
                modal.classList.remove('show');
                tooltip.classList.remove('visible');
                window.navigateToEntityGlobal(n.workspace_id, n.column_id, n.id, null, true, true);
            }
        }
        G.dragNode = null;
        G.isPanning = false;
        G.mouseDownPos = null;
        canvas.style.cursor = G.hoverNode ? 'pointer' : 'grab';
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('pointerleave', () => {
        tooltip.classList.remove('visible');
        G.hoverNode = null;
    });

    window.addEventListener('resize', () => {
        if (modal.classList.contains('show')) resizeGraphCanvas();
    });

    const arrowsToggle = document.getElementById('graph-arrows-toggle');
    if (arrowsToggle) {
        arrowsToggle.classList.toggle('active', G.showArrows);
        arrowsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            G.showArrows = !G.showArrows;
            arrowsToggle.classList.toggle('active', G.showArrows);
        });
    }

    const repulsionSlider = document.getElementById('graph-repulsion-slider');
    if (repulsionSlider) {
        G.repulsionForce = parseInt(repulsionSlider.value);
        repulsionSlider.addEventListener('input', (e) => {
            G.repulsionForce = parseInt(e.target.value);
            if (G.running) {
                G.nodes.forEach(n => { n.vx += (Math.random() - 0.5) * 2; n.vy += (Math.random() - 0.5) * 2; });
            }
        });
    }
}

async function openGraphModal() {
    const modal = document.getElementById('graph-modal');
    const emptyEl = document.getElementById('graph-empty');
    if (!modal) return;

    modal.classList.add('show');

    await new Promise(r => requestAnimationFrame(r));
    resizeGraphCanvas();

    let data = { nodes: [], edges: [] };
    try {
        const res = await fetch(`${API_BASE}/system/graph`);
        if (res.ok) data = await res.json();
    } catch (e) {
        console.error("Graph load failed", e);
    }

    const cx = G.W / 2, cy = G.H / 2;
    const spread = Math.min(600, Math.max(200, G.W));
    G.nodes = data.nodes.map(n => ({
        ...n,
        x: cx + (Math.random() - 0.5) * spread,
        y: cy + (Math.random() - 0.5) * spread,
        vx: 0, vy: 0
    }));
    G.nodeMap = {};
    G.nodes.forEach(n => G.nodeMap[n.id] = n);
    G.edges = data.edges.filter(e => G.nodeMap[e.source] && G.nodeMap[e.target]);

    G.scale = 1; G.offsetX = 0; G.offsetY = 0;
    G.hoverNode = null; G.dragNode = null; G.isPanning = false;

    if (G.nodes.length === 0) {
        emptyEl.textContent = t('graph.empty');
        emptyEl.style.display = 'flex';
    } else {
        emptyEl.style.display = 'none';
    }

    G.running = true;
    runGraphLoop();
}

function runGraphLoop() {
    const modal = document.getElementById('graph-modal');
    const canvas = document.getElementById('graph-canvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    const styles = getComputedStyle(document.documentElement);
    const colorNode = (styles.getPropertyValue('--brand-pine') || '#4A5A48').trim();
    const colorText = (styles.getPropertyValue('--text-primary') || '#2A3029').trim();
    const colorEdge = (styles.getPropertyValue('--text-secondary') || '#828A80').trim();
    const bgColor = (styles.getPropertyValue('--bg-board') || '#EBEAE3').trim();

    const CELL_SIZE = 300;

    function step() {
        if (!G.running || !modal.classList.contains('show')) {
            G.running = false;
            return;
        }

        const repulsion = G.repulsionForce;
        const k = 0.015;
        const nodes = G.nodes;
        const totalNodes = nodes.length;

        const grid = new Map();
        
        for (let i = 0; i < totalNodes; i++) {
            const n = nodes[i];
            const cx = Math.floor(n.x / CELL_SIZE);
            const cy = Math.floor(n.y / CELL_SIZE);
            const key = cx + ',' + cy;
            
            let cell = grid.get(key);
            if (!cell) {
                cell = [];
                grid.set(key, cell);
            }
            cell.push(n);
        }

        for (let i = 0; i < totalNodes; i++) {
            const a = nodes[i];
            const cx = Math.floor(a.x / CELL_SIZE);
            const cy = Math.floor(a.y / CELL_SIZE);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = (cx + dx) + ',' + (cy + dy);
                    const cell = grid.get(key);
                    if (!cell) continue;

                    for (let j = 0; j < cell.length; j++) {
                        const b = cell[j];
                        if (a === b) continue;
                        
                        let diffX = a.x - b.x;
                        let diffY = a.y - b.y;
                        let d2 = diffX * diffX + diffY * diffY;
                        
                        if (d2 > CELL_SIZE * CELL_SIZE) continue;
                        
                        if (d2 < 0.01) { 
                            diffX = (Math.random() - 0.5); 
                            diffY = (Math.random() - 0.5); 
                            d2 = 1; 
                        }
                        
                        const d = Math.sqrt(d2);
                        const f = (repulsion / d2) * 0.5; 
                        
                        a.vx += (diffX / d) * f;
                        a.vy += (diffY / d) * f;
                    }
                }
            }
        }

        const edgesCount = G.edges.length;
        for (let i = 0; i < edgesCount; i++) {
            const e = G.edges[i];
            const a = G.nodeMap[e.source];
            const b = G.nodeMap[e.target];
            if (!a || !b) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            a.vx += dx * k; a.vy += dy * k;
            b.vx -= dx * k; b.vy -= dy * k;
        }

        const cx = G.W / 2, cy = G.H / 2;
        let totalKineticEnergy = 0;

        for (let i = 0; i < totalNodes; i++) {
            const n = nodes[i];
            n.vx += (cx - n.x) * 0.002; 
            n.vy += (cy - n.y) * 0.002;
            n.vx *= 0.82; 
            n.vy *= 0.82; 
            if (n !== G.dragNode) { 
                n.x += n.vx; 
                n.y += n.vy; 
            }
            totalKineticEnergy += Math.abs(n.vx) + Math.abs(n.vy);
        }

        ctx.save();
        ctx.scale(G.dpr, G.dpr);
        
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, G.W, G.H);
        
        ctx.translate(G.offsetX, G.offsetY);
        ctx.scale(G.scale, G.scale);

        const viewLeft = -G.offsetX / G.scale;
        const viewTop = -G.offsetY / G.scale;
        const viewRight = (G.W - G.offsetX) / G.scale;
        const viewBottom = (G.H - G.offsetY) / G.scale;

        const useFastLOD = (totalNodes > 5000 && G.scale < 0.2);

        ctx.strokeStyle = colorEdge;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1 / G.scale;
        
        const arrowLen = 9 / G.scale;
        const arrowAng = 0.42;

        ctx.beginPath();
        for (let i = 0; i < edgesCount; i++) {
            const e = G.edges[i];
            const a = G.nodeMap[e.source];
            const b = G.nodeMap[e.target];
            if (!a || !b) continue;

            if ((a.x < viewLeft && b.x < viewLeft) || 
                (a.x > viewRight && b.x > viewRight) || 
                (a.y < viewTop && b.y < viewTop) || 
                (a.y > viewBottom && b.y > viewBottom)) {
                continue; 
            }

            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);

            if (G.showArrows) {
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 1;
                const ux = dx / dist, uy = dy / dist;
                const rRadius = G.graphNodeRadius(b);
                const tipX = b.x - ux * rRadius;
                const tipY = b.y - uy * rRadius;
                const ang = Math.atan2(uy, ux);
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(tipX - arrowLen * Math.cos(ang - arrowAng), tipY - arrowLen * Math.sin(ang - arrowAng));
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(tipX - arrowLen * Math.cos(ang + arrowAng), tipY - arrowLen * Math.sin(ang + arrowAng));
            }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = colorNode;
        if (useFastLOD) {
            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;
                
                if (n === G.hoverNode) {
                    ctx.fillStyle = colorText;
                    ctx.fillRect(n.x - r, n.y - r, r*2, r*2);
                    ctx.fillStyle = colorNode;
                } else {
                    ctx.fillRect(n.x - r, n.y - r, r*2, r*2);
                }
            }
        } else {
            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;

                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
                ctx.fillStyle = (n === G.hoverNode) ? colorText : colorNode;
                ctx.fill();
            }
        }

        if (G.scale > 1.3) {
            ctx.fillStyle = colorText;
            ctx.textAlign = 'center';
            ctx.font = `${12 / G.scale}px Inter, -apple-system, sans-serif`;
            ctx.globalAlpha = Math.min(1, (G.scale - 1.3) / 0.6);
            
            for (let i = 0; i < totalNodes; i++) {
                const n = nodes[i];
                const r = G.graphNodeRadius(n);
                if (n.x + r < viewLeft || n.x - r > viewRight || n.y + r < viewTop || n.y - r > viewBottom) continue;

                let label = n.title || '';
                // Очищаем от Markdown ссылок и форматирования для отрисовки на канвасе
                label = label.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_~`]/g, '').trim();
                
                if (label.length > 15) label = label.substring(0, 14) + '…';
                ctx.fillText(label, n.x, n.y + r + 14 / G.scale);
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        const tooltip = document.getElementById('graph-tooltip');
        if (G.hoverNode && tooltip && tooltip.classList.contains('visible')) {
            const rect = canvas.getBoundingClientRect();
            const rScaled = G.graphNodeRadius(G.hoverNode) * G.scale;
            
            // Вычисляем экранные координаты узла + отступ радиуса, чтобы тултип не перекрывал саму точку
            let tx = G.hoverNode.x * G.scale + G.offsetX + rect.left + rScaled + 12;
            let ty = G.hoverNode.y * G.scale + G.offsetY + rect.top + rScaled + 12;
            
            // Защита от ухода тултипа за края экрана
            const tRect = tooltip.getBoundingClientRect();
            if (tx + tRect.width > window.innerWidth - 12) tx = window.innerWidth - tRect.width - 12;
            if (ty + tRect.height > window.innerHeight - 12) ty = window.innerHeight - tRect.height - 12;

            tooltip.style.left = tx + 'px';
            tooltip.style.top = ty + 'px';
        }

        if (totalKineticEnergy < 0.1 && !G.dragNode) {
            requestAnimationFrame(step);
            return;
        }

        requestAnimationFrame(step);
    }
    step();
}

initGraphModal();

document.getElementById('graph-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    openGraphModal();
});

// ═══════════════════════════════════════════════
//  СТАТИСТИКА (PRO)
// ═══════════════════════════════════════════════
let statsWeekOffset = 0;

document.getElementById('statistics-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    statsWeekOffset = 0; // При открытии всегда сбрасываем на текущую неделю
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
    
    // Скрываем кнопку Вперед, если мы на текущей неделе (будущее еще не наступило)
    const nextBtn = document.getElementById('stats-next-btn');
    if (statsWeekOffset === 0) {
        nextBtn.style.visibility = 'hidden';
    } else {
        nextBtn.style.visibility = 'visible';
    }
    
    // Анимация затухания старых данных
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
        
        // Значения верхнего ряда
        document.getElementById('stat-val-done').textContent = data.total_done;
        
        let h = Math.floor(data.total_time / 3600);
        let m = Math.floor((data.total_time % 3600) / 60);
        document.getElementById('stat-val-time').textContent = h > 0 ? `${h}${t('timeUnits.h')} ${m}${t('timeUnits.m')}` : `${m}${t('timeUnits.m')}`;
        
        document.getElementById('stat-val-overdue').textContent = data.overdue_count;
        
        // Функция для рендера бейджей трендов
        const applyTrend = (elId, pct) => {
            const el = document.getElementById(elId);
            if (!el) return;
            
            // Полностью скрываем бейдж, если тренд нулевой
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

        // Применяем тренды для Времени и Завершенных задач
        applyTrend('stat-trend-time', data.trend_time_pct);
        applyTrend('stat-trend-done', data.trend_done_pct);

        // Инсайт
        const insightEl = document.getElementById('stats-insight');
        // Зашиваем теги <b> прямо в массив, оставляя предлоги "в/во" снаружи
        const fullDayNamesRu = ['в <b>понедельник</b>', 'во <b>вторник</b>', 'в <b>среду</b>', 'в <b>четверг</b>', 'в <b>пятницу</b>', 'в <b>субботу</b>', 'в <b>воскресенье</b>'];
        const fullDayNamesEn = ['on <b>Monday</b>', 'on <b>Tuesday</b>', 'on <b>Wednesday</b>', 'on <b>Thursday</b>', 'on <b>Friday</b>', 'on <b>Saturday</b>', 'on <b>Sunday</b>'];
        const fullDayNames = currentLang === 'ru' ? fullDayNamesRu : fullDayNamesEn;
        
        if (data.total_time === 0) {
            insightEl.innerHTML = `<span>💡 ${t('stats.insightEmpty')}</span>`;
        } else {
            const bestDayName = data.best_day !== null ? fullDayNames[data.best_day] : '';
            // Оборачиваем всё сообщение в <span>, чтобы Flexbox не разрывал предложение на части из-за тега <b>
            if (data.trend_time_pct > 0) {
                insightEl.innerHTML = `<span>✨ ${t('stats.insightPositive', data.trend_time_pct, bestDayName)}</span>`;
            } else if (data.trend_time_pct < 0) {
                insightEl.innerHTML = `<span>📉 ${t('stats.insightNegative', data.trend_time_pct, bestDayName)}</span>`;
            } else {
                insightEl.innerHTML = `<span>⚖️ ${t('stats.insightNeutral', bestDayName)}</span>`;
            }
        }
        
        // Вспомогательная функция для рендера списка задач (Топ недели или Топ дня)
        const topContainer = document.getElementById('stats-top-tasks');
        const topTitleEl = document.getElementById('stats-top-title-el');
        
        const renderTasksList = (title, tasks, emptyMsg) => {
            topTitleEl.textContent = title;
            topContainer.innerHTML = '';
            
            if (tasks.length === 0) {
                // Раскладываем паддинги (20px сверху, 12px снизу) для идеальной симметрии в 32px
                topContainer.innerHTML = `<div style="font-size: 13px; color: var(--text-secondary); opacity: 0.7; text-align: center; padding: 20px 16px 12px;">${emptyMsg}</div>`;
                return;
            }
            
            tasks.forEach(task => {
                const timeFormatted = formatDetailedDuration(task.time_spent);
                topContainer.innerHTML += `
                    <div class="stats-top-item" onclick="document.getElementById('statistics-modal').classList.remove('show'); loadTaskIntoModal(${task.id}, true); document.getElementById('task-modal').classList.add('show');">
                        <div class="stats-top-header">
                            <div class="stats-top-title">${escapeHtml(task.title)}</div>
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
            
            // Анимация прогресс-баров для свежеотрисованного списка
            setTimeout(() => {
                topContainer.querySelectorAll('.stats-top-progress-fill').forEach(fill => fill.style.width = fill.dataset.target);
            }, 50);
        };

        // Рендер графика
        const chartContainer = document.getElementById('stats-activity-chart');
        chartContainer.innerHTML = '';
        
        let maxTime = Math.max(...data.chart_data.map(d => d.time_spent));
        if (maxTime === 0) maxTime = 1; 
        
        const daysShort = currentLang === 'ru' ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        
        data.chart_data.forEach((day, index) => {
            // Если времени 0, высота строго 0%, иначе минимум 2% для красоты
            const pct = day.time_spent === 0 ? 0 : Math.max(2, Math.round((day.time_spent / maxTime) * 100)); 
            const timeFormatted = formatDetailedDuration(day.time_spent);
            const tooltipText = t('stats.tooltip', day.tasks_done, timeFormatted);
            const isBest = day.day_name === data.best_day;
            const dayNameStr = daysShort[day.day_name];
            
            // Определяем, является ли этот день "сегодняшним"
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
            
            // Логика клика по столбику
            colDiv.onclick = () => {
                const isAlreadySelected = colDiv.classList.contains('is-selected');
                
                // Сбрасываем выбор со всех
                chartContainer.querySelectorAll('.stats-chart-col').forEach(c => c.classList.remove('is-selected'));
                
                if (isAlreadySelected) {
                    // Возвращаемся к топу за неделю
                    renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));
                } else {
                    // Показываем детали конкретного дня
                    colDiv.classList.add('is-selected');
                    renderTasksList(t('stats.dayTasks', dayNameStr), day.tasks, t('stats.emptyDay'));
                }
            };
            
            chartContainer.appendChild(colDiv);
        });
        
        // Изначально рендерим топ за всю неделю
        renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));
        
        // Сброс фильтра по дню при клике в любую пустую область модалки
        const modalBody = modal.querySelector('.modal-body');
        modalBody.onclick = (e) => {
            // Игнорируем клики по самим столбикам графика и карточкам задач
            if (!e.target.closest('.stats-chart-col') && !e.target.closest('.stats-top-item')) {
                const hasSelection = chartContainer.querySelector('.stats-chart-col.is-selected');
                if (hasSelection) {
                    // Снимаем выделение и возвращаем топ за неделю
                    chartContainer.querySelectorAll('.stats-chart-col').forEach(c => c.classList.remove('is-selected'));
                    renderTasksList(t('stats.topTasks'), data.top_tasks, t('stats.emptyTop'));
                }
            }
        };

        // Показываем контент
        loading.style.display = 'none';
        content.style.display = 'flex';
        content.style.opacity = '1';
        content.style.pointerEvents = 'auto';
        
        // Анимация столбиков
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

// ═══════════════════════════════════════════════
//  АВТОМАТИЗАЦИИ
// ═══════════════════════════════════════════════

document.getElementById('automations-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    openAutomationsModal();
});

const AUTO_API = `${API_BASE}/automations`;
let _editingAutomationId = null;
let _selectedWeekdays = [];

window.openAutomationsModal = async () => {
    _editingAutomationId = null;
    hideAutomationForm();
    document.getElementById('automations-modal').classList.add('show');
    await renderAutomationsList();
};

function hideAutomationForm() {
    document.getElementById('automation-form').style.display = 'none';
    document.getElementById('btn-add-automation').style.display = '';
    document.getElementById('automations-list').style.display = '';
    const list = document.getElementById('automations-list');
    document.getElementById('automations-empty').style.display = (list && list.children.length > 0) ? 'none' : '';
}

// ⚡ Умная обёртка для превращения нативных <select> в красивые dropdown-меню
function syncCustomSelect(selectEl) {
    if (!selectEl) return;

    // Инициализация кастомного UI (выполняется один раз на элемент)
    if (!selectEl._customUI) {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select';
        // Прокидываем важные стили для сохранения верстки
        wrapper.style.flex = selectEl.style.flex || '1';
        wrapper.style.width = selectEl.style.width || '100%';

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'setting-input custom-select-trigger';
        trigger.style.display = 'flex';
        trigger.style.alignItems = 'center';
        trigger.style.justifyContent = 'space-between';
        trigger.style.width = '100%';
        trigger.style.paddingRight = '12px';

        trigger.innerHTML = `
            <span class="trigger-text" style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:left;"></span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.5; flex-shrink: 0; margin-left: 8px;"><polyline points="6 9 12 15 18 9"></polyline></svg>
        `;

        const menu = document.createElement('div');
        menu.className = 'dropdown-menu custom-select-menu';
        menu.style.top = '100%';
        menu.style.left = '0';
        menu.style.right = '0';
        menu.style.minWidth = '100%';
        menu.style.transformOrigin = 'top center';
        menu.style.marginTop = '4px';
        menu.style.maxHeight = '200px';
        menu.style.overflowY = 'auto';
        menu.style.scrollbarWidth = 'none'; // Скрываем скролл в Firefox

        trigger.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isShowing = menu.classList.contains('show');
            closeAllDropdowns();
            if (!isShowing) {
                // Предварительный рендер для замера высоты
                menu.style.visibility = 'hidden';
                menu.style.display = 'block';
                menu.classList.add('show');
                const menuHeight = menu.offsetHeight;
                menu.classList.remove('show');
                menu.style.visibility = '';
                menu.style.display = '';

                const rect = trigger.getBoundingClientRect();
                
                // Если не влезает вниз — открываем наверх
                if (rect.bottom + menuHeight + 10 > window.innerHeight) {
                    menu.style.top = 'auto';
                    menu.style.bottom = '100%';
                    menu.style.marginTop = '0';
                    menu.style.marginBottom = '4px';
                    menu.style.transformOrigin = 'bottom center';
                } else {
                    menu.style.bottom = 'auto';
                    menu.style.top = '100%';
                    menu.style.marginTop = '4px';
                    menu.style.marginBottom = '0';
                    menu.style.transformOrigin = 'top center';
                }
                
                void menu.offsetWidth; // Принудительный reflow для анимации
                menu.classList.add('show');
            }
        };

        wrapper.appendChild(trigger);
        wrapper.appendChild(menu);

        // Вставляем рядом с селектом и прячем оригинал
        selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
        selectEl.style.display = 'none';

        selectEl._customUI = { wrapper, triggerSpan: trigger.querySelector('.trigger-text'), menu };
    }

    const { triggerSpan, menu } = selectEl._customUI;
    menu.innerHTML = '';
    let activeText = '';

    // Синхронизируем опции
    Array.from(selectEl.options).forEach(opt => {
        const item = document.createElement('div');
        item.className = 'menu-item';

        // Проверка по value - самая надёжная (отлавливает JS изменения)
        if (opt.value === selectEl.value) {
            item.classList.add('selected');
            activeText = opt.textContent;
        }

        item.textContent = opt.textContent;
        item.onclick = (e) => {
            e.stopPropagation();
            selectEl.value = opt.value;
            selectEl.dispatchEvent(new Event('change')); // Запускаем логику (скрытие/показ секций)
            syncCustomSelect(selectEl); // Перерисовываем для обновления текста триггера
            menu.classList.remove('show');
        };
        menu.appendChild(item);
    });

    triggerSpan.textContent = activeText || (selectEl.options[0] ? selectEl.options[0].textContent : '');
}

function showAutomationForm(autoData = null) {
    document.getElementById('automation-form').style.display = 'flex';
    document.getElementById('btn-add-automation').style.display = 'none';
    document.getElementById('automations-list').style.display = 'none';
    document.getElementById('automations-empty').style.display = 'none';

    // Снимаем overflow: hidden с карточек, чтобы наше меню не обрезалось
    document.querySelectorAll('#automation-form .settings-group-card').forEach(card => {
        card.style.overflow = 'visible';
    });

    // Заполняем колонки
    const select = document.getElementById('auto-column');
    select.innerHTML = '';
    state.columns.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.title;
        select.appendChild(opt);
    });

    if (autoData) {
        _editingAutomationId = autoData.id;
        document.getElementById('auto-type').value = autoData.type || 'recurring_card';
        document.getElementById('auto-name').value = autoData.name || '';

        const cfg = autoData.config || {};

        // Общие поля
        const colSelect = document.getElementById('auto-column');
        colSelect.value = cfg.column_id || '';
        
        // Если колонка была удалена, select.value останется пустым (или неверным).
        // Добавляем плейсхолдер с предупреждением, чтобы не было "тихой ошибки".
        if (cfg.column_id && colSelect.value != cfg.column_id) {
            const opt = document.createElement('option');
            opt.value = cfg.column_id;
            opt.textContent = `⚠️ Удаленная колонка (ID: ${cfg.column_id})`;
            opt.style.color = '#D35446';
            colSelect.appendChild(opt);
            colSelect.value = cfg.column_id;
        }

        // recurring_card: шаблоны
        document.getElementById('auto-title-template').value = cfg.title_template || '';
        document.getElementById('auto-desc-template').value = cfg.description_template || '';

        // sort_column: параметры сортировки
        document.getElementById('auto-sort-by').value = cfg.sort_by || 'position';
        document.getElementById('auto-sort-order').value = cfg.sort_order || 'asc';

        // clear_column: возраст и мгновенное удаление
        const isImmediate = cfg.max_age_minutes === 0;
        document.getElementById('auto-clear-immediate').checked = isImmediate;
        document.getElementById('auto-max-age').value = isImmediate ? 1440 : (cfg.max_age_minutes !== undefined ? cfg.max_age_minutes : 1440);

        // Расписание
        const sched = cfg.schedule || {};
        document.getElementById('auto-schedule-type').value = sched.type || 'daily';
        const timeParts = (sched.time || '09:00').split(':');
        document.getElementById('auto-hour').value = timeParts[0] || '09';
        document.getElementById('auto-minute').value = timeParts[1] || '00';
        _selectedWeekdays = sched.days || [];
        document.getElementById('auto-day-of-month').value = sched.day_of_month || 1;
        document.getElementById('btn-save-automation').textContent = t('modals.btnSave');
    } else {
        _editingAutomationId = null;
        document.getElementById('auto-type').value = 'recurring_card';
        document.getElementById('auto-name').value = '';
        document.getElementById('auto-title-template').value = '';
        document.getElementById('auto-desc-template').value = '';
        if (state.columns.length > 0) document.getElementById('auto-column').value = state.columns[0].id;
        document.getElementById('auto-sort-by').value = 'position';
        document.getElementById('auto-sort-order').value = 'asc';
        document.getElementById('auto-max-age').value = 1440;
        document.getElementById('auto-schedule-type').value = 'daily';
        document.getElementById('auto-hour').value = '09';
        document.getElementById('auto-minute').value = '00';
        _selectedWeekdays = [0, 1, 2, 3, 4]; // ПН–ПТ по умолчанию
        document.getElementById('auto-day-of-month').value = 1;
        document.getElementById('btn-save-automation').textContent = t('modals.btnCreate');
    }

    updateAutomationTypeUI();
    updateScheduleUI();
    renderWeekdayButtons();

    // 🔥 Превращаем все нативные селекты в кастомные
    ['auto-type', 'auto-column', 'auto-sort-by', 'auto-sort-order', 'auto-schedule-type'].forEach(id => {
        syncCustomSelect(document.getElementById(id));
    });
}

// ⚡ Переключение внешнего вида при смене типа автоматизации
function updateAutomationTypeUI() {
    const type = document.getElementById('auto-type').value;

    // recurring_card: шаблоны карточки + расписание
    const recurringSection = document.getElementById('auto-section-recurring-card');
    // sort_column: параметры сортировки
    const sortSection = document.getElementById('auto-section-sort');
    // clear_column: возраст карточек + расписание
    const clearSection = document.getElementById('auto-section-clear');
    // Расписание (для recurring_card и clear_column)
    const scheduleSection = document.getElementById('auto-section-schedule');

    // Скрываем все опциональные секции
    if (recurringSection) recurringSection.style.display = 'none';
    if (sortSection) sortSection.style.display = 'none';
    if (clearSection) clearSection.style.display = 'none';
    if (scheduleSection) scheduleSection.style.display = 'none';

    switch (type) {
        case 'recurring_card':
            if (recurringSection) recurringSection.style.display = 'flex';
            if (scheduleSection) scheduleSection.style.display = 'flex';
            break;
        case 'sort_column':
            if (sortSection) sortSection.style.display = 'flex';
            // sort_column не имеет расписания — срабатывает по событию
            break;
        case 'clear_column':
            if (clearSection) clearSection.style.display = 'flex';
            const isImmediate = document.getElementById('auto-clear-immediate').checked;
            if (isImmediate) {
                if (scheduleSection) scheduleSection.style.display = 'none';
                document.getElementById('auto-clear-age-wrapper').style.display = 'none';
            } else {
                if (scheduleSection) scheduleSection.style.display = 'flex';
                document.getElementById('auto-clear-age-wrapper').style.display = 'flex';
            }
            break;
    }
}

// Слушатели изменения UI
document.getElementById('auto-clear-immediate')?.addEventListener('change', updateAutomationTypeUI);
document.getElementById('auto-type')?.addEventListener('change', () => {
    updateAutomationTypeUI();
    updateScheduleUI();
    renderWeekdayButtons();
});

function updateScheduleUI() {
    const type = document.getElementById('auto-schedule-type').value;
    document.getElementById('auto-weekdays').style.display = type === 'weekly' ? 'flex' : 'none';
    document.getElementById('auto-monthly-day').style.display = type === 'monthly' ? 'flex' : 'none';
}

function renderWeekdayButtons() {
    const container = document.getElementById('auto-weekdays');
    if (!container) return;
    container.querySelectorAll('.auto-wday-btn').forEach(btn => {
        const day = parseInt(btn.dataset.day);
        const active = _selectedWeekdays.includes(day);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

// Делегирование кликов по кнопкам дней недели
document.getElementById('auto-weekdays')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.auto-wday-btn');
    if (!btn) return;
    toggleWeekdayBtn(btn);
});

document.getElementById('auto-weekdays')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const btn = e.target.closest('.auto-wday-btn');
        if (btn) toggleWeekdayBtn(btn);
    }
});

function toggleWeekdayBtn(btn) {
    const day = parseInt(btn.dataset.day);
    if (_selectedWeekdays.includes(day)) {
        _selectedWeekdays = _selectedWeekdays.filter(d => d !== day);
    } else {
        _selectedWeekdays.push(day);
    }
    renderWeekdayButtons();
}

document.getElementById('auto-schedule-type')?.addEventListener('change', updateScheduleUI);

window.cancelAutomationForm = () => {
    _editingAutomationId = null;
    hideAutomationForm();
    renderAutomationsList();
};

document.getElementById('btn-save-automation')?.addEventListener('click', async () => {
    const autoType = document.getElementById('auto-type').value;
    const name = document.getElementById('auto-name').value.trim();
    const columnId = parseInt(document.getElementById('auto-column').value);

    if (!name || !columnId) {
        showToast(t('alerts.error'), t('modals.autoValidationError'), true);
        return;
    }

    // Строим конфиг в зависимости от типа
    let config = { column_id: columnId };

    switch (autoType) {
        case 'recurring_card': {
            const titleTemplate = document.getElementById('auto-title-template').value.trim();
            const descTemplate = document.getElementById('auto-desc-template').value.trim();
            if (!titleTemplate) {
                showToast(t('alerts.error'), t('modals.autoValidationError'), true);
                return;
            }
            const schedType = document.getElementById('auto-schedule-type').value;
            const autoH = (document.getElementById('auto-hour').value || '09').padStart(2, '0');
            const autoM = (document.getElementById('auto-minute').value || '00').padStart(2, '0');
            const schedTime = `${autoH}:${autoM}`;
            const dayOfMonth = parseInt(document.getElementById('auto-day-of-month').value) || 1;
            if (schedType === 'weekly' && _selectedWeekdays.length === 0) {
                showToast(t('alerts.error'), t('modals.autoNoDaysError'), true);
                return;
            }
            config.title_template = titleTemplate;
            config.description_template = descTemplate;
            config.schedule = {
                type: schedType,
                time: schedTime,
                days: _selectedWeekdays.sort((a, b) => a - b),
                day_of_month: dayOfMonth,
            };
            break;
        }
        case 'sort_column': {
            config.sort_by = document.getElementById('auto-sort-by').value;
            config.sort_order = document.getElementById('auto-sort-order').value;
            break;
        }
        case 'clear_column': {
            const isImmediate = document.getElementById('auto-clear-immediate').checked;
            if (isImmediate) {
                config.max_age_minutes = 0;
            } else {
                const rawAge = parseInt(document.getElementById('auto-max-age').value);
                const maxAge = isNaN(rawAge) ? 1440 : Math.max(1, rawAge);
                const schedType = document.getElementById('auto-schedule-type').value;
                const autoH = (document.getElementById('auto-hour').value || '09').padStart(2, '0');
                const autoM = (document.getElementById('auto-minute').value || '00').padStart(2, '0');
                const schedTime = `${autoH}:${autoM}`;
                const dayOfMonth = parseInt(document.getElementById('auto-day-of-month').value) || 1;
                if (schedType === 'weekly' && _selectedWeekdays.length === 0) {
                    showToast(t('alerts.error'), t('modals.autoNoDaysError'), true);
                    return;
                }
                config.max_age_minutes = maxAge;
                config.schedule = {
                    type: schedType,
                    time: schedTime,
                    days: _selectedWeekdays.sort((a, b) => a - b),
                    day_of_month: dayOfMonth,
                };
            }
            break;
        }
    }

    const payload = {
        type: autoType,
        name,
        enabled: true,
        config
    };

    try {
        let res;
        if (_editingAutomationId) {
            res = await fetch(`${AUTO_API}/${_editingAutomationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(AUTO_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (res.ok) {
            _editingAutomationId = null;
            hideAutomationForm();
            await renderAutomationsList();
            if (window.syncColumnDOM) {
                await window.syncColumnDOM(columnId); // 🪄 Магия красивой анимации вместо жесткого refreshBoard
            } else {
                await refreshBoard();
            }
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(t('alerts.error'), err.detail || t('modals.autoSaveError'), true);
        }
    } catch (e) {
        console.error(e);
        showToast(t('alerts.error'), t('modals.autoNetworkError'), true);
    }
});

async function renderAutomationsList() {
    const list = document.getElementById('automations-list');
    const empty = document.getElementById('automations-empty');
    if (!list) return;

    try {
        const res = await fetch(AUTO_API);
        if (!res.ok) throw new Error('Failed to fetch');
        const automations = await res.json();

        list.innerHTML = '';

        if (automations.length === 0) {
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        automations.forEach(auto => {
            const cfg = auto.config || {};
            let typeLabel = '';
            let typeIcon = '';
            let desc = '';

            switch (auto.type) {
                case 'recurring_card': {
                    typeIcon = '🔄';
                    typeLabel = t('modals.autoTypeRecurring') || 'Повторяющаяся карточка';
                    const sched = cfg.schedule || {};
                    switch (sched.type) {
                        case 'hourly': desc = t('modals.autoHourly'); break;
                        case 'daily': desc = `${t('modals.autoDaily')}, ${sched.time || '09:00'}`; break;
                        case 'weekdays': desc = `${t('modals.autoWeekdays')}, ${sched.time || '09:00'}`; break;
                        case 'weekly': {
                            const dayKeys = ['cal.dayMon','cal.dayTue','cal.dayWed','cal.dayThu','cal.dayFri','cal.daySat','cal.daySun'];
                            const days = (sched.days || []).map(d => t(dayKeys[d]) || '').filter(Boolean).join(',');
                            desc = `${t('modals.autoWeekly')} (${days}), ${sched.time || '09:00'}`;
                            break;
                        }
                        case 'monthly': {
                            const dom = sched.day_of_month || 1;
                            desc = `${t('modals.autoMonthly')} (${dom}${t('modals.autoOrdinal', dom)}), ${sched.time || '09:00'}`;
                            break;
                        }
                        default: desc = sched.type || '';
                    }
                    break;
                }
                case 'sort_column': {
                    typeIcon = '↕️';
                    typeLabel = t('modals.autoTypeSort') || 'Сортировка колонки';
                    const sortLabels = {
                        position: t('modals.autoSortPosition') || 'Позиции',
                        title: t('modals.autoSortTitle') || 'Названию',
                        created_at: t('modals.autoSortCreated') || 'Дате создания',
                        priority: t('modals.autoSortPriority') || 'Приоритету',
                        due_date: t('modals.autoSortDue') || 'Сроку',
                    };
                    const sortBy = sortLabels[cfg.sort_by] || cfg.sort_by || t('modals.autoSortPosition');
                    const sortOrder = cfg.sort_order === 'desc' ? '↓' : '↑';
                    desc = `${sortBy} ${sortOrder}`;
                    break;
                }
                case 'clear_column': {
                    typeIcon = '🧹';
                    typeLabel = t('modals.autoTypeClear') || 'Очистка колонки';
                    const maxAge = cfg.max_age_minutes !== undefined ? cfg.max_age_minutes : 1440;
                    
                    if (maxAge === 0) {
                        desc = t('modals.autoClearImmediateDesc') || 'Мгновенное удаление при попадании в колонку';
                    } else {
                        if (maxAge < 60) {
                            desc = `${t('modals.autoClearOlder')}: ${maxAge} ${t('timeUnitsFull.m')}`;
                        } else if (maxAge < 1440) {
                            desc = `${t('modals.autoClearOlder')}: ${Math.round(maxAge / 60)} ${t('timeUnitsFull.h')}`;
                        } else {
                            desc = `${t('modals.autoClearOlder')}: ${Math.round(maxAge / 1440)} ${t('timeUnitsFull.d')}`;
                        }
                        const sched = cfg.schedule || {};
                        if (sched.type) {
                            desc += ` · ${t('modals.autoCheck')}: ${sched.type === 'daily' ? t('modals.autoDaily') : sched.type}`;
                        }
                    }
                    break;
                }
                default: {
                    typeIcon = '⚡';
                    typeLabel = auto.type;
                    desc = '';
                }
            }

            const nextRun = auto.next_run_at
                ? new Date(auto.next_run_at + 'Z').toLocaleString(currentLang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : ((auto.type === 'sort_column' || (auto.type === 'clear_column' && cfg.max_age_minutes === 0)) ? (t('modals.autoOnEvent') || 'По событию') : '—');

            const row = document.createElement('div');
            row.className = 'setting-row';
            row.style.cssText = 'cursor: default; align-items: flex-start; gap: 12px; padding: 14px 12px;';
            row.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0;">
                    <div style="width: 24px; height: 24px; border-radius: 8px; background: var(--brand-pale); color: var(--brand-pine); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; opacity: ${auto.enabled ? '1' : '0.4'}; font-size: 12px;">
                        ${escapeHtml(typeIcon)}
                    </div>
                    <div style="flex: 1; min-width: 0; padding-top: 2px;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                            <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(auto.name)}</div>
                            <span style="font-size: 10px; font-weight: 500; color: var(--text-secondary); opacity: 0.6; background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px; white-space: nowrap;">${escapeHtml(typeLabel)}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">${escapeHtml(desc)}</div>
                        <div style="font-size: 11px; color: var(--text-secondary); opacity: 0.6; margin-top: 4px; font-family: var(--font-mono);">${t('modals.autoNextRun')}: ${nextRun}</div>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0;">
                    <label class="toggle-switch" style="transform: scale(0.8); transform-origin: right center;" onclick="event.stopPropagation();">
                        <input type="checkbox" ${auto.enabled ? 'checked' : ''} onchange="toggleAutomation(${auto.id}, this.checked, this)">
                        <span class="toggle-slider"></span>
                    </label>
                    <div style="display: flex; gap: 4px; margin-top: auto;">
                        <button class="icon-btn" title="${t('modals.autoRunNow')}" onclick="event.stopPropagation(); runAutomationNow(${auto.id})" style="width: 28px; height: 28px; background: rgba(0,0,0,0.03);">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </button>
                        <button class="icon-btn" title="${t('modals.autoEdit')}" onclick="event.stopPropagation(); editAutomation(${auto.id})" style="width: 28px; height: 28px; background: rgba(0,0,0,0.03);">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button class="icon-btn danger-icon" title="${t('modals.autoDelete')}" onclick="event.stopPropagation(); deleteAutomation(${auto.id})" style="width: 28px; height: 28px; background: rgba(211,84,70,0.08); color: #D35446;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
            `;
            list.appendChild(row);
        });
    } catch (e) {
        console.error('Failed to load automations', e);
    }
}

window.toggleAutomation = async (id, enabled, checkbox) => {
    try {
        await fetch(`${AUTO_API}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
    } catch (e) {
        console.error(e);
        // Откатываем чекбокс при ошибке
        if (checkbox) checkbox.checked = !enabled;
        showToast(t('alerts.error'), t('modals.autoNetworkError'), true);
    }
};

window.runAutomationNow = async (id) => {
    try {
        const res = await fetch(`${AUTO_API}/${id}/run`, { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            if (data.type === 'clear_column') {
                showToast(t('modals.autoRunNow'), t('modals.autoRunDoneClear', data.deleted));
            } else if (data.type === 'sort_column') {
                const msg = currentLang === 'ru' ? `Отсортировано карточек: ${data.affected}` : `Sorted cards: ${data.affected}`;
                showToast(t('modals.autoRunNow'), msg);
            } else if (data.type === 'recurring_card') {
                showToast(t('modals.autoRunNow'), t('modals.autoRunDone', data.task_id));
            } else {
                showToast(t('modals.autoRunNow'), 'Выполнено');
            }
            await renderAutomationsList();
            // Даём всплывающему Toast-уведомлению время на отрисовку 
            // перед тем, как заблокировать поток запросом и перерендером доски
            setTimeout(async () => {
                await refreshBoard(); // СИНХРОНИЗАЦИЯ: заново стягиваем стейт доски с бэкенда
            }, 50);
            } else {
                showToast(t('alerts.error'), t('modals.autoRunError'), true);
            }
    } catch (e) {
        console.error(e);
        showToast(t('alerts.error'), t('modals.autoNetworkError'), true);
    }
};

window.editAutomation = async (id) => {
    try {
        const res = await fetch(`${AUTO_API}/${id}`);
        if (res.ok) {
            const auto = await res.json();
            showAutomationForm(auto);
        } else {
            showToast(t('alerts.error'), t('modals.autoNetworkError'), true);
        }
    } catch (e) {
        console.error(e);
    }
};

window.deleteAutomation = async (id) => {
    const confirmed = await showConfirmModal(t('modals.autoDeleteTitle'), t('modals.autoDeleteConfirm'));
    if (!confirmed) return;
    try {
        await fetch(`${AUTO_API}/${id}`, { method: 'DELETE' });
        // Уступаем главный поток на 15 мс (1 кадр), чтобы анимация закрытия модалки 
        // успела начаться до тяжелого перерендера DOM
        setTimeout(async () => {
            await renderAutomationsList();
        }, 100);
    } catch (e) {
        console.error(e);
    }
};

const originalFetch = window.fetch;
window._lastLocalEdit = 0;
window.fetch = async function(...args) {
    const url = args[0] || '';
    const options = args[1] || {};
    const method = options.method || 'GET';
    
    if (method !== 'GET' && typeof url === 'string' && url.includes('/api/v1/')) {
        window._lastLocalEdit = Date.now();
    }
    return originalFetch.apply(this, args);
};

function initCloudSync() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//127.0.0.1:8000/api/v1/system/ws`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
        if (event.data === "db_updated") {
            if (Date.now() - window._lastLocalEdit < 2500) return;
            
            if (typeof isDragging !== 'undefined' && isDragging) return;
            if (document.querySelector('.is-renaming')) return;
            if (document.querySelector('.card-entering:not(.is-exiting)')) return;
            if (document.querySelector('.column-entering:not(.is-exiting)')) return;
            
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
                return;
            }

            console.log("[iCloud Sync] Обнаружено внешнее изменение файла БД. Перерисовываем UI...");
            
            if (document.getElementById('vault-screen').classList.contains('hidden')) {
                refreshBoard();
            } else {
                renderVaultHistory();
            }
        }
    };

    ws.onclose = () => {
        setTimeout(initCloudSync, 3000);
    };
}

(async () => {
    initTooltip();
    initTabsScrollbar();
    initBoardScrollbar();
    initTaskModalDragAndResize();
    initGlobalSearch();
    initCloudSync();

    const urlParams = new URLSearchParams(window.location.search);
    const isVaultMode = urlParams.get('mode') === 'vault';

        try {
            applyLanguage(localStorage.getItem('doe-lang') || 'ru', false);
            applyTheme(localStorage.getItem('doe-theme') || 'light', false);
        } catch (e) {}

        const pendingHighlight = localStorage.getItem('doe-pending-highlight');
        if (pendingHighlight) {
            localStorage.removeItem('doe-pending-highlight');
            setTimeout(async () => {
                try {
                    const ctxRes = await fetch(`${API_BASE}/tasks/${pendingHighlight}/context`);
                    if (ctxRes.ok) {
                        const context = await ctxRes.json();
                        window.navigateToEntityGlobal(context.workspace_id, context.column_id, parseInt(pendingHighlight), null, true, true);
                    }
                } catch (e) {}
            }, 800);
        }

        initTimerCulling();
        setInterval(updateTimers, 250);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                updateTimers();
                updateBellBadge();
            }
        });
        
        setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/system/pending-highlights`);
                if (!res.ok) return;
                const data = await res.json();
                
                if (data.task_id) {
                    const vaultRes = await fetch(`${API_BASE}/system/vault`);
                    const currentVault = await vaultRes.json();
                    
                    if (data.vault_path && data.vault_path !== currentVault.path) {
                        await fetch(`${API_BASE}/system/vault/switch`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ new_path: data.vault_path })
                        });
                        localStorage.setItem('doe-pending-highlight', data.task_id);
                        window.location.reload();
                        return;
                    }
                    
                    const ctxRes = await fetch(`${API_BASE}/tasks/${data.task_id}/context`);
                    if (!ctxRes.ok) return;
                    
                    const context = await ctxRes.json();
                    
                    const taskModal = document.getElementById('task-modal');
                    if (taskModal && taskModal.classList.contains('show')) {
                        taskModal.classList.remove('show');
                    }
                    
                    window.navigateToEntityGlobal(context.workspace_id, context.column_id, data.task_id, null, true, true);
                    
                    updateBellBadge();
                }
            } catch (e) {}
        }, 1000);

        window.addEventListener('resize', () => {
            requestAnimationFrame(() => {
                clampExpandedTitles();
                adjustCollapsedColumnWidths();
                updateVaultHistoryScrollState();
            });
        });

    if (isVaultMode) {
        document.getElementById('vault-screen').classList.remove('hidden', 'content-hidden');

        const lights = document.getElementById('mac-traffic-lights');
        if (lights) lights.classList.add('vault-mode');

        try {
            const settingsData = await fetchSettings().catch(() => ({}));
            if (settingsData.theme) applyTheme(settingsData.theme, false);
            if (settingsData.language) applyLanguage(settingsData.language, false);
            
            window.applyExtensionsUI(settingsData.extensions);

            // Применяем шрифты для окна Vault
            updateAppFont(settingsData.ui_font, settingsData.custom_font);
            const uiFontInput = document.getElementById('ui-font-input');
            if (uiFontInput) {
                uiFontInput.value = settingsData.ui_font ? settingsData.ui_font : `Inter (${t('modals.fontSystemDefault')})`;
            }
        } catch (e) { console.error("Settings load failed in vault mode", e); }

        renderVaultHistory();

        setInterval(async () => {
            try {
                const history = await fetchVaultHistory();
                history.forEach(item => {
                    const safePath = item.path.replace(/\\/g, '\\\\');
                    const el = document.querySelector(`.vault-history-item[data-path="${safePath}"]`);
                    
                    if (el) {
                        const isMissing = item.exists === false;
                        const checkbox = el.querySelector('.subtask-checkbox');
                        const nameEl = el.querySelector('.vault-history-name');
                        const pathEl = el.querySelector('.vault-history-path');
                        const revealBtn = el.querySelector('.vault-hist-reveal');

                        if (isMissing && !checkbox.classList.contains('missing')) {
                            checkbox.classList.add('missing');
                            el.classList.add('is-missing');
                            checkbox.title = currentLang === 'ru' ? 'Хранилище не найдено. Нажмите, чтобы перепривязать' : 'Vault not found. Click to relink';
                            checkbox.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
                            nameEl.classList.add('missing-text');
                            pathEl.classList.add('missing-text');
                            if (revealBtn) revealBtn.style.display = 'none';
                        } else if (!isMissing && checkbox.classList.contains('missing')) {
                            checkbox.classList.remove('missing');
                            el.classList.remove('is-missing');
                            checkbox.removeAttribute('title');
                            checkbox.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
                            nameEl.classList.remove('missing-text');
                            pathEl.classList.remove('missing-text');
                            if (revealBtn) revealBtn.style.display = '';
                        }
                    }
                });
            } catch (e) {}
        }, 1500);

        document.body.classList.remove('preload');
        setTimeout(triggerReveal, 50);
        return; 
    }

    document.getElementById('vault-screen').classList.add('hidden', 'content-hidden');

    try {
        if (!localStorage.getItem('doe-notif-requested')) {
            localStorage.setItem('doe-notif-requested', 'true');
            if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                Notification.requestPermission();
            }
        }

        const [settingsData, vaultData, workspacesData] = await Promise.all([
            fetchSettings().catch(() => ({})),
            fetchVault().catch(() => ({ name: "Doe Board" })),
            fetchWorkspaces().catch(() => [])
        ]);

        window.applyExtensionsUI(settingsData.extensions);
        
        // Применяем настройки приоритетов
        if (settingsData.priority_settings) {
            applyPriorityStyles(settingsData.priority_settings);
        } else {
            applyPriorityStyles(window.prioritySettings);
        }

        // Применяем шрифты при старте основного окна
        updateAppFont(settingsData.ui_font, settingsData.custom_font);
        const uiFontInput = document.getElementById('ui-font-input');
        if (uiFontInput) {
            uiFontInput.value = settingsData.ui_font ? settingsData.ui_font : `Inter (${t('modals.fontSystemDefault')})`;
        }

        updateVaultName(vaultData.name);

        state.workspaces = workspacesData;

        let targetWorkspaceId = settingsData.active_workspace_id;

        if (!targetWorkspaceId || !state.workspaces.find(w => w.id === targetWorkspaceId)) {
            if (state.workspaces.length > 0) {
                targetWorkspaceId = state.workspaces[0].id;
            }
        }

        state.activeWorkspaceId = targetWorkspaceId;

        renderTabs(true);

        if (state.activeWorkspaceId) {
                const columnsData = await fetchColumns(state.activeWorkspaceId);
                state.columns = columnsData.map(col => ({ ...col, collapsed: col.collapsed || false }));
                
                renderBoard();
                
                adjustCollapsedColumnWidths();
                clampExpandedTitles();

                triggerGarbageCollector();

            } else {
                console.error("No workspaces found even after initialization");
                renderBoard(); 
            }

            await updateBellBadge().catch(console.error);

            document.body.classList.remove('preload');
            setTimeout(triggerReveal, 50);

        } catch (e) {
            console.error("Fatal initialization error:", e);
            document.body.classList.remove('preload');
            setTimeout(triggerReveal, 50); 
        }
})();

document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const plusBtn = e.target.closest('.divider-plus-btn');
    if (plusBtn) {
        e.preventDefault();
        e.stopPropagation();
        onAddCardInline(plusBtn);
    }
}, { capture: true });

async function fetchActiveReminders() {
    try {
        const res = await fetch(`${API_BASE}/system/reminders?t=${Date.now()}`);
        if (res.ok) return await res.json();
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
        
        div.innerHTML = `
            <div class="reminder-info">
                <div class="reminder-task-title">${escapeHtml(r.task_title)}</div>
                <div class="reminder-time">${dueTimeStr}</div>
            </div>
            <button class="subtask-delete-btn" title="${t('menu.delete')}">${trashIcon}</button>
        `;
        
        div.addEventListener('click', async (e) => {
            if (e.target.closest('.subtask-delete-btn')) return;
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

        // Улучшенная очистка года для эстетики (убирает " г." или " г")
        const formatDate = (d) => d.toLocaleDateString(currentLang, {day: 'numeric', month: 'short'}).replace(/\s*г\.?/, '').trim();

        // Вычисляем полную длительность для скобочек (с поддержкой локализации)
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
            // Если закончился (используем среднее тире + показываем итоговую длительность)
            if (isSameDay) {
                return `${t1} – ${t2} ${durationStr}`;
            } else {
                return `${formatDate(start)} ${t1} – ${formatDate(end)} ${t2} ${durationStr}`;
            }
        } else {
            // Если НЕ закончился (в процессе) — скрываем потраченное время, так как процесс еще идет
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
                const timeText = this.formatTimeText(ev, true); // true означает компактный режим
                const fullText = `${timeText} ${ev.title}`;
                return `<div class="cal-event-chip ${ev.completed ? 'is-done' : ''}" data-id="${ev.id}" data-event-id="${ev.event_id}" data-ws="${ev.workspace_id}" data-col="${ev.column_id}" data-full-title="${escapeHtml(fullText)}">${timeText} ${escapeHtml(ev.title)}</div>`;
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
                    
                    const timeText = this.formatTimeText(ev, false); // false означает подробный вид
                    
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
                    closeAllDropdowns(); // Закрываем другие меню
                    
                    const menu = document.getElementById('cal-context-menu');
                    menu.dataset.eventId = eventId;
                    
                    // Показываем прозрачным, чтобы измерить ширину/высоту
                    menu.style.visibility = 'hidden';
                    menu.style.display = 'block';
                    menu.classList.add('show');
                    
                    // Умное позиционирование (чтобы меню не уходило за экран)
                    let left = e.clientX;
                    let top = e.clientY;
                    const rect = menu.getBoundingClientRect();
                    
                    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
                    if (top + rect.height > window.innerHeight - 10) top = window.innerHeight - rect.height - 10;
                    
                    menu.style.left = `${left}px`;
                    menu.style.top = `${top}px`;
                    
                    // Делаем видимым
                    menu.style.visibility = '';
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Calendar.init();
});

async function openMoveTaskModal(taskId) {
    const modal = document.getElementById('move-modal');
    modal.dataset.taskId = taskId;
    const select = document.getElementById('move-column-select');
    
    // Временно удаляем кастомную обертку (если была сгенерирована), чтобы обновить данные
    if (select._customUI) {
        select._customUI.wrapper.remove();
        select._customUI = null;
        select.style.display = '';
    }

    select.innerHTML = `<option value="">${t('loading')}</option>`;
    modal.classList.add('show');
    
    try {
        let optionsHtml = '';
        // Собираем колонки со ВСЕХ вкладок текущего хранилища
        for (const ws of state.workspaces) {
            const cols = await fetchColumns(ws.id);
            for (const col of cols) {
                // Отображаем в формате "Вкладка → Колонка"
                optionsHtml += `<option value="${col.id}">${escapeHtml(ws.name)} → ${escapeHtml(col.title)}</option>`;
            }
        }
        select.innerHTML = optionsHtml;
        syncCustomSelect(select); // Оживляем наш нативный кастомный селект
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
            await refreshBoard(); // Полная перерисовка стянет все изменения и корректно отобразит, если перенос был на другой экран
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
        } else if (criteria === 'deadline') {
            valA = a.due_date ? new Date(a.due_date).getTime() : null;
            valB = b.due_date ? new Date(b.due_date).getTime() : null;
            isNullA = valA === null;
            isNullB = valB === null;
        } else if (criteria === 'created') {
            valA = new Date(a.created_at).getTime();
            valB = new Date(b.created_at).getTime();
        } else if (criteria === 'updated') {
            valA = new Date(a.updated_at).getTime();
            valB = new Date(b.updated_at).getTime();
        }

        // Правило 1: Если оба пустые - сохраняем текущий пользовательский порядок
        if (isNullA && isNullB) return a.position - b.position;
        
        // Правило 2: NULLS LAST (пустые значения ВСЕГДА в самом низу списка)
        if (isNullA) return 1;
        if (isNullB) return -1;

        // Правило 3: Стандартная сортировка с учетом направления
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        
        // Правило 4: При равенстве значений сохраняем текущий пользовательский порядок
        return a.position - b.position;
    });

    const orderedIds = column.tasks.map(t => t.id);
    column.tasks.forEach((t, i) => t.position = i);

    try {
        await saveTasksOrder(orderedIds);
        if (window.syncColumnDOM) {
            await window.syncColumnDOM(columnId); // 🪄 Магия красивой анимации
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

    const NO_DRAG = 'button, input, textarea, select, a, [contenteditable="true"],' +
        '.search-wrapper, .settings-wrapper, .tabs-wrapper, .board-tab,' +
        '.vault-container, .menu-btn, .card-menu-btn, .traffic-btn';

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
})();

(function setupWindowsChrome() {
    if (!document.documentElement.classList.contains('win-os')) return;

    const isVault = new URLSearchParams(location.search).get('mode') === 'vault';
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
      .win-rh-t{top:0;left:8px;right:8px;height:6px;cursor:ns-resize}
      .win-rh-b{bottom:0;left:8px;right:8px;height:6px;cursor:ns-resize}
      .win-rh-l{left:0;top:8px;bottom:8px;width:6px;cursor:ew-resize}
      .win-rh-r{right:0;top:8px;bottom:8px;width:6px;cursor:ew-resize}
      .win-rh-tl{top:0;left:0;width:10px;height:10px;cursor:nwse-resize}
      .win-rh-tr{top:0;right:0;width:10px;height:10px;cursor:nesw-resize}
      .win-rh-bl{bottom:0;left:0;width:10px;height:10px;cursor:nesw-resize}
      .win-rh-br{bottom:0;right:0;width:10px;height:10px;cursor:nwse-resize}
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
    controls.querySelector('.close').onclick = () => api()?.close_window?.();
    controls.querySelector('.max')?.addEventListener('click', () => api()?.toggle_maximize_window?.());

    // --- 1. НАТИВНЫЙ РЕСАЙЗ ЧЕРЕЗ SC_SIZE ---
    if (!isVault) {
        const hitCodes = {
            'l': 10, 'r': 11, 't': 12, 'tl': 13, 'tr': 14,
            'b': 15, 'bl': 16, 'br': 17
        };

        ['t','b','l','r','tl','tr','bl','br'].forEach((cls) => {
            const h = document.createElement('div');
            h.className = `win-rh win-rh-${cls}`;
            h.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                api()?.start_window_resize?.(hitCodes[cls]);
            });
            document.body.appendChild(h);
        });
    }

    // --- 2. НАТИВНЫЙ ПЕРЕХВАТ ПЕРЕТАСКИВАНИЯ (SC_MOVE) ---
    const NO_DRAG = 'button, input, textarea, select, a, [contenteditable="true"],' +
        '.search-wrapper, .settings-wrapper, .tabs-wrapper, .board-tab,' +
        '.vault-actions, .vault-create-form, .menu-btn, .card-menu-btn, .win-controls, .win-rh';

    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (!e.target.closest('.app-header, .vault-screen')) return;
        if (e.target.closest(NO_DRAG)) return;
        e.preventDefault();

        api()?.start_window_drag?.();
    }, true);

})();