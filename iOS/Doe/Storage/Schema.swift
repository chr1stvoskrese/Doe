//
//  Schema.swift
//  Doe
//
//  Точная схема базы данных, идентичная той, что десктоп-версия получает после
//  прогона всех миграций Alembic вплоть до head-ревизии `m1n2e3m4o5r6`.
//  DDL снят дословно из эталонной БД, созданной реальными миграциями проекта.
//
//  Когда новый vault создаётся на iOS, мы:
//   1) создаём ВСЕ таблицы/индексы/FTS5/триггеры ровно как Alembic;
//   2) штампуем alembic_version = head — тогда десктоп при открытии видит,
//      что миграции уже применены, и не пытается ничего пересоздавать.
//  Это гарантирует, что папка, созданная на iPhone, открывается на Mac без ошибок.
//

import Foundation

enum Schema {
    /// Head-ревизия Alembic (последняя миграция: add_memory_items).
    static let headRevision = "m1n2e3m4o5r6"

    /// Полный набор DDL-операторов в порядке создания.
    /// Точное соответствие выводу `SELECT sql FROM sqlite_master` десктопной БД.
    static let ddl: [String] = [
        """
        CREATE TABLE workspaces (
            id INTEGER NOT NULL,
            name VARCHAR NOT NULL,
            position FLOAT,
            created_at DATETIME,
            PRIMARY KEY (id)
        )
        """,
        "CREATE INDEX ix_workspaces_id ON workspaces (id)",
        """
        CREATE TABLE columns (
            id INTEGER NOT NULL,
            title VARCHAR NOT NULL,
            mode VARCHAR(10),
            position FLOAT,
            collapsed BOOLEAN,
            workspace_id INTEGER NOT NULL,
            created_at DATETIME,
            updated_at DATETIME,
            width FLOAT,
            PRIMARY KEY (id),
            FOREIGN KEY(workspace_id) REFERENCES workspaces (id)
        )
        """,
        "CREATE INDEX ix_columns_id ON columns (id)",
        """
        CREATE TABLE "tasks" (
            id INTEGER NOT NULL,
            title VARCHAR NOT NULL,
            description VARCHAR,
            attachments_order JSON,
            column_id INTEGER NOT NULL,
            position FLOAT,
            created_at DATETIME,
            updated_at DATETIME,
            completed_at DATETIME,
            is_visible_on_board BOOLEAN DEFAULT '0' NOT NULL,
            folded_headings JSON DEFAULT '[]' NOT NULL,
            due_date DATETIME,
            priority FLOAT,
            priority_data JSON,
            PRIMARY KEY (id),
            FOREIGN KEY(column_id) REFERENCES columns (id)
        )
        """,
        "CREATE INDEX ix_tasks_id ON tasks (id)",
        """
        CREATE TABLE timer_sessions (
            id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            is_active BOOLEAN,
            PRIMARY KEY (id),
            FOREIGN KEY(task_id) REFERENCES tasks (id)
        )
        """,
        "CREATE INDEX ix_timer_sessions_id ON timer_sessions (id)",
        """
        CREATE TABLE task_relations (
            parent_id INTEGER NOT NULL,
            child_id INTEGER NOT NULL,
            PRIMARY KEY (parent_id, child_id),
            FOREIGN KEY(child_id) REFERENCES tasks (id) ON DELETE CASCADE,
            FOREIGN KEY(parent_id) REFERENCES tasks (id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE automations (
            id INTEGER NOT NULL,
            type VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            enabled BOOLEAN DEFAULT '1' NOT NULL,
            config JSON NOT NULL,
            last_run_at DATETIME,
            next_run_at DATETIME,
            created_at DATETIME DEFAULT (datetime('now')) NOT NULL,
            updated_at DATETIME DEFAULT (datetime('now')) NOT NULL,
            PRIMARY KEY (id)
        )
        """,
        """
        CREATE TABLE memory_items (
            id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            fragment_text VARCHAR,
            enabled BOOLEAN,
            state VARCHAR,
            step_index INTEGER,
            ease_factor FLOAT,
            interval_days FLOAT,
            repetitions INTEGER,
            lapses INTEGER,
            due_at DATETIME,
            last_reviewed_at DATETIME,
            last_grade INTEGER,
            created_at DATETIME,
            updated_at DATETIME,
            PRIMARY KEY (id),
            FOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE
        )
        """,
        "CREATE INDEX ix_memory_items_id ON memory_items (id)",
        "CREATE INDEX ix_memory_items_task_id ON memory_items (task_id)",
        "CREATE INDEX ix_memory_items_due_at ON memory_items (due_at)",
        // FTS5 поиск + триггеры синхронизации (нужны, иначе INSERT в tasks на Mac упадёт)
        """
        CREATE VIRTUAL TABLE tasks_fts USING fts5(
            title,
            description,
            content='tasks',
            content_rowid='id',
            tokenize='unicode61'
        )
        """,
        """
        CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
            INSERT INTO tasks_fts(rowid, title, description)
            VALUES (new.id, new.title, new.description);
        END
        """,
        """
        CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
            INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
            VALUES('delete', old.id, old.title, old.description);
        END
        """,
        """
        CREATE TRIGGER tasks_au AFTER UPDATE ON tasks BEGIN
            INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
            VALUES('delete', old.id, old.title, old.description);
            INSERT INTO tasks_fts(rowid, title, description)
            VALUES (new.id, new.title, new.description);
        END
        """,
        """
        CREATE TABLE alembic_version (
            version_num VARCHAR(32) NOT NULL,
            CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
        )
        """,
    ]

