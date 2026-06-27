export type ViewerPreloadStatus = "queued" | "loading" | "loaded" | "error";

export interface ViewerPreloadQueueItem {
  url: string;
  priority: number;
  order: number;
}

export interface ViewerPreloadImageHandle {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  decoding?: "async" | "auto" | "sync";
}

export interface ViewerPreloadQueueOptions {
  connectionLimit: () => number;
  createImage: () => ViewerPreloadImageHandle;
  maxCacheEntries?: number;
  onLoad?: (url: string) => void;
}

const DEFAULT_MAX_CACHE_ENTRIES = 96;

function sortQueue(left: ViewerPreloadQueueItem, right: ViewerPreloadQueueItem): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return left.order - right.order;
}

/**
 * Keeps speculative full-size image requests bounded and deduplicated without coupling queue churn
 * to React state or component render timing.
 */
export class ViewerImagePreloadQueue {
  readonly statusByUrl = new Map<string, ViewerPreloadStatus>();

  private readonly connectionLimit: () => number;
  private readonly createImage: () => ViewerPreloadImageHandle;
  private readonly maxCacheEntries: number;
  private readonly onLoad?: (url: string) => void;
  private readonly queue: ViewerPreloadQueueItem[] = [];
  private activeCount = 0;
  private order = 0;

  constructor(options: ViewerPreloadQueueOptions) {
    this.connectionLimit = options.connectionLimit;
    this.createImage = options.createImage;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.onLoad = options.onLoad;
  }

  get activeRequestCount(): number {
    return this.activeCount;
  }

  get queuedRequestCount(): number {
    return this.queue.length;
  }

  enqueue(url: string | undefined | null, priority: number): void {
    if (!url) {
      return;
    }

    const status = this.statusByUrl.get(url);
    if (status === "queued") {
      this.raiseQueuedPriority(url, priority);
      return;
    }

    if (status === "loading" || status === "loaded") {
      return;
    }

    this.statusByUrl.set(url, "queued");
    this.queue.push({
      url,
      priority,
      order: this.order,
    });
    this.order += 1;
    this.pump();
  }

  private raiseQueuedPriority(url: string, priority: number): void {
    const item = this.queue.find((candidate) => candidate.url === url);
    if (!item) {
      return;
    }

    item.priority = Math.max(item.priority, priority);
  }

  private pump(): void {
    while (this.activeCount < this.connectionLimit() && this.queue.length > 0) {
      this.queue.sort(sortQueue);
      const item = this.queue.shift();
      if (!item) {
        return;
      }

      const status = this.statusByUrl.get(item.url);
      if (status === "loaded" || status === "loading") {
        continue;
      }

      this.statusByUrl.set(item.url, "loading");
      this.activeCount += 1;

      const image = this.createImage();
      image.decoding = "async";
      image.onload = () => this.finish(item.url, "loaded");
      image.onerror = () => this.finish(item.url, "error");
      image.src = item.url;
    }
  }

  private finish(url: string, status: ViewerPreloadStatus): void {
    this.statusByUrl.set(url, status);
    if (status === "loaded") {
      this.onLoad?.(url);
    }
    this.trimCache();
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.pump();
  }

  private trimCache(): void {
    while (this.statusByUrl.size > this.maxCacheEntries) {
      const oldestKey = this.statusByUrl.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }

      this.statusByUrl.delete(oldestKey);
    }
  }
}
