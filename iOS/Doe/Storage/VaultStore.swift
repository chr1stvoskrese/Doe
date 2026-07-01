//
//  VaultStore.swift
//  Doe
//
//  Репозиторий поверх Database. Повторяет бизнес-логику десктопа
//  (src/services/*.py) в объёме, нужном минимальной iOS-версии:
//  вкладки, колонки, карточки, граф подзадач All-to-All, перемещение.
//
//  Все методы синхронные и предназначены для вызова через единый
//  координатор (VaultManager), который оборачивает доступ к файлу
//  в NSFileCoordinator и серийную очередь.
//

import Foundation

final class VaultStore {
    let db: Database

    init(db: Database) { self.db = db }

    // MARK: - JSON helpers

    private func encodeJSONArray(_ arr: [String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: arr),
              let s = String(data: data, encoding: .utf8) else { return "[]" }
        return s
    }

    private func decodeJSONArray(_ raw: String?) -> [String] {
        guard let raw, let data = raw.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [String] else { return [] }
        return arr
    }

    // MARK: - Workspaces (вкладки)

    func fetchWorkspaces() throws -> [Workspace] {
        let rows = try db.query("SELECT id, name, position, created_at FROM workspaces ORDER BY position")
        return rows.map {
            Workspace(id: $0.int("id") ?? 0,
                      name: $0.string("name") ?? "",
                      position: $0.double("position") ?? 0,
                      createdAt: DoeDate.date(from: $0.string("created_at")))
        }
    }

    @discardableResult
    func createWorkspace(name: String) throws -> Int64 {
        let last = try db.query("SELECT position FROM workspaces ORDER BY position DESC LIMIT 1")
        let pos = (last.first?.double("position") ?? 0) + 1.0
        return try db.run("INSERT INTO workspaces (name, position, created_at) VALUES (?, ?, ?)",
                          [.text(name), .double(pos), .text(DoeDate.now())])
    }

    func renameWorkspace(id: Int64, name: String) throws {
        try db.run("UPDATE workspaces SET name = ? WHERE id = ?", [.text(name), .int(id)])
    }

    func deleteWorkspace(id: Int64) throws {
        // Удаляем каскадно вручную: задачи колонок -> колонки -> вкладка.
        try db.transaction {
            let cols = try db.query("SELECT id FROM columns WHERE workspace_id = ?", [.int(id)])
            for c in cols {
                guard let cid = c.int("id") else { continue }
                try db.run("DELETE FROM tasks WHERE column_id = ?", [.int(cid)])
            }
            try db.run("DELETE FROM columns WHERE workspace_id = ?", [.int(id)])
            try db.run("DELETE FROM workspaces WHERE id = ?", [.int(id)])
        }
    }

    func reorderWorkspaces(orderedIds: [Int64]) throws {
        try db.transaction {
            for (idx, wid) in orderedIds.enumerated() {
                try db.run("UPDATE workspaces SET position = ? WHERE id = ?",
                          [.double(Double(idx)), .int(wid)])
            }
        }
    }

    // MARK: - Columns (колонки)

    func fetchColumns(workspaceId: Int64) throws -> [Column] {
        let rows = try db.query("""
            SELECT id, title, mode, position, collapsed, workspace_id, width
            FROM columns WHERE workspace_id = ? ORDER BY position
            """, [.int(workspaceId)])
        return rows.map {
            Column(id: $0.int("id") ?? 0,
                   title: $0.string("title") ?? "",
                   mode: ColumnMode.parse($0.string("mode")),
                   position: $0.double("position") ?? 0,
                   collapsed: $0.bool("collapsed") ?? false,
                   workspaceId: $0.int("workspace_id") ?? workspaceId,
                   width: $0.double("width"))
        }
    }

    @discardableResult
    func createColumn(workspaceId: Int64, title: String, mode: ColumnMode = .default) throws -> Int64 {
        let last = try db.query("SELECT position FROM columns WHERE workspace_id = ? ORDER BY position DESC LIMIT 1",
                                [.int(workspaceId)])
        let pos = (last.first?.double("position") ?? 0) + 1.0
        let now = DoeDate.now()
        return try db.run("""
            INSERT INTO columns (title, mode, position, collapsed, workspace_id, created_at, updated_at)
            VALUES (?, ?, ?, 0, ?, ?, ?)
            """, [.text(title), .text(mode.rawValue), .double(pos), .int(workspaceId), .text(now), .text(now)])
    }

