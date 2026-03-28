from __future__ import annotations

import unittest

from rich.progress import Progress
from rich.text import Text

from src.upload_executor import UploadProgressEvent
from src.wizard import (
    WizardUploadProgressState,
    _frame_status_line,
    _render_upload_progress,
)


class WizardProgressRenderingTests(unittest.TestCase):
    def test_render_upload_progress_preserves_bracketed_frame_titles(self) -> None:
        event = UploadProgressEvent(
            kind="file_uploaded",
            stage="upload",
            frame_order=0,
            frame_title="[v2] sample",
            completed_frames=0,
            total_frames=2,
            completed_files=1,
            total_files=4,
            skipped_files=0,
            retried_count=0,
            failed_count=0,
        )
        state = WizardUploadProgressState(
            frame_status=_frame_status_line(event),
            stats_line="文件：1/4 | frame：0/2 | skipped：0 | retried：0 | failed：0",
        )

        renderables = _render_upload_progress(Progress(), state).renderables

        self.assertIsInstance(renderables[1], Text)
        self.assertEqual(
            renderables[1].plain,
            "当前 frame：1/2 [v2] sample · 上传中",
        )


if __name__ == "__main__":
    unittest.main()
