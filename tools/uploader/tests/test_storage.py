from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from src.storage import create_upload_http_client, upload_file_to_presigned_url


class StorageUploadTests(unittest.TestCase):
    @mock.patch("src.storage.httpx.Client")
    def test_create_upload_http_client_accepts_manual_proxy(
        self, client_class: mock.Mock
    ) -> None:
        create_upload_http_client("http://127.0.0.1:7890")

        client_class.assert_called_once_with(
            timeout=120.0,
            proxy="http://127.0.0.1:7890",
        )

    def test_upload_file_to_presigned_url_uses_shared_client_and_streams_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "frame.png"
            source_path.write_bytes(b"abc123")
            client = mock.Mock()
            client.put.return_value = mock.Mock()

            upload_file_to_presigned_url(
                source_path,
                upload_url="https://r2.example.com/object",
                content_type="image/png",
                client=client,
            )

            request_kwargs = client.put.call_args.kwargs
            self.assertEqual(
                request_kwargs["headers"]["content-length"],
                str(source_path.stat().st_size),
            )
            self.assertEqual(request_kwargs["headers"]["content-type"], "image/png")
            streamed_chunks = list(request_kwargs["content"])
            self.assertEqual(streamed_chunks, [b"abc123"])
            client.put.return_value.raise_for_status.assert_called_once()