    func updateColumn(id: Int64, title: String? = nil, mode: ColumnMode? = nil, width: Double?? = nil) throws {
        var sets: [String] = []
        var params: [SQLValue] = []
        if let title { sets.append("title = ?"); params.append(.text(title)) }
        if let mode { sets.append("mode = ?"); params.append(.text(mode.rawValue)) }
        if let width { // двойной optional: .some(nil) -> сбросить в NULL
            sets.append("width = ?")
            params.append(width == nil ? .null : .double(width!))
        }
        guard !sets.isEmpty else { return }
        sets.append("updated_at = ?"); params.append(.text(DoeDate.now()))
        params.append(.int(id))
        try db.run("UPDATE columns SET \(sets.joined(separator: ", ")) WHERE id = ?", params)
    }

    func deleteColumn(id: Int64) throws {
        try db.transaction {
            try db.run("DELETE FROM tasks WHERE column_id = ?", [.int(id)])
            try db.run("DELETE FROM columns WHERE id = ?", [.int(id)])
        }
    }

    func reorderColumns(orderedIds: [Int64]) throws {
        try db.transaction {
            for (idx, cid) in orderedIds.enumerated() {
                try db.run("UPDATE columns SET position = ? WHERE id = ?",
                          [.double(Double(idx)), .int(cid)])
            }
        }
    }

    /// Переносит колонку в другую вкладку (в конец), сохраняя её карточки.
    func moveColumn(id: Int64, toWorkspace targetWorkspaceId: Int64) throws {
        try db.transaction {
            let last = try db.query("SELECT position FROM columns WHERE workspace_id = ? ORDER BY position DESC LIMIT 1",
                                    [.int(targetWorkspaceId)])
            let newPos = (last.first?.double("position") ?? -1) + 1.0
            try db.run("UPDATE columns SET workspace_id = ?, position = ?, updated_at = ? WHERE id = ?",
                      [.int(targetWorkspaceId), .double(newPos), .text(DoeDate.now()), .int(id)])
        }
    }

    // MARK: - Tasks (карточки)

    private func mapTask(_ row: [String: SQLValue], parentIds: [Int64]) -> Card {
        Card(id: row.int("id") ?? 0,
             title: row.string("title") ?? "",
             description: row.string("description"),
             attachmentsOrder: decodeJSONArray(row.string("attachments_order")),
             columnId: row.int("column_id") ?? 0,
             position: row.double("position") ?? 0,
             createdAt: DoeDate.date(from: row.string("created_at")),
             updatedAt: DoeDate.date(from: row.string("updated_at")),
             completedAt: DoeDate.date(from: row.string("completed_at")),
             dueDate: DoeDate.date(from: row.string("due_date")),
             priority: row.double("priority"),
             isVisibleOnBoard: row.bool("is_visible_on_board") ?? false,
             foldedHeadings: decodeJSONArray(row.string("folded_headings")),
             parentIds: parentIds)
    }

    private let taskColumns = """
        id, title, description, attachments_order, column_id, position,
        created_at, updated_at, completed_at, due_date, priority,
        is_visible_on_board, folded_headings
        """

    /// Карты родителей для набора задач одним запросом.
    private func parentMap(forChildIds ids: [Int64]) throws -> [Int64: [Int64]] {
        guard !ids.isEmpty else { return [:] }
        let placeholders = ids.map { _ in "?" }.joined(separator: ",")
        let rows = try db.query(
            "SELECT parent_id, child_id FROM task_relations WHERE child_id IN (\(placeholders))",
            ids.map { .int($0) })
        var map: [Int64: [Int64]] = [:]
        for r in rows {
            guard let child = r.int("child_id"), let parent = r.int("parent_id") else { continue }
            map[child, default: []].append(parent)
        }
        return map
    }