    /// Создаёт пустую базу с полной схемой и штампом head-ревизии, затем
    /// засевает дефолтную вкладку с тремя колонками (как делает десктоп).
    static func createSchema(in db: Database, language: String) throws {
        try db.transaction {
            for stmt in ddl {
                try db.exec(stmt)
            }
            try db.run("INSERT INTO alembic_version (version_num) VALUES (?)",
                       [.text(headRevision)])

            // Дефолтное наполнение — идентично src/db/database.py
            let wsName = language == "en" ? "Main Board" : "Начальная вкладка"
            let col1 = language == "en" ? "To Do" : "Входящие"
            let col2 = language == "en" ? "In Progress" : "В работе"
            let col3 = language == "en" ? "Done" : "Готово"
            let now = DoeDate.now()

            let wsId = try db.run(
                "INSERT INTO workspaces (name, position, created_at) VALUES (?, ?, ?)",
                [.text(wsName), .double(1.0), .text(now)])

            let cols: [(String, String, Double)] = [
                (col1, ColumnMode.default.rawValue, 1.0),
                (col2, ColumnMode.trackTime.rawValue, 2.0),
                (col3, ColumnMode.completion.rawValue, 3.0),
            ]
            for (title, mode, pos) in cols {
                try db.run("""
                    INSERT INTO columns (title, mode, position, collapsed, workspace_id, created_at, updated_at)
                    VALUES (?, ?, ?, 0, ?, ?, ?)
                    """,
                    [.text(title), .text(mode), .double(pos), .int(wsId), .text(now), .text(now)])
            }
        }
    }
}

/// Преобразование дат в формат, который пишет десктоп (SQLAlchemy + SQLite):
/// наивный UTC "YYYY-MM-DD HH:MM:SS.ffffff".
enum DoeDate {
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss.SSSSSS"
        return f
    }()

    /// Текущий момент в строковом формате БД.
    static func now() -> String { string(from: Date()) }

    /// Date -> строка БД.
    static func string(from date: Date) -> String { formatter.string(from: date) }

    /// Строка БД -> Date (терпимо к отсутствию микросекунд и к суффиксу 'Z'/'T').
    static func date(from raw: String?) -> Date? {
        guard var s = raw, !s.isEmpty else { return nil }
        s = s.replacingOccurrences(of: "T", with: " ")
        if s.hasSuffix("Z") { s.removeLast() }
        if let d = formatter.date(from: s) { return d }
        // Фолбэк без микросекунд.
        let alt = DateFormatter()
        alt.locale = Locale(identifier: "en_US_POSIX")
        alt.timeZone = TimeZone(identifier: "UTC")
        alt.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return alt.date(from: String(s.prefix(19)))
    }
}
