"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UploadZone } from "@/components/UploadZone";
import { Toolbar } from "@/components/Toolbar";
import { ImageCard } from "@/components/ImageCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useBackgroundRemoval } from "@/hooks/useBackgroundRemoval";
import { useClipboardPaste } from "@/hooks/useClipboardPaste";

export default function Home() {
  const {
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
  } = useBackgroundRemoval();

  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: File[]) => {
      const { accepted, rejected } = addFiles(files);
      if (rejected.length > 0) {
        toast.error(
          `지원하지 않는 파일 형식입니다: ${rejected.join(", ")} (JPG/PNG/WEBP만 가능)`,
        );
      }
      if (accepted > 0) {
        toast.success(`${accepted}개 이미지 업로드 완료 · 자동 배경 제거 시작`);
      }
    },
    [addFiles],
  );

  useClipboardPaste(handleFiles);

  useEffect(() => {
    if (modelError) setDismissedError(null);
  }, [modelError]);

  const doneCount = jobs.filter((j) => j.status === "done").length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Remove
        </h1>
        <p className="text-sm text-neutral-500">
          업로드하면 즉시, 브라우저 안에서 배경을 제거합니다. 서버로 이미지가
          전송되지 않아 빠르고 안전합니다.
        </p>
      </header>

      {modelError && dismissedError !== modelError && (
        <ErrorBanner
          message={modelError}
          onDismiss={() => setDismissedError(modelError)}
        />
      )}

      <UploadZone onFiles={handleFiles} compact={jobs.length > 0} />

      {jobs.length > 0 && (
        <>
          <Toolbar
            options={options}
            onChange={setOptions}
            doneCount={doneCount}
            totalCount={jobs.length}
            onDownloadAll={downloadAllAsZip}
            onClearAll={clearAll}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <ImageCard
                key={job.id}
                job={job}
                options={options}
                onRemove={removeJob}
                onRetry={retryJob}
              />
            ))}
          </div>
        </>
      )}

      {jobs.length === 0 && (
        <p className="text-center text-xs text-neutral-400">
          {modelStatus === "loading"
            ? "첫 실행 시 AI 모델을 내려받는 중입니다 (이후에는 캐시되어 즉시 시작)…"
            : "머리카락, 털, 반투명, 유리, 식물, 액세서리까지 자연스럽게 분리합니다."}
        </p>
      )}
    </main>
  );
}
