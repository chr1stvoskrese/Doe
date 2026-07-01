//
//  ReminderStore.swift
//  Doe
//
//  Локальное хранилище времени напоминаний (per-устройство), чтобы не писать
//  «дедлайны» в общий файл vault. Время напоминания живёт в UserDefaults и
//  сопровождается системным локальным уведомлением (см. Reminders).
//

import Foundation

enum ReminderStore {
    private static func key(vault: String) -> String { "doe.reminders.\(vault)" }

    private static func load(vault: String) -> [String: Double] {
        UserDefaults.standard.dictionary(forKey: key(vault: vault)) as? [String: Double] ?? [:]
    }

    private static func save(_ map: [String: Double], vault: String) {
        UserDefaults.standard.set(map, forKey: key(vault: vault))
    }

    static func date(taskId: Int64, vault: String) -> Date? {
        guard let ts = load(vault: vault)["\(taskId)"] else { return nil }
        return Date(timeIntervalSince1970: ts)
    }

    static func set(taskId: Int64, date: Date?, vault: String) {
        var map = load(vault: vault)
        if let date { map["\(taskId)"] = date.timeIntervalSince1970 }
        else { map.removeValue(forKey: "\(taskId)") }
        save(map, vault: vault)
    }
}
