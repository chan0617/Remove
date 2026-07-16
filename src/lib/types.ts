export type BackgroundOption = "transparent" | "white" | "black" | "custom";

export type JobStatus =
  | "queued"
  | "loading-model"
  | "processing"
  | "done"
  | "error";

export interface ProcessOptions {
  background: BackgroundOption;
  customColor: string;
  autoCrop: boolean;
  keepOriginalSize: boolean;
  removeShadow: boolean;
  featherPx: number;
}

export interface ImageJob {
  id: string;
  file: File;
  name: string;
  originalUrl: string;
  resultUrl: string | null;
  resultBlob: Blob | null;
  width: number;
  height: number;
  status: JobStatus;
  progress: number;
  error: string | null;
}

export const DEFAULT_PROCESS_OPTIONS: ProcessOptions = {
  background: "transparent",
  customColor: "#22c55e",
  autoCrop: false,
  keepOriginalSize: true,
  removeShadow: false,
  featherPx: 0,
};

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const MAX_IMAGE_DIMENSION = 4096;
