"""Окно Shreader: вставьте текст или Markdown — получите исправленный.

Слева исходный текст, справа результат. Кнопка «Алгоритм» выполняет
словарную проверку орфографии и расставляет «ёлочки», кнопка «LLM»
дополнительно прогоняет текст через Gemma (Ollama) для пунктуации.
"""

from __future__ import annotations

import difflib
import queue
import threading
import tkinter as tk
from tkinter import font, messagebox, ttk

from . import llm, markdown_guard, quotes
from .speller import RussianSpeller, SpellingIssue


class ShreaderApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        root.title("Shreader — корректор русского текста")
        root.geometry("1100x720")

        self._speller: RussianSpeller | None = None
        self._llm_queue: queue.Queue = queue.Queue()
        self._llm_busy = False

        self._build_toolbar()
        self._build_panes()
        self._build_issues_panel()
        self._build_statusbar()

    # ------------------------------------------------------------------ UI

    def _build_toolbar(self) -> None:
        bar = ttk.Frame(self.root, padding=(8, 6))
        bar.pack(fill="x")

        ttk.Button(bar, text="Проверить (алгоритм)", command=self.run_algorithmic).pack(
            side="left"
        )
        self._llm_button = ttk.Button(
            bar, text="Проверить (алгоритм + LLM)", command=self.run_llm
        )
        self._llm_button.pack(side="left", padx=(6, 0))
        ttk.Button(bar, text="Скопировать результат", command=self.copy_result).pack(
            side="left", padx=(6, 0)
        )

        ttk.Label(bar, text="Модель Ollama:").pack(side="left", padx=(18, 4))
        self.model_var = tk.StringVar(value=llm.DEFAULT_MODEL)
        ttk.Entry(bar, textvariable=self.model_var, width=14).pack(side="left")

    def _build_panes(self) -> None:
        panes = ttk.PanedWindow(self.root, orient="horizontal")
        panes.pack(fill="both", expand=True, padx=8)

        mono = font.nametofont("TkTextFont").copy()
        mono.configure(size=13)

        left = ttk.Frame(panes)
        ttk.Label(left, text="Исходный текст (текст или Markdown)").pack(anchor="w")
        self.input_text = tk.Text(left, wrap="word", undo=True, font=mono)
        self.input_text.pack(fill="both", expand=True)
        panes.add(left, weight=1)

        right = ttk.Frame(panes)
        ttk.Label(right, text="Исправленный текст").pack(anchor="w")
        self.output_text = tk.Text(right, wrap="word", font=mono)
        self.output_text.pack(fill="both", expand=True)
        panes.add(right, weight=1)

        self.input_text.tag_configure("misspelled", underline=True, foreground="#c0392b")
        self.output_text.tag_configure("changed", background="#fff3b0")

    def _build_issues_panel(self) -> None:
        frame = ttk.Frame(self.root, padding=(8, 4))
        frame.pack(fill="x")
        ttk.Label(frame, text="Орфография (словарь):").pack(anchor="w")
        self.issues_list = tk.Listbox(frame, height=5)
        self.issues_list.pack(fill="x")

    def _build_statusbar(self) -> None:
        self.status_var = tk.StringVar(value="Готово")
        ttk.Label(
            self.root, textvariable=self.status_var, padding=(8, 4), relief="sunken"
        ).pack(fill="x", side="bottom")

    # ------------------------------------------------------- алгоритмический

    def run_algorithmic(self) -> str:
        """Словарная орфография + типографские кавычки. Возвращает результат."""
        source = self.input_text.get("1.0", "end-1c")
        if not source.strip():
            self.status_var.set("Вставьте текст в левое поле")
            return ""

        self.status_var.set("Проверяю орфографию по словарю…")
        self.root.update_idletasks()

        masked, saved = markdown_guard.mask(source)
        issues = self._get_speller().check(masked)
        fixed = markdown_guard.unmask(quotes.fix_quotes(masked), saved)

        self._show_issues(source, masked, issues)
        self._show_output(source, fixed)
        self.status_var.set(
            f"Готово: {len(issues)} возможных опечаток, кавычки расставлены"
        )
        return fixed

    def _get_speller(self) -> RussianSpeller:
        if self._speller is None:
            self.status_var.set("Загружаю словарь русского языка…")
            self.root.update_idletasks()
            self._speller = RussianSpeller()
        return self._speller

    def _show_issues(
        self, source: str, masked: str, issues: list[SpellingIssue]
    ) -> None:
        self.input_text.tag_remove("misspelled", "1.0", "end")
        self.issues_list.delete(0, "end")
        for issue in issues:
            hint = ", ".join(issue.suggestions) if issue.suggestions else "нет вариантов"
            self.issues_list.insert("end", f"{issue.word} → {hint}")
            # Плейсхолдеры не содержат кириллицу, поэтому смещения слов
            # в замаскированном тексте ищем в исходном по самому слову.
            for start in _find_occurrences(source, issue.word):
                self.input_text.tag_add(
                    "misspelled",
                    f"1.0+{start}c",
                    f"1.0+{start + len(issue.word)}c",
                )

    # ----------------------------------------------------------------- LLM

    def run_llm(self) -> None:
        if self._llm_busy:
            return
        pre_corrected = self.run_algorithmic()
        if not pre_corrected:
            return

        model = self.model_var.get().strip() or llm.DEFAULT_MODEL
        self._llm_busy = True
        self._llm_button.state(["disabled"])
        self.status_var.set(f"Отправляю текст в {model} (Ollama)… это может занять минуту")

        def worker() -> None:
            try:
                result = llm.correct_text(pre_corrected, model=model)
                self._llm_queue.put(("ok", result))
            except Exception as exc:  # noqa: BLE001 — показываем пользователю
                self._llm_queue.put(("error", str(exc)))

        threading.Thread(target=worker, daemon=True).start()
        self.root.after(200, self._poll_llm)

    def _poll_llm(self) -> None:
        try:
            status, payload = self._llm_queue.get_nowait()
        except queue.Empty:
            self.root.after(200, self._poll_llm)
            return

        self._llm_busy = False
        self._llm_button.state(["!disabled"])
        if status == "ok":
            source = self.input_text.get("1.0", "end-1c")
            self._show_output(source, payload)
            self.status_var.set("Готово: текст проверен словарём и LLM")
        else:
            self.status_var.set("Ошибка LLM")
            messagebox.showerror("Ollama", payload)

    # ------------------------------------------------------------- результат

    def _show_output(self, source: str, corrected: str) -> None:
        self.output_text.delete("1.0", "end")
        self.output_text.insert("1.0", corrected)
        for start, end in _changed_spans(source, corrected):
            self.output_text.tag_add("changed", f"1.0+{start}c", f"1.0+{end}c")

    def copy_result(self) -> None:
        text = self.output_text.get("1.0", "end-1c")
        if not text:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.status_var.set("Результат скопирован в буфер обмена")


def _find_occurrences(text: str, word: str) -> list[int]:
    positions, start = [], 0
    while (idx := text.find(word, start)) != -1:
        positions.append(idx)
        start = idx + 1
    return positions


def _changed_spans(source: str, corrected: str) -> list[tuple[int, int]]:
    """Диапазоны изменённых символов в исправленном тексте (для подсветки)."""
    matcher = difflib.SequenceMatcher(a=source, b=corrected, autojunk=False)
    return [
        (j1, j2)
        for op, _i1, _i2, j1, j2 in matcher.get_opcodes()
        if op in ("replace", "insert") and j2 > j1
    ]


def main() -> None:
    root = tk.Tk()
    ShreaderApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
