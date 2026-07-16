let cachedGpuSupport: Promise<boolean> | null = null;

/** Detects WebGPU availability once and caches the result for the session. */
export function detectGpuSupport(): Promise<boolean> {
  if (cachedGpuSupport) return cachedGpuSupport;

  cachedGpuSupport = (async () => {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      return false;
    }
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      const adapter = await gpu?.requestAdapter();
      return Boolean(adapter);
    } catch {
      return false;
    }
  })();

  return cachedGpuSupport;
}
