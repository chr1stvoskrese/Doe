//
//  DragTypes.swift
//  Doe
//
//  Transferable-полезные нагрузки для drag-and-drop карточек и колонок.
//  Используем собственные UTType, чтобы перетаскивания карточек, колонок и
//  системного текста не путались между собой.
//

import Foundation
import UniformTypeIdentifiers
import CoreTransferable

extension UTType {
    /// Объявлены как exported types в Info.plist (см. README).
    static let doeTask = UTType(exportedAs: "com.aesthetic.doe.ios.task")
    static let doeColumn = UTType(exportedAs: "com.aesthetic.doe.ios.column")
}

/// Перетаскиваемая карточка (передаём только id; данные берём из VM).
struct TaskRef: Codable, Transferable {
    let id: Int64
    let sourceColumnId: Int64

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .doeTask)
    }
}

/// Перетаскиваемая колонка.
struct ColumnRef: Codable, Transferable {
    let id: Int64

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .doeColumn)
    }
}
