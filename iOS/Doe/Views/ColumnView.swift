//
//  ColumnView.swift
//  Doe
//
//  Колонка — визуально 1:1 с десктопом (frontend .column):
//  фон bg-board, ширина 320, radius 16, заголовок 15/600, meta-pill со
//  счётчиком и иконкой режима, список карточек с gap 12, кнопка добавления.
//
//  Перетаскивание карточек и самой колонки — через кастомный движок
//  (DragEngine.swift): призрак-слот на месте, плавающий клон с физикой,
//  живая перестановка соседей.
//

import SwiftUI

struct ColumnView: View {
    @ObservedObject var vm: BoardViewModel
    @ObservedObject var drag: DragController
    let column: Column
    @Binding var openTaskId: Int64?

    @Environment(\.colorScheme) private var scheme
    @State private var newCardText = ""
    @State private var addingCard = false
    @State private var renaming = false
    @State private var draftTitle = ""
    @FocusState private var addFocused: Bool
    @FocusState private var renameFocused: Bool

    private var tasks: [Card] { vm.tasksByColumn[column.id] ?? [] }
    private var width: CGFloat { CGFloat(column.width ?? Double(Theme.columnWidth)) }
    private var isColumnDragging: Bool {
        drag.payload?.kind == .column && drag.payload?.id == column.id
    }

