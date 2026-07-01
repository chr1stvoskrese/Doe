//
//  BoardViewModel.swift
//  Doe
//
//  Состояние доски: вкладки, колонки текущей вкладки и карточки по колонкам.
//  Чтения SQLite локальны и быстры — выполняются синхронно; записи идут через
//  VaultManager.performWrite (координация файла + checkpoint), после чего
//  затронутые данные перечитываются.
//

import SwiftUI
import Combine

@MainActor
final class BoardViewModel: ObservableObject {
    @Published var workspaces: [Workspace] = []
    @Published var activeWorkspaceId: Int64?
    @Published var columns: [Column] = []
    @Published var tasksByColumn: [Int64: [Card]] = [:]
    @Published var errorText: String?

    private let vault: VaultManager
    private var cancellables = Set<AnyCancellable>()

    init(vault: VaultManager) {
        self.vault = vault
        vault.externalChange
            .receive(on: RunLoop.main)
            .sink { [weak self] in self?.reload(preservingSelection: true) }
            .store(in: &cancellables)
    }

    private var store: VaultStore? { vault.store }
    var attachmentsDir: URL? { vault.attachmentsDir }

    private var activeKey: String { "doe.activeWorkspace.\(vault.currentName ?? "")" }

    // MARK: - Загрузка

    func reload(preservingSelection: Bool = true) {
        guard let store else { return }
        do {
            workspaces = try store.fetchWorkspaces()
            if !preservingSelection || activeWorkspaceId == nil
                || !workspaces.contains(where: { $0.id == activeWorkspaceId }) {
                let stored = UserDefaults.standard.object(forKey: activeKey) as? Int
                activeWorkspaceId = workspaces.first(where: { Int($0.id) == stored })?.id
                    ?? workspaces.first?.id
            }
            loadBoard()
        } catch {
            errorText = error.localizedDescription
        }
    }

    func loadBoard() {
        guard let store, let wsId = activeWorkspaceId else {
            columns = []; tasksByColumn = [:]; subtaskStats = [:]; return
        }
        do {
            columns = try store.fetchColumns(workspaceId: wsId)
            var map: [Int64: [Card]] = [:]
            var stats: [Int64: SubtaskStat] = [:]
            for col in columns {
                let cards = try store.fetchBoardTasks(columnId: col.id)
                map[col.id] = cards
                // Счётчики подзадач считаем один раз при загрузке, а не на каждый рендер.
                for c in cards {
                    let subs = (try? store.fetchSubtasks(parentId: c.id)) ?? []
                    if !subs.isEmpty {
                        stats[c.id] = SubtaskStat(count: subs.count,
                                                  done: subs.filter { $0.completedAt != nil }.count)
                    }
                }
            }
            tasksByColumn = map
            subtaskStats = stats
        } catch {
            errorText = error.localizedDescription
        }
    }

    /// Кэш счётчиков подзадач (count/done) по id карточки — заполняется в loadBoard.
    @Published var subtaskStats: [Int64: SubtaskStat] = [:]
    func subtaskStat(_ id: Int64) -> SubtaskStat { subtaskStats[id] ?? SubtaskStat(count: 0, done: 0) }

    func selectWorkspace(_ id: Int64) {
        activeWorkspaceId = id
        UserDefaults.standard.set(Int(id), forKey: activeKey)
        loadBoard()
    }

    // MARK: - Вкладки

    func addWorkspace(name: String) {
        var newId: Int64?
        vault.performWrite { newId = try $0.createWorkspace(name: name) }
        reload(preservingSelection: false)
        if let newId { selectWorkspace(newId) }
    }

    func renameWorkspace(_ id: Int64, to name: String) {
        vault.performWrite { try $0.renameWorkspace(id: id, name: name) }
        reload()
    }

    func deleteWorkspace(_ id: Int64) {
        vault.performWrite { try $0.deleteWorkspace(id: id) }
        if activeWorkspaceId == id { activeWorkspaceId = nil }
        reload(preservingSelection: false)
    }

    func moveWorkspace(from source: IndexSet, to destination: Int) {
        workspaces.move(fromOffsets: source, toOffset: destination)
        vault.performWrite { try $0.reorderWorkspaces(orderedIds: workspaces.map(\.id)) }
    }

    /// Переставляет вкладку с id перед/за позицией другой (для drag вкладок).
    func reorderWorkspaces(_ orderedIds: [Int64]) {
        let order = Dictionary(uniqueKeysWithValues: orderedIds.enumerated().map { ($1, $0) })
        workspaces.sort { (order[$0.id] ?? 0) < (order[$1.id] ?? 0) }
        vault.performWrite { try $0.reorderWorkspaces(orderedIds: workspaces.map(\.id)) }
    }

