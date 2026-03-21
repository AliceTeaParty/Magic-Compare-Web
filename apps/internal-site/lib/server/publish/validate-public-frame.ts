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

export function getValidatedPublicAssets(frame: PublishableFrame): PublishableAsset[] {
  const publicAssets = frame.assets.filter((asset) => asset.isPublic);
  const beforeAsset = publicAssets.find((asset) => asset.kind === "before");
  const afterAsset = publicAssets.find((asset) => asset.kind === "after");

  if (!beforeAsset || !afterAsset) {
    throw new Error(`Frame "${frame.title}" is missing a before/after asset pair.`);
  }

  return publicAssets;
}
