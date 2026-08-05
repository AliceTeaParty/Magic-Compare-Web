"use client";

import { GroupViewerWorkbench } from "@magic-compare/ui";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import { useInternalViewerNavigation } from "./use-internal-viewer-navigation";

/** Keeps sibling Group changes inside one mounted Viewer while direct route loads stay server-fed. */
export function InternalGroupViewer({ dataset: initialDataset }: { dataset: ViewerDataset }) {
  const navigation = useInternalViewerNavigation(initialDataset);

  return (
    <GroupViewerWorkbench
      dataset={navigation.dataset}
      variant="internal"
      onGroupNavigate={navigation.navigateGroup}
      onGroupPrefetch={navigation.prefetchGroup}
      pendingGroupHref={navigation.pendingGroupHref}
    />
  );
}
