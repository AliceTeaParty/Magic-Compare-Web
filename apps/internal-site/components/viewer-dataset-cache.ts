import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";

const DEFAULT_VIEWER_DATASET_CACHE_LIMIT = 5;

/** Keeps recently visited sibling datasets bounded while protecting the currently visible entry. */
export class ViewerDatasetCache {
  private readonly entries = new Map<string, ViewerDataset>();

  constructor(
    initialEntries: Iterable<readonly [string, ViewerDataset]>,
    private readonly limit = DEFAULT_VIEWER_DATASET_CACHE_LIMIT,
  ) {
    for (const [href, dataset] of initialEntries) {
      this.entries.set(href, dataset);
    }
  }

  get(href: string): ViewerDataset | undefined {
    const dataset = this.entries.get(href);
    if (!dataset) {
      return undefined;
    }

    this.entries.delete(href);
    this.entries.set(href, dataset);
    return dataset;
  }

  set(href: string, dataset: ViewerDataset, protectedHref: string): void {
    this.entries.delete(href);
    this.entries.set(href, dataset);

    while (this.entries.size > this.limit) {
      const evictionCandidate = [...this.entries.keys()].find(
        (key) => key !== protectedHref && key !== href,
      );
      if (!evictionCandidate) {
        return;
      }
      this.entries.delete(evictionCandidate);
    }
  }

  has(href: string): boolean {
    return this.entries.has(href);
  }

  get size(): number {
    return this.entries.size;
  }
}

interface ViewerDatasetRequest<T> {
  controller: AbortController;
  promise: Promise<T>;
  speculative: boolean;
}

/** Deduplicates route requests and allows only one abortable speculative target at a time. */
export class ViewerDatasetRequestRegistry<T> {
  private readonly requests = new Map<string, ViewerDatasetRequest<T>>();
  private speculativeRequest: { href: string; request: ViewerDatasetRequest<T> } | null = null;

  load(
    href: string,
    speculative: boolean,
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const existing = this.requests.get(href);
    if (existing) {
      if (!speculative) {
        existing.speculative = false;
        if (this.speculativeRequest?.href === href) {
          this.speculativeRequest = null;
        }
      }
      return existing.promise;
    }

    if (this.speculativeRequest && this.speculativeRequest.href !== href) {
      this.speculativeRequest.request.controller.abort();
      this.speculativeRequest = null;
    }

    const controller = new AbortController();
    const promise: Promise<T> = request(controller.signal).finally(() => {
      if (this.requests.get(href)?.promise === promise) {
        this.requests.delete(href);
      }
      if (this.speculativeRequest?.request.promise === promise) {
        this.speculativeRequest = null;
      }
    });
    const entry = { controller, promise, speculative };
    this.requests.set(href, entry);
    if (speculative) {
      this.speculativeRequest = { href, request: entry };
    }
    return promise;
  }

  abortAll(): void {
    for (const request of this.requests.values()) {
      request.controller.abort();
    }
    this.requests.clear();
    this.speculativeRequest = null;
  }
}
