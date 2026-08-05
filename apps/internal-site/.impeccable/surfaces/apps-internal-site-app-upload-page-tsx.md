---
version: 1
slug: "apps-internal-site-app-upload-page-tsx"
primary_target: "apps/internal-site/app/upload/page.tsx"
related_targets: ["apps/internal-site/components/web-uploader/web-upload-workbench.tsx","apps/internal-site/components/web-uploader/web-upload-pairing-preview.tsx"]
---

Scope: `/upload` internal Web upload workspace.
Mode: Operate.
Audience and job: internal operators import comparison groups under time pressure.
Primary task: choose the target Case and local directory, validate pairing, generate assets, then upload.
Required content: source identity, Case and Group metadata, pairing rows, blocking issues, generation progress, upload progress.
Constraints: keep File and Blob objects outside React state, create object URLs lazily, preserve explicit cancel semantics, use the existing presigned S3/R2 upload path, follow the project Material 3 and MUI system, and support 390px through wide desktop.
Direction: one continuous four-stage task band above a pairing inspection workspace with a stable supporting configuration pane.
Memorable moment: selecting a directory turns the intake surface into the pairing workspace in place, without navigation or a page-level reset.
Unresolved decisions: none.
