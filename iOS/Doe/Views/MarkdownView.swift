//
//  MarkdownView.swift
//  Doe
//
//  Лёгкий блочный рендер Markdown: заголовки, списки, цитаты, код, ссылки,
//  изображения (из подпапки doe/). Инлайн-форматирование (жирный/курсив/код/
//  ссылки) делегируется AttributedString(markdown:).
//

import SwiftUI
import UIKit

struct MarkdownView: View {
    let text: String
    var attachmentsDir: URL?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Блоки

    private enum Block {
        case heading(level: Int, text: String)
        case paragraph(String)
        case bullet([String])
        case ordered([String])
        case quote(String)
        case code(String)
        case image(alt: String, path: String)
        case rule
    }

    private var blocks: [Block] {
        var result: [Block] = []
        let lines = text.components(separatedBy: "\n")
        var i = 0
        func flushList(_ items: inout [String], ordered: Bool) {
            if !items.isEmpty {
                result.append(ordered ? .ordered(items) : .bullet(items))
                items.removeAll()
            }
        }
        var bullets: [String] = []
        var ordereds: [String] = []

        while i < lines.count {
            let raw = lines[i]
            let line = raw.trimmingCharacters(in: .whitespaces)

            // Код-фенс ```
            if line.hasPrefix("```") {
                flushList(&bullets, ordered: false); flushList(&ordereds, ordered: true)
                var code: [String] = []
                i += 1
                while i < lines.count && !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    code.append(lines[i]); i += 1
                }
                result.append(.code(code.joined(separator: "\n")))
                i += 1
                continue
            }
            // Изображение ![alt](path)
            if let img = parseImage(line) {
                flushList(&bullets, ordered: false); flushList(&ordereds, ordered: true)
                result.append(.image(alt: img.0, path: img.1)); i += 1; continue
            }
            // Горизонтальная линия
            if line == "---" || line == "***" || line == "___" {
                flushList(&bullets, ordered: false); flushList(&ordereds, ordered: true)
                result.append(.rule); i += 1; continue
            }
            // Заголовок
            if let h = parseHeading(line) {
                flushList(&bullets, ordered: false); flushList(&ordereds, ordered: true)
                result.append(.heading(level: h.0, text: h.1)); i += 1; continue
            }
            // Цитата
            if line.hasPrefix(">") {
                flushList(&bullets, ordered: false); flushList(&ordereds, ordered: true)
                result.append(.quote(String(line.dropFirst()).trimmingCharacters(in: .whitespaces)))
                i += 1; continue
            }
            // Маркированный список
            if line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("+ ") {
                flushList(&ordereds, ordered: true)
                bullets.append(String(line.dropFirst(2))); i += 1; continue
            }
            // Нумерованный список
            if let dot = line.firstIndex(of: "."), line[line.startIndex..<dot].allSatisfy(\.isNumber),
               line.startIndex != dot {
                flushList(&bullets, ordered: false)
                let rest = line[line.index(after: dot)...].trimmingCharacters(in: .whitespaces)
                ordereds.append(rest); i += 1; continue
            }
            // Пустая строка
            if line.isEmpty {
                flushList(&bullets, ordered: false); flushList(&ordereds, ordered: true)
                i += 1; continue
            }
            // Абзац (склеиваем подряд идущие непустые строки)
            flushList(&bullets, ordered: false); flushList(&ordereds, ordered: true)
            var para = [line]; i += 1
            while i < lines.count {
                let n = lines[i].trimmingCharacters(in: .whitespaces)
                if n.isEmpty || isBlockStart(n) { break }
                para.append(n); i += 1
            }
            result.append(.paragraph(para.joined(separator: " ")))
        }
        flushList(&bullets, ordered: false); flushList(&ordereds, ordered: true)
        return result
    }

    private func isBlockStart(_ line: String) -> Bool {
        line.hasPrefix("#") || line.hasPrefix(">") || line.hasPrefix("- ")
            || line.hasPrefix("* ") || line.hasPrefix("+ ") || line.hasPrefix("```")
            || line == "---" || parseImage(line) != nil
    }

    private func parseHeading(_ line: String) -> (Int, String)? {
        var level = 0
        for ch in line { if ch == "#" { level += 1 } else { break } }
        guard (1...6).contains(level), line.count > level,
              line[line.index(line.startIndex, offsetBy: level)] == " " else { return nil }
        let text = String(line.dropFirst(level)).trimmingCharacters(in: .whitespaces)
        return (level, text)
    }

    private func parseImage(_ line: String) -> (String, String)? {
        guard line.hasPrefix("!["), let close = line.firstIndex(of: "]"),
              line.index(after: close) < line.endIndex,
              line[line.index(after: close)] == "(", line.hasSuffix(")") else { return nil }
        let alt = String(line[line.index(line.startIndex, offsetBy: 2)..<close])
        let pathStart = line.index(close, offsetBy: 2)
        let path = String(line[pathStart..<line.index(before: line.endIndex)])
        return (alt, path)
    }

    // MARK: - Рендер

    @ViewBuilder
    private func view(for block: Block) -> some View {
        switch block {
        case .heading(let level, let text):
            inline(text)
                .font(headingFont(level))
                .fontWeight(.semibold)
                .padding(.top, level <= 2 ? 4 : 0)
        case .paragraph(let text):
            inline(text).font(.body)
        case .bullet(let items):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").foregroundStyle(Theme.textSecondary)
                        inline(item).font(.body)
                    }
                }
            }
        case .ordered(let items):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(idx + 1).").foregroundStyle(Theme.textSecondary).monospacedDigit()
                        inline(item).font(.body)
                    }
                }
            }
        case .quote(let text):
            HStack(spacing: 8) {
                Rectangle().fill(Theme.brandPine.opacity(0.5)).frame(width: 3)
                inline(text).font(.body).foregroundStyle(Theme.textSecondary)
            }
        case .code(let code):
            ScrollView(.horizontal, showsIndicators: false) {
                Text(code).font(.system(.callout, design: .monospaced))
                    .padding(10)
            }
            .background(Theme.pillBg)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        case .image(let alt, let path):
            imageView(alt: alt, path: path)
        case .rule:
            Divider()
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title
        case 2: return .title2
        case 3: return .title3
        default: return .headline
        }
    }

    /// Инлайн-Markdown (жирный/курсив/код/ссылки) через AttributedString.
    private func inline(_ text: String) -> Text {
        if let attr = try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return Text(attr)
        }
        return Text(text)
    }

    @ViewBuilder
    private func imageView(alt: String, path: String) -> some View {
        if let dir = attachmentsDir, let img = loadImage(path: path, dir: dir) {
            Image(uiImage: img)
                .resizable()
                .scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            Label(alt.isEmpty ? path : alt, systemImage: "photo")
                .font(.callout)
                .foregroundStyle(Theme.textSecondary)
        }
    }

    private func loadImage(path: String, dir: URL) -> UIImage? {
        // path вида "doe/file.png" — берём имя файла относительно папки vault.
        let name = path.hasPrefix("doe/") ? String(path.dropFirst(4)) : path
        let url = dir.appendingPathComponent(name)
        return UIImage(contentsOfFile: url.path)
    }
}