    var body: some View {
        let container = VStack(spacing: 0) {
            header
            cardList
            addRow
        }
        .frame(width: width)
        .background(Theme.bgBoard)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusBoard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusBoard, style: .continuous)
                .strokeBorder(Theme.borderLight, lineWidth: 1)
        )

        return Group {
            if isColumnDragging {
                // Модификатор сохраняет реальную высоту колонки, скрывает контент
                // и рисует пунктир — верстка HStack не ломается.
                container.doeColumnGhost()
            } else {
                container
            }
        }
        .doeReportFrame(drag, .column, column.id)
    }

    // MARK: - Шапка

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            if renaming {
                TextField("Название", text: $draftTitle)
                    .font(.system(size: 15, weight: .semibold))
                    .focused($renameFocused)
                    .submitLabel(.done)
                    .onSubmit(commitRename)
            } else {
                Text(column.title)
                    .font(.system(size: 15, weight: .semibold))
                    .tracking(-0.15)
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onTapGesture { startRename() }
            }
            metaPill
            menu
        }
        .padding(.top, 20)
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
        .contentShape(Rectangle())
        // Колонка тащится за шапку (reorder колонок) — кастомный жест.
        .doeDragGesture(drag, kind: .column, id: column.id) {
            columnDragPreview
        }
    }

    private var metaPill: some View {
        HStack(spacing: 6) {
            Text("\(tasks.count)")
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
            Image(systemName: modeIcon)
                .font(.system(size: 11, weight: .semibold))
                .opacity(0.9)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .foregroundStyle(Theme.textSecondary)
        .background(Theme.pillBg)
        .clipShape(Capsule())
    }

    private var modeIcon: String {
        switch column.mode {
        case .default:    return "square"
        case .trackTime:  return "clock"
        case .completion: return "checkmark"
        }
    }

    private var menu: some View {
        Menu {
            Button { startRename() } label: { Label("Переименовать", systemImage: "pencil") }
            Menu("Режим колонки") {
                ForEach(ColumnMode.allCases) { m in
                    Button { vm.setColumnMode(column.id, mode: m) } label: {
                        if column.mode == m { Label(m.title, systemImage: "checkmark") }
                        else { Text(m.title) }
                    }
                }
            }
            Divider()
            Button(role: .destructive) { vm.deleteColumn(column.id) } label: {
                Label("Удалить колонку", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.textSecondary)
                .frame(width: 28, height: 28)
        }
    }

    // Клон колонки: шапка + карточки, высота строго по содержимому
    // (без жёстких ограничений), как на десктопе.
    private var columnDragPreview: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(column.title)
                    .font(.system(size: 15, weight: .semibold))
                    .tracking(-0.15)
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                metaPill
            }
            .padding(.top, 20).padding(.horizontal, 20).padding(.bottom, 12)

            if tasks.isEmpty {
                Spacer().frame(height: 28)
            } else {
                VStack(spacing: Theme.cardGap) {
                    ForEach(tasks) { t in
                        let st = vm.subtaskStat(t.id)
                        CardView(task: t, subtaskCount: st.count, doneSubtasks: st.done,
                                 reminderDate: vm.reminderDate(for: t.id))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
        .frame(width: width, alignment: .topLeading)
        .frame(maxHeight: .infinity, alignment: .topLeading)   // заполняем высоту клона
        .background(Theme.bgBoard)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusBoard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusBoard, style: .continuous)
            .strokeBorder(Theme.borderLight, lineWidth: 1))
    }

    // MARK: - Список карточек

    private var cardList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: Theme.cardGap) {
                ForEach(tasks) { task in
                    let st = vm.subtaskStat(task.id)
                    cardCell(task, st.count, st.done)
                }
                endZone

                if addingCard {
                    cardForm
                }
            }
            .padding(.top, 4)
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
            .animation(Theme.appleCurve(), value: tasks)
        }
    }

    @ViewBuilder
    private func cardCell(_ task: Card, _ subCount: Int, _ done: Int) -> some View {
        let isDragging = drag.payload?.kind == .card && drag.payload?.id == task.id
        Group {
            if isDragging {
                CardView(task: task, subtaskCount: subCount, doneSubtasks: done,
                         reminderDate: vm.reminderDate(for: task.id))
                    .doeCardGhost()
            } else {
                CardView(task: task, subtaskCount: subCount, doneSubtasks: done,
                         reminderDate: vm.reminderDate(for: task.id))
                    .contentShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
                    .onTapGesture { openTaskId = task.id }
                    .doeDragGesture(drag, kind: .card, id: task.id, sourceColumnId: column.id) {
                        CardView(task: task, subtaskCount: subCount, doneSubtasks: done)
                    }
                    .transition(.doeCardEnter)
            }
        }
        .doeReportFrame(drag, .card, task.id)
    }

    // Зона приёма в конец/в пустую колонку (визуальная подсказка; попадание — по кадру колонки).
    private var endZone: some View {
        Color.clear
            .frame(height: tasks.isEmpty ? 80 : 36)
            .frame(maxWidth: .infinity)
            .overlay {
                if tasks.isEmpty {
                    Text("Перетащите сюда")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textSecondary)
                }
            }
    }

    // MARK: - Добавление карточки

    // Черновик карточки — штрихпунктирная рамка, как desktop .card-entering.
    // Живёт внутри cardList (в скроллящемся списке), поэтому без своих боковых отступов.
    private var cardForm: some View {
        HStack(alignment: .top, spacing: 8) {
            TextField("Название карточки", text: $newCardText, axis: .vertical)
                .font(.system(size: 14, weight: .medium))
                .focused($addFocused)
                .submitLabel(.done)
                .onSubmit(commitAdd)
            Button(action: commitAdd) {
                Image(systemName: "arrow.up.circle.fill").font(.title3)
                    .foregroundStyle(Theme.brandPine)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                .strokeBorder(Theme.brandPine.opacity(0.35),
                              style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
        )
        .transition(.scale(scale: 0.97, anchor: .top).combined(with: .opacity))
    }

    private var addRow: some View {
        VStack(spacing: 0) {
            if !addingCard {
                Button {
                    withAnimation(Theme.enterCard()) { addingCard = true }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { addFocused = true }
                } label: {
                    Text("+ Новая карточка")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
                .transition(.opacity)
            }
        }
        .animation(Theme.enterCard(), value: addingCard)
    }

    private func commitAdd() {
        let t = newCardText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { vm.addTask(columnId: column.id, title: t) }
        newCardText = ""
        withAnimation(Theme.enterCard()) { addingCard = false }
    }

    private func startRename() { draftTitle = column.title; renaming = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { renameFocused = true } }
    private func commitRename() {
        renaming = false
        let t = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty && t != column.title { vm.renameColumn(column.id, to: t) }
    }
}