    /// Видимые на доске карточки колонки: верхнеуровневые (без родителей) ИЛИ
    /// закреплённые на доске (is_visible_on_board). Точно как get_columns_with_tasks.
    func fetchBoardTasks(columnId: Int64) throws -> [Card] {
        let rows = try db.query("""
            SELECT \(taskColumns) FROM tasks
            WHERE column_id = ?
              AND (
                    NOT EXISTS (SELECT 1 FROM task_relations tr WHERE tr.child_id = tasks.id)
                    OR is_visible_on_board = 1
                  )
            ORDER BY position
            """, [.int(columnId)])
        let ids = rows.compactMap { $0.int("id") }
        let pmap = try parentMap(forChildIds: ids)
        return rows.map { mapTask($0, parentIds: pmap[$0.int("id") ?? 0] ?? []) }
    }

    /// Прямые подзадачи (дети) карточки — для отображения в модалке.
    func fetchSubtasks(parentId: Int64) throws -> [Card] {
        let rows = try db.query("""
            SELECT \(taskColumns) FROM tasks
            WHERE id IN (SELECT child_id FROM task_relations WHERE parent_id = ?)
            ORDER BY position
            """, [.int(parentId)])
        let ids = rows.compactMap { $0.int("id") }
        let pmap = try parentMap(forChildIds: ids)
        return rows.map { mapTask($0, parentIds: pmap[$0.int("id") ?? 0] ?? []) }
    }

    func fetchTask(id: Int64) throws -> Card? {
        let rows = try db.query("SELECT \(taskColumns) FROM tasks WHERE id = ?", [.int(id)])
        guard let row = rows.first else { return nil }
        let pmap = try parentMap(forChildIds: [id])
        return mapTask(row, parentIds: pmap[id] ?? [])
    }

    /// Все карточки, которые можно назначить родителем/ребёнком (для пикера связей).
    func fetchAllTasksBrief() throws -> [(id: Int64, title: String)] {
        let rows = try db.query("SELECT id, title FROM tasks ORDER BY updated_at DESC")
        return rows.map { (id: $0.int("id") ?? 0, title: $0.string("title") ?? "") }
    }

    @discardableResult
    func createTask(columnId: Int64, title: String, parentIds: [Int64] = []) throws -> Int64 {
        return try db.transaction {
            let last = try db.query("SELECT position FROM tasks WHERE column_id = ? ORDER BY position DESC LIMIT 1",
                                    [.int(columnId)])
            let pos = (last.first?.double("position") ?? 0) + 1.0
            let now = DoeDate.now()

            // completed_at, если колонка в режиме завершения.
            let mode = try columnMode(columnId)
            let completedAt: SQLValue = (mode == .completion) ? .text(now) : .null

            let newId = try db.run("""
                INSERT INTO tasks
                    (title, description, attachments_order, column_id, position,
                     created_at, updated_at, completed_at, is_visible_on_board, folded_headings)
                VALUES (?, NULL, '[]', ?, ?, ?, ?, ?, 0, '[]')
                """,
                [.text(title), .int(columnId), .double(pos), .text(now), .text(now), completedAt])

            for pid in parentIds {
                try db.run("INSERT OR IGNORE INTO task_relations (parent_id, child_id) VALUES (?, ?)",
                          [.int(pid), .int(newId)])
                try db.run("UPDATE tasks SET updated_at = ? WHERE id = ?", [.text(now), .int(pid)])
            }

            if mode == .trackTime && parentIds.isEmpty {
                try db.run("INSERT INTO timer_sessions (task_id, start_time, is_active) VALUES (?, ?, 1)",
                          [.int(newId), .text(now)])
            }
            return newId
        }
    }

