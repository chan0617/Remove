"use client";

import { useCallback, useRef } from "react";
import { ImagePlus, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

export function UploadZone({ onFiles, compact = false }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isDragging, dragHandlers } = useDragAndDrop(onFiles);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) onFiles(files);
      e.target.value = "";
    },
    [onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleClick()}
      {...dragHandlers}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors",
        "border-neutral-200 bg-neutral-50/50 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40",
        isDragging && "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20",
        compact ? "p-6" : "p-16",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-neutral-900 text-white transition-transform dark:bg-white dark:text-neutral-900",
          isDragging && "scale-110",
          compact ? "h-10 w-10" : "h-14 w-14",
        )}
      >
        {isDragging ? (
          <UploadCloud className={compact ? "h-5 w-5" : "h-6 w-6"} />
        ) : (
          <ImagePlus className={compact ? "h-5 w-5" : "h-6 w-6"} />
        )}
      </div>
      <div className="text-center">
        <p className={cn("font-semibold text-neutral-900 dark:text-neutral-100", compact ? "text-sm" : "text-base")}>
          이미지를 드래그하거나 클릭해서 업로드
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          JPG · PNG · WEBP · 여러 장 동시 업로드 · Ctrl+V 붙여넣기 지원
        </p>
        <p className="mt-0.5 text-xs text-neutral-400">
          업로드 즉시 자동으로 배경이 제거됩니다
        </p>
      </div>
    </div>
  );
}
