<p align="center">
  <img src="doe.png" alt="Doe" width="120" />
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/English-0969da?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MCAzMCI%2bPGNsaXBQYXRoIGlkPSJhIj48cGF0aCBkPSJNMCAwdjMwaDYwVjB6Ii8%2bPC9jbGlwUGF0aD48cGF0aCBkPSJNMCAwdjMwaDYwVjB6IiBmaWxsPSIjMDEyMTY5Ii8%2bPHBhdGggZD0iTTAgMGw2MCAzMG0wLTMwTDAgMzAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2Ii8%2bPHBhdGggZD0iTTAgMGw2MCAzMG0wLTMwTDAgMzAiIGNsaXAtcGF0aD0idXJsKCNhKSIgc3Ryb2tlPSIjQzgxMDJFIiBzdHJva2Utd2lkdGg9IjQiLz48cGF0aCBkPSJNMzAgMHYzME0wIDE1aDYwIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMTAiLz48cGF0aCBkPSJNMzAgMHYzME0wIDE1aDYwIiBzdHJva2U9IiNDODEwMkUiIHN0cm9rZS13aWR0aD0iNiIvPjwvc3ZnPgo%3d"></a>
  <a href="README_RU.md"><img alt="Русский" src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-555c66?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDYiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoOXYySDB6Ii8%2bPHBhdGggZmlsbD0iIzAwMzlBNiIgZD0iTTAgMmg5djJIMHoiLz48cGF0aCBmaWxsPSIjRDUyQjFFIiBkPSJNMCA0aDl2MkgweiIvPjwvc3ZnPgo%3d"></a>
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

> **Doe** — a desktop Kanban app for those who value aesthetics, privacy, and complete control over their data.
> No clouds, subscriptions, or sign-ups. Just you, your tasks, and a local database.

<br>

<p align="center">
  <a href="#-why-doe">Why Doe</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-keyboard-shortcuts">Keyboard Shortcuts</a> ·
  <a href="#-development">Development</a>
</p>

---

## ✨ Why Doe?

<table>
<tr>
  <td width="50%" valign="top">

**🔒 100% Local** — All data is stored in a vault folder on your computer. Inside — Obsidian-compatible files (.md with YAML frontmatter) and a hidden SQLite index. Want to put the vault in iCloud and sync between Macs? Go ahead. A USB stick? Works too. Nobody but you has access.

  </td>
  <td width="50%" valign="top">

**📝 Markdown Editor** — Full-featured editor with live preview, collapsible headings, syntax highlighting (Prism.js), math (KaTeX), and drag-and-drop attachments.

  </td>
</tr>
<tr>
  <td width="50%" valign="top">

**🎨 Aesthetics in Everything** — Dark and light themes, custom fonts, smooth animations, thoughtful typography. The board looks as good as it works.

  </td>
  <td width="50%" valign="top">

**🔗 Task Links** — Many-to-many relationships: parent, child, dependent tasks. The relationship graph is visualized with D3.js.

  </td>
</tr>
<tr>
  <td width="50%" valign="top">

**⏱️ Built-in Time Tracker** — Start a timer on a task — time is written to the database. The calendar shows your daily breakdown. Statistics sum up your week.

  </td>
  <td width="50%" valign="top">

**📊 Priorities** — 9-factor importance model: value, success chance, background burden, process pain, drag, reporting need, proactivity, serenity, harm.

  </td>
</tr>
<tr>
  <td width="50%" valign="top">

**🔐 Vault Encryption** — Password-protect your entire vault with **AES-256-GCM + scrypt**. Even if someone gets your files — they're useless without the password. Optionally unlock with **Touch ID** on macOS. Your data, your rules.

  </td>
  <td width="50%" valign="top">

**🌍 Russian & English** — Full UI localization in two languages. Switch on the fly.

  </td>
</tr>
</table>

---

## 🖼 Screenshots

<p align="center">
  <em>Screenshots coming soon.</em>
</p>

---

## 🚀 Quick Start

### macOS (Apple Silicon)

```bash
# 1. Clone
git clone https://github.com/chr1stvoskrese/Doe.git
cd Doe

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run
python wrapper.py
```

### Build (macOS arm64)

```bash
make install   # virtualenv + dependencies (first time)
make build     # dist/Doe.app
make install-app  # build + install into /Applications
```

Other useful targets: `make run` (dev mode), `make check` (backend smoke test), `make clean`.

### Windows

```bat
:: 1. Clone and navigate
git clone https://github.com/chr1stvoskrese/Doe.git
cd Doe

:: 2. Virtual environment and dependencies
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

:: 3. Run
python wrapper.py
```


---

## 🧱 Architecture

No local server, no open ports: the UI talks to the backend through the
`window.pywebview.api` bridge, and the FastAPI app runs **in-process** as a
plain ASGI library. Zero network attack surface, fully offline.