    /// Обновление полей карточки (title/description/visibility/folded/due/priority).
    func updateTask(id: Int64,
                    title: String? = nil,
                    description: String?? = nil,
                    isVisibleOnBoard: Bool? = nil,
                    foldedHeadings: [String]? = nil,
                    dueDate: Date?? = nil,
                    priority: Double?? = nil) throws {
        var sets: [String] = []
        var params: [SQLValue] = []
        if let title { sets.append("title = ?"); params.append(.text(title)) }
        if let description { sets.append("description = ?"); params.append(description == nil ? .null : .text(description!)) }
        if let isVisibleOnBoard { sets.append("is_visible_on_board = ?"); params.append(.int(isVisibleOnBoard ? 1 : 0)) }
        if let foldedHeadings { sets.append("folded_headings = ?"); params.append(.text(encodeJSONArray(foldedHeadings))) }
        if let dueDate { sets.append("due_date = ?"); params.append(dueDate == nil ? .null : .text(DoeDate.string(from: dueDate!))) }
        if let priority { sets.append("priority = ?"); params.append(priority == nil ? .null : .double(priority!)) }
        guard !sets.isEmpty else { return }
        sets.append("updated_at = ?"); params.append(.text(DoeDate.now()))
        params.append(.int(id))
        try db.run("UPDATE tasks SET \(sets.joined(separator: ", ")) WHERE id = ?", params)
    }

    // MARK: - Граф связей (подзадачи All-to-All)

    /// Все потомки задачи (DFS) — для защиты от циклов.
    private func allChildIds(of taskId: Int64, visited: inout Set<Int64>) throws {
        if visited.contains(taskId) { return }
        visited.insert(taskId)
        let rows = try db.query("SELECT child_id FROM task_relations WHERE parent_id = ?", [.int(taskId)])
        for r in rows {
            if let c = r.int("child_id") { try allChildIds(of: c, visited: &visited) }
        }
    }

    /// Устанавливает полный список родителей карточки с проверкой циклов.
    /// Бросает VaultError при попытке создать цикл или самоссылку.
    func setParents(taskId: Int64, parentIds: [Int64]) throws {
        if parentIds.contains(taskId) {
            throw VaultError.cycle("Карточка не может быть подзадачей самой себя")
        }
        var descendants = Set<Int64>()
        try allChildIds(of: taskId, visited: &descendants)
        descendants.remove(taskId)
        for pid in parentIds where descendants.contains(pid) {
            throw VaultError.cycle("Обнаружена циклическая зависимость")
        }
        let now = DoeDate.now()
        try db.transaction {
            // Текущие родители (для пометки updated_at).
            let current = try db.query("SELECT parent_id FROM task_relations WHERE child_id = ?", [.int(taskId)])
                .compactMap { $0.int("parent_id") }
            try db.run("DELETE FROM task_relations WHERE child_id = ?", [.int(taskId)])
            for pid in parentIds {
                try db.run("INSERT OR IGNORE INTO task_relations (parent_id, child_id) VALUES (?, ?)",
                          [.int(pid), .int(taskId)])
            }
            for pid in Set(current).union(parentIds) {
                try db.run("UPDATE tasks SET updated_at = ? WHERE id = ?", [.text(now), .int(pid)])
            }
            try db.run("UPDATE tasks SET updated_at = ? WHERE id = ?", [.text(now), .int(taskId)])
        }
    }

    /// Добавляет одну связь ребёнок->родитель (для пикера) с проверкой циклов.
    func addParent(taskId: Int64, parentId: Int64) throws {
        let existing = try db.query("SELECT parent_id FROM task_relations WHERE child_id = ?", [.int(taskId)])
            .compactMap { $0.int("parent_id") }
        var set = Set(existing); set.insert(parentId)
        try setParents(taskId: taskId, parentIds: Array(set))
    }

    func removeParent(taskId: Int64, parentId: Int64) throws {
        try db.run("DELETE FROM task_relations WHERE child_id = ? AND parent_id = ?",
                  [.int(taskId), .int(parentId)])
    }

    // MARK: - Move / reorder / delete

    private func columnMode(_ columnId: Int64) throws -> ColumnMode {
        let rows = try db.query("SELECT mode FROM columns WHERE id = ?", [.int(columnId)])
        return ColumnMode.parse(rows.first?.string("mode"))
    }

