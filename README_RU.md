<p align="center">
  <img src="doe.png" alt="Doe" width="120" />
</p>

<p align="center">
  <a href="README.md"><strong>🇬🇧 English</strong></a>
</p>

<h1 align="center">Doe</h1>

<p align="center">
  <strong>Aesthetic. Local-first. Kanban sanctuary.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/version-v1-blue" alt="Version">
  <img src="https://img.shields.io/badge/python-3.12-3776ab?logo=python&logoColor=white" alt="Python 3.12">
  <img src="https://img.shields.io/badge/frontend-vanilla%20JS-f7df1e?logo=javascript&logoColor=black" alt="Vanilla JS">
  <img src="https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/database-SQLite-003b57?logo=sqlite&logoColor=white" alt="SQLite">
</p>

<br>

> **Doe** — десктопное Kanban-приложение для тех, кто ценит эстетику, приватность и полный контроль над данными.
> Никаких облаков, подписок и регистраций. Только ты, твои задачи и локальная база данных.

<br>

<p align="center">
  <a href="#-почему-doe">Почему Doe</a> ·
  <a href="#-быстрый-старт">Быстрый старт</a> ·
  <a href="#-архитектура">Архитектура</a> ·
  <a href="#-возможности">Возможности</a> ·
  <a href="#-горячие-клавиши">Горячие клавиши</a> ·
  <a href="#-разработка">Разработка</a>
</p>

---

## ✨ Почему Doe?

<table>
<tr>
  <td width="50%" valign="top">

**🔒 100% Локально** — Все данные хранятся в папке-хранилище (vault) на твоём компьютере. Внутри — файлы в Obsidian-совместимом формате (.md с YAML frontmatter) и служебный SQLite-индекс. Хочешь — положи vault в iCloud и синхронизируй между Mac'ами. Хочешь — на флешку. Никто, кроме тебя, не имеет доступа.

  </td>
  <td width="50%" valign="top">

**📝 Markdown-редактор** — Полноценный редактор с живым предпросмотром, сворачиваемыми заголовками, подсветкой синтаксиса (Prism.js), математикой (KaTeX) и drag-and-drop вложениями.

  </td>
</tr>
<tr>
  <td width="50%" valign="top">

**🎨 Эстетика во всём** — Тёмная и светлая темы, кастомные шрифты, плавные анимации, продуманная типографика. Доска выглядит так же хорошо, как работает.

  </td>
  <td width="50%" valign="top">

**🔗 Связи между задачами** — Многие-ко-многим: родительские, дочерние, зависимые. Граф связей визуализируется через D3.js.

  </td>
</tr>
<tr>
  <td width="50%" valign="top">

**🧠 Локальный AI** `🚧 beta` — Встроенный AI-ассистент на базе **Gemma 4** — работает полностью оффлайн, с ускорением на Apple Silicon. Общается о задачах, ищет по доске, создаёт карточки, помнит факты между сессиями.

  </td>
  <td width="50%" valign="top">

**🔁 Автоматизации** — Повторяющиеся карточки по расписанию (ежедневно, еженедельно…), авто-сортировка колонок, авто-очистка старых задач.

  </td>
</tr>
<tr>
  <td width="50%" valign="top">

**⏱️ Встроенный тайм-трекер** — Запускай таймер на задаче — время пишется в базу. Календарь покажет раскладку по дням. Статистика подведёт итоги недели.

  </td>
  <td width="50%" valign="top">

**📊 Приоритеты** — 9-факторная модель оценки важности: ценность, шанс успеха, фоновое бремя, боль процесса, затянутость, потребность в отчёте, проактивность, безмятежность, вред.

  </td>
</tr>
<tr>
  <td width="50%" valign="top">

**🔐 Шифрование хранилища** — Запароль весь vault **AES-256-GCM + scrypt**. Даже если кто-то получит твои файлы — без пароля они бесполезны. Можно разблокировать **Touch ID** на macOS. Твои данные, твои правила.

  </td>
  <td width="50%" valign="top">

**🌍 Русский и English** — Полная локализация интерфейса на двух языках. Переключение на лету.

  </td>
</tr>
</table>

---

## 🖼 Скриншоты

<p align="center">
  <em>Скоро здесь будут скриншоты.</em>
</p>

<!--
  Готовый шаблон галереи. Положи четыре изображения в assets/screenshots/
  (точные имена файлов — в assets/screenshots/README.md), затем удали
  эти комментарии-маркеры, чтобы сетка отобразилась.

<table>
<tr>
  <td width="50%" valign="top">
    <img src="assets/screenshots/board.png" alt="Kanban-доска">
    <p align="center"><sub>Kanban-доска — тёмная тема</sub></p>
  </td>
  <td width="50%" valign="top">
    <img src="assets/screenshots/card.png" alt="Карточка задачи с Markdown-редактором">
    <p align="center"><sub>Карточка задачи — Markdown-редактор с живым предпросмотром</sub></p>
  </td>