    // MARK: - Колонки

    func addColumn(title: String, mode: ColumnMode = .default) {
        guard let wsId = activeWorkspaceId else { return }
        vault.performWrite { try $0.createColumn(workspaceId: wsId, title: title, mode: mode) }
        loadBoard()
    }

    func renameColumn(_ id: Int64, to title: String) {
        vault.performWrite { try $0.updateColumn(id: id, title: title) }
        loadBoard()
    }

    func setColumnMode(_ id: Int64, mode: ColumnMode) {
        vault.performWrite { try $0.updateColumn(id: id, mode: mode) }
        loadBoard()
    }

    func deleteColumn(_ id: Int64) {
        vault.performWrite { try $0.deleteColumn(id: id) }
        loadBoard()
    }

    func reorderColumns(_ orderedIds: [Int64]) {
        let order = Dictionary(uniqueKeysWithValues: orderedIds.enumerated().map { ($1, $0) })
        columns.sort { (order[$0.id] ?? 0) < (order[$1.id] ?? 0) }
        vault.performWrite { try $0.reorderColumns(orderedIds: columns.map(\.id)) }
    }

    // MARK: - Карточки

    func addTask(columnId: Int64, title: String) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        vault.performWrite { try $0.createTask(columnId: columnId, title: trimmed) }
        loadBoard()
    }

    func deleteTask(_ id: Int64) {
        vault.performWrite { try $0.deleteTask(id: id) }
        Reminders.cancel(taskId: id)
        loadBoard()
    }

    /// Переставляет карточки внутри колонки (drag reorder).
    func reorderTasks(in columnId: Int64, orderedIds: [Int64]) {
        if var arr = tasksByColumn[columnId] {
            let order = Dictionary(uniqueKeysWithValues: orderedIds.enumerated().map { ($1, $0) })
            arr.sort { (order[$0.id] ?? 0) < (order[$1.id] ?? 0) }
            tasksByColumn[columnId] = arr
        }
        vault.performWrite { try $0.reorderTasks(orderedIds: orderedIds) }
    }

    /// Перемещает карточку в другую колонку, опционально на конкретную позицию.
    func moveTask(_ taskId: Int64, toColumn targetColumnId: Int64, atIndex index: Int? = nil) {
        vault.performWrite { store in
            try store.moveTask(id: taskId, toColumn: targetColumnId)
            if let index {
                var ids = (try store.fetchBoardTasks(columnId: targetColumnId)).map(\.id)
                ids.removeAll { $0 == taskId }
                let safe = max(0, min(index, ids.count))
                ids.insert(taskId, at: safe)
                try store.reorderTasks(orderedIds: ids)
            }
        }
        loadBoard()
    }

    /// Единый обработчик дропа карточки: и переупорядочивание внутри колонки,
    /// и перенос между колонками, с вставкой перед целевой карточкой
    /// (beforeId == nil — в конец колонки). Анимирует локально, затем сохраняет.
    func handleCardDrop(_ ref: TaskRef, targetColumnId: Int64, beforeId: Int64?) {
        guard ref.id != beforeId else { return }

        // Локальная оптимистичная перестановка для плавной анимации.
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
            applyLocalMove(taskId: ref.id, from: ref.sourceColumnId,
                           to: targetColumnId, beforeId: beforeId)
        }

        // Персист: если колонка та же — только reorder; иначе move + reorder.
        let targetIds = tasksByColumn[targetColumnId]?.map(\.id) ?? []
        if ref.sourceColumnId == targetColumnId {
            vault.performWrite { try $0.reorderTasks(orderedIds: targetIds) }
        } else {
            let sourceIds = tasksByColumn[ref.sourceColumnId]?.map(\.id) ?? []
            vault.performWrite { store in
                try store.moveTask(id: ref.id, toColumn: targetColumnId)
                try store.reorderTasks(orderedIds: targetIds)
                if !sourceIds.isEmpty { try store.reorderTasks(orderedIds: sourceIds) }
            }
        }
        // Перечитываем, чтобы подтянуть completed_at/таймеры и скрытые подзадачи.
        loadBoard()
    }

    private func applyLocalMove(taskId: Int64, from sourceColumnId: Int64,
                               to targetColumnId: Int64, beforeId: Int64?) {
        guard var moving = findTask(taskId) else { return }
        // Удаляем из исходной колонки.
        tasksByColumn[sourceColumnId]?.removeAll { $0.id == taskId }
        moving.columnId = targetColumnId
        var dest = tasksByColumn[targetColumnId] ?? []
        if let beforeId, let idx = dest.firstIndex(where: { $0.id == beforeId }) {
            dest.insert(moving, at: idx)
        } else {
            dest.append(moving)
        }
        tasksByColumn[targetColumnId] = dest
    }

    private func findTask(_ id: Int64) -> Card? {
        for (_, arr) in tasksByColumn { if let t = arr.first(where: { $0.id == id }) { return t } }
        return nil
    }

    /// Переносит карточку в первую колонку другой вкладки (drop на таб).
    func moveTaskToWorkspace(_ ref: TaskRef, workspaceId: Int64) {
        guard let store else { return }
        guard let firstColumn = (try? store.fetchColumns(workspaceId: workspaceId))?.first else {
            errorText = "В целевой вкладке нет колонок"; return
        }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            tasksByColumn[ref.sourceColumnId]?.removeAll { $0.id == ref.id }
        }
        vault.performWrite { try $0.moveTask(id: ref.id, toColumn: firstColumn.id) }
        loadBoard()
    }

    // MARK: - Кастомный drag (оптимистичная перестановка + отложенный персист)

    /// Текущие перетаскиваемые элементы (для отрисовки призраков-слотов).
    @Published var draggingCardId: Int64?
    @Published var draggingColumnId: Int64?
    @Published var draggingTabId: Int64?
    /// Исходная колонка карточки на момент старта (нужна для персиста переноса).
    private var dragCardOrigin: Int64?

    /// Колонка, в которой сейчас находится карточка (после оптимистичных перестановок).
    func columnOf(_ cardId: Int64) -> Int64? {
        for (col, arr) in tasksByColumn where arr.contains(where: { $0.id == cardId }) { return col }
        return nil
    }

    func beginCardDrag(_ id: Int64, origin: Int64) { draggingCardId = id; dragCardOrigin = origin }
    func beginColumnDrag(_ id: Int64) { draggingColumnId = id }
    func beginTabDrag(_ id: Int64) { draggingTabId = id }

    /// Живая перестановка карточки в позицию `index` колонки `toColumn`. Без записи в БД.
    func previewCardMove(_ id: Int64, toColumn: Int64, index: Int) {
        guard let cur = columnOf(id),
              var card = tasksByColumn[cur]?.first(where: { $0.id == id }) else { return }
        var source = tasksByColumn[cur] ?? []
        source.removeAll { $0.id == id }
        var dest = (cur == toColumn) ? source : (tasksByColumn[toColumn] ?? [])
        let safe = max(0, min(index, dest.count))
        card.columnId = toColumn
        dest.insert(card, at: safe)

        // Пропускаем, если расположение не изменилось (иначе бесконечная пере-анимация).
        if cur == toColumn {
            if dest.map(\.id) == (tasksByColumn[toColumn]?.map(\.id) ?? []) { return }
        } else if dest.map(\.id) == (tasksByColumn[toColumn]?.map(\.id) ?? []),
                  source.map(\.id) == (tasksByColumn[cur]?.map(\.id) ?? []) {
            return
        }

        withAnimation(Theme.appleCurve(0.22)) {
            if cur != toColumn { tasksByColumn[cur] = source }
            tasksByColumn[toColumn] = dest
        }
    }

    /// Фиксация переноса карточки: персист текущего расположения.
    func commitCardDrag() {
        defer { draggingCardId = nil; dragCardOrigin = nil }
        guard let id = draggingCardId, let col = columnOf(id) else { return }
        let origin = dragCardOrigin ?? col
        let targetIds = tasksByColumn[col]?.map(\.id) ?? []
        if origin == col {
            vault.performWrite { try $0.reorderTasks(orderedIds: targetIds) }
        } else {
            let sourceIds = tasksByColumn[origin]?.map(\.id) ?? []
            vault.performWrite { store in
                try store.moveTask(id: id, toColumn: col)
                try store.reorderTasks(orderedIds: targetIds)
                if !sourceIds.isEmpty { try store.reorderTasks(orderedIds: sourceIds) }
            }
        }
        loadBoard()
    }

    /// Перенос перетаскиваемой карточки в первую колонку другой вкладки (дроп на таб).
    func moveDraggedCardToWorkspace(_ workspaceId: Int64) {
        defer { draggingCardId = nil; dragCardOrigin = nil }
        guard let id = draggingCardId, let store else { return }
        guard let firstColumn = (try? store.fetchColumns(workspaceId: workspaceId))?.first else {
            errorText = "В целевой вкладке нет колонок"; loadBoard(); return
        }
        if let col = columnOf(id) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                tasksByColumn[col]?.removeAll { $0.id == id }
            }
        }
        vault.performWrite { try $0.moveTask(id: id, toColumn: firstColumn.id) }
        loadBoard()
    }

    /// Живая перестановка колонки в позицию `toIndex`. Без записи в БД.
    func previewColumnMove(_ id: Int64, toIndex: Int) {
        guard let from = columns.firstIndex(where: { $0.id == id }) else { return }
        var arr = columns
        let item = arr.remove(at: from)
        let safe = max(0, min(toIndex, arr.count))
        arr.insert(item, at: safe)
        if arr.map(\.id) == columns.map(\.id) { return }
        withAnimation(Theme.appleCurve(0.25)) { columns = arr }
    }

    func commitColumnDrag() {
        defer { draggingColumnId = nil }
        vault.performWrite { try $0.reorderColumns(orderedIds: columns.map(\.id)) }
    }

    /// Перенос перетаскиваемой колонки в другую вкладку (дроп на таб).
    func moveDraggedColumnToWorkspace(_ workspaceId: Int64) {
        defer { draggingColumnId = nil }
        guard let id = draggingColumnId, workspaceId != activeWorkspaceId else {
            commitColumnDrag(); return
        }
        withAnimation(Theme.appleCurve(0.25)) { columns.removeAll { $0.id == id } }
        vault.performWrite { try $0.moveColumn(id: id, toWorkspace: workspaceId) }
        loadBoard()
    }

    /// Фиксация переноса вкладки на позицию `toIndex`.
    func commitTabReorder(_ id: Int64, toIndex: Int) {
        defer { draggingTabId = nil }
        var ids = workspaces.map(\.id)
        guard let from = ids.firstIndex(of: id) else { return }
        ids.remove(at: from)
        let safe = max(0, min(toIndex, ids.count))
        ids.insert(id, at: safe)
        withAnimation(Theme.appleCurve(0.3)) { reorderWorkspaces(ids) }
    }

    func updateTask(_ id: Int64,
                    title: String? = nil,
                    description: String?? = nil,
                    isVisibleOnBoard: Bool? = nil,
                    foldedHeadings: [String]? = nil,
                    dueDate: Date?? = nil) {
        vault.performWrite {
            try $0.updateTask(id: id, title: title, description: description,
                              isVisibleOnBoard: isVisibleOnBoard,
                              foldedHeadings: foldedHeadings, dueDate: dueDate)
        }
        loadBoard()
    }

    // MARK: - Подзадачи (граф)

    // MARK: - Напоминания

    var vaultName: String { vault.currentName ?? "" }

    func reminderDate(for taskId: Int64) -> Date? {
        ReminderStore.date(taskId: taskId, vault: vaultName)
    }

    func setReminder(taskId: Int64, title: String, date: Date?) async {
        ReminderStore.set(taskId: taskId, date: date, vault: vaultName)
        if let date {
            await Reminders.schedule(taskId: taskId, title: "Doe", body: title, at: date)
        } else {
            Reminders.cancel(taskId: taskId)
        }
        objectWillChange.send()
    }

    func subtasks(of taskId: Int64) -> [Card] {
        (try? store?.fetchSubtasks(parentId: taskId)) ?? []
    }

    func task(_ id: Int64) -> Card? { try? store?.fetchTask(id: id) }

    func allTasksBrief() -> [(id: Int64, title: String)] {
        (try? store?.fetchAllTasksBrief()) ?? []
    }

    func setParents(taskId: Int64, parentIds: [Int64]) {
        vault.performWrite { try $0.setParents(taskId: taskId, parentIds: parentIds) }
        loadBoard()
    }

    func addSubtask(parentId: Int64, title: String, columnId: Int64) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        vault.performWrite { try $0.createTask(columnId: columnId, title: trimmed, parentIds: [parentId]) }
        loadBoard()
    }

    func linkSubtask(parentId: Int64, childId: Int64) {
        vault.performWrite { try $0.addParent(taskId: childId, parentId: parentId) }
        loadBoard()
    }

    func unlinkSubtask(parentId: Int64, childId: Int64) {
        vault.performWrite { try $0.removeParent(taskId: childId, parentId: parentId) }
        loadBoard()
    }
}
