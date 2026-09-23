<p align="center">
  <img src="doe.png" alt="Doe" width="120" />
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/English-555c66?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MCAzMCI%2bPGNsaXBQYXRoIGlkPSJhIj48cGF0aCBkPSJNMCAwdjMwaDYwVjB6Ii8%2bPC9jbGlwUGF0aD48cGF0aCBkPSJNMCAwdjMwaDYwVjB6IiBmaWxsPSIjMDEyMTY5Ii8%2bPHBhdGggZD0iTTAgMGw2MCAzMG0wLTMwTDAgMzAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2Ii8%2bPHBhdGggZD0iTTAgMGw2MCAzMG0wLTMwTDAgMzAiIGNsaXAtcGF0aD0idXJsKCNhKSIgc3Ryb2tlPSIjQzgxMDJFIiBzdHJva2Utd2lkdGg9IjQiLz48cGF0aCBkPSJNMzAgMHYzME0wIDE1aDYwIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMTAiLz48cGF0aCBkPSJNMzAgMHYzME0wIDE1aDYwIiBzdHJva2U9IiNDODEwMkUiIHN0cm9rZS13aWR0aD0iNiIvPjwvc3ZnPgo%3d"></a>
  <a href="README_RU.md"><img alt="Русский" src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-0969da?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDYiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoOXYySDB6Ii8%2bPHBhdGggZmlsbD0iIzAwMzlBNiIgZD0iTTAgMmg5djJIMHoiLz48cGF0aCBmaWxsPSIjRDUyQjFFIiBkPSJNMCA0aDl2MkgweiIvPjwvc3ZnPgo%3d"></a>
</p>

<h1 align="center">Doe</h1>

<p align="center">
  <strong>Aesthetic. Local-first. Kanban sanctuary.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
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

### Сборка (macOS arm64)

```bash
make install   # виртуальное окружение + зависимости (первый раз)
make build     # dist/Doe.app
make install-app  # сборка + установка в /Applications
```

Другие полезные цели: `make run` (dev-режим), `make check` (дымовой тест бэкенда), `make clean`.

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
```


---

## 🧱 Архитектура

Без локального сервера и открытых портов: UI общается с бэкендом через мост
`window.pywebview.api`, а FastAPI-приложение работает **in-process** как
обычная ASGI-библиотека. Нулевая сетевая поверхность атаки, полностью офлайн.

```
┌──────────────────────────────────────────────┐
│          Desktop Window (pywebview)          │
│  ┌────────────────────────────────────────┐  │
│  │    index.html · app.js · styles.css    │  │
│  │   Vanilla JS · fetch() → мост-шим      │  │
│  └────────────────────┬───────────────────┘  │
│                       │ window.pywebview.api │
│  ┌────────────────────┴───────────────────┐  │
│  │  In-process ASGI (FastAPI, без сокета) │  │
│  │  /api/v1/columns                       │  │
│  │  /api/v1/tasks          CRUD + move    │  │
│  │  /api/v1/workspaces                    │  │
│  │  /api/v1/system     vault/настройки    │  │
│  └────────────────────┬───────────────────┘  │
│  ┌────────────────────┴───────────────────┐  │
│  │  SQLAlchemy 2.0 (async) + aiosqlite    │  │
│  │  Миграции Alembic                      │  │
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
| **Фронтенд** | Vanilla JS (~15k строк) · CSS (~9k строк) · space.js (~1.7k) |
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

</details>

<details>
<summary><strong>📝 Карточки задач</strong></summary>

- Markdown-описание с живым предпросмотром
- Чек-листы (подзадачи) через связи многие-ко-многим
- Вложения: drag-and-drop, файл-пикер, авто-очистка осиротевших файлов
- Приоритеты: 9-факторная модель с визуальными индикаторами
- Тайм-трекинг: запуск/стоп таймера, накопление времени, ручная правка

</details>

<details>
<summary><strong>🧩 Расширения (8 модулей)</strong></summary>

| Модуль | Описание |
|---|---|
| **Поиск** | Глобальный поиск с булевыми выражениями (`&&`, `\|\|`) и поиском по тегам |
| **Календарь** | День/неделя/месяц: блоки времени |
| **Напоминания** | Системные уведомления по расписанию |
| **Граф** | Визуализация связей задач (D3.js force-directed graph) |
| **Статистика** | Недельная аналитика: тренды, топ задач, разбивка по дням |
| **Приоритеты** | Цветовые метки и эмодзи приоритетов |
| **Табы** | Переключение между рабочими пространствами |
| **Пространство** `🚧 beta` | Бесконечный векторный холст (DoeSpace): рисование, текст, соединения |

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
# Структура проекта
src/
├── api/v1/          # FastAPI роутеры (columns, tasks, workspaces, system)
├── core/            # config, watcher, vault_crypto, biometric, fs_store (Obsidian-vault), attach_jobs
├── db/              # database.py, models.py
├── services/        # task_service, column_service, workspace_service
└── schemas/         # Pydantic DTO (task, column, workspace)
frontend/
├── index.html       # точка входа (~1.5k строк)
├── app.js           # вся логика (~15k строк)
├── styles.css       # стили (~9k строк)
└── space.js         # расширение «Пространство» (~1.7k строк)
wrapper.py           # точка входа: окно + мост pywebview
main.py              # FastAPI-приложение (in-process ASGI, без сетевого сервера)
Makefile             # install / run / build / install-app / check / clean (macOS arm64)
notify_worker.py     # фоновый воркер уведомлений
build.py             # сборщик под macOS arm64 (вызывается через `make build`)
make_dmg.sh          # сборка DMG-образов
```

---

## 🚧 Планы

- **Пространство (бесконечный холст)** — богаче инструменты рисования и встраивание карточек
- **Скриншоты и демо-GIF** в этом README

---

<p align="center">
  <sub>Сделано с любовью к деталям. Данные — твои. Приватность — абсолютная.</sub>
</p>
