"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CompareSlider } from "@/components/CompareSlider";
import { compositeBackground, downloadBlob, formatBytes, getPngFilename } from "@/lib/imageUtils";
import { ImageJob, ProcessOptions } from "@/lib/types";

interface ImageCardProps {
  job: ImageJob;
  options: ProcessOptions;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

const STATUS_LABEL: Record<ImageJob["status"], string> = {
  queued: "대기 중",
  "loading-model": "AI 모델 준비 중",
  processing: "배경 제거 중",
  done: "완료",
  error: "오류",
};

export function ImageCard({ job, options, onRemove, onRetry }: ImageCardProps) {
  const [displayBlob, setDisplayBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!job.resultBlob) {
      setDisplayBlob(null);
      return;
    }
    compositeBackground(job.resultBlob, options.background, options.customColor).then(
      (blob) => {
        if (!cancelled) setDisplayBlob(blob);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [job.resultBlob, options.background, options.customColor]);

  const displayUrl = useMemo(() => {
    if (!displayBlob) return job.resultUrl;
    return URL.createObjectURL(displayBlob);
  }, [displayBlob, job.resultUrl]);

  useEffect(() => {
    return () => {
      if (displayUrl && displayBlob) URL.revokeObjectURL(displayUrl);
    };
  }, [displayUrl, displayBlob]);

  const isBusy = job.status === "loading-model" || job.status === "processing";

  const handleDownload = () => {
    const blob = displayBlob ?? job.resultBlob;
    if (!blob) return;
    downloadBlob(blob, getPngFilename(job.name));
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      <div className="relative">
        <CompareSlider originalUrl={job.originalUrl} resultUrl={displayUrl} />

        {isBusy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm dark:bg-black/60">
            <Loader2 className="h-7 w-7 animate-spin text-neutral-700 dark:text-neutral-200" />
            <div className="w-2/3 space-y-1">
              <Progress value={job.progress} className="h-1.5" />
              <p className="text-center text-xs text-neutral-600 dark:text-neutral-300">
                {STATUS_LABEL[job.status]} · {job.progress}%
              </p>
            </div>
          </div>
        )}

        {job.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 p-4 text-center dark:bg-black/80">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <p className="text-xs text-red-600 dark:text-red-400">{job.error}</p>
            <Button size="sm" variant="outline" onClick={() => onRetry(job.id)}>
              <RotateCcw className="h-3.5 w-3.5" />
              다시 시도
            </Button>
          </div>
        )}

        <button
          onClick={() => onRemove(job.id)}
          className="absolute right-2 bottom-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
          aria-label="이미지 제거"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {job.name}
          </p>
          <p className="text-xs text-neutral-500">
            {job.width > 0 ? `${job.width}×${job.height}px` : STATUS_LABEL[job.status]}
            {job.resultBlob ? ` · ${formatBytes(job.resultBlob.size)}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleDownload}
          disabled={job.status !== "done"}
          className="shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          PNG
        </Button>
      </div>
    </div>
  );
}
