from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import yaml

from src.workspace_builder import (
    _yaml_scalar,
    write_commented_yaml,
    write_case_yaml,
    write_group_yaml,
    build_case_payload,
    build_group_payload,
)


class YamlScalarTests(unittest.TestCase):
    def test_string_plain(self) -> None:
        self.assertEqual(_yaml_scalar("before-after"), "before-after")

    def test_string_numeric_is_quoted(self) -> None:
        result = _yaml_scalar("2026")
        # yaml.safe_load should round-trip back to the string "2026"
        self.assertEqual(yaml.safe_load(f"key: {result}")["key"], "2026")

    def test_bool_false(self) -> None:
        self.assertEqual(_yaml_scalar(False), "false")

    def test_bool_true(self) -> None:
        self.assertEqual(_yaml_scalar(True), "true")

    def test_empty_list(self) -> None:
        self.assertEqual(_yaml_scalar([]), "[]")

    def test_list_values(self) -> None:
        result = _yaml_scalar(["2026", "TV"])
        loaded = yaml.safe_load(f"key: {result}")["key"]
        self.assertEqual(loaded, ["2026", "TV"])


class WriteCommentedYamlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "test.yaml"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_comments_are_written(self) -> None:
        write_commented_yaml(
            self.path,
            [
                ("唯一标识符", "slug", "2026"),
                ("状态", "status", "internal"),
            ],
        )
        text = self.path.read_text(encoding="utf-8")
        self.assertIn("# 唯一标识符", text)
        self.assertIn("# 状态", text)

    def test_values_round_trip(self) -> None:
        write_commented_yaml(
            self.path,
            [
                ("标题", "title", "Test 测试"),
                ("公开", "isPublic", False),
                ("标签", "tags", ["a", "b"]),
            ],
        )
        data = yaml.safe_load(self.path.read_text(encoding="utf-8"))
        self.assertEqual(data["title"], "Test 测试")
        self.assertEqual(data["isPublic"], False)
        self.assertEqual(data["tags"], ["a", "b"])


class CaseYamlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "case.yaml"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_case_yaml_has_all_fields_and_comments(self) -> None:
        payload = build_case_payload(None, "2026")
        write_case_yaml(self.path, payload)
        text = self.path.read_text(encoding="utf-8")
        # Comments present
        self.assertIn("# 唯一标识符", text)
        self.assertIn("# 状态", text)
        self.assertIn("# 封面资产标签", text)
        # Values round-trip correctly
        data = yaml.safe_load(text)
        self.assertEqual(data["slug"], "2026")
        self.assertEqual(data["status"], "internal")
        self.assertIn("coverAssetLabel", data)


class GroupYamlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "group.yaml"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_group_yaml_has_comments(self) -> None:
        payload = {
            "title": "测试 Group",
            "description": "",
            "defaultMode": "before-after",
            "isPublic": False,
            "tags": [],
        }
        write_group_yaml(self.path, payload)
        text = self.path.read_text(encoding="utf-8")
        self.assertIn("# 对外展示标题", text)
        self.assertIn("# 默认对比模式", text)
        self.assertIn("# 是否公开", text)
        data = yaml.safe_load(text)
        self.assertEqual(data["isPublic"], False)
        self.assertEqual(data["defaultMode"], "before-after")
