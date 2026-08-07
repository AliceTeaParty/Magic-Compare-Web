export type ViewerPreloadStatus = "queued" | "loading" | "loaded" | "error";

export interface ViewerPreloadQueueItem {
  url: string;
  priority: number;
  order: number;
  scope?: string;
}

export type ViewerPreloadQueueEntry = Pick<ViewerPreloadQueueItem, "url" | "priority">;

export interface ViewerPreloadImageHandle {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  decoding?: "async" | "auto" | "sync";
  cancel?: () => void;
  decode?: () => Promise<void>;
}

export interface ViewerPreloadQueueOptions {
  connectionLimit: () => number;
  createImage: () => ViewerPreloadImageHandle;
  maxCacheEntries?: number;
  maxQueuedEntries?: number;
  onLoad?: (url: string) => void;
}

const DEFAULT_MAX_CACHE_ENTRIES = 96;
const DEFAULT_MAX_QUEUED_ENTRIES = 8;
type ViewerPreloadResultStatus = Extract<ViewerPreloadStatus, "loaded" | "error">;

interface ViewerActivePreloadRequest {
  handle: ViewerPreloadImageHandle;
  item: ViewerPreloadQueueItem;
  token: number;
}

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
  private readonly connectionLimit: () => number;
  private readonly createImage: () => ViewerPreloadImageHandle;
  private readonly activeRequests = new Map<string, ViewerActivePreloadRequest>();
  private readonly maxCacheEntries: number;
  private readonly maxQueuedEntries: number;
  private readonly onLoad?: (url: string) => void;
  private readonly queue: ViewerPreloadQueueItem[] = [];
  private readonly queuedUrls = new Set<string>();
  private readonly resultCache = new Map<string, ViewerPreloadResultStatus>();
  private order = 0;
  private requestToken = 0;

  constructor(options: ViewerPreloadQueueOptions) {
    this.connectionLimit = options.connectionLimit;
    this.createImage = options.createImage;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.maxQueuedEntries = options.maxQueuedEntries ?? DEFAULT_MAX_QUEUED_ENTRIES;
    this.onLoad = options.onLoad;
  }

  get activeRequestCount(): number {
    return this.activeRequests.size;
  }

  get queuedRequestCount(): number {
    return this.queue.length;
  }

  get statusByUrl(): ReadonlyMap<string, ViewerPreloadStatus> {
    const statuses = new Map<string, ViewerPreloadStatus>();

    for (const url of this.queuedUrls) {
      statuses.set(url, "queued");
    }

    for (const url of this.activeRequests.keys()) {
      statuses.set(url, "loading");
    }

    for (const [url, status] of this.resultCache) {
      statuses.set(url, status);
    }

    return statuses;
  }

  enqueue(url: string | undefined | null, priority: number, scope?: string): void {
    if (!url) {
      return;
    }

    const status = this.getStatus(url);
    if (status === "queued") {
      this.raiseQueuedPriority(url, priority, scope);
      return;
    }

    if (status === "loading") {
      const activeRequest = this.activeRequests.get(url);
      if (activeRequest) {
        activeRequest.item.priority = Math.max(activeRequest.item.priority, priority);
        // Explicit focus/click intent promotes an active speculative request so a later frame-window
        // replacement cannot cancel the image the user has just chosen.
        if (scope === undefined) {
          activeRequest.item.scope = undefined;
        }
      }
      return;
    }

    if (status === "loaded") {
      return;
    }

    this.resultCache.delete(url);
    this.queuedUrls.add(url);
    this.queue.push({
      url,
      priority,
      order: this.order,
      scope,
    });
    this.order += 1;
    this.trimQueue();
    this.pump();
  }

  /** Promotes existing speculative work without creating a duplicate request for the live stage. */
  promote(url: string | undefined | null, priority: number): void {
    if (!url) {
      return;
    }

    if (this.queuedUrls.has(url)) {
      this.raiseQueuedPriority(url, priority, undefined);
      return;
    }

    const activeRequest = this.activeRequests.get(url);
    if (activeRequest) {
      activeRequest.item.priority = Math.max(activeRequest.item.priority, priority);
      activeRequest.item.scope = undefined;
    }
  }

  /** Replaces stale speculative work, including active requests that still belong to the scope. */
  replaceScope(scope: string, entries: ViewerPreloadQueueEntry[]): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const item = this.queue[index];
      if (item?.scope !== scope) {
        continue;
      }

      this.queue.splice(index, 1);
      this.queuedUrls.delete(item.url);
    }

    for (const [url, request] of this.activeRequests) {
      if (request.item.scope === scope) {
        this.cancelActiveRequest(url);
      }
    }

    for (const entry of entries) {
      this.enqueue(entry.url, entry.priority, scope);
    }

    this.pump();
  }

  private raiseQueuedPriority(url: string, priority: number, scope?: string): void {
    const item = this.queue.find((candidate) => candidate.url === url);
    if (!item) {
      return;
    }

    item.priority = Math.max(item.priority, priority);
    // Direct focus/pointer intent must survive later replacement of the speculative frame window.
    if (scope === undefined) {
      item.scope = undefined;
    } else if (item.scope !== undefined) {
      item.scope = scope;
    }
  }

  private trimQueue(): void {
    this.queue.sort(sortQueue);
    while (this.queue.length > this.maxQueuedEntries) {
      const removed = this.queue.pop();
      if (removed) {
        this.queuedUrls.delete(removed.url);
      }
    }
  }

  private pump(): void {
    while (this.activeRequests.size < this.connectionLimit() && this.queue.length > 0) {
      this.queue.sort(sortQueue);
      const item = this.queue.shift();
      if (!item) {
        return;
      }

      this.queuedUrls.delete(item.url);
      const status = this.getStatus(item.url);
      if (status === "loaded" || status === "loading") {
        continue;
      }

      this.resultCache.delete(item.url);
      const image = this.createImage();
      const token = this.requestToken + 1;
      this.requestToken = token;
      this.activeRequests.set(item.url, { handle: image, item, token });
      image.decoding = "async";
      image.onload = () => this.finishLoadedImage(item.url, token, image);
      image.onerror = () => this.finish(item.url, token, "error");
      image.src = item.url;
    }
  }

  private getStatus(url: string): ViewerPreloadStatus | undefined {
    if (this.queuedUrls.has(url)) {
      return "queued";
    }

    if (this.activeRequests.has(url)) {
      return "loading";
    }

    const resultStatus = this.resultCache.get(url);
    if (resultStatus) {
      return resultStatus;
    }

    return undefined;
  }

  /** Marks an image ready only after browser decode so preloader cache hits cannot reveal a blank. */
  private finishLoadedImage(url: string, token: number, image: ViewerPreloadImageHandle): void {
    if (!image.decode) {
      this.finish(url, token, "loaded");
      return;
    }

    void image
      .decode()
      .then(() => this.finish(url, token, "loaded"))
      .catch(() => this.finish(url, token, "error"));
  }

  private finish(url: string, token: number, status: ViewerPreloadResultStatus): void {
    const activeRequest = this.activeRequests.get(url);
    if (!activeRequest || activeRequest.token !== token) {
      return;
    }

    activeRequest.handle.onload = null;
    activeRequest.handle.onerror = null;
    this.activeRequests.delete(url);

    if (status === "loaded") {
      this.resultCache.delete(url);
      this.resultCache.set(url, status);
      this.onLoad?.(url);
    } else if (status === "error") {
      this.resultCache.delete(url);
      this.resultCache.set(url, status);
    }

    this.trimCache();
    this.pump();
  }

  /** Clears callbacks before aborting so cancellation and late browser events cannot finish twice. */
  private cancelActiveRequest(url: string): void {
    const activeRequest = this.activeRequests.get(url);
    if (!activeRequest) {
      return;
    }

    activeRequest.handle.onload = null;
    activeRequest.handle.onerror = null;
    this.activeRequests.delete(url);
    if (activeRequest.handle.cancel) {
      activeRequest.handle.cancel();
    } else {
      activeRequest.handle.src = "";
    }
  }

  private trimCache(): void {
    while (this.resultCache.size > this.maxCacheEntries) {
      const oldestKey = this.resultCache.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }

      this.resultCache.delete(oldestKey);
    }
  }
}
