//
//  Notifications.swift
//  Doe
//
//  Локальные напоминания через UNUserNotificationCenter. На iOS у нас нет
//  фоновых процессов-воркеров как на десктопе — вместо них планируем системные
//  локальные уведомления, которые ОС доставит в назначенное время.
//

import Foundation
import UserNotifications

enum Reminders {
    /// Запрашивает разрешение на уведомления (вызвать при первом планировании).
    static func requestAuthorization() async -> Bool {
        await withCheckedContinuation { cont in
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                cont.resume(returning: granted)
            }
        }
    }

    /// Идентификатор уведомления для карточки.
    static func identifier(taskId: Int64) -> String { "doe.reminder.task.\(taskId)" }

    /// Планирует напоминание на дату. Заменяет предыдущее для этой карточки.
    static func schedule(taskId: Int64, title: String, body: String, at date: Date) async {
        _ = await requestAuthorization()
        let content = UNMutableNotificationContent()
        content.title = title.isEmpty ? "Doe" : title
        content.body = body
        content.sound = .default

        let comps = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let request = UNNotificationRequest(identifier: identifier(taskId: taskId),
                                            content: content, trigger: trigger)
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier(taskId: taskId)])
        try? await center.add(request)
    }

    /// Отменяет напоминание карточки.
    static func cancel(taskId: Int64) {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [identifier(taskId: taskId)])
    }

    /// Есть ли запланированное напоминание для карточки.
    static func pending(taskId: Int64) async -> Bool {
        let id = identifier(taskId: taskId)
        let reqs = await UNUserNotificationCenter.current().pendingNotificationRequests()
        return reqs.contains { $0.identifier == id }
    }
}
