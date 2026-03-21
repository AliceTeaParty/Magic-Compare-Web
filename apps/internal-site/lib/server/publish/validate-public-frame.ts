interface PublishableAsset {
  id: string;
  kind: string;
  label: string;
  imageUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  note: string;
  isPublic: boolean;
  isPrimaryDisplay: boolean;
}

interface PublishableFrame {
  title: string;
  assets: PublishableAsset[];
}

/**
 * Enforces the minimum public compare contract: every published frame must still have a visible
 * before/after pair even if extra assets such as heatmaps are present.
 */
export function getValidatedPublicAssets(frame: PublishableFrame): PublishableAsset[] {
  const publicAssets = frame.assets.filter((asset) => asset.isPublic);
  const beforeAsset = publicAssets.find((asset) => asset.kind === "before");
  const afterAsset = publicAssets.find((asset) => asset.kind === "after");

  if (!beforeAsset || !afterAsset) {
    throw new Error(`Frame "${frame.title}" is missing a before/after asset pair.`);
  }

  return publicAssets;
}
