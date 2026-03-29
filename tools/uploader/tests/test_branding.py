from __future__ import annotations

import json
import tomllib
import unittest
from pathlib import Path


class VersionLinkingTests(unittest.TestCase):
    def test_uploader_pyproject_matches_root_package_version(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        root_package = json.loads((repo_root / "package.json").read_text(encoding="utf-8"))
        uploader_pyproject = tomllib.loads(
            (repo_root / "tools" / "uploader" / "pyproject.toml").read_text(
                encoding="utf-8"
            )
        )

        self.assertEqual(
            uploader_pyproject["project"]["version"],
            root_package["version"],
        )


if __name__ == "__main__":
    unittest.main()
