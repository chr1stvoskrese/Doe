import unittest

from shreader.markdown_guard import mask, unmask
from shreader.quotes import fix_quotes


class MarkdownGuardTest(unittest.TestCase):
    def test_roundtrip(self):
        text = 'Текст с `print("hi")` и ссылкой [тут](https://example.com "t").'
        masked, saved = mask(text)
        self.assertNotIn("print", masked)
        self.assertNotIn("example.com", masked)
        self.assertIn("[тут]", masked)  # текст ссылки остаётся проверяемым
        self.assertEqual(unmask(masked, saved), text)

    def test_fenced_code_block(self):
        text = 'До\n```python\ns = "строка"\n```\nПосле'
        masked, saved = mask(text)
        self.assertNotIn('"строка"', masked)
        self.assertEqual(unmask(masked, saved), text)

    def test_quotes_inside_code_untouched(self):
        text = 'Скажи "да" и выполни `echo "нет"`.'
        masked, saved = mask(text)
        result = unmask(fix_quotes(masked), saved)
        self.assertEqual(result, 'Скажи «да» и выполни `echo "нет"`.')

    def test_bare_url(self):
        text = 'Сайт https://example.com/a?b="c" работает.'
        masked, saved = mask(text)
        result = unmask(fix_quotes(masked), saved)
        self.assertEqual(result, text)


if __name__ == "__main__":
    unittest.main()
