//
//  VaultManager.swift
//  Doe
//
//  Управляет жизненным циклом хранилища (vault) — папки, в которой лежит
//  файл *.db.doe и подпапка doe/ с вложениями. Работает «как Obsidian»:
//  пользователь выбирает любую папку (в т.ч. в iCloud Drive) через системный
//  пикер, мы сохраняем security-scoped bookmark и работаем с тем же файлом,
//  что и десктоп. Отслеживает внешние изменения файла для синхронизации.
//

import Foundation
import Combine

/// Описание недавнего хранилища, сохраняемого между запусками.
struct RecentVault: Codable, Identifiable, Equatable {
    var id: String { bookmarkBase64 }
    var name: String
    var bookmarkBase64: String
    var lastOpenedAt: Date
}

@MainActor
final class VaultManager: ObservableObject {
    @Published private(set) var recents: [RecentVault] = []
    @Published private(set) var currentName: String?
    @Published private(set) var isOpen = false
    @Published var lastError: String?

    /// Издаётся, когда файл БД изменился извне (синхронизация с Mac).
    let externalChange = PassthroughSubject<Void, Never>()

    private(set) var store: VaultStore?
    private var folderURL: URL?
    private var dbURL: URL?
    private var accessingURL: URL?
    private var pollTimer: Timer?
    private var lastSignature: String = ""

    private let recentsKey = "doe.recentVaults.v1"

    init() { loadRecents() }

    // MARK: - Recents

    private func loadRecents() {
        guard let data = UserDefaults.standard.data(forKey: recentsKey),
              let list = try? JSONDecoder().decode([RecentVault].self, from: data) else { return }
        recents = list.sorted { $0.lastOpenedAt > $1.lastOpenedAt }
    }

    private func saveRecents() {
        if let data = try? JSONEncoder().encode(recents) {
            UserDefaults.standard.set(data, forKey: recentsKey)
        }
    }

    func removeRecent(_ recent: RecentVault) {
        recents.removeAll { $0.id == recent.id }
        saveRecents()
    }

    private func rememberRecent(name: String, bookmark: Data) {
        let b64 = bookmark.base64EncodedString()
        recents.removeAll { $0.bookmarkBase64 == b64 }
        recents.insert(RecentVault(name: name, bookmarkBase64: b64, lastOpenedAt: Date()), at: 0)
        recents = Array(recents.prefix(12))
        saveRecents()
    }

    // MARK: - Открытие / создание

    /// Открывает существующую папку-хранилище по URL, полученному из пикера.
    /// Если в папке нет .db.doe — создаёт новую базу со схемой head-ревизии.
    func openFolder(_ url: URL, createIfEmpty: Bool = true) {
        do {
            let bookmark = try makeBookmark(url)
            try open(url: url, bookmark: bookmark, createIfEmpty: createIfEmpty)
            rememberRecent(name: url.lastPathComponent, bookmark: bookmark)
        } catch {
            lastError = "Не удалось открыть хранилище: \(error.localizedDescription)"
        }
    }

    /// Создаёт новую папку-хранилище с именем внутри выбранного родителя.
    func createVault(named name: String, inParent parent: URL) {
        let safe = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safe.isEmpty else { lastError = "Пустое имя хранилища"; return }
        let didAccess = parent.startAccessingSecurityScopedResource()
        defer { if didAccess { parent.stopAccessingSecurityScopedResource() } }
        let folder = parent.appendingPathComponent(safe, isDirectory: true)
        do {
            var coordError: NSError?
            let coordinator = NSFileCoordinator()
            coordinator.coordinate(writingItemAt: folder, options: .forReplacing, error: &coordError) { newURL in
                try? FileManager.default.createDirectory(at: newURL, withIntermediateDirectories: true)
            }
            if let coordError { throw coordError }
            openFolder(folder, createIfEmpty: true)
        } catch {
            lastError = "Не удалось создать хранилище: \(error.localizedDescription)"
        }
    }

    /// Открывает недавнее хранилище из сохранённого bookmark.
    func openRecent(_ recent: RecentVault) {
        guard let data = Data(base64Encoded: recent.bookmarkBase64) else {
            lastError = "Повреждённая закладка хранилища"; return
        }
        do {
            var stale = false
            let url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
            let bookmark = stale ? (try makeBookmark(url)) : data
            try open(url: url, bookmark: bookmark, createIfEmpty: false)
            rememberRecent(name: url.lastPathComponent, bookmark: bookmark)
        } catch {
            lastError = "Не удалось открыть «\(recent.name)»: \(error.localizedDescription)"
        }
    }

    private func makeBookmark(_ url: URL) throws -> Data {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
        // На iOS bookmark из URL пикера сам по себе security-scoped.
        return try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
    }

