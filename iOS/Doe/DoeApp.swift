//
//  DoeApp.swift
//  Doe — iOS
//
//  Точка входа. Маршрутизация между экраном выбора хранилища и доской.
//

import SwiftUI

@main
struct DoeApp: App {
    @StateObject private var vault = VaultManager()

    var body: some Scene {
        WindowGroup {
            RootView(vault: vault)
        }
    }
}

struct RootView: View {
    @ObservedObject var vault: VaultManager

    var body: some View {
        Group {
            if vault.isOpen {
                NavigationStack {
                    BoardView(vault: vault)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button {
                                    vault.closeCurrent()
                                } label: { Image(systemName: "rectangle.stack.badge.minus") }
                            }
                        }
                }
            } else {
                VaultPickerView(vault: vault)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: vault.isOpen)
    }
}