```
┌──────────────────────────────────────────────┐
│          Desktop Window (pywebview)          │
│  ┌────────────────────────────────────────┐  │
│  │    index.html · js/ · styles/          │  │
│  │   Vanilla JS · fetch() → bridge shim   │  │
│  └────────────────────┬───────────────────┘  │
│                       │ window.pywebview.api │
│  ┌────────────────────┴───────────────────┐  │
│  │   In-process ASGI (FastAPI, no socket) │  │
│  │  /api/v1/columns                       │  │
│  │  /api/v1/tasks          CRUD + move    │  │
│  │  /api/v1/workspaces                    │  │
│  │  /api/v1/system     vault/settings     │  │
│  └────────────────────┬───────────────────┘  │
│  ┌────────────────────┴───────────────────┐  │
│  │  SQLAlchemy 2.0 (async) + aiosqlite    │  │
│  │  Alembic migrations                    │  │
│  └────────────────────┬───────────────────┘  │
└───────────────────────┼──────────────────────┘
                        │
┌───────────────────────┴──────────────────────┐
│             Vault folder on disk             │
│  ├── .doe.index.db.doe   (SQLite index)      │
│  ├── Columns/             (.md + frontmatter)│
│  └── attachments/                            │
│  Obsidian-compatible                         │
└──────────────────────────────────────────────┘
```

| Layer | Technology |
|---|---|
| **Runtime** | Python 3.12 · FastAPI 0.115 (in-process ASGI, no network server) |
| **Database** | SQLite (aiosqlite) · SQLAlchemy 2.0 (async) |
| **Migrations** | Alembic |
| **Desktop** | pywebview (native OS WebView) |
| **Build** | PyInstaller (`.app` / `.exe`) |
| **Frontend** | Vanilla JS (~15k lines) · CSS (~10k lines) |
| **Storage** | SQLite (+aiosqlite) **and** Obsidian-compatible file store (FS Store v2) |
| **Editor** | CodeMirror · Marked.js · Prism.js · KaTeX |
| **Sync** | pywebview bridge push · watchdog |

---

## 📦 Features

<details open>
<summary><strong>📋 Kanban Board</strong></summary>

- Unlimited workspaces (tabs) and columns
- Drag-and-drop cards between and within columns
- Three column modes: **Normal**, **Time Tracker**, **Close-out**
- Collapsible columns, adjustable width, keyboard shortcuts

</details>

<details>
<summary><strong>📝 Task Cards</strong></summary>

- Markdown description with live preview
- Checklists (subtasks) via many-to-many relations
- Attachments: drag-and-drop, file picker, auto-cleanup of orphaned files
- Priorities: 9-factor model with visual indicators
- Time tracking: start/stop timer, accumulated time, manual adjustment

</details>

<details>
<summary><strong>🧩 Extensions (8 modules)</strong></summary>

| Module | Description |
|---|---|
| **Search** | Global search with boolean expressions (`&&`, `\|\|`) and tag search |
| **Calendar** | Day/week/month: time blocks |
| **Reminders** | System notifications on schedule |
| **Graph** | Task relationship visualization (hand-rolled canvas graph) |
| **Statistics** | Weekly analytics: trends, top tasks, daily breakdown |
| **Priorities** | Color labels and emoji for priorities |
| **Tabs** | Switch between workspaces |
| **Space** `🚧 beta` | Infinite vector canvas (DoeSpace): drawing, text, connections |

</details>

<details>
<summary><strong>⚙️ Settings</strong></summary>

- Theme: light / dark (CSS variables)
- Language: Russian / English
- Custom fonts: system picker or `.ttf` / `.woff2` from storage
- Attachment storage: inside vault or global folder
- Priorities: configure thresholds, colors, and emoji

</details>

---

## ⌨ Keyboard Shortcuts

| Keys | Action |
|---|---|
| `Cmd/Ctrl + F` | Search — across the board or within an open card |
| `Cmd/Ctrl + \` | Collapse / expand tabs |
| `Esc` | Close modal / cancel editing |

---

## 🛠 Development

```bash
# Alembic migrations
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
```
# Project structure
src/
├── api/v1/          # columns, tasks, workspaces, system/ (vault, security, settings, attachments, stats, reminders, search, graph, calendar, fonts)
├── core/            # config, watcher, vault_crypto, biometric, fs_store (Obsidian-vault), attach_jobs, notifications
├── db/              # database.py, models.py
├── services/        # task_service, column_service, workspace_service
└── schemas/         # Pydantic DTOs (task, column, workspace, system)
frontend/
├── index.html       # entry point, ordered <script> / <link> includes
├── js/              # logic in 27 ordered scripts (00_core … 110_chrome, no bundler)
└── styles/          # styles by feature (00_base … 90_media, link order matters)
launcher/            # GUI runtime: bridge, api (WindowAPI), main, macos, platform, logging_setup, vault_exit
main.py              # FastAPI app (in-process ASGI, no network server)
Makefile             # install / run / build / install-app / check / clean (macOS arm64)
notify_worker.py     # background notification worker
build.py             # macOS arm64 builder (called via `make build`)
```

---

## 🚧 Roadmap

- **Space (infinite canvas)** — richer drawing tools and inline card embedding
- **Screenshots & demo GIFs** in this README

---

<p align="center">
  <sub>Crafted with love for detail. Your data is yours. Privacy is absolute.</sub>
</p>
