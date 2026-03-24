from __future__ import annotations

import unittest

from src.naming import kebab_case, _cjk_to_latin


class CjkToLatinTests(unittest.TestCase):
    def test_pure_ascii_passthrough(self) -> None:
        self.assertEqual(_cjk_to_latin("BDRip-2026"), "BDRip-2026")

    def test_chinese_to_pinyin(self) -> None:
        result = _cjk_to_latin("魔法少女")
        self.assertIn("mo", result)
        self.assertIn("fa", result)

    def test_japanese_katakana_uses_hepburn(self) -> None:
        # Katakana triggers pykakasi path
        result = _cjk_to_latin("マジカル")
        self.assertTrue(result.isascii(), f"Expected ASCII hepburn, got: {result!r}")

    def test_japanese_hiragana_uses_hepburn(self) -> None:
        result = _cjk_to_latin("まどか")
        self.assertTrue(result.isascii(), f"Expected ASCII hepburn, got: {result!r}")

    def test_mixed_ascii_and_chinese(self) -> None:
        result = _cjk_to_latin("BDRip-压制")
        self.assertIn("BDRip", result)
        # Chinese part should be converted to pinyin
        self.assertTrue(result.isascii(), f"Expected ASCII output, got: {result!r}")


class KebabCaseTests(unittest.TestCase):
    def test_plain_ascii(self) -> None:
        self.assertEqual(kebab_case("Hello World"), "hello-world")

    def test_chinese_slug_contains_pinyin(self) -> None:
        slug = kebab_case("魔法少女2026")
        self.assertTrue(slug.isascii(), f"Slug should be ASCII, got: {slug!r}")
        self.assertNotEqual(slug, "untitled")
        self.assertIn("2026", slug)

    def test_japanese_slug_contains_romaji(self) -> None:
        # Contains katakana, so pykakasi path is used
        slug = kebab_case("マジカルコンペア2026")
        self.assertTrue(slug.isascii(), f"Slug should be ASCII, got: {slug!r}")
        self.assertNotEqual(slug, "untitled")
        self.assertIn("2026", slug)

    def test_chinese_group_name_in_slug(self) -> None:
        # Reproduces the original bug: Chinese-only name should not produce "untitled"
        slug = kebab_case("压制组作品")
        self.assertTrue(slug.isascii())
        self.assertNotEqual(slug, "untitled")

    def test_slug_has_no_double_hyphens(self) -> None:
        slug = kebab_case("BDRip-魔法-2026")
        self.assertNotIn("--", slug)

    def test_slug_does_not_start_or_end_with_hyphen(self) -> None:
        slug = kebab_case("-魔法-")
        self.assertFalse(slug.startswith("-"))
        self.assertFalse(slug.endswith("-"))

    def test_empty_string_returns_untitled(self) -> None:
        self.assertEqual(kebab_case(""), "untitled")

    def test_only_special_chars_returns_untitled(self) -> None:
        self.assertEqual(kebab_case("---"), "untitled")

    def test_url_safe_output(self) -> None:
        # Slug must only contain lowercase letters, digits and hyphens
        import re
        slug = kebab_case("SPY×FAMILY 间谍过家家")
        self.assertRegex(slug, r"^[a-z0-9-]+$")
