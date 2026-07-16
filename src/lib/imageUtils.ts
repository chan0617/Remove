import { BackgroundOption } from "./types";

export function getPngFilename(originalName: string): string {
  const base = originalName.replace(/\.[^/.]+$/, "");
  return `${base || "image"}.png`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function loadImageBitmap(source: Blob | File): Promise<ImageBitmap> {
  return createImageBitmap(source);
}

export async function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

/**
 * Extends the canvas with edge-replicated pixels so subjects touching the
 * frame border still have context around them for the segmentation model.
 * The returned offset is used to crop the padding back off after inference,
 * so the final output keeps the original image dimensions.
 */
export async function padForInference(
  file: File | Blob,
  paddingRatio = 0.06,
): Promise<{
  blob: Blob;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
}> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const padX = Math.round(width * paddingRatio);
  const padY = Math.round(height * paddingRatio);
  const paddedWidth = width + padX * 2;
  const paddedHeight = height + padY * 2;

  const canvas = document.createElement("canvas");
  canvas.width = paddedWidth;
  canvas.height = paddedHeight;
  const ctx = canvas.getContext("2d")!;

  // Replicate edge pixels into the padding area for context, then draw
  // the original image centered on top.
  ctx.drawImage(bitmap, 0, 0, width, height, padX, padY, width, height);
  ctx.drawImage(bitmap, 0, 0, width, 1, padX, 0, width, padY); // top
  ctx.drawImage(
    bitmap,
    0,
    height - 1,
    width,
    1,
    padX,
    padY + height,
    width,
    padY,
  ); // bottom
  ctx.drawImage(bitmap, 0, 0, 1, height, 0, padY, padX, height); // left
  ctx.drawImage(
    bitmap,
    width - 1,
    0,
    1,
    height,
    padX + width,
    padY,
    padX,
    height,
  ); // right
  bitmap.close();

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
  );

  return {
    blob,
    offsetX: padX,
    offsetY: padY,
    originalWidth: width,
    originalHeight: height,
  };
}

export async function cropToRegion(
  blob: Blob,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
  );
}

/** Trims fully-transparent padding around the subject to a tight bounding box. */
export async function autoCropTransparent(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(
    0,
    0,
    bitmap.width,
    bitmap.height,
  );
  bitmap.close();

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const alphaThreshold = 8;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    // Nothing detected (fully transparent) — return original untouched.
    return blob;
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  return cropToRegion(blob, minX, minY, cropWidth, cropHeight);
}

/**
 * Softens the alpha channel edges with a small blur so cutouts don't look
 * jagged (anti-alias / feather), without bleeding color into transparent
 * areas.
 */
export async function featherAlpha(
  blob: Blob,
  radiusPx: number,
): Promise<Blob> {
  if (radiusPx <= 0) return blob;

  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = width;
  colorCanvas.height = height;
  const colorCtx = colorCanvas.getContext("2d")!;
  colorCtx.drawImage(bitmap, 0, 0);
  const imageData = colorCtx.getImageData(0, 0, width, height);

  // Isolate alpha into its own grayscale canvas, blur it, then write it back.
  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const alphaCtx = alphaCanvas.getContext("2d")!;
  const alphaData = alphaCtx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const a = imageData.data[i * 4 + 3];
    alphaData.data[i * 4] = a;
    alphaData.data[i * 4 + 1] = a;
    alphaData.data[i * 4 + 2] = a;
    alphaData.data[i * 4 + 3] = 255;
  }
  alphaCtx.putImageData(alphaData, 0, 0);

  const blurredCanvas = document.createElement("canvas");
  blurredCanvas.width = width;
  blurredCanvas.height = height;
  const blurredCtx = blurredCanvas.getContext("2d")!;
  blurredCtx.filter = `blur(${radiusPx}px)`;
  blurredCtx.drawImage(alphaCanvas, 0, 0);
  const blurredAlpha = blurredCtx.getImageData(0, 0, width, height);

  for (let i = 0; i < width * height; i++) {
    imageData.data[i * 4 + 3] = blurredAlpha.data[i * 4];
  }
  colorCtx.putImageData(imageData, 0, 0);
  bitmap.close();

  return new Promise((resolve) =>
    colorCanvas.toBlob((b) => resolve(b!), "image/png"),
  );
}

/**
 * Renders the cutout on a solid background for preview/export. Transparent
 * stays untouched (returns the original blob).
 */
export async function compositeBackground(
  blob: Blob,
  background: BackgroundOption,
  customColor: string,
): Promise<Blob> {
  if (background === "transparent") return blob;

  const color = background === "white"
    ? "#ffffff"
    : background === "black"
      ? "#000000"
      : customColor;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
  );
}

/**
 * The matting model outputs a soft (continuous) alpha matte, which keeps a
 * faint gradient where a drop shadow used to be. `removeShadow` thresholds
 * and remaps low-alpha pixels away so shadows disappear; leaving it off
 * preserves the original soft gradient (kept shadow / reflection).
 */
export async function applyShadowMode(
  blob: Blob,
  removeShadow: boolean,
): Promise<Blob> {
  if (!removeShadow) return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const threshold = 50;
  const data = imageData.data;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a <= threshold) {
      data[i] = 0;
    } else {
      data[i] = Math.round(((a - threshold) / (255 - threshold)) * 255);
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
