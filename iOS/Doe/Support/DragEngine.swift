//
//  DragEngine.swift
//  Doe
//
//  Кастомный движок перетаскивания, воспроизводящий «физику» десктопа
//  (frontend/app.js → startDrag / renderPhysics / endDrag):
//
//    • плавающий клон следует за пальцем (как .card-drag-clone);
//    • наклон по горизонтальной скорости: target = clamp(dx*0.4, ±maxRot),
//      сглаживание lerp 0.15 за кадр, возврат к 0 в покое;
//    • масштаб карточки → 1.04 (колонка/вкладка → 1.02) с тем же lerp;
//    • «приземление» к целевому слоту пружиной (аналог cubic-bezier 0.2,0.8,0.2,1);
//    • живая перестановка соседей (FLIP) — делает ViewModel оптимистично.
//
//  ВАЖНО (производительность): покадровая анимация клона живёт в отдельном
//  объекте DragMotion. На него подписан только сам клон (DragClone во View),
//  поэтому 60 fps-обновления НЕ перерисовывают всю доску. DragController хранит
//  лишь низкочастотное состояние (payload, реестр кадров) — на него подписаны
//  колонки/карточки только для показа призраков.
//
//  Старт — long-press → drag, порог удержания 0.22с.
//

import SwiftUI
import UIKit

// MARK: - Что перетаскиваем

enum DragKind: Hashable { case card, column, tab }

struct DragPayload: Equatable {
    var kind: DragKind
    var id: Int64
    var sourceColumnId: Int64   // только для карточек (иначе -1)
}

// MARK: - Покадровая физика клона (высокочастотный объект)

final class DragMotion: ObservableObject {
    /// Левый-верхний угол клона (как desktop transform-origin: top left).
    @Published var topLeft: CGPoint = .zero
    @Published var rotation: Double = 0
    @Published var scale: Double = 1
    @Published var opacity: Double = 1
    @Published var width: CGFloat = 0
    /// Явная высота клона (для колонок = высота реальной колонки; 0 = по содержимому).
    @Published var height: CGFloat = 0

    private var kind: DragKind = .card
    private var grab: CGSize = .zero
    private(set) var finger: CGPoint = .zero
    private var lastX: CGFloat = 0
    private var targetRotation: Double = 0
    /// Над лентой вкладок: клон сжимается (как desktop isHoveringTabs → scale 0.2).
    private var overTabs = false
    private var link: CADisplayLink?

    /// Вызывается каждый кадр (после физики) — для авто-скролла у края.
    var onTick: (() -> Void)?

    deinit { link?.invalidate() }

    func begin(kind: DragKind, width: CGFloat, height: CGFloat, grab: CGSize, finger: CGPoint) {
        self.kind = kind; self.width = width; self.height = height
        self.grab = grab; self.finger = finger
        lastX = finger.x
        rotation = 0; targetRotation = 0; scale = 1; opacity = 1; overTabs = false
        topLeft = topLeftFor(finger)
        start()
    }

    func setOverTabs(_ v: Bool) { overTabs = v }

    func update(finger: CGPoint) {
        self.finger = finger
        topLeft = topLeftFor(finger)
    }

    /// Пружинное приземление к левому-верхнему углу целевого слота и остановка цикла.
    func settle(toTopLeft target: CGPoint?) {
        stop()
        overTabs = false
        withAnimation(.interpolatingSpring(stiffness: 220, damping: 26)) {
            rotation = 0
            scale = 1
            opacity = 1
            if let target { topLeft = target }
        }
    }

    private func topLeftFor(_ f: CGPoint) -> CGPoint {
        CGPoint(x: f.x - grab.width, y: f.y - grab.height)
    }

    // Цикл сглаживания (аналог renderPhysics на requestAnimationFrame).
    private func start() {
        stop()
        let proxy = DisplayLinkProxy { [weak self] in self?.tick() }
        let l = CADisplayLink(target: proxy, selector: #selector(DisplayLinkProxy.tick))
        l.add(to: .main, forMode: .common)
        link = l
    }

    private func stop() { link?.invalidate(); link = nil }

    private func tick() {
        let maxRot: Double = (kind == .card) ? 12 : 3
        let dx = Double(finger.x - lastX)
        lastX = finger.x
        // Над вкладками наклон гасим (как при сжатии на десктопе).
        targetRotation = overTabs ? 0 : max(-maxRot, min(maxRot, dx * 0.4))
        rotation += (targetRotation - rotation) * 0.15
        let baseScale: Double = (kind == .card) ? 1.04 : 1.02
        let targetScale: Double = overTabs ? 0.2 : baseScale
        scale += (targetScale - scale) * 0.15
        let targetOpacity: Double = overTabs ? 0.7 : 1.0
        opacity += (targetOpacity - opacity) * 0.15
        onTick?()
    }
}

/// Прокси для CADisplayLink (требуется @objc-цель; удержание разрывается через [weak self]).
final class DisplayLinkProxy: NSObject {
    private let cb: () -> Void
    init(_ cb: @escaping () -> Void) { self.cb = cb; super.init() }
    @objc func tick() { cb() }
}

/// Находит UIScrollView, в который встроен SwiftUI-ScrollView (для авто-скролла).
struct ScrollViewFinder: UIViewRepresentable {
    let onFound: (UIScrollView) -> Void