    /// Перемещение карточки в другую колонку. Повторяет move_task десктопа:
    /// меняет column_id, обрабатывает completed_at и таймеры, тянет за собой
    /// скрытые подзадачи (которые не вынесены на доску).
    func moveTask(id: Int64, toColumn targetColumnId: Int64) throws {
        try db.transaction {
            let taskRows = try db.query("SELECT column_id, is_visible_on_board FROM tasks WHERE id = ?", [.int(id)])
            guard let t = taskRows.first, let sourceColumnId = t.int("column_id") else { return }
            if sourceColumnId == targetColumnId { return }
            let sourceMode = try columnMode(sourceColumnId)
            let targetMode = try columnMode(targetColumnId)
            let now = DoeDate.now()
            let hasParents = !(try db.query("SELECT 1 FROM task_relations WHERE child_id = ? LIMIT 1", [.int(id)]).isEmpty)
            let isVisible = t.bool("is_visible_on_board") ?? false

            // Позиция в конец целевой колонки.
            let last = try db.query("SELECT position FROM tasks WHERE column_id = ? ORDER BY position DESC LIMIT 1",
                                    [.int(targetColumnId)])
            let newPos = (last.first?.double("position") ?? 0) + 1.0

            try db.run("UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?",
                      [.int(targetColumnId), .double(newPos), .text(now), .int(id)])

            // Останавливаем таймер при выходе из колонки учёта времени.
            if sourceMode == .trackTime {
                try db.run("UPDATE timer_sessions SET is_active = 0, end_time = ? WHERE task_id = ? AND is_active = 1",
                          [.text(now), .int(id)])
            }
            // Завершение / снятие завершения.
            if targetMode == .completion {
                try db.run("UPDATE tasks SET completed_at = COALESCE(completed_at, ?) WHERE id = ?",
                          [.text(now), .int(id)])
            } else {
                try db.run("UPDATE tasks SET completed_at = NULL WHERE id = ?", [.int(id)])
            }
            // Новый сеанс таймера при входе в колонку учёта времени (если не скрытая подзадача).
            let isHiddenSubtask = hasParents && !isVisible
            if targetMode == .trackTime && !isHiddenSubtask {
                try db.run("INSERT INTO timer_sessions (task_id, start_time, is_active) VALUES (?, ?, 1)",
                          [.int(id), .text(now)])
            }

            // Рекурсивно перетаскиваем скрытые подзадачи вслед за родителем.
            try moveHiddenChildren(parentId: id, toColumn: targetColumnId, sourceMode: sourceMode, now: now)
        }
    }

    private func moveHiddenChildren(parentId: Int64, toColumn targetColumnId: Int64,
                                    sourceMode: ColumnMode, now: String) throws {
        let children = try db.query("""
            SELECT id, is_visible_on_board FROM tasks
            WHERE id IN (SELECT child_id FROM task_relations WHERE parent_id = ?)
            """, [.int(parentId)])
        for c in children {
            guard let cid = c.int("id") else { continue }
            if (c.bool("is_visible_on_board") ?? false) { continue } // живёт своей жизнью
            try db.run("UPDATE tasks SET column_id = ?, updated_at = ? WHERE id = ?",
                      [.int(targetColumnId), .text(now), .int(cid)])
            if sourceMode == .trackTime {
                try db.run("UPDATE timer_sessions SET is_active = 0, end_time = ? WHERE task_id = ? AND is_active = 1",
                          [.text(now), .int(cid)])
            }
            try moveHiddenChildren(parentId: cid, toColumn: targetColumnId, sourceMode: sourceMode, now: now)
        }
    }

    /// Переупорядочивание карточек: position = индекс (0-based), как reorder_tasks.
    func reorderTasks(orderedIds: [Int64]) throws {
        try db.transaction {
            for (idx, tid) in orderedIds.enumerated() {
                try db.run("UPDATE tasks SET position = ? WHERE id = ?", [.double(Double(idx)), .int(tid)])
            }
        }
    }

    /// Удаление карточки. ON DELETE CASCADE в task_relations уберёт связи;
    /// подзадачи, существующие только под этим родителем, остаются (как карточки),
    /// что соответствует поведению графовой модели десктопа для скрытых детей —
    /// здесь мы повторяем безопасный минимум: удаляем только саму карточку.
    func deleteTask(id: Int64) throws {
        try db.run("DELETE FROM tasks WHERE id = ?", [.int(id)])
    }
}

enum VaultError: LocalizedError {
    case cycle(String)
    case io(String)

    var errorDescription: String? {
        switch self {
        case .cycle(let m): return m
        case .io(let m): return m
        }
    }
}
