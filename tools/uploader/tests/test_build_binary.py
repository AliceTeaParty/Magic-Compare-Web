from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


def _load_build_binary_module():
    module_path = (
        Path(__file__).resolve().parents[1] / "scripts" / "build-binary.py"
    )
    spec = importlib.util.spec_from_file_location("build_binary_module", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载 build-binary.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build_binary_module = _load_build_binary_module()


class BuildBinaryTests(unittest.TestCase):
    def test_pykakasi_data_args_include_dictionary_bundle(self) -> None:
        args = build_binary_module._pykakasi_data_args("macos")

        self.assertGreaterEqual(len(args), 2)
        self.assertEqual(args[0], "--add-data")
        joined = "\n".join(args)
        self.assertIn("kanwadict4.db", joined)
        self.assertIn("pykakasi", joined)

    def test_write_windows_cmd_wrapper_forwards_args_and_pauses_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            executable_path = Path(temp_dir) / "magic-compare-uploader-windows-amd64.exe"

            wrapper_path = build_binary_module._write_windows_cmd_wrapper(executable_path)

            self.assertEqual(wrapper_path.suffix, ".cmd")
            content = wrapper_path.read_text(encoding="utf-8")
            self.assertIn(str(executable_path.name), content)
            self.assertIn("%*", content)
            self.assertIn("pause", content.lower())

    def test_branding_asset_args_include_root_logo_file(self) -> None:
        uploader_root = Path(__file__).resolve().parents[1]

        args = build_binary_module._branding_asset_args(uploader_root, "windows")

        self.assertEqual(args[0], "--add-data")
        self.assertIn("字符画.txt", args[1])


if __name__ == "__main__":
    unittest.main()
