"use client";

import { useEffect, useRef, useState } from "react";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import type { HeatmapRequest, HeatmapResponse, HeatmapSummary } from "./heatmap-worker";

export interface LiveHeatmapState {
  key: string;
  status: "loading" | "ready" | "error";
  asset?: ViewerAsset;
  summary?: HeatmapSummary;
  renderedGain?: number;
  error?: string;
}

/** Decode the originals without resizing; averaging images first would erase fine compression errors. */
async function readOriginal(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`原图读取失败（${response.status}）。`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  try {
    image.src = objectUrl;
    await image.decode();
    signal.throwIfAborted();
    // Bound peak memory on mobile while retaining native-pixel analysis for images through 4K.
    if (image.naturalWidth * image.naturalHeight > 12_000_000)
      throw new Error("原图超过 1200 万像素，请使用预生成热图或裁切后分析。");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    if (!context) throw new Error("无法读取原图像素。");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.height = 0;
    return pixels;
  } finally {
    image.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}

/** A pair-scoped worker and generation id prevent stale frames or old gain responses replacing the current result. */
export function useLiveHeatmap(
  enabled: boolean,
  before: ViewerAsset | undefined,
  after: ViewerAsset | undefined,
  gain: number,
  retry: number,
) {
  const key = `${enabled}\n${before?.imageUrl}\n${after?.imageUrl}\n${retry}`;
  const [state, setState] = useState<LiveHeatmapState>({ key: "", status: "loading" });
  const workerRef = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const gainRef = useRef(gain);
  gainRef.current = gain;
  const beforeUrl = before?.imageUrl;
  const afterUrl = after?.imageUrl;

  useEffect(() => {
    if (!enabled || !beforeUrl || !afterUrl) {
      setState({ key, status: "loading" });
      return;
    }
    const abort = new AbortController();
    let worker: Worker | undefined;
    let resultUrl: string | undefined;
    setState({ key, status: "loading" });
    const fail = (error: unknown) => {
      clearTimeout(timeout);
      if (abort.signal.aborted) return;
      setState({
        key,
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "无法分析原图，请检查素材跨域访问或使用预生成热图。",
      });
      abort.abort();
      worker?.terminate();
      workerRef.current = null;
    };
    const timeout = setTimeout(() => fail(new Error("原图分析超时，请重试。")), 30_000);
    try {
      worker = new Worker(new URL("./heatmap-worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onerror = () => fail(new Error("热图计算不可用，请重试或使用预生成热图。"));
      worker.onmessage = ({ data }: MessageEvent<HeatmapResponse>) => {
        if (abort.signal.aborted || data.id !== sequence.current) return;
        if ("error" in data) {
          fail(new Error(data.error));
          return;
        }
        clearTimeout(timeout);
        const previous = resultUrl;
        resultUrl = URL.createObjectURL(data.blob);
        setState({
          key,
          status: "ready",
          summary: data.summary,
          renderedGain: data.gain,
          asset: {
            id: `live-heatmap-${data.id}`,
            kind: "heatmap",
            label: "实时差异热图",
            imageUrl: resultUrl,
            thumbUrl: resultUrl,
            width: data.summary.width,
            height: data.summary.height,
            note: "",
            isPrimaryDisplay: false,
          },
        });
        if (previous) URL.revokeObjectURL(previous);
      };
      void Promise.all([
        readOriginal(beforeUrl, abort.signal),
        readOriginal(afterUrl, abort.signal),
      ])
        .then(([a, b]) => {
          if (abort.signal.aborted) return;
          worker!.postMessage(
            {
              id: ++sequence.current,
              before: a,
              after: b,
              gain: gainRef.current,
            } satisfies HeatmapRequest,
            [a.data.buffer, b.data.buffer],
          );
        })
        .catch(fail);
    } catch (error) {
      fail(error);
    }
    return () => {
      clearTimeout(timeout);
      abort.abort();
      worker?.terminate();
      workerRef.current = null;
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [enabled, key, beforeUrl, afterUrl]);

  useEffect(() => {
    if (!enabled) return;
    workerRef.current?.postMessage({ id: ++sequence.current, gain } satisfies HeatmapRequest);
  }, [enabled, gain]);

  return state.key === key ? state : { key, status: "loading" as const };
}
