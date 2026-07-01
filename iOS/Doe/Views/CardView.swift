//
//  CardView.swift
//  Doe
//
//  Карточка — визуально 1:1 с десктопом (frontend .card):
//  белая поверхность, radius 16, padding 14, мягкая тень; заголовок 14/500;
//  завершённая карточка — фон #F7F6F3, зачёркнутый вторичный текст и зелёная
//  галочка; футер с пилюлей чек-листа (число подзадач).
//

import SwiftUI

struct CardView: View {
    let task: Card
    let subtaskCount: Int
    var doneSubtasks: Int = 0
    var reminderDate: Date? = nil

    @Environment(\.colorScheme) private var scheme

    private var isCompleted: Bool { task.completedAt != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            titleRow
            if hasFooter { footer }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isCompleted ? Theme.cardCompleted : Theme.surfaceCard)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                .strokeBorder(Theme.borderLight, lineWidth: 1)
        )
        .shadowCard(scheme)
    }

    // MARK: Заголовок

    private var titleRow: some View {
        HStack(alignment: .top, spacing: 8) {
            if isCompleted {
                Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.successDone)
                    .padding(.top, 1)
                    .transition(.scale.combined(with: .opacity))
            }
            Text(titleAttributed)
                .font(.system(size: 14, weight: .medium))
                .lineSpacing(2)
                .foregroundStyle(isCompleted ? Theme.textSecondary : Theme.textPrimary)
                .strikethrough(isCompleted, color: Theme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Футер (пилюли)

    private var hasFooter: Bool { subtaskCount > 0 || reminderDate != nil }

    private var footer: some View {
        HStack(spacing: 8) {
            if subtaskCount > 0 { checklistPill }
            if let due = reminderDate { duePill(due) }
            Spacer(minLength: 0)
        }
    }

    private var allDone: Bool { subtaskCount > 0 && doneSubtasks >= subtaskCount }

    private var checklistPill: some View {
        HStack(spacing: 4) {
            Image(systemName: "checklist")
                .font(.system(size: 11, weight: .semibold))
            Text("\(doneSubtasks)/\(subtaskCount)")
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .foregroundStyle(allDone ? Theme.checklistDoneText : Theme.textSecondary)
        .background(allDone ? Theme.checklistDoneBg : Theme.pillBg)
        .clipShape(Capsule())
    }

    private func duePill(_ date: Date) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "bell.fill")
                .font(.system(size: 10, weight: .semibold))
            Text(shortDate(date))
                .font(.system(size: 12, weight: .semibold))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .foregroundStyle(date < Date() ? Theme.timerText : Theme.textSecondary)
        .background(Theme.pillBg)
        .clipShape(Capsule())
    }

    // MARK: Helpers

    private var titleAttributed: AttributedString {
        (try? AttributedString(markdown: task.displayTitle,
                               options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(task.displayTitle)
    }

    private func shortDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = Calendar.current.isDateInToday(date) ? "HH:mm" : "d MMM"
        return f.string(from: date)
    }
}