    func makeUIView(context: Context) -> UIView {
        let v = UIView(frame: .zero)
        v.isUserInteractionEnabled = false
        DispatchQueue.main.async {
            var responder: UIResponder? = v
            while let r = responder {
                if let sv = r as? UIScrollView { onFound(sv); break }
                responder = r.next
            }
        }
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

// MARK: - Контроллер (низкочастотное состояние)

final class DragController: ObservableObject {

    /// Имя общего координатного пространства доски.
    static let spaceName = "doeBoard"

    /// Меняется только на старте/финише — на него подписаны виды (показ призраков).
    @Published var payload: DragPayload?

    /// Вкладка под пальцем во время перетаскивания (для подсветки цели «перенести во вкладку»).
    @Published var hoverTabId: Int64?

    /// Покадровая анимация клона (подписан только сам клон).
    let motion = DragMotion()

    // Снимок перетаскиваемого вида (читается только когда payload != nil).
    private(set) var snapshot: AnyView = AnyView(EmptyView())

    private var finger: CGPoint = .zero
    private var dropping = false

    // Колбэки в текущую доску (устанавливает BoardView).
    var onBegin: ((DragPayload) -> Void)?
    var onMove: ((DragPayload, CGPoint) -> Void)?
    var onDrop: ((DragPayload, CGPoint) -> Void)?
    /// Сработал dwell над чужой вкладкой (~0.6с) — авто-переключение, как на десктопе.
    var onHoverSwitch: ((Int64) -> Void)?

    private var hoverWork: DispatchWorkItem?
    private var pendingHoverTab: Int64?

    /// Горизонтальный скролл доски — для авто-прокрутки у краёв при перетаскивании.
    weak var boardScroll: UIScrollView?
    func setBoardScroll(_ sv: UIScrollView?) { boardScroll = sv }

    // Реестр кадров элементов в координатах "doeBoard" (не @Published — не вызывает перерисовку).
    private var frames: [DragKind: [Int64: CGRect]] = [:]

    var isDragging: Bool { payload != nil }

    // MARK: Реестр кадров

    func report(_ k: DragKind, _ id: Int64, _ r: CGRect) { frames[k, default: [:]][id] = r }
    func clear(_ k: DragKind, _ id: Int64) { frames[k]?.removeValue(forKey: id) }
    func frame(_ k: DragKind, _ id: Int64) -> CGRect? { frames[k]?[id] }
    func framesOf(_ k: DragKind) -> [Int64: CGRect] { frames[k] ?? [:] }

    // MARK: Жизненный цикл

    func begin(_ p: DragPayload, preview: AnyView, width: CGFloat, height: CGFloat,
               grab: CGSize, finger: CGPoint) {
        snapshot = preview
        self.finger = finger
        dropping = false
        motion.onTick = { [weak self] in self?.autoPan() }
        motion.begin(kind: p.kind, width: width, height: height, grab: grab, finger: finger)
        hoverTabId = nil
        pendingHoverTab = nil
        hoverWork?.cancel(); hoverWork = nil
        payload = p   // последним — клон уже готов к показу
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        onBegin?(p)
    }

    /// Авто-прокрутка доски по горизонтали, когда палец у левого/правого края.
    private func autoPan() {
        guard let p = payload, !dropping, let sv = boardScroll else { return }
        let w = sv.bounds.width
        guard w > 0 else { return }
        let margin: CGFloat = 70
        let maxSpeed: CGFloat = 18
        let x = finger.x
        var dx: CGFloat = 0
        if x < margin {
            dx = -maxSpeed * (1 - max(0, x) / margin)
        } else if x > w - margin {
            dx = maxSpeed * (1 - max(0, w - x) / margin)
        }
        guard dx != 0 else { return }
        let maxOff = max(0, sv.contentSize.width - w)
        let newX = min(maxOff, max(0, sv.contentOffset.x + dx))
        guard newX != sv.contentOffset.x else { return }
        sv.contentOffset.x = newX
        onMove?(p, finger)   // цель вставки обновляется под неподвижным пальцем
    }

    func update(finger: CGPoint) {
        guard let p = payload, !dropping else { return }
        self.finger = finger
        motion.update(finger: finger)
        onMove?(p, finger)
    }

    /// Признак «клон над лентой вкладок» — включает сжатие клона (перенос во вкладку).
    func setOverTabs(_ v: Bool) { motion.setOverTabs(v) }

    /// Наведение на вкладку во время перетаскивания: подсветка + dwell-таймер 0.6с.
    func hoverTab(_ tabId: Int64?) {
        hoverTabId = tabId
        guard tabId != pendingHoverTab else { return }
        pendingHoverTab = tabId
        hoverWork?.cancel(); hoverWork = nil
        guard let tabId else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.payload != nil, !self.dropping,
                  self.pendingHoverTab == tabId else { return }
            self.onHoverSwitch?(tabId)
        }
        hoverWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: work)
    }

