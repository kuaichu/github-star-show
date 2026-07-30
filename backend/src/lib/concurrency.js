export async function mapWithConcurrency(items, limit, worker, options = {}) {
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, 8));
  const results = new Array(items.length);
  let nextIndex = 0;
  let stopError = null;

  async function runWorker() {
    while (!stopError) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = error;
        if (options.stopOn?.(error)) {
          stopError = error;
          return;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  if (stopError) throw stopError;
  return results;
}
