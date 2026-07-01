//
//  Theme.swift
//  Doe
//
//  Точные дизайн-токены десктопной версии (frontend/styles.css :root и
//  [data-theme="dark"]). Цвета динамические — сами адаптируются под светлую
//  и тёмную тему системы.
//

import SwiftUI
import UIKit

// MARK: - Hex helpers

extension UIColor {
    /// UIColor из hex 0xRRGGBB + alpha.
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red:   CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue:  CGFloat(hex & 0xFF) / 255,
            alpha: alpha)
    }

    /// Динамический цвет: разные значения для светлой и тёмной темы.
    static func dynamic(light: UIColor, dark: UIColor) -> UIColor {
        UIColor { traits in traits.userInterfaceStyle == .dark ? dark : light }
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(UIColor(hex: hex, alpha: alpha))
    }
}

/// Палитра и метрики, дословно перенесённые из styles.css.
enum Theme {

    // MARK: Цвета (light / dark)

    static let bgCanvas = Color(uiColor: .dynamic(
        light: UIColor(hex: 0xF4F3EF), dark: UIColor(hex: 0x161815)))
    static let bgBoard = Color(uiColor: .dynamic(
        light: UIColor(hex: 0xEBEAE3), dark: UIColor(hex: 0x1C1E1B)))
    static let surfaceCard = Color(uiColor: .dynamic(
        light: UIColor(hex: 0xFFFFFF), dark: UIColor(hex: 0x232521)))
    static let cardCompleted = Color(uiColor: .dynamic(
        light: UIColor(hex: 0xF7F6F3), dark: UIColor(hex: 0x1A1C19)))

    static let textPrimary = Color(uiColor: .dynamic(
        light: UIColor(hex: 0x2A3029), dark: UIColor(hex: 0xE6E8E5)))
    static let textSecondary = Color(uiColor: .dynamic(
        light: UIColor(hex: 0x828A80), dark: UIColor(hex: 0x8B9088)))

    static let borderLight = Color(uiColor: .dynamic(
        light: UIColor(white: 0, alpha: 0.06), dark: UIColor(white: 1, alpha: 0.06)))

    static let brandPine = Color(uiColor: .dynamic(
        light: UIColor(hex: 0x4A5A48), dark: UIColor(hex: 0x89A085)))
    static let brandPale = Color(uiColor: .dynamic(
        light: UIColor(hex: 0x4A5A48, alpha: 0.08), dark: UIColor(hex: 0x89A085, alpha: 0.15)))

    static let timerText = Color(uiColor: .dynamic(
        light: UIColor(hex: 0xC27A62), dark: UIColor(hex: 0xD69780)))
    static let successDone = Color(uiColor: .dynamic(
        light: UIColor(hex: 0x89A085), dark: UIColor(hex: 0x738A70)))

    /// Фон meta-pill / лёгкие hover-подложки.
    static let pillBg = Color(uiColor: .dynamic(
        light: UIColor(white: 0, alpha: 0.04), dark: UIColor(white: 1, alpha: 0.06)))
    /// Подложка под наведением (rgba 0,0,0,0.04 / white 0.06).
    static let hoverBg = pillBg
    /// Завершённый чек-лист.
    static let checklistDoneBg = Color(uiColor: .dynamic(
        light: UIColor(hex: 0x89A085, alpha: 0.15), dark: UIColor(hex: 0x738A70)))
    static let checklistDoneText = Color(uiColor: .dynamic(
        light: UIColor(hex: 0x89A085), dark: UIColor(hex: 0xFFFFFF)))

    // MARK: Метрики

    static let radiusBoard: CGFloat = 16   // --radius-board
    static let radiusCard: CGFloat = 16    // --radius-card
    static let columnWidth: CGFloat = 320  // .column width
    static let boardGap: CGFloat = 24      // .board gap
    static let cardGap: CGFloat = 12       // .card-list gap

    /// Кривая Apple-перехода: cubic-bezier(0.16, 1, 0.3, 1), 0.3s.
    static func appleCurve(_ duration: Double = 0.3) -> Animation {
        .timingCurve(0.16, 1, 0.3, 1, duration: duration)
    }

    // MARK: Кривые появления (1:1 с desktop .*-entering)

    /// Карточка: cubic-bezier(0.2, 0.8, 0.2, 1), ~0.12s.
    static func enterCard() -> Animation { .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.14) }
    /// Колонка: cubic-bezier(0.4, 0, 0.2, 1), 0.3s.
    static func enterColumn() -> Animation { .timingCurve(0.4, 0, 0.2, 1, duration: 0.30) }
    /// Вкладка: cubic-bezier(0.16, 1, 0.3, 1), 0.3s.
    static func enterTab() -> Animation { .timingCurve(0.16, 1, 0.3, 1, duration: 0.30) }
}

// MARK: - Переходы появления элементов (вставка в список)

extension AnyTransition {
    /// Карточка: scale 0.97 от верха + fade (desktop .card-entering → .entered).
    static var doeCardEnter: AnyTransition {
        .scale(scale: 0.97, anchor: .top)
            .combined(with: .opacity)
            .animation(Theme.enterCard())
    }
    /// Колонка: scale 0.98 + fade (desktop .column-entering → .entered).
    static var doeColumnEnter: AnyTransition {
        .scale(scale: 0.98)
            .combined(with: .opacity)
            .animation(Theme.enterColumn())
    }
    /// Вкладка: scale 0.96 от левого края + сдвиг -10px + fade (desktop .tab-entering).
    static var doeTabEnter: AnyTransition {
        .offset(x: -10, y: 0)
            .combined(with: .scale(scale: 0.96, anchor: .leading))
            .combined(with: .opacity)
            .animation(Theme.enterTab())
    }
}

// MARK: - Тени (shadow-card / shadow-drag) с поддержкой тёмной темы

extension View {
    /// --shadow-card: мягкая тень карточки (значения отличаются в тёмной теме).
    @ViewBuilder
    func shadowCard(_ scheme: ColorScheme) -> some View {
        if scheme == .dark {
            self.shadow(color: .black.opacity(0.55), radius: 1.5, x: 0, y: 1)
        } else {
            self
                .shadow(color: .black.opacity(0.06), radius: 3, x: 0, y: 2)
                .shadow(color: .black.opacity(0.04), radius: 1, x: 0, y: 1)
        }
    }

    /// Подъём карточки при наведении/нажатии: translateY(-2px) + усиленная тень.
    @ViewBuilder
    func shadowCardHover(_ scheme: ColorScheme) -> some View {
        if scheme == .dark {
            self.shadow(color: .black.opacity(0.7), radius: 8, x: 0, y: 4)
        } else {
            self
                .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 6)
                .shadow(color: .black.opacity(0.04), radius: 2, x: 0, y: 2)
        }
    }

    /// --shadow-drag: крупная слоистая тень при перетаскивании.
    @ViewBuilder
    func shadowDrag(_ scheme: ColorScheme) -> some View {
        if scheme == .dark {
            self
                .shadow(color: .black.opacity(0.9), radius: 8, x: 0, y: 6)
                .shadow(color: .black.opacity(0.9), radius: 16, x: 0, y: 16)
        } else {
            self
                .shadow(color: .black.opacity(0.04), radius: 8, x: 0, y: 8)
                .shadow(color: .black.opacity(0.06), radius: 32, x: 0, y: 24)
                .shadow(color: .black.opacity(0.05), radius: 64, x: 0, y: 48)
        }
    }
}
