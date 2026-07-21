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

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

interface BackgroundSample {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Samples background color at many grid points across the *original*
 * (pre-matting) photo, keeping only points the matte marks as pure
 * background. Studio backdrops are rarely one flat color — product/pet
 * photography backdrops are commonly a white-to-blue-gray vignette — so a
 * single global average under/over-corrects depending on where on the
 * gradient a given edge pixel actually sits. These spatial samples let
 * decontamination interpolate a local estimate per pixel instead.
 */
export async function sampleBackgroundColors(
  original: File | Blob,
  matted: Blob,
): Promise<BackgroundSample[]> {
  const [origBitmap, mattedBitmap] = await Promise.all([
    createImageBitmap(original),
    createImageBitmap(matted),
  ]);
  const { width, height } = mattedBitmap;

  const origCanvas = document.createElement("canvas");
  origCanvas.width = width;
  origCanvas.height = height;
  const origCtx = origCanvas.getContext("2d")!;
  origCtx.drawImage(origBitmap, 0, 0, width, height);
  const origData = origCtx.getImageData(0, 0, width, height).data;

  const mattedCanvas = document.createElement("canvas");
  mattedCanvas.width = width;
  mattedCanvas.height = height;
  const mattedCtx = mattedCanvas.getContext("2d")!;
  mattedCtx.drawImage(mattedBitmap, 0, 0);
  const alphaData = mattedCtx.getImageData(0, 0, width, height).data;

  origBitmap.close();
  mattedBitmap.close();

  // Aim for a bounded sample count regardless of image resolution, so
  // interpolation cost stays predictable.
  const gridStep = Math.max(
    16,
    Math.round(Math.sqrt((width * height) / 600)),
  );
  const alphaThreshold = 6;

  const samples: BackgroundSample[] = [];
  for (let gy = 0; gy < height; gy += gridStep) {
    for (let gx = 0; gx < width; gx += gridStep) {
      const i = (gy * width + gx) * 4;
      if (alphaData[i + 3] <= alphaThreshold) {
        samples.push({
          x: gx,
          y: gy,
          r: origData[i],
          g: origData[i + 1],
          b: origData[i + 2],
        });
      }
    }
  }

  // Subject fills the frame with no clean background grid points — fall
  // back to the corners so decontamination still has something to use.
  if (samples.length === 0) {
    const corners: [number, number][] = [
      [2, 2],
      [width - 3, 2],
      [2, height - 3],
      [width - 3, height - 3],
    ];
    for (const [x, y] of corners) {
      const i = (y * width + x) * 4;
      samples.push({
        x,
        y,
        r: origData[i],
        g: origData[i + 1],
        b: origData[i + 2],
      });
    }
  }

  return samples;
}

function interpolateBackground(
  samples: BackgroundSample[],
  x: number,
  y: number,
): [number, number, number] {
  let wSum = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (const s of samples) {
    const dx = s.x - x;
    const dy = s.y - y;
    // +64 caps the weight of near-coincident samples so one lucky sample
    // doesn't dominate the estimate.
    const w = 1 / (dx * dx + dy * dy + 64);
    wSum += w;
    rSum += s.r * w;
    gSum += s.g * w;
    bSum += s.b * w;
  }
  return [rSum / wSum, gSum / wSum, bSum / wSum];
}

/**
 * Undoes color contamination on the cutout's semi-transparent boundary
 * pixels. Matting output blends foreground and background color together at
 * partial-alpha edges (`observed = fg*a + bg*(1-a)`), which is what causes a
 * hazy/whitish (or background-tinted) halo when composited elsewhere. This
 * inverts that blend to recover the pure foreground color at each edge
 * pixel, using a locally-interpolated background estimate rather than one
 * flat color so gradient/vignette backdrops decontaminate correctly too.
 */
export async function decontaminateEdges(
  blob: Blob,
  backgroundSamples: BackgroundSample[],
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Below this, dividing by alphaF to invert the blend amplifies any small
  // error in the background estimate into a wildly saturated wrong color
  // (a pixel that's 90%+ background shows the tiniest bg mis-estimate
  // magnified 10x+). These pixels contribute almost nothing to the final
  // composite anyway, so just use the estimated background color directly
  // instead of guessing at a foreground color from mostly-background data.
  const minAlphaF = 0.2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a > 0 && a < 250) {
        const [br, bg, bb] = interpolateBackground(backgroundSamples, x, y);
        const alphaF = a / 255;
        if (alphaF <= minAlphaF) {
          data[i] = br;
          data[i + 1] = bg;
          data[i + 2] = bb;
        } else {
          data[i] = clamp255((data[i] - (1 - alphaF) * br) / alphaF);
          data[i + 1] = clamp255((data[i + 1] - (1 - alphaF) * bg) / alphaF);
          data[i + 2] = clamp255((data[i + 2] - (1 - alphaF) * bb) / alphaF);
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
  );
}

/**
 * Produces a crisp, "fully cut out" edge: erodes the alpha mask inward by
 * `erodePx` (a min-filter, so any pixel near a transparent neighbor is
 * dropped) to remove the soft/hazy transition band the model leaves behind,
 * then applies a contrast curve so the remaining edge snaps to a narrow
 * anti-aliasing ramp instead of a wide gradient.
 *
 * (A guided-image-filter alpha refinement was tried here instead of erosion,
 * to preserve fine fur/hair detail — but without a proper trimap it produced
 * a halo ring around the whole silhouette, which looked worse than the loss
 * of fur detail this erosion trades away. Reverted.)
 */
export async function sharpenAlphaEdge(
  blob: Blob,
  erodePx = 1,
  low = 0.35,
  high = 0.75,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const n = width * height;

  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];

  const r = Math.max(1, Math.round(erodePx));

  // Separable min-filter (box erosion): horizontal pass, then vertical pass.
  const horizontal = new Uint8ClampedArray(n);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let m = 255;
      const xs = Math.max(0, x - r);
      const xe = Math.min(width - 1, x + r);
      for (let xx = xs; xx <= xe; xx++) {
        const v = alpha[rowOffset + xx];
        if (v < m) m = v;
      }
      horizontal[rowOffset + x] = m;
    }
  }

  const eroded = new Uint8ClampedArray(n);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 255;
      const ys = Math.max(0, y - r);
      const ye = Math.min(height - 1, y + r);
      for (let yy = ys; yy <= ye; yy++) {
        const v = horizontal[yy * width + x];
        if (v < m) m = v;
      }
      eroded[y * width + x] = m;
    }
  }

  // Contrast curve centered on the midtone: snaps confident foreground/
  // background pixels to fully opaque/transparent while keeping a thin
  // anti-aliasing ramp right at the boundary.
  for (let i = 0; i < n; i++) {
    const a = eroded[i] / 255;
    let sharpened: number;
    if (a <= low) sharpened = 0;
    else if (a >= high) sharpened = 1;
    else sharpened = (a - low) / (high - low);
    data[i * 4 + 3] = Math.round(sharpened * 255);
  }

  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
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
