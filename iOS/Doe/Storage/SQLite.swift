//
//  SQLite.swift
//  Doe
//
//  Тонкая безопасная обёртка над системным libsqlite3 (модуль SQLite3).
//  Никаких внешних зависимостей — проект собирается без резолва пакетов.
//
//  Соглашения формата (полностью совпадают с десктоп-версией Doe):
//   • datetime  -> "YYYY-MM-DD HH:MM:SS.ffffff" (наивный UTC, разделитель — пробел)
//   • bool      -> INTEGER 0/1
//   • JSON      -> TEXT (например "[]")
//   • enum mode -> "DEFAULT" | "TRACK_TIME" | "COMPLETION"
//

import Foundation
import SQLite3

/// Ошибка уровня SQLite с человекочитаемым сообщением.
struct SQLiteError: Error, CustomStringConvertible {
    let code: Int32
    let message: String
    var description: String { "SQLite error \(code): \(message)" }
}

/// Значение, которое можно привязать к параметру запроса.
enum SQLValue {
    case null
    case int(Int64)
    case double(Double)
    case text(String)
    case blob(Data)
}

/// Транзиентный токен — заставляет SQLite копировать переданный буфер.
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/// Соединение с базой данных. НЕ потокобезопасно — используйте один экземпляр
/// на серийной очереди (см. VaultStore).
final class Database {
    private var handle: OpaquePointer?

    /// Открывает (или создаёт) файл БД по пути.
    init(path: String) throws {
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        let rc = sqlite3_open_v2(path, &handle, flags, nil)
        guard rc == SQLITE_OK, handle != nil else {
            let msg = handle != nil ? String(cString: sqlite3_errmsg(handle)) : "cannot open"
            sqlite3_close(handle)
            throw SQLiteError(code: rc, message: msg)
        }
        // Разумные значения по умолчанию для надёжной работы с iCloud-файлом.
        sqlite3_busy_timeout(handle, 5000)
        try exec("PRAGMA foreign_keys = ON;")
    }

    deinit { sqlite3_close(handle) }

    private func lastErrorMessage() -> String {
        String(cString: sqlite3_errmsg(handle))
    }

    /// Выполняет один или несколько SQL-операторов без возврата строк.
    func exec(_ sql: String) throws {
        var errPtr: UnsafeMutablePointer<CChar>?
        let rc = sqlite3_exec(handle, sql, nil, nil, &errPtr)
        if rc != SQLITE_OK {
            let msg = errPtr != nil ? String(cString: errPtr!) : lastErrorMessage()
            sqlite3_free(errPtr)
            throw SQLiteError(code: rc, message: msg)
        }
    }

    /// Выполняет запрос с параметрами, не ожидая строк результата.
    @discardableResult
    func run(_ sql: String, _ params: [SQLValue] = []) throws -> Int64 {
        let stmt = try prepare(sql, params)
        defer { sqlite3_finalize(stmt) }
        let rc = sqlite3_step(stmt)
        guard rc == SQLITE_DONE || rc == SQLITE_ROW else {
            throw SQLiteError(code: rc, message: lastErrorMessage())
        }
        return sqlite3_last_insert_rowid(handle)
    }

    /// Выполняет запрос и возвращает строки как массив словарей [имя_колонки: значение].
    func query(_ sql: String, _ params: [SQLValue] = []) throws -> [[String: SQLValue]] {
        let stmt = try prepare(sql, params)
        defer { sqlite3_finalize(stmt) }

        var rows: [[String: SQLValue]] = []
        let colCount = sqlite3_column_count(stmt)
        while true {
            let rc = sqlite3_step(stmt)
            if rc == SQLITE_DONE { break }
            guard rc == SQLITE_ROW else {
                throw SQLiteError(code: rc, message: lastErrorMessage())
            }
            var row: [String: SQLValue] = [:]
            for i in 0..<colCount {
                let name = String(cString: sqlite3_column_name(stmt, i))
                row[name] = columnValue(stmt, i)
            }
            rows.append(row)
        }
        return rows
    }

    private func columnValue(_ stmt: OpaquePointer?, _ i: Int32) -> SQLValue {
        switch sqlite3_column_type(stmt, i) {
        case SQLITE_INTEGER: return .int(sqlite3_column_int64(stmt, i))
        case SQLITE_FLOAT:   return .double(sqlite3_column_double(stmt, i))
        case SQLITE_NULL:    return .null
        case SQLITE_BLOB:
            if let bytes = sqlite3_column_blob(stmt, i) {
                let count = Int(sqlite3_column_bytes(stmt, i))
                return .blob(Data(bytes: bytes, count: count))
            }
            return .blob(Data())
        default:
            if let c = sqlite3_column_text(stmt, i) {
                return .text(String(cString: c))
            }
            return .null
        }
    }

    private func prepare(_ sql: String, _ params: [SQLValue]) throws -> OpaquePointer? {
        var stmt: OpaquePointer?
        let rc = sqlite3_prepare_v2(handle, sql, -1, &stmt, nil)
        guard rc == SQLITE_OK else {
            throw SQLiteError(code: rc, message: lastErrorMessage())
        }
        for (idx, value) in params.enumerated() {
            let pos = Int32(idx + 1)
            switch value {
            case .null:
                sqlite3_bind_null(stmt, pos)
            case .int(let v):
                sqlite3_bind_int64(stmt, pos, v)
            case .double(let v):
                sqlite3_bind_double(stmt, pos, v)
            case .text(let v):
                sqlite3_bind_text(stmt, pos, v, -1, SQLITE_TRANSIENT)
            case .blob(let data):
                if data.isEmpty {
                    sqlite3_bind_zeroblob(stmt, pos, 0)
                } else {
                    _ = data.withUnsafeBytes { raw in
                        sqlite3_bind_blob(stmt, pos, raw.baseAddress, Int32(data.count), SQLITE_TRANSIENT)
                    }
                }
            }
        }
        return stmt
    }

    /// Сворачивает WAL в основной файл, чтобы синхронизировался один .db.doe.
    func checkpointTruncate() {
        sqlite3_wal_checkpoint_v2(handle, nil, SQLITE_CHECKPOINT_TRUNCATE, nil, nil)
    }

    /// Транзакция-обёртка. При ошибке откатывает изменения.
    func transaction<T>(_ body: () throws -> T) throws -> T {
        try exec("BEGIN IMMEDIATE;")
        do {
            let result = try body()
            try exec("COMMIT;")
            return result
        } catch {
            try? exec("ROLLBACK;")
            throw error
        }
    }
}

// MARK: - Удобные геттеры значений строки

extension Dictionary where Key == String, Value == SQLValue {
    func int(_ key: String) -> Int64? {
        if case .int(let v)? = self[key] { return v }
        if case .double(let v)? = self[key] { return Int64(v) }
        return nil
    }
    func double(_ key: String) -> Double? {
        if case .double(let v)? = self[key] { return v }
        if case .int(let v)? = self[key] { return Double(v) }
        return nil
    }
    func string(_ key: String) -> String? {
        if case .text(let v)? = self[key] { return v }
        return nil
    }
    func bool(_ key: String) -> Bool? {
        if let v = int(key) { return v != 0 }
        return nil
    }
}
