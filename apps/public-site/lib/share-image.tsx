import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import React from "react";
import type { PublishManifest } from "@magic-compare/content-schema";
import {
  buildPublicShareImageData,
  PUBLIC_SHARE_IMAGE_HEIGHT,
  PUBLIC_SHARE_IMAGE_WIDTH,
} from "./share-image-data";

const FONT_CACHE_DIRECTORY = path.join(process.cwd(), ".next", "cache", "share-image-fonts");
const FONT_DOWNLOAD_TIMEOUT_MS = 60_000;
const FONT_SOURCES = {
  ibmPlexRegular: {
    fileName: "IBMPlexSans-Regular.ttf",
    url: "https://raw.githubusercontent.com/IBM/plex/master/packages/plex-sans/fonts/complete/ttf/IBMPlexSans-Regular.ttf",
  },
  ibmPlexSemiBold: {
    fileName: "IBMPlexSans-SemiBold.ttf",
    url: "https://raw.githubusercontent.com/IBM/plex/master/packages/plex-sans/fonts/complete/ttf/IBMPlexSans-SemiBold.ttf",
  },
  notoSansSc: {
    fileName: "NotoSansCJKsc-Regular.otf",
    url: "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf",
  },
  playwriteUsTrad: {
    fileName: "PlaywriteUSTrad-Regular.ttf",
    url: "https://raw.githubusercontent.com/TypeTogether/Playwrite/02e4e15767f5b6c2109413429fc51879b9507ab4/fonts/ttf/PlaywriteUSTrad-Regular.ttf",
  },
} as const;

interface ShareImageFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600;
  style: "normal";
}

let shareImageFontsPromise: Promise<ShareImageFont[]> | null = null;

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/** Downloads a font once and keeps it in the persistent Next build cache for later exports. */
async function loadCachedFont(source: { fileName: string; url: string }): Promise<ArrayBuffer> {
  const cachePath = path.join(FONT_CACHE_DIRECTORY, source.fileName);

  try {
    const cached = await readFile(cachePath);
    if (cached.byteLength > 0) return toArrayBuffer(cached);
  } catch {
    // A cache miss is expected on the first export; the network copy is written atomically below.
  }

  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(FONT_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to download share image font ${source.fileName}: HTTP ${response.status}`,
    );
  }

  const fontData = Buffer.from(await response.arrayBuffer());
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  await mkdir(FONT_CACHE_DIRECTORY, { recursive: true });
  await writeFile(temporaryPath, fontData);
  await rename(temporaryPath, cachePath);
  return toArrayBuffer(fontData);
}

/** Loads the UI, CJK fallback, and watermark fonts once for the full export process. */
async function loadShareImageFonts(): Promise<ShareImageFont[]> {
  if (!shareImageFontsPromise) {
    shareImageFontsPromise = Promise.all([
      loadCachedFont(FONT_SOURCES.ibmPlexRegular),
      loadCachedFont(FONT_SOURCES.ibmPlexSemiBold),
      loadCachedFont(FONT_SOURCES.notoSansSc),
      loadCachedFont(FONT_SOURCES.playwriteUsTrad),
    ]).then(([regular, semiBold, notoSansSc, playwrite]) => [
      { name: "IBM Plex Sans", data: regular, weight: 400, style: "normal" },
      { name: "IBM Plex Sans", data: semiBold, weight: 600, style: "normal" },
      { name: "Noto Sans SC", data: notoSansSc, weight: 400, style: "normal" },
      { name: "Noto Sans SC", data: notoSansSc, weight: 600, style: "normal" },
      { name: "Playwrite US Trad", data: playwrite, weight: 400, style: "normal" },
    ]);
  }

  return shareImageFontsPromise;
}

function ComparisonPanel({ imageUrl, label }: { imageUrl: string; label: string }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: 600,
        height: 450,
        overflow: "hidden",
        background: "#151a14",
      }}
    >
      <img
        alt=""
        src={imageUrl}
        width={690}
        height={520}
        style={{
          position: "absolute",
          top: -35,
          left: -45,
          width: 690,
          height: 520,
          objectFit: "cover",
          filter: "blur(26px) brightness(0.56) saturate(0.82)",
          opacity: 0.86,
        }}
      />
      <img
        alt=""
        src={imageUrl}
        width={600}
        height={450}
        style={{ position: "absolute", inset: 0, width: 600, height: 450, objectFit: "contain" }}
      />
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          display: "flex",
          alignItems: "center",
          maxWidth: 560,
          height: 42,
          padding: "0 15px",
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.78)",
          borderRadius: 8,
          background: "rgba(31, 38, 29, 0.88)",
          boxShadow: "0 10px 26px rgba(12, 17, 11, 0.28)",
          color: "#ffffff",
          fontFamily: "IBM Plex Sans, Noto Sans SC",
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 1,
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** Renders the fixed 1200x630 card used by Open Graph and Twitter metadata. */
export async function renderPublicShareImage(manifest: PublishManifest): Promise<ImageResponse> {
  const data = buildPublicShareImageData(manifest);
  const fonts = await loadShareImageFonts();

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#f2f3e8",
        color: "#2f382b",
        fontFamily: "IBM Plex Sans, Noto Sans SC",
      }}
    >
      <div style={{ display: "flex", width: 1200, height: 450, background: "#151a14" }}>
        <ComparisonPanel imageUrl={data.leftAsset.imageUrl} label={data.leftAsset.label} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 599,
            width: 1,
            height: 450,
            background: "rgba(255, 255, 255, 0.72)",
          }}
        />
        <ComparisonPanel imageUrl={data.rightAsset.imageUrl} label={data.rightAsset.label} />
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          width: 1200,
          height: 180,
          boxSizing: "border-box",
          padding: "22px 48px 20px",
          overflow: "hidden",
          borderTop: "1px solid #aeb789",
          background: "#f2f3e8",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -18,
            bottom: -4,
            display: "flex",
            color: "rgba(47, 56, 43, 0.10)",
            fontFamily: "Playwrite US Trad",
            fontSize: 96,
            fontWeight: 400,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          Magic Compare
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            width: 790,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 790,
              overflow: "hidden",
              color: "#2f382b",
              // Group and Case form one title, so script differences never change their size.
              fontSize: 54,
              fontWeight: 600,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {data.title}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: 790,
              marginTop: 15,
              overflow: "hidden",
              color: "#596353",
              fontSize: 22,
              fontWeight: 400,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>{data.countLabel}</span>
            {data.description ? (
              <>
                <span style={{ margin: "0 10px", color: "#899174" }}>·</span>
                <span
                  style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                >
                  {data.description}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    {
      width: PUBLIC_SHARE_IMAGE_WIDTH,
      height: PUBLIC_SHARE_IMAGE_HEIGHT,
      fonts,
    },
  );
}