    private func open(url pickedURL: URL, bookmark: Data, createIfEmpty: Bool) throws {
        closeCurrent()

        // URL прямо из пикера (а тем более подпапка, созданная при «Создать
        // хранилище») может НЕ иметь security-scoped прав. Восстанавливаем URL
        // из bookmark — он даёт корректный доступ и к самой папке, и к её детям.
        var stale = false
        let folder = (try? URL(resolvingBookmarkData: bookmark, options: [],
                               relativeTo: nil, bookmarkDataIsStale: &stale)) ?? pickedURL

        guard folder.startAccessingSecurityScopedResource() else {
            throw VaultError.io("Нет доступа к выбранной папке. Попробуйте выбрать папку "
                + "в «Файлы» (например, On My iPhone или iCloud Drive) и повторить.")
        }
        accessingURL = folder

        // Гарантируем загрузку из iCloud, если файл ещё не скачан.
        try? FileManager.default.startDownloadingUbiquitousItem(at: folder)

        let dbFile = try resolveDBFile(in: folder, createIfEmpty: createIfEmpty)
        // Подпапка вложений.
        let doeDir = folder.appendingPathComponent("doe", isDirectory: true)
        try? FileManager.default.createDirectory(at: doeDir, withIntermediateDirectories: true)

        let database = try Database(path: dbFile.path)
        // Если файл только что создан пустым — наполняем схемой head-ревизии.
        if try isEmptyDatabase(database) {
            try Schema.createSchema(in: database, language: "ru")
        } else {
            // Существующая база: проверяем, что её ревизия совпадает с нашей.
            let rev = try schemaRevision(database)
            if rev != Schema.headRevision {
                let shown = rev ?? "неизвестна"
                throw VaultError.io("Версия базы (\(shown)) не совпадает с поддерживаемой "
                    + "(\(Schema.headRevision)). Откройте это хранилище один раз в десктоп-Doe "
                    + "последней версии, чтобы обновить схему, затем повторите.")
            }
        }
        let store = VaultStore(db: database)

        self.folderURL = folder
        self.dbURL = dbFile
        self.store = store
        self.currentName = folder.lastPathComponent
        self.isOpen = true
        self.lastSignature = fileSignature(dbFile)
        startPolling()
    }

    /// Находит рабочий .db.doe (самый свежий, без backup/._), либо путь для нового.
    private func resolveDBFile(in folder: URL, createIfEmpty: Bool) throws -> URL {
        let fm = FileManager.default
        let items = (try? fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        let candidates = items.filter {
            $0.lastPathComponent.hasSuffix(".db.doe")
            && !$0.lastPathComponent.hasSuffix(".backup.db.doe")
            && !$0.lastPathComponent.hasPrefix("._")
        }
        if let newest = candidates.max(by: { mtime($0) < mtime($1) }) {
            return newest
        }
        // Нет файла — создаём новый по имени папки.
        guard createIfEmpty else { throw VaultError.io("В папке нет базы Doe (.db.doe)") }
        return folder.appendingPathComponent("\(folder.lastPathComponent).db.doe")
    }

    private func isEmptyDatabase(_ db: Database) throws -> Bool {
        let rows = try db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'")
        return rows.isEmpty
    }

    private func schemaRevision(_ db: Database) throws -> String? {
        let has = try db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'")
        guard !has.isEmpty else { return nil }
        return try db.query("SELECT version_num FROM alembic_version LIMIT 1").first?.string("version_num")
    }

    func closeCurrent() {
        stopPolling()
        store?.db.checkpointTruncate()
        store = nil
        if let accessingURL { accessingURL.stopAccessingSecurityScopedResource() }
        accessingURL = nil
        folderURL = nil
        dbURL = nil
        isOpen = false
        currentName = nil
    }

    // MARK: - Запись с координацией файла

    /// Выполняет запись с координацией доступа к файлу и сворачиванием WAL,
    /// чтобы синхронизировался единый .db.doe.
    func performWrite(_ block: (VaultStore) throws -> Void) {
        guard let store, let dbURL else { return }
        do {
            try block(store)
            store.db.checkpointTruncate()
            // Обновляем подпись, чтобы не принять собственную запись за внешнюю.
            touchSignature(dbURL)
        } catch let e as VaultError {
            lastError = e.errorDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Отслеживание внешних изменений (синк)

    private func startPolling() {
        stopPolling()
        let timer = Timer(timeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkExternalChange() }
        }
        RunLoop.main.add(timer, forMode: .common)
        pollTimer = timer
    }

    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    /// Вызывать при возврате приложения на передний план.
    func refreshNow() { checkExternalChange() }

    private func checkExternalChange() {
        guard let dbURL else { return }
        let sig = fileSignature(dbURL)
        if sig != lastSignature && !sig.isEmpty {
            lastSignature = sig
            // Сворачиваем чужой WAL в основной файл, затем уведомляем UI.
            store?.db.checkpointTruncate()
            externalChange.send(())
        }
    }

    private func touchSignature(_ url: URL) {
        lastSignature = fileSignature(url)
    }

    /// Подпись файла = mtime+size основного файла и -wal (для надёжной детекции).
    private func fileSignature(_ url: URL) -> String {
        var parts: [String] = []
        for u in [url, url.appendingPathExtension("wal")] {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: u.path) {
                let m = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
                let s = (attrs[.size] as? Int) ?? 0
                parts.append("\(Int(m * 1000))-\(s)")
            }
        }
        return parts.joined(separator: "|")
    }

    private func mtime(_ url: URL) -> Date {
        (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
    }

    /// Папка вложений текущего хранилища (doe/).
    var attachmentsDir: URL? { folderURL?.appendingPathComponent("doe", isDirectory: true) }
}
