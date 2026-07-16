"use client";

import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BackgroundOption, ProcessOptions } from "@/lib/types";

interface ToolbarProps {
  options: ProcessOptions;
  onChange: (options: ProcessOptions) => void;
  doneCount: number;
  totalCount: number;
  onDownloadAll: () => void;
  onClearAll: () => void;
}

const BG_LABELS: Record<BackgroundOption, string> = {
  transparent: "투명",
  white: "흰색",
  black: "검정",
  custom: "커스텀",
};

export function Toolbar({
  options,
  onChange,
  doneCount,
  totalCount,
  onDownloadAll,
  onClearAll,
}: ToolbarProps) {
  const patch = (p: Partial<ProcessOptions>) => onChange({ ...options, ...p });

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            배경
          </span>
          <Select
            value={options.background}
            onValueChange={(v) => patch({ background: v as BackgroundOption })}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BG_LABELS) as BackgroundOption[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {BG_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {options.background === "custom" && (
            <input
              type="color"
              value={options.customColor}
              onChange={(e) => patch({ customColor: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded-md border border-neutral-200 dark:border-neutral-700"
              aria-label="커스텀 배경색"
            />
          )}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
          <Switch
            checked={options.autoCrop}
            onCheckedChange={(v) => patch({ autoCrop: v })}
          />
          자동 크롭
        </label>

        <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
          <Switch
            checked={options.removeShadow}
            onCheckedChange={(v) => patch({ removeShadow: v })}
          />
          그림자 제거
        </label>

        <div className="flex w-36 items-center gap-2">
          <span className="whitespace-nowrap text-xs font-medium text-neutral-600 dark:text-neutral-300">
            페더 {options.featherPx}px
          </span>
          <Slider
            value={[options.featherPx]}
            min={0}
            max={2}
            step={0.5}
            onValueChange={(v) =>
              patch({ featherPx: Array.isArray(v) ? v[0] : v })
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {totalCount > 0 && (
          <span className="text-xs text-neutral-500">
            {doneCount}/{totalCount} 완료
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={doneCount === 0}
          onClick={onDownloadAll}
        >
          <Archive className="h-3.5 w-3.5" />
          전체 다운로드 (ZIP)
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={totalCount === 0}
          onClick={onClearAll}
        >
          <Trash2 className="h-3.5 w-3.5" />
          모두 지우기
        </Button>
      </div>
    </div>
  );
}
