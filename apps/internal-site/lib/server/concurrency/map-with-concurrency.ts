/**
 * Maps server-side I/O with a fixed worker budget while preserving input order. Once one mapper
 * fails, workers finish only their current calls and stop claiming more work.
 */
export async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  limit: number,
  mapper: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError("Concurrency limit must be a positive integer.");
  }
  if (items.length === 0) {
    return [];
  }

  const results = new Array<Output>(items.length);
  let nextIndex = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed) {
      const index = nextIndex;
      if (index >= items.length) {
        return;
      }
      nextIndex += 1;

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
