//
//  RelationPickerView.swift
//  Doe
//
//  Выбор существующей карточки для связи (как ребёнок или как родитель).
//  Защита от циклов выполняется в слое хранения (VaultStore.setParents).
//

import SwiftUI

struct RelationPickerView: View {
    @ObservedObject var vm: BoardViewModel
    let taskId: Int64
    let mode: Mode
    var onDone: () -> Void
    @Environment(\.dismiss) private var dismiss

    enum Mode { case child, parent }

    @State private var query = ""
    @State private var all: [(id: Int64, title: String)] = []

    private var filtered: [(id: Int64, title: String)] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return all.filter { $0.id != taskId && (q.isEmpty || $0.title.lowercased().contains(q)) }
    }

    var body: some View {
        NavigationStack {
            List(filtered, id: \.id) { item in
                Button {
                    link(item.id)
                } label: {
                    Text(item.title.isEmpty ? "Без названия" : item.title)
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(2)
                }
            }
            .searchable(text: $query, prompt: "Поиск карточки")
            .navigationTitle(mode == .child ? "Связать подзадачу" : "Выбрать родителя")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Закрыть") { dismiss() } }
            }
            .onAppear { all = vm.allTasksBrief() }
            .alert("Нельзя связать", isPresented: Binding(
                get: { vm.errorText != nil }, set: { if !$0 { vm.errorText = nil } })) {
                Button("Ок", role: .cancel) { vm.errorText = nil }
            } message: { Text(vm.errorText ?? "") }
        }
    }

    private func link(_ otherId: Int64) {
        switch mode {
        case .child:  vm.linkSubtask(parentId: taskId, childId: otherId)
        case .parent: vm.linkSubtask(parentId: otherId, childId: taskId)
        }
        if vm.errorText == nil { onDone(); dismiss() }
    }
}
