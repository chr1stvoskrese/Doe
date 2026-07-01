//
//  BoardView.swift
//  Doe
//
//  Доска — визуально по мотивам десктопа: канвас bg-canvas, лента вкладок-чипов
//  (активная = белая пилюля с тенью), горизонтальная лента колонок с gap 24 и
//  пунктирной кнопкой создания колонки.
//
//  Перетаскивание — кастомный движок (см. DragEngine.swift), повторяющий физику
//  десктопа: плавающий клон с наклоном по скорости, масштабом и пружинным
//  приземлением, плюс живая перестановка соседей.
//

import SwiftUI
import UIKit
import UniformTypeIdentifiers
import CoreTransferable

struct BoardView: View {
    @ObservedObject var vault: VaultManager
    @StateObject private var vm: BoardViewModel
    @StateObject private var drag = DragController()
    @State private var openTaskId: Int64?
    @State private var addingColumn = false
    @State private var newColumnTitle = ""
    @State private var addingTab = false
    @State private var newWorkspaceName = ""
    @State private var tabMenuWs: Workspace?
    @FocusState private var columnFieldFocused: Bool
    @FocusState private var tabFieldFocused: Bool
    @Environment(\.scenePhase) private var scenePhase

    init(vault: VaultManager) {
        self.vault = vault
        _vm = StateObject(wrappedValue: BoardViewModel(vault: vault))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 0) {
                tabBar
                boardArea
            }
            dragOverlay
        }
        .coordinateSpace(name: DragController.spaceName)
        .background(Theme.bgCanvas.ignoresSafeArea())
        .navigationTitle(vault.currentName ?? "Doe")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { startAddingColumn() } label: { Image(systemName: "plus.rectangle.on.rectangle") }
                    .tint(Theme.brandPine)
            }
        }
        .onAppear { vm.reload(); wireDrag() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { vault.refreshNow() } }
        .sheet(item: Binding(get: { openTaskId.map { IdentifiableInt(id: $0) } },
                             set: { openTaskId = $0?.id })) { wrapper in
            CardModalView(vm: vm, taskId: wrapper.id)
        }
        .confirmationDialog(tabMenuWs?.name ?? "",
                            isPresented: Binding(get: { tabMenuWs != nil },
                                                 set: { if !$0 { tabMenuWs = nil } }),
                            presenting: tabMenuWs) { ws in
            Button("Переименовать") { presentRename(ws) }
            if vm.workspaces.count > 1 {
                Button("Удалить вкладку", role: .destructive) { vm.deleteWorkspace(ws.id) }
            }
        }
    }

    // MARK: - Плавающий клон (физика перетаскивания)

    @ViewBuilder
    private var dragOverlay: some View {
        if drag.payload != nil {
            DragClone(controller: drag)
        }
    }

    // MARK: - Вкладки

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(vm.workspaces) { ws in
                    tabChip(ws).transition(.doeTabEnter)
                }
                if addingTab {
                    tabForm.transition(.doeTabEnter)
                } else {
                    Button { startAddingTab() } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.textSecondary)
                            .frame(width: 32, height: 32)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .animation(Theme.appleCurve(0.35), value: vm.workspaces)
        }
    }

    private func tabChip(_ ws: Workspace) -> some View {
        let isActive = ws.id == vm.activeWorkspaceId
        let isDragging = drag.payload?.kind == .tab && drag.payload?.id == ws.id
        let isDropTarget = drag.hoverTabId == ws.id
        return Text(ws.name)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(isActive ? Theme.textPrimary : Theme.textSecondary)
            .lineLimit(1)
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isDropTarget ? Theme.brandPale : (isActive ? Theme.surfaceCard : Color.clear))
                    .shadow(color: isActive ? .black.opacity(0.05) : .clear, radius: 1.5, x: 0, y: 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Theme.brandPine, lineWidth: isDropTarget ? 1.5 : 0)
            )
            .scaleEffect(isDropTarget ? 1.06 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 10))
            .opacity(isDragging ? 0.35 : 1)
            .animation(Theme.appleCurve(0.2), value: isDropTarget)
            .onTapGesture {
                if isActive { tabMenuWs = ws } else { vm.selectWorkspace(ws.id) }
            }
            .doeReportFrame(drag, .tab, ws.id)
            .doeDragGesture(drag, kind: .tab, id: ws.id) {
                Text(ws.name).font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                    .padding(.horizontal, 14).padding(.vertical, 6)
                    .background(Theme.surfaceCard)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
    }

    // MARK: - Колонки

    private var boardArea: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: Theme.boardGap) {
                ForEach(vm.columns) { column in
                    ColumnView(vm: vm, drag: drag, column: column, openTaskId: $openTaskId)
                        .transition(.doeColumnEnter)
                }
                newColumnButton
            }
            .padding(.leading, 24)
            .padding(.trailing, 24)
            .padding(.top, 4)
            .padding(.bottom, 16)
            .frame(maxHeight: .infinity, alignment: .top)
            .animation(Theme.appleCurve(), value: vm.columns)
            .background(ScrollViewFinder { drag.setBoardScroll($0) })
        }
    }

    private var newColumnButton: some View {
        Group {
            if addingColumn {
                columnForm.transition(.doeColumnEnter)
            } else {
                Button { startAddingColumn() } label: {
                    Text("+ Создать колонку")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.brandPine)
                        .frame(width: Theme.columnWidth, height: 60)
                        .background(
                            RoundedRectangle(cornerRadius: Theme.radiusBoard, style: .continuous)
                                .strokeBorder(Theme.brandPine.opacity(0.25),
                                              style: StrokeStyle(lineWidth: 2, dash: [6, 5]))
                        )
                }
            }
        }
        .animation(Theme.enterColumn(), value: addingColumn)
    }

    // Черновик колонки — штрихпунктирная рамка 2px, как desktop .column-entering.
    private var columnForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            TextField("Название колонки", text: $newColumnTitle, axis: .vertical)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
                .focused($columnFieldFocused)
                .submitLabel(.done)
                .onSubmit(commitAddColumn)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Theme.brandPine.opacity(0.25),
                                      style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                )
                .padding(.top, 20).padding(.horizontal, 20).padding(.bottom, 12)
        }
        .frame(width: Theme.columnWidth, alignment: .topLeading)
        .background(Color.clear)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusBoard, style: .continuous)
                .strokeBorder(Theme.brandPine.opacity(0.25),
                              style: StrokeStyle(lineWidth: 2, dash: [6, 5]))
        )
        .onChange(of: columnFieldFocused) { _, focused in if !focused { commitAddColumn() } }
    }

    // Черновик вкладки — штрихпунктирный чип, как desktop .board-tab.tab-entering.
    private var tabForm: some View {
        TextField("Вкладка", text: $newWorkspaceName)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(Theme.textPrimary)
            .focused($tabFieldFocused)
            .submitLabel(.done)
            .onSubmit(commitAddTab)
            .frame(minWidth: 110, maxWidth: 200)
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Theme.brandPine.opacity(0.35),
                                  style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            )
            .onChange(of: tabFieldFocused) { _, focused in if !focused { commitAddTab() } }
    }

    private func startAddingColumn() {
        withAnimation(Theme.enterColumn()) { addingColumn = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { columnFieldFocused = true }
    }
    private func commitAddColumn() {
        guard addingColumn else { return }
        let t = newColumnTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { vm.addColumn(title: t) }
        newColumnTitle = ""
        withAnimation(Theme.enterColumn()) { addingColumn = false }
    }
    private func startAddingTab() {
        withAnimation(Theme.enterTab()) { addingTab = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { tabFieldFocused = true }
    }
    private func commitAddTab() {
        guard addingTab else { return }
        let t = newWorkspaceName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { vm.addWorkspace(name: t) }
        newWorkspaceName = ""
        withAnimation(Theme.enterTab()) { addingTab = false }
    }

    // MARK: - Подключение движка

    private func wireDrag() {
        drag.onBegin = { payload in
            switch payload.kind {
            case .card:   vm.beginCardDrag(payload.id, origin: payload.sourceColumnId)
            case .column: vm.beginColumnDrag(payload.id)
            case .tab:    vm.beginTabDrag(payload.id)
            }
        }
        drag.onMove = { payload, finger in
            // «Над вкладкой» считаем только когда палец реально в полосе вкладок
            // сверху — иначе при обычном переносе колонка ложно сжималась в миниатюру.
            let tabsMaxY = drag.framesOf(.tab).values.map(\.maxY).max() ?? 0
            let overTab = finger.y <= tabsMaxY + 12 ? tabUnder(finger) : nil
            let overForeignTab = overTab != nil && overTab != vm.activeWorkspaceId && payload.kind != .tab
            drag.hoverTab(overForeignTab ? overTab : nil)
            drag.setOverTabs(overForeignTab)   // сжатие клона только реально над лентой
            switch payload.kind {
            case .card:   if !overForeignTab { handleCardMove(payload, finger) }
            case .column: if !overForeignTab { handleColumnMove(payload, finger) }
            case .tab:    break
            }
        }
        drag.onDrop = { payload, finger in handleDrop(payload, finger) }
        drag.onHoverSwitch = { tabId in
            guard let kind = drag.payload?.kind else { return }
            drag.abort()                 // плавно завершаем клон
            switch kind {
            case .card:   vm.moveDraggedCardToWorkspace(tabId)
            case .column: vm.moveDraggedColumnToWorkspace(tabId)
            case .tab:    break
            }
            vm.selectWorkspace(tabId)    // авто-переключение на целевую вкладку
        }
    }

    private func handleCardMove(_ payload: DragPayload, _ finger: CGPoint) {
        if tabUnder(finger) != nil { return }   // над лентой вкладок колонки не трогаем
        let cols = drag.framesOf(.column)
        guard !cols.isEmpty else { return }
        let targetCol: Int64 = cols.first(where: { $0.value.minX <= finger.x && finger.x <= $0.value.maxX })?.key
            ?? cols.min(by: { abs($0.value.midX - finger.x) < abs($1.value.midX - finger.x) })!.key
        let cardFrames = drag.framesOf(.card)
        let ids = (vm.tasksByColumn[targetCol]?.map(\.id) ?? []).filter { $0 != payload.id }
        var index = ids.count
        for (i, cid) in ids.enumerated() {
            if let f = cardFrames[cid], finger.y < f.midY { index = i; break }
        }
        vm.previewCardMove(payload.id, toColumn: targetCol, index: index)
    }

    private func handleColumnMove(_ payload: DragPayload, _ finger: CGPoint) {
        let cols = drag.framesOf(.column).filter { $0.key != payload.id }
            .sorted { $0.value.minX < $1.value.minX }
        var index = cols.count
        for (i, e) in cols.enumerated() { if finger.x < e.value.midX { index = i; break } }
        vm.previewColumnMove(payload.id, toIndex: index)
    }

    private func handleDrop(_ payload: DragPayload, _ finger: CGPoint) {
        switch payload.kind {
        case .card:
            if let tab = tabUnder(finger), tab != vm.activeWorkspaceId {
                vm.moveDraggedCardToWorkspace(tab)
            } else { vm.commitCardDrag() }
        case .column:
            if let tab = tabUnder(finger), tab != vm.activeWorkspaceId {
                vm.moveDraggedColumnToWorkspace(tab)
            } else { vm.commitColumnDrag() }
        case .tab:
            let tabs = drag.framesOf(.tab).filter { $0.key != payload.id }
                .sorted { $0.value.minX < $1.value.minX }
            var index = tabs.count
            for (i, e) in tabs.enumerated() { if finger.x < e.value.midX { index = i; break } }
            vm.commitTabReorder(payload.id, toIndex: index)
        }
    }

    private func tabUnder(_ finger: CGPoint) -> Int64? {
        drag.framesOf(.tab).first(where: { $0.value.contains(finger) })?.key
    }

    private func presentRename(_ ws: Workspace) {
        let alert = UIAlertController(title: "Переименовать вкладку", message: nil, preferredStyle: .alert)
        alert.addTextField { $0.text = ws.name }
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel))
        alert.addAction(UIAlertAction(title: "Сохранить", style: .default) { _ in
            if let t = alert.textFields?.first?.text, !t.isEmpty { vm.renameWorkspace(ws.id, to: t) }
        })
        UIApplication.shared.topController?.present(alert, animated: true)
    }
}

