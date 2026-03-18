"use client";

import { useRouter } from "next/navigation";
import { GroupViewerWorkbench } from "@magic-compare/ui";
import type { ViewerDataset } from "@magic-compare/compare-core";

export function InternalGroupViewer({ dataset }: { dataset: ViewerDataset }) {
  const router = useRouter();

  return (
    <GroupViewerWorkbench
      dataset={dataset}
      variant="internal"
      onFrameReorder={async (frameIds) => {
        const response = await fetch("/api/ops/frame-reorder", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            groupId: dataset.group.id,
            frameIds,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to persist frame order.");
        }

        router.refresh();
      }}
    />
  );
}
