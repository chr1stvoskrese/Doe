//
//  VaultPickerView.swift
//  Doe
//
//  Экран выбора хранилища. Можно открыть существующую папку (например, в
//  iCloud Drive, созданную на Mac), создать новое хранилище в выбранной папке,
//  или открыть недавнее. Это и есть «как в Obsidian»: папка в iCloud,
//  доступная и Mac, и iPhone.
//

import SwiftUI

struct VaultPickerView: View {
    @ObservedObject var vault: VaultManager
    @Environment(\.colorScheme) private var scheme

    @State private var showOpenPicker = false
    @State private var showParentPicker = false
    @State private var pendingParent: URL?
    @State private var showNameAlert = false
    @State private var newName = ""

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 32) {
                    header
                    actions
                    if !vault.recents.isEmpty { recentsList }
                    Spacer(minLength: 20)
                    footer
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 40)
            }
            .background(Theme.bgCanvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showOpenPicker) {
                FolderPicker { url in vault.openFolder(url, createIfEmpty: true) }
                    .ignoresSafeArea()
            }
            .sheet(isPresented: $showParentPicker) {
                FolderPicker { url in
                    pendingParent = url
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { showNameAlert = true }
                }
                .ignoresSafeArea()
            }
            .alert("Имя нового хранилища", isPresented: $showNameAlert) {
                TextField("Например, Мои задачи", text: $newName)
                Button("Создать") {
                    if let parent = pendingParent {
                        vault.createVault(named: newName, inParent: parent)
                    }
                    newName = ""; pendingParent = nil
                }
                Button("Отмена", role: .cancel) { newName = ""; pendingParent = nil }
            } message: {
                Text("Будет создана папка с файлом базы .db.doe. Выберите папку в iCloud Drive, чтобы синхронизировать с Mac.")
            }
            .alert("Ошибка", isPresented: Binding(
                get: { vault.lastError != nil }, set: { if !$0 { vault.lastError = nil } })) {
                Button("Ок", role: .cancel) { vault.lastError = nil }
            } message: { Text(vault.lastError ?? "") }
        }
    }

    // MARK: - Header (Hero)

    private var header: some View {
        VStack(spacing: 12) {
            Image(systemName: "shippingbox.fill")
                .font(.system(size: 34))
                .foregroundStyle(Theme.brandPine)
                .frame(width: 68, height: 68)
                .background(Theme.brandPale)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .padding(.bottom, 8)

            Text("Doe")
                .font(.system(size: 38, weight: .bold))
                .tracking(-1)
                .foregroundStyle(Theme.textPrimary)

            Text("Aesthetic. Local-first. Kanban sanctuary.")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.textSecondary)
        }
        .multilineTextAlignment(.center)
        .padding(.top, 16)
    }

    // MARK: - Actions

    private var actions: some View {
        HStack(spacing: 16) {
            vaultActionCard(
                title: "Создать хранилище",
                desc: "Начните новое локальное хранилище на вашем устройстве",
                icon: "plus",
                action: { showParentPicker = true }
            )
            vaultActionCard(
                title: "Открыть хранилище",
                desc: "Выберите существующее хранилище из вашего устройства",
                icon: "folder",
                action: { showOpenPicker = true }
            )
        }
    }

    private func vaultActionCard(title: String, desc: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .strokeBorder(Theme.brandPine.opacity(0.3), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                        .frame(width: 48, height: 48)
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(Theme.brandPine)
                }
                .padding(.bottom, 4)

                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .multilineTextAlignment(.center)

                Text(desc)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .padding(.horizontal, 4)
            }
            .padding(.vertical, 24)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Theme.surfaceCard)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.borderLight, lineWidth: 1)
            )
            .shadowCard(scheme)
        }
        .buttonStyle(VaultCardButtonStyle())
    }

    // MARK: - Recents

    private var recentsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("История хранилищ")
                .font(.system(size: 11, weight: .heavy))
                .textCase(.uppercase)
                .tracking(1.2)
                .foregroundStyle(Theme.textSecondary)
                .opacity(0.8)
                .padding(.bottom, 2)

            VStack(spacing: 8) {
                ForEach(vault.recents) { recent in
                    HStack(spacing: 14) {
                        Image(systemName: "folder.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(Theme.brandPine.opacity(0.85))

                        VStack(alignment: .leading, spacing: 4) {
                            Text(recent.name)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.textPrimary)
                                .lineLimit(1)
                            Text(recent.lastOpenedAt, style: .date)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Theme.textSecondary)
                        }
                        Spacer()
                        
                        Button {
                            vault.removeRecent(recent)
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.textSecondary)
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 4)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(Theme.surfaceCard)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Theme.borderLight, lineWidth: 1)
                    )
                    .shadowCard(scheme)
                    .contentShape(Rectangle())
                    .onTapGesture { vault.openRecent(recent) }
                }
            }
        }
    }

    // MARK: - Footer

    private var footer: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "lock.shield")
                .font(.system(size: 16))
            Text("Все данные хранятся только на вашем устройстве.\nКонфиденциальность. Без облака. Без компромиссов.")
                .font(.system(size: 12, weight: .medium))
                .lineSpacing(3)
        }
        .foregroundStyle(Theme.textSecondary)
        .opacity(0.8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Анимация вдавливания (эмуляция :active в CSS)
struct VaultCardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