</tr>
<tr>
  <td width="50%" valign="top">
    <img src="assets/screenshots/graph.png" alt="Граф связей задач">
    <p align="center"><sub>Граф связей задач (D3.js)</sub></p>
  </td>
  <td width="50%" valign="top">
    <img src="assets/screenshots/stats.png" alt="Недельная статистика">
    <p align="center"><sub>Недельная статистика и тайм-трекинг</sub></p>
  </td>
</tr>
</table>
-->

---

## 🚀 Быстрый старт

### macOS (Apple Silicon)

```bash
# 1. Клонируй
git clone https://github.com/chr1stvoskrese/Doe.git
cd Doe

# 2. Создай виртуальное окружение
python3 -m venv venv
source venv/bin/activate

# 3. Установи зависимости
pip install -r requirements.txt

# 4. Запусти
python wrapper.py
```

### Сборка

Единый кросс-платформенный сборщик с интерактивным меню (работает и на macOS, и на Windows):

```bash
python build.py
```

Скрипт сам определит систему и предложит цели: Apple Silicon (с ИИ), Intel (без ИИ, для старых маков) или обе сразу. Intel-окружение создаётся автоматически. Результат: `dist/Doe.app` (arm64) и/или `dist-intel/Doe.app` (Intel).

Без меню (для CI): `python build.py --target arm64|intel|both|windows`.

### Windows

```bat
:: 1. Клонируй и перейди в папку
git clone https://github.com/chr1stvoskrese/Doe.git
cd Doe

:: 2. Виртуальное окружение и зависимости
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

:: 3. Запуск
python wrapper.py

:: 4. Сборка (.exe)
python build.py
```

> **Примечание:** AI-ассистент (llama-cpp) работает только на macOS arm64 с Apple Silicon.
> На Windows и Intel Mac AI недоступен — всё остальное работает полностью.

---

## 🧱 Архитектура

```
┌──────────────────────────────────────────────┐
│          Desktop Window (pywebview)          │
│  ┌────────────────────────────────────────┐  │
│  │    index.html · app.js · styles.css    │  │
│  │   Vanilla JS · window.pywebview.api    │  │
│  └────────────────────┬───────────────────┘  │
│                       │ pywebview bridge     │
└───────────────────────┼──────────────────────┘
                        │
┌───────────────────────┼──────────────────────┐
│        FastAPI ASGI core (in-process)        │
│  ┌────────────────────┴───────────────────┐  │
│  │  /api/v1/columns                       │  │
│  │  /api/v1/tasks          CRUD + move    │  │
│  │  /api/v1/workspaces                    │  │
│  │  /api/v1/system     vault/settings     │  │
│  │  /api/v1/ai            local LLM       │  │
│  │  /api/v1/automations                   │  │
│  │  /api/v1/memory       spaced repetition│  │
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────┴───────────────────┐  │
│  │  SQLAlchemy 2.0 (async) + aiosqlite    │  │
│  │  Alembic migrations                    │  │
│  └────────────────────┬───────────────────┘  │
└───────────────────────┼──────────────────────┘
                        │
┌───────────────────────┴──────────────────────┐
│       Папка-хранилище (vault) на диске       │
│  ├── .doe.index.db.doe  (SQLite-индекс)      │
│  ├── Колонки/        (.md + frontmatter)     │
│  └── вложения/                               │
│  Совместимо с Obsidian                       │
└──────────────────────────────────────────────┘
```

| Слой | Технология |
|---|---|
| **Рантайм** | Python 3.12 · FastAPI 0.115 (in-process ASGI, без сетевого сервера) |
| **База данных** | SQLite (aiosqlite) · SQLAlchemy 2.0 (async) |
| **Миграции** | Alembic |
| **Десктоп** | pywebview (нативный WebView ОС) |
| **Сборка** | PyInstaller (`.app` / `.exe`) |
| **AI** | llama-cpp-python · Gemma 4 (Metal-ускорение) |
| **Фронтенд** | Vanilla JS (~17k строк) · CSS (~10k строк) · space.js (~1.7k) |
| **Хранилище** | SQLite (+aiosqlite) **и** Obsidian-совместимое файловое хранилище (FS Store v2) |
| **Редактор** | CodeMirror · Marked.js · Prism.js · KaTeX |
| **Синхронизация** | push через мост pywebview · watchdog |

---

## 📦 Возможности

<details open>
<summary><strong>📋 Kanban-доска</strong></summary>

- Неограниченное количество рабочих пространств (табов) и колонок
- Drag-and-drop карточек между колонками и внутри них
- Три режима колонок: **Обычная**, **Трекер времени**, **Завершение**
- Сворачивание колонок, настраиваемая ширина, горячие клавиши
- JSON-экспорт/импорт всей доски или отдельных карточек

</details>

<details>
<summary><strong>📝 Карточки задач</strong></summary>

