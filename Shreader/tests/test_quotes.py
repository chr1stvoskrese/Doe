import unittest

from shreader.quotes import fix_quotes


class FixQuotesTest(unittest.TestCase):
    def test_simple_pair(self):
        self.assertEqual(fix_quotes('Он сказал "привет" мне.'), "Он сказал «привет» мне.")

    def test_quote_at_start(self):
        self.assertEqual(fix_quotes('"Мир" — это слово.'), "«Мир» — это слово.")

    def test_nested_quotes(self):
        self.assertEqual(
            fix_quotes('Фильм "Операция "Ы"" вышел давно.'),
            "Фильм «Операция „Ы“» вышел давно.",
        )

    def test_smart_english_quotes(self):
        self.assertEqual(fix_quotes("Он сказал “привет”."), "Он сказал «привет».")

    def test_existing_guillemets_untouched(self):
        self.assertEqual(fix_quotes("Слово «мир» уже с ёлочками."),
                         "Слово «мир» уже с ёлочками.")

    def test_quote_after_open_paren(self):
        self.assertEqual(fix_quotes('(см. "пример")'), "(см. «пример»)")

    def test_no_quotes(self):
        text = "Обычный текст без кавычек."
        self.assertEqual(fix_quotes(text), text)


if __name__ == "__main__":
    unittest.main()