/// Плавающий клон. Подписан на DragMotion (60 fps) — перерисовывается только он,
/// а не вся доска.
private struct DragClone: View {
    @ObservedObject var controller: DragController
    @ObservedObject var motion: DragMotion
    @Environment(\.colorScheme) private var scheme

    init(controller: DragController) {
        _controller = ObservedObject(wrappedValue: controller)
        _motion = ObservedObject(wrappedValue: controller.motion)
    }

    var body: some View {
        sizedSnapshot
            .scaleEffect(motion.scale, anchor: .topLeading)
            .rotationEffect(.degrees(motion.rotation), anchor: .topLeading)
            .shadowDrag(scheme)
            .opacity(motion.opacity)
            .offset(x: motion.topLeft.x, y: motion.topLeft.y)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .allowsHitTesting(false)
    }

    @ViewBuilder
    private var sizedSnapshot: some View {
        if motion.height > 0 {
            // Колонка — в реальную высоту (как на доске), а не миниатюрой.
            controller.snapshot
                .frame(width: motion.width, height: motion.height, alignment: .topLeading)
        } else {
            // Карточка — по содержимому.
            controller.snapshot
                .frame(width: motion.width, alignment: .topLeading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Обёртка Int64 для .sheet(item:).
struct IdentifiableInt: Identifiable { let id: Int64 }

extension UIApplication {
    var topController: UIViewController? {
        guard let scene = connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return nil }
        var top = root
        while let presented = top.presentedViewController { top = presented }
        return top
    }
}
