"use client";

import { GroupViewerWorkbench } from "@magic-compare/ui";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";

export function InternalGroupViewer({ dataset }: { dataset: ViewerDataset }) {
  return <GroupViewerWorkbench dataset={dataset} variant="internal" />;
}
