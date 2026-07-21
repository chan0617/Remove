"use client";

import { useCallback, useRef, useState } from "react";
import { preload, removeBackground } from "@imgly/background-removal";
import { detectGpuSupport } from "@/lib/device";
import {
  applyShadowMode,
  autoCropTransparent,
  cropToRegion,
  decontaminateEdges,
  featherAlpha,
  getImageDimensions,
  padForInference,
  sampleBackgroundColors,
  sharpenAlphaEdge,
} from "@/lib/imageUtils";
import {
  ACCEPTED_MIME_TYPES,
  DEFAULT_PROCESS_OPTIONS,
  ImageJob,
  ProcessOptions,
} from "@/lib/types";
import { createZip } from "@/lib/zip";

// The ONNX model + wasm runtime is downloaded once and cached by the browser
// (HTTP cache + @imgly's internal model cache), so we only need to guard
// against triggering the preload fetch more than once per session.
let modelPreloadPromise: Promise<void> | null = null;

function ensureModelPreloaded(
  device: "cpu" | "gpu",
  onProgress: (pct: number) => void,
): Promise<void> {
  if (!modelPreloadPromise) {
    modelPreloadPromise = preload({
      device,
      model: "isnet_fp16",
      progress: (_key: string, current: number, total: number) => {
        if (total > 0) onProgress(Math.round((current / total) * 100));
      },
    }).catch((err) => {
      modelPreloadPromise = null;
      throw err;
    });
  }
  return modelPreloadPromise;
}

// How far (px) to erode the cutout edge inward to remove the hazy/soft
// fringe that matting models leave at the boundary.
const EDGE_ERODE_PX = 1;

// Each job runs a full ONNX inference session in-browser (WASM/WebGPU).
// Firing all jobs at once for a large batch exhausts tab memory and stalls
// every job mid-progress (and re-uploading the same batch after a refresh
// hits the same wall), so only a few run at a time.
const MAX_CONCURRENT_JOBS = 2;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isSupportedImageFile(file: File): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type);
}

export function useBackgroundRemoval() {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [options, setOptions] = useState<ProcessOptions>(
    DEFAULT_PROCESS_OPTIONS,
  );
  const [modelStatus, setModelStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [modelError, setModelError] = useState<string | null>(null);
  const jobsRef = useRef<ImageJob[]>([]);
  jobsRef.current = jobs;
  const queueRef = useRef<{ job: ImageJob; opts: ProcessOptions }[]>([]);
  const activeCountRef = useRef(0);

  const updateJob = useCallback((id: string, patch: Partial<ImageJob>) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    );
  }, []);

  const processFile = useCallback(async (job: ImageJob, opts: ProcessOptions) => {
    try {
      updateJob(job.id, { status: "loading-model", progress: 0 });
      const gpu = await detectGpuSupport();
      setModelStatus((s) => (s === "ready" ? s : "loading"));

      await ensureModelPreloaded(gpu ? "gpu" : "cpu", (pct) =>
        updateJob(job.id, { progress: Math.round(pct * 0.4) }),
      );
      setModelStatus("ready");

      updateJob(job.id, { status: "processing", progress: 40 });

      const padded = await padForInference(job.file);
      const rawResult = await removeBackground(padded.blob, {
        device: gpu ? "gpu" : "cpu",
        model: "isnet_fp16",
        output: { format: "image/png", quality: 1 },
        progress: (_key: string, current: number, total: number) => {
          if (total > 0) {
            const pct = 40 + Math.round((current / total) * 50);
            updateJob(job.id, { progress: Math.min(pct, 90) });
          }
        },
      });

      let result = await cropToRegion(
        rawResult,
        padded.offsetX,
        padded.offsetY,
        padded.originalWidth,
        padded.originalHeight,
      );

      // Clean up the hazy/whitish fringe matting models leave on edges:
      // recover the true foreground color on semi-transparent boundary
      // pixels, then erode + contrast the alpha so the cut looks crisp
      // instead of soft.
      const bgSamples = await sampleBackgroundColors(job.file, result);
      result = await decontaminateEdges(result, bgSamples);
      result = await sharpenAlphaEdge(result, EDGE_ERODE_PX);

      result = await applyShadowMode(result, opts.removeShadow);

      if (opts.featherPx > 0) {
        result = await featherAlpha(result, opts.featherPx);
      }

      if (opts.autoCrop) {
        result = await autoCropTransparent(result);
      }

      const dims = await getImageDimensions(
        new File([result], job.name, { type: "image/png" }),
      );

      updateJob(job.id, {
        status: "done",
        progress: 100,
        resultBlob: result,
        resultUrl: URL.createObjectURL(result),
        width: dims.width,
        height: dims.height,
      });
    } catch (err) {
      setModelStatus((s) => (s === "ready" ? s : "error"));
      const message =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      setModelError((prev) => prev ?? message);
      updateJob(job.id, { status: "error", error: message, progress: 0 });
    }
  }, [updateJob]);

  const pumpQueue = useCallback(() => {
    while (
      activeCountRef.current < MAX_CONCURRENT_JOBS &&
      queueRef.current.length > 0
    ) {
      const next = queueRef.current.shift();
      if (!next) break;
      activeCountRef.current += 1;
      void processFile(next.job, next.opts).finally(() => {
        activeCountRef.current -= 1;
        pumpQueue();
      });
    }
  }, [processFile]);

  const enqueueJob = useCallback(
    (job: ImageJob, opts: ProcessOptions) => {
      queueRef.current.push({ job, opts });
      pumpQueue();
    },
    [pumpQueue],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted: ImageJob[] = [];
      const rejected: string[] = [];

      for (const file of files) {
        if (!isSupportedImageFile(file)) {
          rejected.push(file.name);
          continue;
        }
        accepted.push({
          id: makeId(),
          file,
          name: file.name,
          originalUrl: URL.createObjectURL(file),
          resultUrl: null,
          resultBlob: null,
          width: 0,
          height: 0,
          status: "queued",
          progress: 0,
          error: null,
        });
      }

      if (accepted.length > 0) {
        setJobs((prev) => [...prev, ...accepted]);
        for (const job of accepted) {
          enqueueJob(job, options);
        }
      }

      return { accepted: accepted.length, rejected };
    },
    [options, enqueueJob],
  );

  const retryJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (job) enqueueJob(job, options);
    },
    [options, enqueueJob],
  );

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => {
      const job = prev.find((j) => j.id === id);
      if (job) {
        URL.revokeObjectURL(job.originalUrl);
        if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
      }
      return prev.filter((j) => j.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    for (const job of jobsRef.current) {
      URL.revokeObjectURL(job.originalUrl);
      if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
    }
    setJobs([]);
  }, []);

  const downloadAllAsZip = useCallback(async () => {
    const done = jobsRef.current.filter((j) => j.status === "done" && j.resultBlob);
    if (done.length === 0) return;
    const zipBlob = await createZip(
      done.map((j) => ({
        name: j.name.replace(/\.[^/.]+$/, "") + ".png",
        blob: j.resultBlob!,
      })),
    );
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "removed-backgrounds.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  return {
    jobs,
    options,
    setOptions,
    modelStatus,
    modelError,
    addFiles,
    retryJob,
    removeJob,
    clearAll,
    downloadAllAsZip,
  };
}