- Markdown-описание с живым предпросмотром
- Чек-листы (подзадачи) через связи многие-ко-многим
- Дедлайны с нативными уведомлениями macOS/Windows
- Вложения: drag-and-drop, файл-пикер, авто-очистка осиротевших файлов
- Приоритеты: 9-факторная модель с визуальными индикаторами
- Тайм-трекинг: запуск/стоп таймера, накопление времени, ручная правка

</details>

<details>
<summary><strong>🧩 Расширения (13 модулей)</strong></summary>

| Модуль | Описание |
|---|---|
| **Поиск** | Глобальный поиск с булевыми выражениями (`&&`, `\|\|`) и поиском по тегам |
| **Календарь** | День/неделя/месяц: дедлайны и блоки времени |
| **Напоминания** | Системные уведомления по расписанию |
| **Граф** | Визуализация связей задач (D3.js force-directed graph) |
| **Статистика** | Недельная аналитика: тренды, топ задач, разбивка по дням |
| **AI Ассистент** `🚧 beta` | Локальный LLM: чат, поиск, создание задач, память |
| **Автоматизации** | Повторяющиеся карточки, авто-сортировка, авто-очистка |
| **Дедлайны** | Просроченные и ближайшие дедлайны |
| **Приоритеты** | Цветовые метки и эмодзи приоритетов |
| **Экспорт** | Выгрузка карточек в Markdown |
| **Табы** | Переключение между рабочими пространствами |
| **Пространство** `🚧 beta` | Бесконечный векторный холст (DoeSpace): рисование, текст, соединения |
| **Запоминание** | Интервальное повторение (SRS, алгоритм SM-2) для фактов и заметок |

</details>

<details>
<summary><strong>🤖 AI Ассистент</strong> · 🚧 beta</summary>

> **В активной разработке.** Ассистент рабочий, но ещё дорабатывается — поведение, набор действий и линейка моделей могут меняться.

Работает **полностью оффлайн** — локальная **Gemma 4** (Google), Apple Silicon с Metal-ускорением и flash-attention (macOS arm64). Линейка моделей скачивается через HuggingFace:

| Модель | Параметры | Размер |
|---|---|---|
| Gemma 4 E2B | 2.3B | ~3.1 GB |
| Gemma 4 E4B | 4.5B | ~4.8 GB |
| Gemma 4 12B | 12B | ~6.5 GB |
| Gemma 4 26B (A4B MoE) | 26B | ~13.5 GB |

- **Умеет:** искать по доске, создавать/менять/удалять задачи, двигать карточки, создавать колонки и пространства, менять тему и язык, включать расширения, приоритизировать задачи, ставить напоминания
- **Память:** запоминает факты между сессиями (`~/.doe_app/memory/`)

</details>

<details>
<summary><strong>⚙️ Настройки</strong></summary>

- Тема: светлая / тёмная (CSS-переменные)
- Язык: русский / English
- Кастомные шрифты: системный пикер или `.ttf` / `.woff2` в хранилище
- Хранилище вложений: внутри vault или глобальная папка
- Приоритеты: настройка порогов, цветов и эмодзи

</details>

---

## ⌨ Горячие клавиши

| Клавиши | Действие |
|---|---|
| `Cmd/Ctrl + F` | Поиск — по доске, либо внутри открытой карточки |
| `Cmd/Ctrl + \` | Свернуть / развернуть вкладки |
| `Esc` | Закрыть модальное окно / отменить редактирование |

---

## 🛠 Разработка

```bash
# Миграции Alembic
alembic revision --autogenerate -m "описание"
alembic upgrade head
alembic downgrade -1
```

```
# Структура проекта
src/
├── api/v1/          # FastAPI роутеры (columns, tasks, workspaces, system, ai, automations, memory)
├── core/            # config, watcher, vault_crypto, biometric, fs_store (Obsidian-vault), attach_jobs
├── db/              # database.py, models.py
├── services/        # task_service, column_service, workspace_service, ai_service, automation_service, memory_service, srs, hardware
└── schemas/         # Pydantic DTO (task, column, workspace, automation)
frontend/
├── index.html       # точка входа (~1.9k строк)
├── app.js           # вся логика (~17k строк)
├── styles.css       # стили (~10k строк)
└── space.js         # расширение «Пространство» (~1.7k строк)
wrapper.py           # точка входа, менеджмент окна
main.py              # FastAPI-приложение (in-process ASGI, без сетевого сервера)
notify_worker.py     # фоновый воркер уведомлений
build.py             # кросс-платформенный сборщик
rewrite.py           # AI-рефакторинг через git
gather_context.py    # сбор контекста кода для AI-диалогов
dev_stats.py         # статистика разработки
make_dmg.sh          # сборка DMG-образов
```

---

## 🚧 Планы

- **Локальный AI-ассистент** — доработка набора действий, стриминг ответов, поддержка большего числа моделей
- **Пространство (бесконечный холст)** — богаче инструменты рисования и встраивание карточек
- **Скриншоты и демо-GIF** в этом README
- **Автотесты и CI** для слоя API

---

<p align="center">
  <sub>Сделано с любовью к деталям. Данные — твои. Приватность — абсолютная.</sub>
</p>
