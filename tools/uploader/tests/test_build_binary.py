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
    def test_write_windows_cmd_wrapper_forwards_args_and_pauses_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            executable_path = Path(temp_dir) / "magic-compare-uploader-windows-amd64.exe"

            wrapper_path = build_binary_module._write_windows_cmd_wrapper(executable_path)

            self.assertEqual(wrapper_path.suffix, ".cmd")
            content = wrapper_path.read_text(encoding="utf-8")
            self.assertIn(str(executable_path.name), content)
            self.assertIn("%*", content)
            self.assertIn("pause", content.lower())


if __name__ == "__main__":
    unittest.main()