    /// Завершить перетаскивание без дропа (например, после авто-переключения вкладки).
    func abort() {
        guard payload != nil, !dropping else { return }
        dropping = true
        hoverTabId = nil
        pendingHoverTab = nil
        hoverWork?.cancel(); hoverWork = nil
        motion.settle(toTopLeft: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.34) { [weak self] in
            guard let self else { return }
            self.snapshot = AnyView(EmptyView())
            self.dropping = false
            self.payload = nil
        }
    }

    func drop() {
        guard let p = payload, !dropping else { return }
        dropping = true
        hoverTabId = nil
        pendingHoverTab = nil
        hoverWork?.cancel(); hoverWork = nil
        onDrop?(p, finger)
        let target = frame(p.kind, p.id)?.origin
        motion.settle(toTopLeft: target)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.34) { [weak self] in
            guard let self else { return }
            self.snapshot = AnyView(EmptyView())
            self.dropping = false
            self.payload = nil
        }
    }
}

// MARK: - Модификаторы видов

extension View {

    /// Сообщает кадр элемента в координатах доски (для попадания и приземления).
    func doeReportFrame(_ c: DragController, _ kind: DragKind, _ id: Int64) -> some View {
        background(
            GeometryReader { geo in
                let r = geo.frame(in: .named(DragController.spaceName))
                Color.clear
                    .onAppear { c.report(kind, id, r) }
                    .onChange(of: r) { _, nr in c.report(kind, id, nr) }
                    .onDisappear { c.clear(kind, id) }
            }
        )
    }

    /// Жест «удержать → тащить».
    func doeDragGesture<P: View>(_ c: DragController,
                                 kind: DragKind,
                                 id: Int64,
                                 sourceColumnId: Int64 = -1,
                                 @ViewBuilder preview: @escaping () -> P) -> some View {
        let press = LongPressGesture(minimumDuration: 0.22)
        let dragG = DragGesture(minimumDistance: 0, coordinateSpace: .named(DragController.spaceName))
        let combo = press.sequenced(before: dragG)
            .onChanged { value in
                if case .second(true, let d?) = value {
                    if c.payload?.kind == kind && c.payload?.id == id {
                        c.update(finger: d.location)
                    } else if c.payload == nil {
                        let f = c.frame(kind, id)
                            ?? CGRect(origin: d.location, size: CGSize(width: 1, height: 1))
                        let grab = CGSize(width: d.location.x - f.minX,
                                          height: d.location.y - f.minY)
                        // Колонку клонируем в её реальную высоту (иначе «миниатюра»);
                        // карточку — по содержимому.
                        let cloneHeight: CGFloat = (kind == .column) ? f.height : 0
                        c.begin(DragPayload(kind: kind, id: id, sourceColumnId: sourceColumnId),
                                preview: AnyView(preview()),
                                width: f.width, height: cloneHeight, grab: grab, finger: d.location)
                    }
                }
            }
            .onEnded { _ in
                if c.payload?.kind == kind && c.payload?.id == id { c.drop() }
            }
        return gesture(combo)
    }
}

// MARK: - Призраки (слот на месте перетаскиваемого элемента)

extension View {

    /// Призрак карточки (desktop .card.is-ghost: opacity 0.3, фон border-light).
    func doeCardGhost() -> some View {
        hidden().overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard, style: .continuous)
                .fill(Theme.borderLight)
                .opacity(0.5)
        )
    }

    /// Призрак колонки (desktop .column.is-ghost: фон bg-canvas, пунктир, opacity 0.6).
    func doeColumnGhost() -> some View {
        hidden().overlay(
            RoundedRectangle(cornerRadius: Theme.radiusBoard, style: .continuous)
                .fill(Theme.bgCanvas)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.radiusBoard, style: .continuous)
                        .strokeBorder(Theme.borderLight,
                                      style: StrokeStyle(lineWidth: 2, dash: [6, 5]))
                )
                .opacity(0.6)
        )
    }
}
