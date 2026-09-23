# Doe — agent map (read this first, ~1k tokens)

Local-first desktop Kanban (Python 3.12+ backend, vanilla JS frontend, SQLite).
No network server: FastAPI runs **in-process**, frontend calls it via
`window.pywebview.api.api_request` (ASGI bridge, no socket/ports/CORS).

## Commands (macOS arm64 only)

- `make install` — venv + deps (first time) · `make run` — dev (`python wrapper.py`)
- `make build` — `dist/Doe.app` (PyInstaller) · `make install-app` — + copy to /Applications
- `make check` — backend smoke (imports, routes, `alembic heads`, extensions)
- `make clean` — rm `build/ dist/ Doe.spec`

## Entry points

- `wrapper.py` (83) — PyInstaller entry. `--worker …` (7 args) → `src/core/notifications.py`;
  else macOS early init → logging → re-exports (`WindowAPI`, `runtime_index_url`,
  `DATA_LOOP` — required, backend finds them via `sys.modules['wrapper']`) → `launcher.main:main()`
- `main.py` (225) — FastAPI `app` (in-process only) + `startup()`/`shutdown()` (called by DataLoop thread)
- `notify_worker.py` (26) — thin shim over `src/core/notifications.py` (built as separate console binary inside `.app`)
- `build.py` (208) — arm64-only builder, called by `make build`

## Backend map (`src/`)

- `api/v1/columns.py` (112), `tasks.py` (145), `workspaces.py` (36) — CRUD routers
- `api/v1/system/` — 44 endpoints, split by domain (aggregate `router` in `__init__.py`, prefix `/system`):
  `vault.py` (494: vault/switch/create/history/highlight/startup) · `security.py` (256: unlock/lock/password/Touch ID)
  · `settings.py` (154) · `attachments.py` (533: upload/stream/pdfjs/attach/open-link/reveal/cleanup)
  · `stats.py` (173) · `reminders.py` (36) · `search.py` (502: boolean `&&`/`||` parser + tags)
  · `graph.py` (42) · `calendar.py` (53, timer sessions only) · `fonts.py` (111)
- `schemas/` — `task.py`, `column.py`, `workspace.py`, `system.py` (144: all system DTOs)
- `services/` — `task_service.py` (686), `column_service.py` (219), `workspace_service.py` (52)
- `core/` — `config.py` (467: `~/.doe_config.json`, extensions allowlist = search,calendar,reminders,graph,tabs,priority,statistics)
  · `fs_store.py` (980: Obsidian-compatible `.md` vault = source of truth, SQLite is an index)
  · `vault_crypto.py` (559: AES-256-GCM+scrypt) · `notifications.py` (417: shared worker logic, stdlib-only)
  · `watcher.py` (170: watchdog) · `attach_jobs.py` (214) · `biometric.py` (187: Touch ID)
- `db/` — `models.py` (130: workspaces→columns→tasks, M2M `task_relations`, timer_sessions), `database.py` (399)
- `launcher/` — `bridge.py` (206: DataLoop, `runtime_index_url`, `DATA_LOOP`)
  · `api.py` (634: `WindowAPI` = `_DataBridgeMixin` + `_WinChromeMixin`) · `api_data.py` (78) · `api_winchrome.py` (491)
  · `main.py` (333: signals/window/webview loop) · `macos.py` (555: AppKit patches, DnD intercept, `odoc` handler)
  · `platform.py` (407: geometry/DPI) · `logging_setup.py` (129) · `vault_exit.py` (47)
- `alembic/versions/` — single head; vaults migrate automatically on open

## Frontend map (`frontend/`, no bundler — plain ordered `<script>`/`<link>` in `index.html`)

- `index.html` (1524) — markup + include order (do not reorder includes)
- `js/` (27 files, numeric order = load order, shared globals, no modules):
  `00_core` globals · `10_i18n` dicts · `20_shell` exit/fonts/extensions · `30_data` markdown-worker+API+utils
  · `40_board`+`41_forms` rendering · `50_tabs_menus`+`51_renames` · `55_drag`+`56_router` (global click router)
  · `60_card_modal`+`61_chrome` · `65_code`+`66_subtasks`+`67_editor` (CodeMirror)+`68_modal_attachments`
  · `70_vault` selector · `80_overlays`+`81_picknotify` (search/datepicker/notify/priority)
  · `85_sanitize` (also `.toString()`-injected into preview Web Worker — keep global functions)
  · `86_fragpdf` · `87_localsearch` · `88_graph` (hand-rolled canvas, no D3) · `89_stats`
  · `90_boot` (fetch-shim + boot IIFE — single `DOMContentLoaded` lives here) · `100_calendar` · `110_chrome`
- `styles/` (17 files, link order = cascade order, do not reorder):
  `00_base` · `10_board` · `11_modal_chrome` · `20_modals` · `21_tabs` · `30_markdown` · `40_subtasks`
  · `41_attachments` · `50_overlays` · `60_graph` · `61_calendar` · `70_stats` · `80_vault`
  · `82_code_media` · `86_space` · `88_md_obsidian` · `90_media`
- Vendor (don't touch): `codemirror/prism/marked/katex.min.*`, `fonts/` (KaTeX)

## Contracts & pitfalls (violations break the app)

1. All modules ≤1000 lines (project rule). Split at `}`+blank boundaries; verify by concatenating in include order == byte-identical.
2. `file://` + no build step: no ES `import/export` in frontend; inline `onclick="fn()"` needs globals; worker injection needs global fns.
3. CSS link order IS the cascade. JS numeric order IS execution order. Never reorder includes.
4. Backend contract: paths/methods under `/api/v1/*` are the frontend API — compare route sets before/after refactors.
5. `sys.modules['wrapper']` must expose `WindowAPI` + `runtime_index_url` (used by `system/vault.py`).
6. Worker argv: `wrapper.py --worker due title message task_id vault reminder` (8+); `notify_worker` reads vault from config by reminder_id. Shared flow in `src/core/notifications.py` (stdlib-only — keep it so).
7. State locations: `~/.doe_config.json`, vault dir = `.md` files + `.doe.index.db.doe`, `~/.doe_runtime/`, `~/.doe/vendor/`, logs `~/.log.doe.txt` or `<vault>/<vault>.log.doe.txt`.
8. Tests: no suite — verify with `make check` + ASGI spot-checks + `make build`; GUI needs manual click-through.
